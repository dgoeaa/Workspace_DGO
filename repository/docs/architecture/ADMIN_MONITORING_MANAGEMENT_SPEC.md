# Administration, Monitoring & Management — Requirements and Specification

**Document ID** `AMM-SPEC/v1` · **Status** Draft for review · **Date** 11 September 2026
**Applies to** DGO Digital Operations R11.6 — every platform in the estate
**Kind** Specification. Per [`docs/README.md`](../README.md) that means: *binding — change the code to match, or change this and say why.*

**Owner** NITDA / Office of the Director-General — Digital Operations
**Supersedes** nothing. This is the first document to state what the platform's control plane must do, as opposed to describing what its five scattered administration screens happen to do today.

---

## 0. How to read this document

| Section | Answers |
|---|---|
| [1 Purpose & scope](#1-purpose-and-scope) | What is being specified and what is deliberately out |
| [2 Baseline](#2-baseline--what-exists-today) | What exists **today**, measured, with citations |
| [3 Gaps](#3-the-gaps-this-specification-closes) | The nine defects this exists to close |
| [4 Principles](#4-binding-principles) | Constraints every requirement below inherits |
| [5 Actors](#5-actors-and-access) | Who operates the control plane |
| [6 Architecture](#6-control-console-architecture) | **The standalone application**, its targets, its reach, its topologies, and its boundary with the in-runtime Admin Suite |
| [7 Components](#7-component-specifications) | **The 16 tools** — features, functions, executable actions |
| [8 Dashboards](#8-dashboard-specification) | Dashboards, tiles, metric formulas, drill-downs |
| [9 Telemetry](#9-telemetry-and-observability-data-model) | The data model monitoring needs and does not have |
| [10 Alerting](#10-alerting-thresholds-and-escalation) | Thresholds and escalation — the largest single gap |
| [11 Action register](#11-master-executable-action-register) | All **126** executable actions, and how they reconcile with the 44 that exist |
| [12 RBAC](#12-access-control-specification) | Who may execute what |
| [13 Backend obligations](#13-backend-obligations) | What the flow estate must provide |
| [14 NFRs](#14-non-functional-requirements) | Performance, accessibility, resilience, security |
| [15 Acceptance](#15-acceptance-criteria-and-verification) | How each requirement is proven |
| [16 Delivery](#16-delivery-phasing) | Sequencing |
| [17 Traceability](#17-traceability) | Requirement → evidence → test |
| [18 Open questions](#18-open-questions-assumptions-and-risks) | What is undecided, stated rather than guessed |

Requirement identifiers are stable. `AMM-R-nnn` requirements, `CP-nn` components, `ACT-nnn` executable
actions, `T-n` deployment topologies, `DSH-nn` dashboards, `MET-nnn` metrics, `ALR-nn` alert rules, `OBL-nn` backend obligations,
`NFR-nn` non-functional requirements, `AC-nn` acceptance criteria.

Every factual claim about the current system carries a file citation. Where the evidence is
ambiguous or the sources disagree, this document says so rather than picking a number.

---

## 1. Purpose and scope

### 1.1 Purpose

DGO Digital Operations runs one governed lifecycle — intake → assignment → work → review →
dispatch → archive — across four ingestion sources and two delivered applications, on top of a
tenant of 51 Power Automate workflows and 10 SharePoint lists.

Administration of it is done from inside one of the things being administered.

That is the architectural problem this document addresses, and it is distinct from the
fragmentation problem `modules/admin-suite.js` has just solved. The Admin Suite consolidated ten
administrative concerns into one coherent interface, and it is good. But it is a route inside the
internal runtime, which means: it can only be reached by signing into the platform it is meant to
govern; it cannot be deployed to anyone who does not have that platform; it has no view of the
Document Portal at all; and when the runtime will not boot — precisely when administration matters
most — the tool for diagnosing that is inside the thing that will not start.

**This specifies the DGO Control Console: a standalone administrative, monitoring and management
application, one of the system's platforms in its own right, able to administer any one of the
platforms in the estate or all of them together.**

Standalone means it ships, deploys, is versioned and runs on its own — an operator opens it
without opening anything else. Part of the system means it is not a foreign tool bolted on: it is
built from the same `core/` services, the same design system, the same governance spine and the
same action catalogue as everything else in this repository, and it is packaged by the same
command.

It carries both halves of what a control plane is. The **management** half largely exists already
in `core/` and needs re-hosting, not re-inventing (§2.2). The **monitoring** half does not exist at
all: nothing aggregates across devices, nothing has a threshold, nothing alerts, no dashboard
answers *is the office in control of its correspondence*, and the public portal that promises every
citizen a confirmation within one working day has no operator view whatsoever.

> **Written against a moving tree.** The Admin Suite and its six supporting core services landed
> while this specification was being drafted. That is recorded rather than papered over: §2.2
> measures what now exists, §3 restates the gaps against it, §6.5 defines the boundary between the
> in-runtime suite and the standalone console, and §7 marks each component **Exists** · **Extend** ·
> **New**. Where this document and the Admin Suite disagree about a mechanism, the Admin Suite is
> the implementation and this is the requirement — reconcile them deliberately, in one direction,
> and say which.

### 1.2 In scope

#### What is being built

**P-E · DGO Control Console** — a new, third delivered application, alongside the internal runtime
and the document portal. Zero build, no runtime dependencies, its own entry point, its own package,
its own version. It is specified in §6 and detailed component by component in §7.

#### What it administers

Any one of these, or all of them at once:

| Platform | What it is | Admin surface today |
|---|---|---|
| **P-A · Internal Runtime** | `index.html` — 31 routes, the operator platform | Admin Suite, plus 5 older screens it consolidates |
| **P-B · Document Portal** | `document-portal/` — public submission & tracking PWA, 4 public pages | **None** |
| **P-C · Flow & Data Estate** | 51 Power Automate workflows, 25 contract keys, 10 SharePoint lists / 97 fields | In-product via the Admin Suite's estate tabs |
| **P-D · Toolchain & Release** | 225 npm scripts, packaging, commissioning gate, test suite | Partly — the suite's Commissioning tab and `core/ops-runbook.js` |

- **AMM-R-000.** The console administers a **named target**, never "whatever this browser happens
  to be". Every screen states which platform instance it is looking at, and an aggregate across
  several states that it is an aggregate and names the instances in it. This is the standalone
  equivalent of the device-scope honesty rule (AMM-R-016), and it is the rule that makes a
  multi-platform console safe: an administrator who believes they are looking at production and is
  looking at a pilot will eventually act on it.

### 1.3 Out of scope

- **Rebuilding the operational workspaces.** Intake, assignment, dispatch, approvals and the rest
  are specified elsewhere and are unchanged by this document, except where they must *emit*
  telemetry the control plane reads.
- **The authentication activation itself.** That is [`AUTHENTICATION_CONTRACT.md`](./AUTHENTICATION_CONTRACT.md).
  This document specifies how the control plane *reports and manages* authentication posture, and
  states its dependency on activation (§13).
- **Signature rotation mechanics.** `npm run rotation` and [`docs/folio-Master-Flows-and-Endpoints/deployment/rotation/`](../folio-Master-Flows-and-Endpoints/deployment/rotation/)
  own that. The control plane surfaces rotation state; it does not mint credentials.
- **Replacing the toolchain.** The 225 scripts remain the authority. CP-12 wraps them; it does
  not reimplement them.

### 1.4 Definitions

| Term | Meaning in this document |
|---|---|
| **Control Console** | **P-E** — the standalone administrative application this document specifies |
| **Control plane** | The administration, monitoring and management capability, taken as one system — the Console plus the in-runtime Admin Suite |
| **Target** | A named, addressed instance of a platform that the Console administers (§6.2). Not a platform *type* |
| **Reach** | What a Console deployment can observe of a target: `same-origin`, `cross-origin` or `backend-only` (§6.3) |
| **Topology** | How a Console deployment is hosted relative to its targets: T-1 co-hosted, T-2 central, T-3 portable, T-4 embedded (§6.4) |
| **Component / tool** | One coherent capability of the control plane, `CP-nn` |
| **Executable action** | Something an administrator can *do* that changes state, sends something, or produces an artefact. Every one is governed (§4.2) |
| **Function** | Something a component computes or renders. Read-only. Not governed, but subject to redaction rules |
| **Feature** | A grouping of functions and actions a user would name |
| **Fleet** | All devices and sessions running either platform. Today, unobservable (§3, G-M1) |
| **Estate** | The tenant-side assets: flows, lists, connections |

---

## 2. Baseline — what exists today

Measured on branch `claude/system-remediation-gaps-ahpmsy`, 11 September 2026. Every row is
checkable.

### 2.1 The administration surfaces

Six in-platform screens. The sixth consolidates the other five and is a different kind of thing
from them.

| Route | Screen name | Lines | What it does | What it cannot do |
|---|---:|---|---|---|
| `admin-suite` | **Admin Suite** | **1,862** | Ten tabs — Overview · Endpoints · Live checks · Flow shapes · Commissioning · Capsule registry · People & access · Platform control · Action catalogue · Audit & evidence — rendered from `core/admin-actions.js` so that an action which exists is listed and an action which is listed exists | Reports on **this browser**. No aggregation, no history, no threshold, no alert, no dashboard, no SLA view, and nothing at all about the public portal |
| `settings` | Administration | 50 | Profile, theme, density, bulk-assignment cap, per-key endpoint overrides, record import, clear-device-data | Nothing estate-wide |
| `user-admin` | User Administration | 100 | Create / update / disable user, assign role, role-capability matrix | No directory. Users are rows in `localStorage` |
| `diagnostics` | System Health | 61 | 9 runtime checks, auth posture, provisioning health, collection counts, viewport contract, activity parity, lifecycle readiness, receipt health | One browser, one moment. Counts 19 endpoint keys against an estate of 25 |
| `operator-hud` | Operator HUD | 39 | Sync lineage, collection inventory, intake-feed placement (D4), live operational metrics, pending write queue | Same — one device, no history |
| `endpoint-console` | Endpoint Console | 579 | Six tabs reconciling 25 contract keys against 51 tenant workflows | Probes from one browser; overrides are device-local, and it says so |

Sources: `modules/admin-suite.js`, `modules/settings.js`, `modules/user-admin.js`,
`modules/diagnostics.js`, `modules/operator-hud.js`, `modules/endpoint-console.js`.

Adjacent surfaces carrying monitoring weight without being administration screens:
`modules/fasttrack.js` (SLA queue, escalations, and an 80-entry in-memory telemetry trace discarded
on every route change), `modules/statistics.js`, `modules/reports.js`, `modules/archive.js`,
`modules/executive.js`.

Outside the runtime: `tools/admin-console.html`, `tools/flow-workbench/`, `tools/flow-capsule/`
and `docs/visual/`.

### 2.2 The governed substrate the control plane can build on

This is the good news, and it is substantial. The platform already has the spine a control plane
needs; what it lacks is the surface and the aggregation.

| Capability | Where | Measured |
|---|---|---|
| Action governance | `core/action-authority.js`, `config/action-ownership.config.js` | **62 governed actions**, each with owner, plain-language label, service, audit vocabulary, backend requirement |
| Module boundaries | `config/module-boundaries.config.js` | What each module owns and explicitly must not own |
| Audit ledger | `core/audit-log.js` | Ring buffer, **5,000 events**, indexed by reference, returned frozen |
| Idempotency | `core/idempotency.js` | `idem:<op>:<ref>:<actor>:<5-min bucket>:<sha256 digest>` |
| Offline durability | `core/pending-queue.js` → `core/offline-action-queue.js` → `core/receipt-ledger.js` | Queue, drain-on-online, receipt per attempt (`queued` / `sent` / `failed`) |
| Step-up auth | `core/otp-service.js` | OTP bound to a payload digest — a verified code cannot be replayed against different data |
| Endpoint resolution & redaction | `core/endpoint-registry.js` | deployment manifest → audited operator override → packaged default; `redact()` strips `sig`, `sv`, `sp`, `code` |
| Estate reconciliation | `config/endpoint-atlas.data.js`, `core/endpoint-atlas.js` | **25 contract keys** mapped against **51 tenant workflows** |
| Provisioning manifest | `config/platform-provisioning.config.js` | Per-route purpose, features, actions — validated at boot, route↔provisioning parity tested |
| Performance budget | `config/performance-budget.config.js` | boot 2500 ms · route mount 700 ms · module render 250 ms · FETCH_ALL 60 s · action 45 s · cache read 30 ms · payload 6.5 MB |
| Render budget | `core/render-budget.js` | listRows 100 · tableRows 120 · timelineItems 30 · pendingRows 20 |
| Retention policy | `core/retention.js` | default 7 y · Legal 10 · Executive directive 10 · Routine administrative 5 · General 3 |
| Notification obligations | `config/notification-matrix.config.js` | **39 required notifications**, 4 channels, 11 audiences, 4 severities, 6 provisioning states |
| RBAC | `config/rbac.config.js` | 6 roles, 13 permissions, per-route access table |
| **Administrative action catalogue** | `core/admin-actions.js` | **44 actions** across 7 domains, each declaring blast radius, permission and audit event |
| **Non-destructive health probe** | `core/health-contract.js` | A `validationOnly` contract so a write endpoint can be checked without being executed |
| **Commissioning register** | `core/ops-runbook.js` | Dependency-gated obligations, evidence attachment and the release gate — the half `npm run commission` cannot settle |
| **Flow request shapes** | `core/flow-shapes.js`, `config/flow-shapes.data.js` | Trigger JSON Schema for **65 exported workflows**, with a field index and validator |
| **URL formation rules** | `core/endpoint-formation.js` | Paste defects caught where the URL is entered, not where it is first used |
| **Capsule registry client** | `core/capsule-client.js` | Alias-based invocation, version history, rollback, enable/disable — the posture where a server exists |
| Durable UI feed | `core/notification-center.js` | 200-entry local feed, 4 tones, survives route change |
| Quality gate | `package.json`, `tests/` | **225 npm scripts**, 90+ test files |

#### The blast-radius taxonomy

`core/admin-actions.js` classifies every administrative action by what it reaches. This
specification adopts it rather than inventing a parallel scheme, and §11 extends it:

| Blast | Meaning | Current count |
|---|---|---:|
| `read` | Changes nothing. Safe to run while wondering whether to | 16 |
| `device` | Changes this browser only. An administrator who "fixed" the estate from one laptop has fixed nothing for anyone else | 5 |
| `tenant` | Reaches Power Automate. It leaves this building | 7 |
| `estate` | Changes what every user of this deployment sees | 12 |
| `irreversible` | No undo, no copy. Confirmed by typing, never by clicking | 4 |

Domains: `estate` 7 · `flows` 7 · `runbook` 8 · `capsule` 6 · `people` 5 · `platform` 8 ·
`evidence` 3.

### 2.3 The measured state of monitoring

Three numbers define the problem.

**54 monitoring records. Zero thresholds.**
[`docs/process/19-MONITORING-AUDIT-AND-PERFORMANCE.md`](../process/19-MONITORING-AUDIT-AND-PERFORMANCE.md)
catalogues MON-001 … MON-054. Every one is an audit event. Every one has `—` in the Threshold,
Escalation threshold, Alerting and Reporting-output columns. The estate records what happened; it
defines nothing about what *should* happen and nothing that fires when it does not.

**39 notification obligations. 16 provisioned.**
`config/notification-matrix.config.js` computes: `PROVISIONED 16 · ABSENT 9 · MISADDRESSED 6 ·
LOCAL_ONLY 4 · REGRESSION 2 · UNIMPLEMENTED 2`. Its own header states the consequence — of 76 live
mail actions in the estate, four are addressed solely to the person concerned; 70 hard-code a
fixed mailbox.

**Everything monitored is monitored per-device.** The audit ring buffer, the receipt ledger, the
pending queue, the notification feed, the performance monitor and the FastTrack telemetry trace
all live in browser memory or `localStorage`. "Queued writes: 3" means three on *this laptop*. No
supervisor, anywhere, can see the fleet.

### 2.4 Known contradictions in the current surfaces

Recorded because a specification that quietly averages them would be wrong.

1. **Endpoint counts disagree, by design, and the disagreement is a fault.** `EndpointKeys` in
   `config/endpoints.config.js` is **19**. `EndpointAtlas` covers **25** contract keys across both
   surfaces. System Health counts the 19 and can show a complete green while `SCAN_INTAKE` — which
   `config/action-ownership.config.js` declares as `required` for `scan-deposit` — is unconfigured
   and registry scanning is dead. `modules/endpoint-console.js` documents this in its header; it is
   not yet fixed in System Health.
2. **`schemaVersion` check is pinned to 3; the schema is v4.** `modules/diagnostics.js` asserts
   `s.schemaVersion===3`; `PLATFORM.md` §3.3 states schema v4. One of them is wrong
   and the check is either vacuous or permanently red. Resolve before building on it (§18, Q-3).
3. **Route count drifts between documents.** `config/routes.config.js` carries **30** routes;
   `PLATFORM.md` says 29 and "25 route modules"; `modules/diagnostics.js` asserts
   `Router.known().length>=22`. The control plane must derive counts from config, never restate them.

---

## 3. The gaps this specification closes

Nine gaps. The Admin Suite closed one of them and narrowed a second; the rest are untouched by it,
because they are monitoring problems and it is a management tool.

| ID | Gap | Evidence | Severity | Status |
|---|---|---|---|---|
| **G-M1** | **No fleet view.** All monitoring state is device-local. No aggregation across users, sessions or devices | `core/audit-log.js`, `core/receipt-ledger.js`, `core/pending-queue.js`, `core/notification-center.js` — all browser-resident | Critical | Open |
| **G-M2** | **No thresholds, no alerting.** 54 monitoring records, none with a threshold, escalation trigger, alert or reporting output | `docs/process/19-MONITORING-AUDIT-AND-PERFORMANCE.md` | Critical | Open |
| **G-M3** | **Fragmented administration** | §2.1 | High | **Largely closed** by `modules/admin-suite.js` and `core/admin-actions.js`. What remains: the five older screens still exist alongside it, and the CLI is still the authority for anything the suite does not cover |
| **G-M4** | **The Document Portal has no administration or monitoring surface at all.** Four public pages and a 404; nothing for an operator | `document-portal/` | High | Open — untouched by the suite |
| **G-M5** | **Notification obligations unmet.** 16 of 39 provisioned; 70 of 76 live mail actions address a fixed mailbox | `config/notification-matrix.config.js` | High | Open |
| **G-M6** | **Enforcement is browser-side only.** Every control in §2.2, the action catalogue included, is advisory until the flows validate tokens and derive roles | `docs/architecture/AUTHENTICATION_CONTRACT.md`; G-04 open | Critical (inherited) | Open |
| **G-M7** | **Estate run health is invisible in-product.** `core/health-contract.js` can now probe a write endpoint without executing it — a real advance — but nothing reads the tenant's run history, so failure rates, durations and last-failure remain unobservable | No contract reads run history | High | **Narrowed**, not closed |
| **G-M8** | **Scope-narrowed green.** Checks compute over a subset and report complete — System Health counts 19 endpoint keys against an estate of 25 | §2.4 | High | Open in `diagnostics`; the suite reads the 25-key atlas |
| **G-M9** | **No administrator evidence trail for administration itself** | `core/audit-log.js` had `query()` and no consumer screen | Medium | **Closed** by the suite's Audit & evidence tab and the catalogue's per-action audit events |

### 3.1 What is left, stated plainly

Removing what the Admin Suite settled, this specification exists for five things:

1. **Aggregation** — every number in the platform is true of one browser (G-M1).
2. **Thresholds and alerting** — nothing can be exceeded, so nobody is ever told (G-M2).
3. **Dashboards** — there is no surface that answers whether the office is in control of its
   correspondence, only surfaces that answer whether an endpoint is wired.
4. **The public portal** — a citizen-facing service with no operator view (G-M4).
5. **Service level, retention and notification compliance** — measured nowhere (G-M5, and the SLA
   and retention machinery that exists in `core/` with no reader).

## 4. Binding principles

Every requirement in this document inherits these. A proposed feature that violates one is
rejected, not negotiated.

### 4.1 Inherited platform commitments

From [`PLATFORM.md`](../PLATFORM.md) §1:

- **AMM-R-001 · Zero build.** No bundler, transpiler or SSR. The control plane is ES modules served
  over HTTP, like every other module.
- **AMM-R-002 · No runtime dependencies.** Nothing ships to the browser that is not in this
  repository. No charting library, no dashboard framework, no telemetry SDK. Visualisation is
  inline SVG and CSS, authored here.
- **AMM-R-003 · Configuration over code.** Every dashboard, tile, metric, threshold, alert rule and
  action is declared in `config/`, not embedded in a module.
- **AMM-R-004 · Governed by default.** A mutating control-plane action that is not declared in
  `config/action-ownership.config.js` and owned by its module **throws rather than executing**.

### 4.2 Governance of every executable action

- **AMM-R-005.** Every executable action in §11 routes through
  `executeOwnedAction(module, action, runner, meta)` — status check → ownership assertion → audit
  `started` → run → audit `completed | failed`.
- **AMM-R-006.** Every action declares in `config/action-ownership.config.js`: `owner`, `label`
  (plain noun phrase), `service`, `audit` vocabulary, `backend` requirement, and `allowedInvokers`
  where cross-module invocation is intended.
- **AMM-R-007.** Every write carries an idempotency key per `core/idempotency.js`.
- **AMM-R-008.** Actions marked **destructive** or **estate-wide** in §11 require OTP step-up via
  `core/otp-service.js`, with the OTP bound to the payload digest.
- **AMM-R-009.** Every action marked **confirm** presents `confirmAction()` with a body that names
  the consequence in plain language and an `actionPreview()` of what will change. A confirmation
  that does not name the consequence does not satisfy this.

### 4.3 Vocabulary and disclosure

- **AMM-R-010 · Two audiences, two channels, never the same text.** Per
  `core/action-authority.js`: the audit record carries raw technical detail verbatim; the operator
  toast carries `Could not <label>. <consequence>` and **never** derives from `error.message`.
  Finding I-07 is binding on every screen in this specification.
- **AMM-R-011 · No signature ever reaches a screen, an export or a log.** Everything that renders a
  URL passes through `EndpointRegistry.redact()`. This is asserted on rendered HTML in
  `tests/endpoint-console.test.mjs` and the same standard applies to every new surface.
- **AMM-R-012 · Configuration constants are not labels.** A contract key, role id or audit
  vocabulary may appear as secondary detail for IT; it may never be the primary label an operator
  reads. (I-08.)
- **AMM-R-013 · A failing check states its cost.** Every check renders a one-sentence consequence
  when it fails, as `modules/diagnostics.js` already does via `CHECK_CONSEQUENCE`. A bare
  `6/9` is not an acceptable monitoring output.

### 4.4 Honesty constraints

- **AMM-R-014 · No scope-narrowed green.** Every aggregate indicator declares its denominator and
  the set it computed over. Where a check cannot cover the whole set, it reports
  **partial**, never **pass**. Closes G-M8.
- **AMM-R-015 · Unverified is not healthy.** Where no safe probe exists — as with `DYNAMIC_ACTIONS`,
  where every call is a write — the control plane reports *not verified*, never *ready*. This
  already holds in `core/activity-parity.js`; it is now general.
- **AMM-R-016 · Device scope is stated at the point of display.** Any figure derived from local
  state is labelled as this device's, until §9 telemetry lands. A number that looks estate-wide and
  is not is a defect, not a limitation.
- **AMM-R-017 · The control plane reports on its own weakest posture.** As
  `EndpointRegistry.describeAll()` already raises a warning when any endpoint resolves to a packaged
  signed URL, every component surfaces the worst thing true about its own domain, prominently,
  without being asked.

### 4.5 Read-only by default

- **AMM-R-018.** Health probes call **read-only contracts only**. A console that can dispatch
  correspondence as a side effect of a health check is not a console
  (`modules/endpoint-console.js`, retained verbatim as a requirement).
- **AMM-R-019.** Every component opens in a read-only state. Controls that mutate are behind an
  explicit affordance and an RBAC permission; they are not the default focus.

---

## 5. Actors and access

### 5.1 Control-plane actors

| Actor | Existing role | Primary need | Principal components |
|---|---|---|---|
| **System Administrator** | `systemAdmin` | Everything. The estate, the configuration, the release | All |
| **User Administrator** | `userAdmin` | Identity, access, and the evidence of both | CP-05, CP-07 |
| **IT Support / Platform Engineer** | `systemAdmin` (no distinct role today — see Q-1) | Is it working? What broke? How do I fix it without a laptop in the room? | CP-02, CP-03, CP-04, CP-10, CP-14 |
| **Registry Supervisor** | `director` | Is work moving? What is breached? Who is idle? | CP-01, CP-09, CP-13 |
| **Executive / DGCEO office** | `executive` | Is the office in control of its correspondence? | CP-01, CP-13 |
| **Portal Operator** | *none today* (see Q-2) | What did the public send, did it reach us, did they get told? | CP-11 |
| **Release Manager** | `systemAdmin` | Can this be shipped? What is it wired to? | CP-12, CP-14 |
| **Auditor** | `executive` / `userAdmin` (`audit:view`) | What happened, in order, provably | CP-07 |

### 5.2 New permissions required

`config/rbac.config.js` carries 13 permissions. The control plane needs six more. They are
additive; no existing permission changes meaning.

| Permission | Grants | Default roles |
|---|---|---|
| `monitor:view` | Read any monitoring surface, fleet-wide | `systemAdmin`, `userAdmin`, `director`, `executive` |
| `monitor:operate` | Retry, drain, clear and re-probe queues and caches | `systemAdmin` |
| `estate:view` | Read the endpoint atlas, flow estate and connection state | `systemAdmin`, `userAdmin` |
| `estate:manage` | Change an endpoint target, request a re-probe, mark a finding | `systemAdmin` |
| `alert:manage` | Create, edit, silence and acknowledge alert rules | `systemAdmin`, `director` |
| `release:manage` | Run the commissioning gate, build and verify a package | `systemAdmin` |

- **AMM-R-020.** The six permissions above are added to `Permissions` and assigned in `Roles` in
  `config/rbac.config.js`. `tests/governance.test.mjs` asserts every control-plane action names a
  permission that exists.
- **AMM-R-021.** A role answers from its own row and only its own row. The persona fall-through
  closed by finding F-020 is not reopened for any control-plane route.
- **AMM-R-022.** Until authentication is enforced (§13, OBL-01), every control-plane screen renders
  the standing posture banner specified in CP-14 F-3. Advisory control that presents as enforcement
  is the defect; saying so is the mitigation.

---

## 6. Control Console architecture

### 6.1 A third application

```
ECM_DOCS_DEV/
  index.html                 P-A · Internal Runtime      31 routes, the operator platform
  document-portal/           P-B · Document Portal       public PWA, 4 pages
  console/                   P-E · DGO Control Console   ← this specification
    index.html               entry point + boot watchdog
    app/                     console-only modules (the 16 components)
    targets/                 platform target definitions
  core/                      shared by all three
  config/                    shared by all three
  styles/                    shared design system
```

- **AMM-R-023.** The console is a **peer application**, not a route group. It boots on its own,
  routes on its own, and is reachable without signing into any platform it governs.
- **AMM-R-024.** It shares `core/` and `config/` by direct ES-module import — the same files, not a
  copy. `core/admin-actions.js`, `core/endpoint-atlas.js`, `core/health-contract.js`,
  `core/ops-runbook.js`, `core/flow-shapes.js`, `core/endpoint-formation.js`,
  `core/capsule-client.js`, `core/audit-log.js`, `core/action-authority.js` and
  `core/endpoint-registry.js` are consumed as they stand. The console adds no second implementation
  of anything they do.
- **AMM-R-025.** Zero build, no runtime dependencies, configuration over code, governed by default
  (§4.1) apply unchanged. The console is the same kind of artefact as the other two.
- **AMM-R-026.** It is built and verified by the existing commands: `npm run package` emits a third
  self-contained directory with its manifest hashing every byte, and `npm run package:verify`
  checks it. A console that needs its own toolchain is a console that rots between releases.
- **AMM-R-027.** A console failure can never affect a governed platform. It holds no state any
  platform reads at boot, and registers no service worker in a scope another application occupies.

> **Why not simply copy the design tokens, as the portal does?** The Document Portal keeps its own
> copy deliberately, so it can deploy standalone to a public host with no relationship to the
> runtime. The console deploys to administrators, alongside the platforms, and must agree with them
> about what a status badge means — so it shares. The divergence risk the portal accepts in exchange
> for independence is the exact risk a control console cannot accept.

### 6.2 Target platforms

The console's central abstraction. Every screen operates against a **target**, and a target is a
named, addressed instance of a platform — not a platform type.

```
Target {
  id           string     'prod-runtime', 'pilot-portal', 'tenant-estate'
  label        string     what an administrator calls it
  kind         enum       runtime | portal | estate | toolchain
  environment  enum       production | pilot | development
  origin       URL?       where the application is served, for runtime and portal kinds
  endpoints    map        contract key → resolved URL, through EndpointRegistry
  reach        enum       same-origin | cross-origin | backend-only   (§6.4)
  posture      object     auth posture, build id, package hash, last contact
}
```

- **AMM-R-028.** Targets are declared in `config/console-targets.config.js` and resolved through
  `core/endpoint-registry.js` with its existing precedence — deployment manifest → audited operator
  override → packaged default. The console invents no second configuration mechanism.
- **AMM-R-029.** **No signature is ever displayed, exported or logged for any target**
  (AMM-R-011). A target that resolves to a packaged signed URL is reported as such, exactly as
  `EndpointRegistry.describeAll()` already does.
- **AMM-R-030.** The active target is in the URL, so a link to a finding is a link to that finding
  **on that instance**. A deep link that silently resolves against whatever target happens to be
  selected is a defect.
- **AMM-R-031.** `environment` is rendered as a persistent, visually distinct band — production is
  not a dropdown item that looks like the other two. Every destructive or estate-blast action names
  the target and its environment in its confirmation.
- **AMM-R-032.** **Aggregate mode** — "all targets" — is explicit, never a default, and every
  aggregate figure names its constituents and its completeness (how many of the selected targets
  actually reported). A figure computed over 2 of 5 targets is reported as such.

### 6.3 What the console can see, and what it cannot

This is the constraint that decides the whole design, and it is a browser constraint, not a
preference.

Almost everything the platform currently knows about itself lives in `localStorage`: the audit ring
buffer, the receipt ledger, the pending write queue, the notification feed, the endpoint overrides,
the user directory. **`localStorage` is partitioned by origin.** Scheme, host and port — path is
irrelevant. So:

| Console deployed | Can read a target's device-local state? | Consequence |
|---|---|---|
| **Same origin** as the target (e.g. `/console/` beside `/`) | **Yes**, for that platform, on that device | Full device-scope administration with no backend at all |
| **Different origin** from the target | **No** | Everything must come from the backend (§9 telemetry, §13 contracts) |
| Target is `estate` or `toolchain` | N/A — there is no browser state to read | Backend and repository artefacts only |

- **AMM-R-033.** The console declares each target's `reach` and **renders what it cannot see as
  absent, never as zero**. "Queued writes: 0" against a cross-origin target is a lie; "Queued
  writes: not visible from here — needs telemetry (§9)" is the truth, and the difference is the
  whole value of the screen.
- **AMM-R-034.** The console **never** attempts to reach into another origin's storage — no iframe
  bridge, no `postMessage` shim, no injected script. Those are the mechanisms of a cross-site
  attack, and building one into an administrative tool builds a vulnerability with a legitimate
  name. Cross-origin visibility comes from the backend or it does not come.
- **AMM-R-035.** Therefore: **same-origin deployment is the recommended topology, and telemetry
  (§9) is what makes any other topology honest.** Both are stated at §6.4 and in the deployment
  procedure, because an administrator who deploys the console to a separate host and finds half the
  screens saying "not visible from here" has been failed by the documentation, not the tool.

### 6.4 Deployment topologies

| ID | Topology | Reach | When to use |
|---|---|---|---|
| **T-1** | **Co-hosted** — `console/` served from the same origin as the runtime and portal | Full device-scope for both, plus backend | The default. One host, three applications, one deployment |
| **T-2** | **Central** — one console instance on its own origin, administering many target instances | Backend-only | Multiple deployments, multiple environments, one administrator. **Requires telemetry (§9)** or most monitoring screens are empty and say so |
| **T-3** | **Portable** — run locally from a package, pointed at a target's endpoints | Backend-only for the target; full local for itself | Incident response, commissioning, a site with no console deployed. This is the topology that works when the runtime will not boot |
| **T-4** | **Embedded** — the existing in-runtime Admin Suite | Full device-scope for the runtime only | Already shipped. Retained per §6.5 |

- **AMM-R-036.** The console must work in all four, and state which it is in. T-3 in particular is
  a first-class requirement, not a fallback: an administrator with a laptop and a values file must
  be able to open the console against a live deployment and diagnose it, without deploying anything.
- **AMM-R-037.** In T-2 and T-3 the console holds endpoint addresses for targets it administers.
  It is therefore a credential-bearing artefact and is packaged, distributed and rotated as one —
  `docs/deployment/RUNBOOK.md` rules apply to it exactly as they do to the other two platforms.

### 6.5 The boundary with the in-runtime Admin Suite

Both exist. They are not duplicates, and the rule for which capability goes where is:

| | In-runtime Admin Suite (T-4) | Standalone Control Console (P-E) |
|---|---|---|
| **Audience** | An operator or administrator already working in the platform | An administrator whose job is the estate |
| **Scope** | This runtime, this device | Any target, any environment, or all of them |
| **Answers** | *Is this platform, on this machine, working?* | *Is the estate healthy, is work moving, is anything waiting on me?* |
| **Holds** | Device-scope repair and commissioning | Monitoring, alerting, dashboards, cross-platform and cross-device |
| **Available when the runtime will not boot** | No | **Yes** |

- **AMM-R-038.** Shared capability lives in `core/`, consumed by both. Neither re-implements the
  other; a change to an action's blast radius or audit event happens once, in
  `core/admin-actions.js`, and both surfaces change with it.
- **AMM-R-039.** A capability that is device-scope-only belongs in the suite. A capability that is
  cross-target, historical, aggregated or alerting belongs in the console. Where a capability is
  genuinely both — the endpoint estate is the clearest case — the console is authoritative and the
  suite renders the same core service scoped to itself.
- **AMM-R-040.** The five older screens (`settings`, `user-admin`, `diagnostics`, `operator-hud`,
  `endpoint-console`) are **retired into** the suite and the console once their capability is
  covered by both, with a redirect and a deprecation note. Leaving six administrative screens
  standing while adding a seventh application would reopen precisely the fragmentation the suite
  closed.

### 6.6 Component register

| ID | Component | Status | Where it lives / what it extends | Primary permission |
|---|---|---|---|---|
| **CP-01** | Control Dashboard | **New** | Console home. The suite's Overview tab is an estate summary, not a platform dashboard | `monitor:view` |
| **CP-02** | System Health & Readiness | Extend | `modules/diagnostics.js` + suite *Live checks* · `core/health-contract.js` | `monitor:view` |
| **CP-03** | Live Operations HUD | Extend | `modules/operator-hud.js` | `monitor:view` |
| **CP-04** | Endpoint & Estate Console | **Mostly exists** | Suite *Endpoints* / *Flow shapes* / *Capsule registry*, re-hosted per-target. Adds F-5 run health | `estate:view` |
| **CP-05** | Identity & Access Manager | Extend | Suite *People & access* + `modules/user-admin.js` | `user:view` |
| **CP-06** | Platform Configuration Manager | Extend | Suite *Platform control* + `modules/settings.js` | `settings:manage` |
| **CP-07** | Audit & Evidence Explorer | **Mostly exists** | Suite *Audit & evidence*. Adds coverage statement, dossier, receipt reconciliation | `audit:view` |
| **CP-08** | Notification & Escalation Control | **New** | Consumer for `config/notification-matrix.config.js` — nothing reads it today | `alert:manage` |
| **CP-09** | SLA & Workload Monitor | Extend | Monitoring half of `modules/fasttrack.js` | `monitor:view` |
| **CP-10** | Data, Queue & Cache Manager | **Mostly exists** | Suite *Platform control* (`platform.*` actions). Adds storage budget, reconciliation diff | `monitor:operate` |
| **CP-11** | Portal Operations Console | **New** | Nothing exists. P-B has no admin surface | `monitor:view` |
| **CP-12** | Release & Commissioning Manager | **Mostly exists** | Suite *Commissioning* · `core/ops-runbook.js`. Adds deployment identity, package inspection | `release:manage` |
| **CP-13** | Reporting & Export Studio | Extend | `modules/reports.js`, `modules/statistics.js` | `executive:export` |
| **CP-14** | Security & Posture Console | **New** | Consumer for the rotation register and auth posture | `estate:view` |
| **CP-15** | Retention & Disposition Manager | **New** | Consumer for `core/retention.js` — computed today, surfaced nowhere | `settings:manage` |
| **CP-16** | **Target Manager** | **New** | The console's own: register, address, verify and switch targets (§6.2) | `estate:manage` |

**Six components are new, four mostly exist, six extend.** The four marked *Mostly exists* are
specified in full in §7 because a specification that omits what is built cannot be used to check
whether what is built is right — but their delivery cost is re-hosting per-target, not
construction.

### 6.7 Shape

```
                    ┌──────────────────────────────────────┐
                    │   CP-16  TARGET MANAGER              │
                    │   which platform am I administering? │
                    └──────────────────┬───────────────────┘
                                       │
                    ┌──────────────────▼───────────────────┐
                    │   CP-01  CONTROL DASHBOARD           │
                    │   is the estate ok?                  │
       ┌────────────┴──────┬─────────────┬─────────────────┴────────────┐
       │  MONITOR (new)    │  MANAGE     │  GOVERN        │  OPERATE    │
       │  CP-02 Health     │  CP-05 Acc. │  CP-07 Audit ✓ │ CP-10 Data ✓│
       │  CP-03 Live       │  CP-06 Conf.│  CP-08 Notify  │ CP-11 Portal│
       │  CP-04 Estate ✓   │  CP-15 Ret. │  CP-14 Security│ CP-12 Rel. ✓│
       │  CP-09 SLA        │             │                │ CP-13 Report│
       └───────────────────┴─────────────┴────────────────┴─────────────┘
                    ✓ = core service already delivered for the Admin Suite
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
   GOVERNANCE SPINE            TELEMETRY SPINE                ESTATE BRIDGE
   action-authority ✓          §9 — collector,                endpoint-atlas ✓
   admin-actions ✓             aggregate, retain               health-contract ✓
   audit-log ✓                 (NEW — nothing                  flow-shapes ✓
   idempotency ✓               like it exists)                 ops-runbook ✓
   receipt-ledger ✓                                            capsule-client ✓
   otp-service ✓                                               run history (NEW, OBL-04)
```

The telemetry spine is the one column with nothing in it, and in T-2 and T-3 it is also what makes
the console able to see anything at all. That is the specification's centre of gravity, and §9 is
where the engineering is.

- **AMM-R-041.** Each component is a lazily imported module registered in the console's boot, of
  the same shape as every other module in this repository: `export async function mount(el)`.
- **AMM-R-042.** Each component is independently reachable, deep-linkable per-target (AMM-R-030),
  and independently degradable: with telemetry unavailable it renders what its reach allows and
  names what it cannot see (AMM-R-033).
- **AMM-R-043.** Every action the console adds is declared in `core/admin-actions.js` with its
  `domain`, `blast`, `permission` and `audit` event, so the suite's own guarantee holds across both
  surfaces — an action that exists is listed, and an action that is listed exists.
- **AMM-R-044.** The console carries its own boot watchdog, a classic non-module script, for the
  same reason `index.html` does: module resolution happens before any of its code runs, so a missing
  import cannot report itself. A control console that hangs silently is worse than none.

## 7. Component specifications

Sixteen components. Each states: **purpose · audience · data sources · features (F-n) · functions
(fn-n) · executable actions**. Action tables carry every column needed to build the action without a
second conversation.

Every component operates against the **active target** (§6.2) and renders only what its **reach**
(§6.3) allows, naming what it cannot see rather than showing zero. That applies to all sixteen and
is not restated in each.

Column key for action tables:
`Gov` = governance requirement — `C` confirm (AMM-R-009), `S` OTP step-up (AMM-R-008),
`A` audited (all are), `I` idempotent write (AMM-R-007).

Status, from §6.6: **New** — nothing exists · **Mostly exists** — delivered for the Admin Suite and
re-hosted per-target here · **Extend** — an existing screen or `core/` service, widened.

---

### CP-01 · Control Dashboard

**Purpose.** One screen that answers *is the platform healthy, is work moving, and is anything
waiting on me*, for every platform in the estate, without the reader choosing a tool first.

**Audience.** Every actor in §5.1. Content is role-scoped; the layout is not.

**Data sources.** Telemetry aggregate (§9) · `core/metrics-service.js` · `core/audit-log.js` ·
`core/endpoint-atlas.js` · `config/notification-matrix.config.js` · `core/receipt-ledger.js` ·
`config/platform-provisioning.config.js`.

#### Features

- **F-1 · Posture band.** A single, always-first statement of the worst thing currently true, in
  plain language, with the component that owns it one click away. Satisfies AMM-R-017.
- **F-2 · Four platform cards.** P-A Runtime, P-B Portal, P-C Estate, P-D Release — each with
  status, the metric that decides that status, and last-observed time.
- **F-3 · Work-in-flight strip.** Open references, open tasks, overdue, due within 24 h, pending
  approvals, pending dispatch — from `operationalMetrics()`, extended fleet-wide.
- **F-4 · Attention queue.** Every open alert (§10), ranked by severity then age, each with the one
  action that resolves it.
- **F-5 · Recent governed activity.** Last 20 audit events, actor-visible, deep-linked to CP-07.
- **F-6 · Scope declaration.** A persistent, unmissable statement of whether figures are
  fleet-wide or this device only (AMM-R-016).

#### Functions

`fn-1` compose posture from all component healths · `fn-2` resolve per-platform status ·
`fn-3` compute work-in-flight aggregates · `fn-4` rank the attention queue ·
`fn-5` role-scope every tile · `fn-6` render trend sparkline from telemetry history (inline SVG,
AMM-R-002) · `fn-7` declare denominator on every aggregate (AMM-R-014).

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-001 | Refresh all monitors | — | Re-reads telemetry and re-probes read-only health | `monitor:view` | A | `audit:monitor-refreshed` |
| ACT-002 | Acknowledge alert | Alert open | Marks acknowledged, records actor and time, stops re-notification | `alert:manage` | C·A·I | `audit:alert-acknowledged` |
| ACT-003 | Snooze alert | Alert open | Suppresses for a chosen window; expiry is itself an event | `alert:manage` | C·A·I | `audit:alert-snoozed` |
| ACT-004 | Open owning component | — | Deep-links to the component that owns the condition | `monitor:view` | — | — |
| ACT-005 | Export dashboard snapshot | — | Redacted JSON + printable HTML of the current posture | `monitor:view` | A | `audit:dashboard-exported` |
| ACT-006 | Pin / unpin a tile | — | Per-user layout preference; not audited state | `monitor:view` | — | — |

---

### CP-02 · System Health & Readiness

**Purpose.** Whether each platform can do its job right now, what is degraded, and what it costs —
extended from one browser to the fleet, and from a fraction to a declared denominator.

**Audience.** IT Support, System Administrator.

**Data sources.** `modules/diagnostics.js` checks · `core/platform-provisioner.js` ·
`core/activity-parity.js` · `config/browser-certification.config.js` · `config/auth.config.js` ·
telemetry aggregate (§9).

#### Features

- **F-1 · Check register.** Every runtime check, failures first, each with its plain consequence
  (`CHECK_CONSEQUENCE` pattern, AMM-R-013). Extended to cover all **25** atlas contract keys, not
  the 19 in `EndpointKeys` — closing G-M8 and baseline contradiction §2.4(1).
- **F-2 · Readiness verdict.** `READY · PARTIAL · NOT READY` per platform, with the denominator
  stated and the specific unmet items listed. Never `PASS` over a narrowed set (AMM-R-014).
- **F-3 · Authentication posture.** The existing `authPanel()` — posture, identity source, role
  source, ready-to-activate, missing configuration keys — promoted to a standing banner (AMM-R-022).
- **F-4 · Provisioning parity.** Route ↔ provisioning manifest in both directions; a route absent
  from `config/platform-provisioning.config.js` is a failure, not an omission.
- **F-5 · Backend readiness.** `DYNAMIC_ACTIONS` operation recognition, reported as *not verified*
  where no safe dry-run exists (AMM-R-015).
- **F-6 · Browser & viewport certification.** Certified viewport matrix, `forced-colors` support,
  `100dvh` support, and alignment between `AppConfig.certifiedViewports` and
  `BrowserCertification.viewports`.
- **F-7 · Health history.** 30 days of check results per platform, so "it broke on Tuesday" is
  answerable. New — requires §9.

#### Functions

`fn-1` evaluate every check against the full atlas · `fn-2` map failure → consequence sentence ·
`fn-3` compute readiness verdict with denominator · `fn-4` diff provisioning against routes ·
`fn-5` classify backend readiness (`verified` / `failed` / `not verified`) · `fn-6` build 30-day
history series · `fn-7` produce a redacted support bundle.

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-010 | Run all checks | — | Re-evaluates every check; records a health sample | `monitor:view` | A | `audit:diagnostics-run` |
| ACT-011 | Run one check | Check selected | Re-evaluates that check only | `monitor:view` | A | `audit:diagnostics-run` |
| ACT-012 | Copy health report | — | Redacted report to clipboard, safe to send to IT support | `monitor:view` | A | `audit:health-exported` |
| ACT-013 | Download support bundle | — | Redacted JSON: checks, posture, provisioning, atlas summary, last 200 audit events, queue state | `monitor:view` | C·A | `audit:support-bundle-exported` |
| ACT-014 | Re-validate provisioning | — | Re-runs `PlatformProvisioner.validate()` and republishes `window.__DGO_PROVISIONING__` | `monitor:operate` | A | `audit:provisioning-validated` |
| ACT-015 | Record a known-issue note | Check failing | Attaches an administrator note to a failing check, visible to every reader | `monitor:operate` | C·A·I | `audit:health-note-recorded` |
| ACT-016 | Clear a known-issue note | Note exists | Removes it, retaining both events in audit | `monitor:operate` | C·A·I | `audit:health-note-cleared` |

---

### CP-03 · Live Operations HUD

**Purpose.** What the platform is doing *right now* — synchronisation, lineage, intake placement,
queue depth — across the fleet rather than one tab.

**Audience.** IT Support, Registry Supervisor.

**Data sources.** `core/data-loader.js` (`lastLoad`, `requestId`, `runId`, `contractVersion`) ·
`config/entry-points.config.js` · `core/metrics-service.js` · `core/cache-manager.js` ·
`core/loading-state.js` · `core/pending-queue.js` · telemetry aggregate.

#### Features

- **F-1 · Synchronisation lineage.** Source contract, last-load time, request id, run id, contract
  version, outcome — per session, and aggregated as success rate and p95 duration.
- **F-2 · Collection inventory.** Per-collection record counts with drift from the previous sample.
- **F-3 · Intake feed placement (D4).** Per entry point: admitted count, `unplaced` (declared no
  entry point) and `conflicts` (arrived on one lane, declared another). Both are failure counts, not
  statistics — a rising `unplaced` means a producer stopped stamping its channel.
- **F-4 · Live operational metrics.** Open references, open tasks, overdue, due soon, pending
  approvals, pending dispatch.
- **F-5 · Data-operations panel.** Cache entries and hit rate, in-flight loading states, pending
  write depth, dedupe hits.
- **F-6 · Pending write queue.** Every queued write with key, age, last error and retry count,
  `RenderBudget.pendingRows`-capped with an explicit "showing n of m".
- **F-7 · Session map.** Active sessions by role and platform, with last-seen. New — requires §9.

#### Functions

`fn-1` read sync lineage · `fn-2` diff collection counts against last sample · `fn-3` classify feed
placement · `fn-4` compute operational metrics · `fn-5` summarise cache/loading/pending ·
`fn-6` cap and annotate long lists · `fn-7` aggregate sessions.

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-020 | Synchronise now | Online | Full `requestSync({mode:'full'})`; re-renders on completion | `monitor:view` | A | `audit:sync-requested` |
| ACT-021 | Synchronise one collection | Collection selected | Targeted refresh of that collection only | `monitor:view` | A | `audit:sync-requested` |
| ACT-022 | Retry queued writes | Queue non-empty | Drains `OfflineActionQueue`; each attempt writes a receipt | `monitor:operate` | C·A·I | `audit:queue-retried` |
| ACT-023 | Retry one queued write | Item selected | Retries that item only | `monitor:operate` | C·A·I | `audit:queue-retried` |
| ACT-024 | Discard a queued write | Item selected, retries exhausted | Removes it; records the payload digest and reason in audit. **Destructive** | `monitor:operate` | C·S·A·I | `audit:queue-item-discarded` |
| ACT-025 | Export queue state | — | Redacted JSON of every queued write and its history | `monitor:operate` | A | `audit:queue-exported` |
| ACT-026 | Copy request lineage | A load recorded | Copies request id, run id and contract version for a support ticket | `monitor:view` | — | — |
| ACT-027 | Open placement conflicts | `conflicts > 0` | Lists the records that disagree with their lane, with producer | `monitor:view` | — | — |

---

### CP-04 · Endpoint & Estate Console

**Purpose.** Every contract key on both surfaces, every workflow in the tenant, what each is doing,
what is wrong with it, and the controls to change it. Extends the existing six-tab console with
estate-side run health.

**Audience.** System Administrator, IT Support, Release Manager.

**Data sources.** `config/endpoints.config.js` (19 internal contracts) ·
`config/endpoint-atlas.data.js` (**25 keys / 51 workflows**) · `core/endpoint-atlas.js` ·
`core/endpoint-registry.js` · flow run history (new, OBL-04).

#### Features

- **F-1 · Findings first.** The default tab is what is *wrong*, not a list of green ticks —
  retained from the existing console. Chief among them: a URL that is present, HTTPS, correctly
  signed, and pointing at the wrong flow. It fails nothing and succeeds against the wrong flow.
- **F-2 · Endpoint register.** Per key: contract, method, read-only/write, timeout, resolution
  source (deployment manifest → operator override → packaged default), target workflow, findings.
- **F-3 · Flow estate.** All **51** tenant workflows, not only the ~20 in use — because 14 carry a
  contract-key name while serving nothing, and 8 of those still answer. Wiring by name is a mistake
  this tenant actively rewards.
- **F-4 · Live health probe.** Read-only contracts only (AMM-R-018), with status, latency and body
  shape. Write contracts show *not probed — every call is a write*, never *unknown*.
- **F-5 · Run health.** Per flow: 24 h / 7 d run count, failure rate, p95 duration, last failure
  and its message. **New**, and the whole of G-M7.
- **F-6 · Configuration.** Per-key override with the scope stated where the control is: *an
  override is stored in this browser, for this device. The estate is configured by
  `npm run setup -- --values <file> --force` and shipped by `npm run package`.*
- **F-7 · Reference.** Trigger contracts, request/response shapes, and the workflow id map.

#### Functions

`fn-1` reconcile keys against the atlas · `fn-2` classify findings by severity · `fn-3` resolve each
key through the registry precedence · `fn-4` probe read-only contracts · `fn-5` compute run-health
aggregates · `fn-6` redact every rendered and exported URL (AMM-R-011) · `fn-7` diff configured
target against atlas-declared target.

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-030 | Probe all read-only endpoints | Online | Calls every read-only contract; records status, latency, shape | `estate:view` | C·A | `audit:endpoint-probed` |
| ACT-031 | Probe one endpoint | Read-only contract selected | Probes that contract | `estate:view` | A | `audit:endpoint-probed` |
| ACT-032 | Set an endpoint override | Admin; valid HTTPS URL | Stores a device-local override; refuses malformed URLs and duplicate targets | `estate:manage` | C·S·A·I | `audit:endpoint-override-set` |
| ACT-033 | Clear one override | Override present | Key reverts to the installed address | `estate:manage` | C·A·I | `audit:endpoint-override-cleared` |
| ACT-034 | Restore all installed addresses | Any override present | Clears every device-local override | `estate:manage` | C·A·I | `audit:endpoint-overrides-restored` |
| ACT-035 | Empty every address | Admin | Platform can no longer reach the registry from this device. **Destructive** | `estate:manage` | C·S·A·I | `audit:endpoint-overrides-emptied` |
| ACT-036 | Export estate report | — | Redacted by construction: keys, targets, findings, run health | `estate:view` | A | `audit:estate-exported` |
| ACT-037 | Acknowledge a finding | Finding open | Records that an administrator has seen it, with a reason; it stays open | `estate:manage` | C·A·I | `audit:estate-finding-acknowledged` |
| ACT-038 | Refresh run health | Run-history endpoint configured (OBL-04) | Pulls latest run statistics from the tenant | `estate:view` | A | `audit:run-health-refreshed` |
| ACT-039 | Copy support address report | — | Redacted per-key report for an IT ticket | `estate:view` | — | — |

---

### CP-05 · Identity & Access Manager

**Purpose.** Who exists, what they may do, what they have done, and the evidence of every change —
for both platforms.

**Audience.** User Administrator, System Administrator, Auditor.

**Data sources.** `config/rbac.config.js` (6 roles, 13 + 6 permissions) ·
`state.users` · `docs/reference/role-catalogue-seed.json` · `core/current-user.js` ·
`core/audit-log.js`.

#### Features

- **F-1 · Directory.** Every user: name, email, role, persona, directorate, status, last seen,
  enrolment state. Sortable, filterable, `RenderBudget`-capped with a stated total.
- **F-2 · Role-capability matrix.** Role × permission × route, rendered from config, so the table a
  human reads is the table the code enforces — the defect finding F-020 recorded.
- **F-3 · Effective-access inspector.** Choose a user, see exactly which routes and actions they can
  reach and *why* (which row granted it). Answers access questions without reasoning about code.
- **F-4 · Access change history.** Every role assignment, enable and disable, with actor and time,
  filtered from the audit ledger.
- **F-5 · Bulk enrolment.** Import a directorate roster; preview every change before applying.
- **F-6 · Escalation posture.** A standing statement: while authentication is inert, role is read
  from local state and editing one storage key escalates a viewer to `systemAdmin`. Stated here,
  where access is managed, not only in documentation (AMM-R-022).
- **F-7 · Orphan and anomaly detection.** Users with no role, roles with no users, accounts unseen
  for 90 days, and any account whose stored role is not in `Roles`.

#### Functions

`fn-1` normalise user records · `fn-2` derive persona from role via `RolePersonaMap` ·
`fn-3` compute effective route set per user · `fn-4` explain a grant (which row, which table) ·
`fn-5` filter audit by identity vocabulary · `fn-6` diff a roster import against the directory ·
`fn-7` detect orphans and anomalies.

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-040 | Create user | `user:create`; unique email | Adds a user record | `user:create` | C·A·I | `audit:user-created` |
| ACT-041 | Update user | User exists | Updates name, directorate, contact | `user:update` | C·A·I | `audit:user-updated` |
| ACT-042 | Assign role | `role:assign`; role in `Roles` | Changes role and derived persona | `role:assign` | C·S·A·I | `audit:user-role-assigned` |
| ACT-043 | Disable user | User active | Sets status `disabled`; `ensureCurrentUserActive()` denies every subsequent governed action | `user:disable` | C·S·A·I | `audit:user-disabled` |
| ACT-044 | Re-enable user | User disabled | Restores `active` | `user:disable` | C·S·A·I | `audit:user-enabled` |
| ACT-045 | Bulk import roster | Valid file; preview accepted | Applies the previewed diff only | `user:create` | C·S·A·I | `audit:roster-imported` |
| ACT-046 | Export directory | — | CSV/JSON of users, roles and status. No credentials | `user:view` | A | `audit:directory-exported` |
| ACT-047 | Inspect effective access | User selected | Read-only explanation of every grant | `role:view` | — | — |
| ACT-048 | Export access-change history | — | Filtered audit extract for an access review | `audit:view` | A | `audit:access-history-exported` |
| ACT-049 | Force sign-out of a user | Auth enforced (OBL-01) | Invalidates sessions. **Unavailable while auth is inert; the control states why** | `role:assign` | C·S·A·I | `audit:user-signed-out` |

---

### CP-06 · Platform Configuration Manager

**Purpose.** Every setting that changes platform behaviour, in one place, with its scope, its
authority and its consequence stated at the control.

**Audience.** System Administrator, IT Support.

**Data sources.** `config/app.config.js` · `config/auth.config.js` · `config/fetch-policy.config.js` ·
`config/cache-policy.config.js` · `config/performance-budget.config.js` ·
`config/priority.config.js` · `config/status-vocabulary.config.js` ·
`config/workflow-clarity.config.js` · `config/notification-delivery.config.js` · `state.settings`.

#### Features

- **F-1 · Setting register.** Every setting: plain name, current value, default, **scope**
  (device · deployment · repository), authority (which file, which command), and consequence of
  change. A setting whose authority is a build-time file is shown read-only with the command that
  changes it.
- **F-2 · Scope honesty.** Three visually distinct scopes. A device-scope control never presents as
  estate configuration — the misconception the endpoint console already warns about, generalised.
- **F-3 · Personal preferences.** Theme (light / dark / high-contrast), density (comfortable /
  compact), profile. Unchanged behaviour, moved under one register.
- **F-4 · Operational limits.** Bulk-assignment cap, table pagination threshold, search debounce,
  background refresh floor — editable within the bounds `config/performance-budget.config.js`
  declares, and refused outside them.
- **F-5 · Configuration diff.** Current effective configuration versus packaged default, so "what
  is non-standard about this deployment" is one screen.
- **F-6 · Change history.** Every configuration change, actor, time, before → after.
- **F-7 · Vocabulary registers.** Priority scale and status vocabulary shown read-only with their
  aliases, so an administrator can answer why a record displays a word the flow did not send.

#### Functions

`fn-1` enumerate settings with scope and authority · `fn-2` validate a proposed value against its
budget · `fn-3` diff effective versus default · `fn-4` preview a change (`actionPreview()`) ·
`fn-5` filter audit for configuration vocabulary · `fn-6` resolve alias → canonical for priority
and status.

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-050 | Save profile | — | Updates name, email, persona where permitted | — | C·A·I | `audit:settings-updated` |
| ACT-051 | Change theme or density | — | Applies to `<html>` only — never mirrored onto descendants | — | A | `audit:settings-updated` |
| ACT-052 | Change an operational limit | Value within budget | Updates the limit; refuses out-of-bounds with the bound named | `settings:manage` | C·A·I | `audit:settings-updated` |
| ACT-053 | Import records from a file | Valid export file | Reconciles records into state; count reported | `settings:manage` | C·A·I | `audit:state-imported` |
| ACT-054 | Export configuration | — | Redacted effective configuration | `settings:manage` | A | `audit:config-exported` |
| ACT-055 | Reset to packaged defaults | — | Clears every device-scope override | `settings:manage` | C·S·A·I | `audit:config-reset` |
| ACT-056 | Clear this device's data | — | Removes profile, cached lists, **queued writes** and the local audit copy. Registry records are not deleted. **Destructive** | — | C·S·A·I | `audit:local-data-cleared` |
| ACT-057 | Replay welcome sequence | — | Restarts the introduction. Deletes nothing | — | A | `audit:welcome-replayed` |
| ACT-058 | Copy configuration report | — | Redacted report for an IT ticket | `settings:manage` | — | — |

---

### CP-07 · Audit & Evidence Explorer

**Purpose.** A reader for the audit ledger. The platform has written audit events since R11.0 and
has never had a screen that reads them. This is G-M9.

**Audience.** Auditor, User Administrator, System Administrator, Executive.

**Data sources.** `core/audit-log.js` (`query()`, `byReference()`, `snapshot()`, 5,000-event ring) ·
`state.audit` (capped 1,000) · `core/receipt-ledger.js` · telemetry archive (§9).

#### Features

- **F-1 · Timeline.** Every audit event: time, actor, action label, phase (`started` / `completed` /
  `failed`), reference, entity, status transition. Newest first.
- **F-2 · Filters.** Actor · action · audit vocabulary · reference · entity type · date range ·
  phase · outcome. Composable, deep-linkable.
- **F-3 · Record dossier.** Every event for one reference, in order, across modules — the complete
  custody trail for a single correspondence, from intake to archive.
- **F-4 · Failure view.** Failed actions with the **raw technical detail intact** — this is the
  channel that is allowed to carry it (AMM-R-010) — alongside what the operator was shown.
- **F-5 · Coverage statement.** How far back the ledger reaches, what has been evicted by the ring
  buffer, and whether telemetry archive extends it. An audit reader that implies completeness it
  does not have is worse than none.
- **F-6 · Evidence export.** A defensible extract: filtered events, generation time, actor, filter
  criteria, and a digest over the payload.
- **F-7 · Receipt reconciliation.** Audit events matched against delivery receipts, so *we recorded
  it* and *it left the device* are two separate answers.

#### Functions

`fn-1` query with composed predicates · `fn-2` assemble a per-reference dossier · `fn-3` resolve
action → plain label from `config/action-ownership.config.js` · `fn-4` pair audit with receipts ·
`fn-5` compute ledger coverage and eviction · `fn-6` digest an export.

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-060 | Search audit | `audit:view` | Returns filtered events | `audit:view` | — | — |
| ACT-061 | Open record dossier | Reference known | Full custody trail for one reference | `audit:view` | — | — |
| ACT-062 | Export evidence extract | Filter applied | Signed-by-digest JSON + printable HTML | `audit:view` | C·A | `audit:evidence-exported` |
| ACT-063 | Export full ledger | `systemAdmin` | Entire ring buffer, redacted | `audit:view` | C·S·A | `audit:ledger-exported` |
| ACT-064 | Copy an event | Event selected | Copies one event as JSON for a ticket | `audit:view` | — | — |
| ACT-065 | Reconcile against receipts | Receipts present | Lists recorded-but-never-sent and sent-but-unrecorded | `audit:view` | A | `audit:receipt-reconciled` |
| ACT-066 | Archive ledger segment | Telemetry archive available (OBL-03) | Ships a segment to durable storage before eviction | `monitor:operate` | C·S·A·I | `audit:ledger-archived` |

---

### CP-08 · Notification & Escalation Control

**Purpose.** Every message the estate owes, whether it is actually sent, to whom, and what happens
when it is not. Backed by the obligation matrix that already exists and has no product surface.

**Audience.** System Administrator, Registry Supervisor, Portal Operator.

**Data sources.** `config/notification-matrix.config.js` (**39 required**, 6 surplus, 4 channels,
11 audiences, 4 severities, 6 provisioning states) · `config/notification-delivery.config.js` ·
`core/notification-center.js` · `core/receipt-ledger.js` · `scripts/verify-notification-matrix.mjs`.

#### Features

- **F-1 · Obligation register.** All 39 required notifications: event, platform, audience, channel,
  trigger, carrier, content, failure behaviour, basis, and **current provisioning state**.
- **F-2 · Compliance summary.** The four numbers that matter, stated without softening:
  `PROVISIONED 16 · MISADDRESSED 6 · ABSENT 9 · LOCAL_ONLY 4 · REGRESSION 2 · UNIMPLEMENTED 2`.
- **F-3 · Misaddressing view.** The specific failure this estate has most of: sent, but to a
  hard-coded mailbox rather than the audience the row names. 70 of 76 live mail actions.
- **F-4 · Delivery ledger.** Per message: attempted, delivered, failed, with the receipt that proves
  it — where a carrier writes one.
- **F-5 · Escalation rules.** The chains defined in §10, editable, with their clocks and targets.
- **F-6 · Channel status.** Per channel: email (O365 via `SendEmailV2`), in-app, ledger, SMS —
  including that **SMS is advertised by the OTP trigger contract and has no carrier in the estate**.
  An advertised channel with no carrier is reported as unimplemented, never as available.
- **F-7 · Surplus register.** The 6 notifications the estate sends that no obligation requires —
  candidates for removal, shown so they are a decision rather than an accident.

#### Functions

`fn-1` join the matrix to live delivery evidence · `fn-2` compute compliance by platform and
severity · `fn-3` resolve audience → actual recipient for each carrier · `fn-4` evaluate escalation
clocks · `fn-5` test channel reachability (read-only) · `fn-6` diff declared status against
verifier output, so the matrix cannot go stale.

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-070 | Re-verify the matrix | — | Recomputes each row's status from the artefacts; flags disagreement | `alert:manage` | A | `audit:notification-matrix-verified` |
| ACT-071 | Send a test notification | Channel configured; test recipient is the actor | Sends one message to the acting administrator only. Never to a real audience | `alert:manage` | C·S·A·I | `audit:notification-test-sent` |
| ACT-072 | Create escalation rule | Valid clock and target | Adds a rule per §10 | `alert:manage` | C·A·I | `audit:escalation-rule-created` |
| ACT-073 | Edit escalation rule | Rule exists | Updates threshold, target or channel | `alert:manage` | C·A·I | `audit:escalation-rule-updated` |
| ACT-074 | Disable escalation rule | Rule active | Stops the rule; reason required | `alert:manage` | C·S·A·I | `audit:escalation-rule-disabled` |
| ACT-075 | Resend a failed notification | Failed receipt exists | Re-attempts one message, idempotency-keyed so it cannot double-send | `alert:manage` | C·A·I | `audit:notification-resent` |
| ACT-076 | Export compliance report | — | The register, its states, and the basis citation per row | `alert:manage` | A | `audit:notification-report-exported` |
| ACT-077 | Acknowledge an obligation gap | Row not `PROVISIONED` | Records an administrator's acceptance and target date; the row stays non-compliant | `alert:manage` | C·A·I | `audit:notification-gap-acknowledged` |

---

### CP-09 · SLA & Workload Monitor

**Purpose.** Whether work is moving, what has missed its deadline, who is carrying it, and what has
been done about it — separated from FastTrack's *action* half, which stays where it is.

**Audience.** Registry Supervisor, Director, Executive.

**Data sources.** `state.tracking`, `state.activities`, `state.approvals`, `state.dispatches`,
`state.escalations` · `core/metrics-service.js` · `config/priority.config.js` ·
`config/assignment-cascade.config.js` · `config/organizational-units.config.js` · telemetry.

#### Features

- **F-1 · SLA board.** Breached · due within 24 h · unassigned · in flight · completed — by
  directorate, by assignee, by category, by entry point.
- **F-2 · Ageing profile.** Distribution of open work by age bucket, so a build-up is visible before
  it is a breach.
- **F-3 · Cycle-time analysis.** Time in each lifecycle stage (intake → assignment → work → review →
  dispatch → archive), with median and p90 per stage. Identifies *which* stage is slow.
- **F-4 · Workload distribution.** Open items per officer and per unit, with a flag where one
  officer carries a disproportionate share.
- **F-5 · Escalation register.** Open escalations by level, age and reason; resolution rate.
- **F-6 · Acknowledgement compliance.** Assigned versus acknowledged versus overdue-unacknowledged —
  the measure that says whether assignment is reaching people at all.
- **F-7 · Threshold binding.** Each measure carries the alert rule that watches it (§10). A measure
  with no rule is shown as **unwatched**, which is the honest description of all 54 records today.

#### Functions

`fn-1` classify risk (`Breached` · `Unassigned` · `Due soon` · priority) · `fn-2` bucket by age ·
`fn-3` compute per-stage cycle times from audit transitions · `fn-4` aggregate workload by officer
and unit · `fn-5` compute acknowledgement compliance · `fn-6` bind measure → rule → current state.

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-080 | Recalculate SLA board | — | Re-derives every measure from current state | `monitor:view` | A | `audit:sla-recalculated` |
| ACT-081 | Set an SLA threshold | `alert:manage` | Binds a threshold to a measure; creates the watching rule | `alert:manage` | C·A·I | `audit:sla-threshold-set` |
| ACT-082 | Escalate an item | Item open | Raises escalation level, records reason. Delegates to FastTrack's owned action | `monitor:operate` | C·A·I | `audit:executive-escalated` |
| ACT-083 | Resolve an escalation | Escalation open | Marks resolved with actor and time | `monitor:operate` | C·A·I | `audit:escalation-resolved` |
| ACT-084 | Notify an owner | Item has an assignee | Queues an owner notification through CP-08's carrier, not a fixed mailbox | `monitor:operate` | C·A·I | `audit:ack-reminder` |
| ACT-085 | Export SLA report | — | Period report by directorate, with method stated | `executive:export` | A | `audit:report-generated` |
| ACT-086 | Rebalance workload (propose) | Imbalance detected | **Proposes** a reassignment set; applying it routes through the assignment module's owned action | `bulk:assign` | C·S·A·I | `audit:bulk-assignment-submitted` |

---

### CP-10 · Data, Queue & Cache Manager

**Purpose.** The durability machinery — pending writes, offline acknowledgements, receipts, cache —
as one manageable surface rather than three panels split across two screens.

**Audience.** IT Support, System Administrator.

**Data sources.** `core/pending-queue.js` · `core/offline-action-queue.js` ·
`core/receipt-ledger.js` · `core/cache-manager.js` · `config/cache-policy.config.js` ·
`core/loading-state.js` · `core/write-manager.js` · `core/data-reconciler.js`.

#### Features

- **F-1 · Queue register.** Every queued write: operation, reference, actor, age, attempts, last
  error, idempotency key (digest shown, payload not). Fleet-wide once §9 lands.
- **F-2 · Receipt ledger.** Every delivery attempt with outcome `queued` / `sent` / `failed`,
  per-reference, with the count that matters — failed receipts.
- **F-3 · Cache inspector.** Entries, size, age, TTL per policy, hit rate, and which contract
  populated each.
- **F-4 · Write-mode visibility.** Which writes are `local`, `backend` or `optimistic`, and for
  optimistic writes, which have rolled back.
- **F-5 · Reconciliation.** Local state versus last backend load, listing records that exist only
  locally and records whose local copy is stale.
- **F-6 · Storage budget.** `localStorage` consumption against browser quota, with the eviction
  order that applies when it is exceeded. A platform that silently fails to persist is worse than
  one that warns.
- **F-7 · Offline posture.** Online/offline state, time offline, what accumulated during it, and
  what drained on reconnection.

#### Functions

`fn-1` enumerate the queue with derived age and attempt count · `fn-2` summarise receipts by
outcome · `fn-3` read cache statistics against policy TTLs · `fn-4` classify writes by mode ·
`fn-5` diff local state against last load · `fn-6` measure storage consumption · `fn-7` record
online/offline transitions.

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-090 | Drain the queue | Online; queue non-empty | Retries every queued write in order; receipt per attempt | `monitor:operate` | C·A·I | `audit:queue-retried` |
| ACT-091 | Retry acknowledgements | Ack queue non-empty | `OfflineActionQueue.retryAckQueue()`; reports sent/failed | `monitor:operate` | C·A·I | `audit:acknowledgement-retried` |
| ACT-092 | Discard a queued write | Retries exhausted; reason given | Removes it; digest and reason recorded. **Destructive** | `monitor:operate` | C·S·A·I | `audit:queue-item-discarded` |
| ACT-093 | Export receipts | — | `ReceiptLedger.exportJSON()` download | `monitor:view` | A | `audit:receipts-exported` |
| ACT-094 | Clear receipt ledger | Receipts exported or explicitly waived | Empties the ledger. **Destructive — delivery evidence is lost** | `monitor:operate` | C·S·A·I | `audit:receipts-cleared` |
| ACT-095 | Invalidate cache | — | Clears cached responses; next read goes to the contract | `monitor:operate` | C·A | `audit:cache-invalidated` |
| ACT-096 | Invalidate one cache entry | Entry selected | Clears that contract's cached response | `monitor:operate` | C·A | `audit:cache-invalidated` |
| ACT-097 | Force reconciliation | Backend reachable | Re-reads and reconciles against the backend; reports the diff before applying | `monitor:operate` | C·S·A·I | `audit:state-reconciled` |
| ACT-098 | Export queue and receipt bundle | — | One redacted evidence bundle for a support escalation | `monitor:view` | A | `audit:queue-exported` |

---

### CP-11 · Portal Operations Console

**Purpose.** An operator view of the public Document Portal. Today there is none — the portal has
four public pages and no administrative surface at all (G-M4). A citizen-facing service with no
operator view cannot be run; it can only be hoped about.

**Audience.** Portal Operator, Registry Supervisor, IT Support.

**Data sources.** Portal submission flows (`CG_Submission_Endpoint` and siblings) ·
Portal Registry and Portal Outbox Receipts SharePoint lists · `config/status-vocabulary.config.js` ·
`config/notification-matrix.config.js` (portal rows: 8) · service-worker version from the deployed
portal build.

#### Features

- **F-1 · Submission stream.** Every public submission: tracking id, type, time, attachment count,
  channel, current status, and the internal record it became.
- **F-2 · Confirmation compliance.** The portal promises every submitter a confirmation and tells
  them to call the helpdesk if it does not arrive within one working day. This shows, per
  submission, whether that message was actually sent — the obligation `RN-001` states and the
  delivery receipt proves.
- **F-3 · Tracking integrity.** Whether the status a citizen sees on `track.html` matches the
  internal status, through the governed vocabulary mapping. A citizen reading *Under review* and an
  officer reading *Pending* is the defect V-04 records; this is the monitor for it.
- **F-4 · Support queue.** Submissions through `support.html`, their case references, and whether
  the response the portal implies was actually sent.
- **F-5 · Portal health.** Availability, service-worker version in the field versus published, cache
  staleness, offline-shell integrity, and submission error rate by type.
- **F-6 · Intake reconciliation.** Portal submissions versus records admitted into the internal
  platform — the count that finds submissions that arrived and never became work.
- **F-7 · Attachment posture.** Upload success rate, size distribution against the payload budget,
  and rejected uploads by reason.

#### Functions

`fn-1` stream submissions with derived age · `fn-2` join submission → outbox receipt ·
`fn-3` map internal status → published vocabulary and flag divergence · `fn-4` compute portal error
rates · `fn-5` detect service-worker version skew · `fn-6` reconcile portal intake against internal
records · `fn-7` summarise attachment outcomes.

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-100 | Refresh submission stream | Portal read contract configured | Pulls latest submissions | `monitor:view` | A | `audit:portal-stream-refreshed` |
| ACT-101 | Open a submission | Submission selected | Full detail with its internal record and receipt trail | `monitor:view` | — | — |
| ACT-102 | Resend a confirmation | Confirmation absent or failed | Re-sends to the submitter's own address, idempotency-keyed | `alert:manage` | C·S·A·I | `audit:notification-resent` |
| ACT-103 | Promote a stranded submission | Submission with no internal record | Creates the correspondence through the owning module's action — never a direct write | `monitor:operate` | C·S·A·I | `audit:correspondence-created` |
| ACT-104 | Flag a status divergence | Published ≠ internal | Records the divergence for investigation; does not silently correct either side | `monitor:operate` | C·A·I | `audit:status-divergence-flagged` |
| ACT-105 | Export portal operations report | — | Submissions, confirmations, divergences, error rates for a period | `executive:export` | A | `audit:report-generated` |
| ACT-106 | Probe portal health | — | Read-only availability and version check | `monitor:view` | A | `audit:portal-probed` |
| ACT-107 | Publish a portal service notice | `systemAdmin` | Sets the banner citizens see on the portal. **Outward-facing — step-up and preview mandatory** | `settings:manage` | C·S·A·I | `audit:portal-notice-published` |
| ACT-108 | Withdraw a portal service notice | Notice published | Removes the banner | `settings:manage` | C·A·I | `audit:portal-notice-withdrawn` |

---

### CP-12 · Release & Commissioning Manager

**Purpose.** Whether this deployment can go live, what it is wired to, and what stands between the
repository and production — in the product, not only in a terminal. It wraps the existing gates; it
does not reimplement them (§1.3).

**Audience.** Release Manager, System Administrator.

**Data sources.** `scripts/commission-check.mjs` (`npm run commission`) ·
`scripts/package.mjs` · `PACKAGE_MANIFEST.json` / `DEPLOY.md` from a built package ·
`docs/deployment/PRODUCTION_READINESS_REGISTER.json` · `scripts/rotation-register.mjs` ·
`docs/audits/CAPABILITY_ASSESSMENT_R11.6.md` gap register.

#### Features

- **F-1 · Commissioning gate.** Every obligation between here and live, its state, its owner, and
  **which of them only a human can discharge**. This distinction is the point of the gate.
- **F-2 · Deployment identity.** Build id, package hash, wired endpoint count, exposure stamp, build
  time, and what distinguishes this deployment from the one it replaced.
- **F-3 · Readiness register.** The production readiness register rendered as a live checklist, not
  a static JSON file.
- **F-4 · Gap register.** The `G-nn` capability gaps with current state — `Fixed` / `Open` /
  `Provisioned, inert` — including the two that remain open (G-03 rotation, G-04 server-side
  enforcement).
- **F-5 · Package inspector.** For a built package: which endpoints are wired, which are missing,
  whether any packaged signature is disclosed, and whether the module graph resolves.
- **F-6 · Environment comparison.** Development versus pilot versus production posture, side by
  side, so a difference is visible rather than discovered at an officer's desk.
- **F-7 · Verification results.** Latest results of the quality gate — the Node suites and the
  Playwright suite — with what each proves and, crucially, what it does not.

#### Functions

`fn-1` read and render the commissioning report · `fn-2` resolve deployment identity from the
manifest · `fn-3` render the readiness register with state · `fn-4` join the gap register to
current evidence · `fn-5` verify a package against its manifest · `fn-6` diff environment postures ·
`fn-7` summarise the last verification run.

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-110 | Run the commissioning gate | `release:manage` | Executes the readiness gate and renders the report | `release:manage` | A | `audit:commissioning-run` |
| ACT-111 | Verify this deployment | Manifest present | Checks the running deployment against its own manifest | `release:manage` | A | `audit:deployment-verified` |
| ACT-112 | Export readiness report | — | The full register with evidence citations | `release:manage` | A | `audit:readiness-exported` |
| ACT-113 | Mark an obligation discharged | Obligation is human-dischargeable; evidence attached | Records who discharged it, when, and with what evidence | `release:manage` | C·S·A·I | `audit:obligation-discharged` |
| ACT-114 | Reopen an obligation | Previously discharged | Returns it to open with a reason | `release:manage` | C·A·I | `audit:obligation-reopened` |
| ACT-115 | Compare environments | Two postures available | Side-by-side configuration and wiring diff | `release:manage` | — | — |
| ACT-116 | Export deployment fingerprint | — | Build id, hashes, wiring, exposure — for a change record | `release:manage` | A | `audit:fingerprint-exported` |

> **Boundary.** CP-12 **never builds or ships**. `npm run package` and `npm run setup` are
> repository commands run by a person with the values file. CP-12 reports, verifies and records.
> A console that can mint a production package from a browser is a console that can mint one from
> a compromised browser.

---

### CP-13 · Reporting & Export Studio

**Purpose.** Every report the office needs, from one place, with its method stated and its
provenance attached.

**Audience.** Executive, Director, Registry Supervisor, Auditor.

**Data sources.** `core/report-export-service.js` · `core/export-bundle.js` ·
`core/executive-register.js` · `core/metrics-service.js` · `core/audit-log.js` ·
`config/organizational-units.config.js` · telemetry archive.

#### Features

- **F-1 · Report catalogue.** Named reports with purpose, audience, period, method and required
  permission: Correspondence Volume · Lifecycle Throughput · SLA Compliance · Acknowledgement
  Compliance · Directorate Workload · Dispatch & Closure · Portal Intake · Access Review ·
  Audit Evidence · Estate Health · Notification Compliance.
- **F-2 · Parameterisation.** Period, directorate, category, entry point, priority, status — bound
  to the canonical vocabularies so a report cannot group on an alias.
- **F-3 · Method statement.** Every report states how each figure was computed, over what
  denominator, and what it excludes. A number without a method is not a report.
- **F-4 · Provenance.** Generation time, actor, parameters and source-data timestamp on every
  export, so two copies of the same report can be told apart.
- **F-5 · Formats.** On-screen · printable HTML · CSV · JSON. No PDF library is added (AMM-R-002);
  print styling produces the PDF through the browser.
- **F-6 · Scheduled reports.** A recurring report definition delivered through CP-08's carriers.
  Requires OBL-05.
- **F-7 · Redaction.** Every export passes the same redaction as every other surface (AMM-R-011),
  and personal data is included only where the report's purpose requires it.

#### Functions

`fn-1` resolve a report definition · `fn-2` validate parameters against vocabularies ·
`fn-3` compute the dataset · `fn-4` render method and denominator · `fn-5` serialise to each format ·
`fn-6` attach provenance · `fn-7` evaluate a schedule.

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-120 | Generate a report | Parameters valid | Produces the report on screen | `executive:view` | A | `audit:report-generated` |
| ACT-121 | Export a report | Report generated | Downloads in the chosen format with provenance | `executive:export` | A | `audit:report-generated` |
| ACT-122 | Save a report definition | Parameters valid | Stores a named, re-runnable definition | `executive:export` | C·A·I | `audit:report-definition-saved` |
| ACT-123 | Delete a report definition | Definition exists | Removes it | `executive:export` | C·A·I | `audit:report-definition-deleted` |
| ACT-124 | Schedule a report | Definition saved; carrier available (OBL-05) | Creates a recurring delivery | `executive:export` | C·S·A·I | `audit:report-scheduled` |
| ACT-125 | Cancel a schedule | Schedule exists | Stops future deliveries | `executive:export` | C·A·I | `audit:report-schedule-cancelled` |
| ACT-126 | Export an evidence bundle | `audit:view` | Report plus the audit extract supporting it | `audit:view` | C·A | `audit:evidence-exported` |

---

### CP-14 · Security & Posture Console

**Purpose.** One statement of the platform's actual security posture, including the parts that are
uncomfortable — because those are the parts a console exists to surface.

**Audience.** System Administrator, Release Manager, Auditor.

**Data sources.** `config/auth.config.js` (`authPosture()`, `missingActivationConfig()`) ·
`core/endpoint-registry.js` warnings · `scripts/rotation-register.mjs` ·
`docs/architecture/ROTATION_REGISTER.md` · `tests/check-secrets.mjs` baseline ·
`docs/architecture/AUTHENTICATION_CONTRACT.md` §2 obligations.

#### Features

- **F-1 · Authentication posture.** `ENFORCED` or `PROVISIONED — INERT`, identity source, role
  source, ready-to-activate, and the configuration keys still missing. While inert, it states the
  consequence in one sentence: caller identity is a client-asserted value from local storage, RBAC
  is advisory, and editing one storage key escalates a viewer to system administrator.
- **F-2 · Server-obligation register.** The seven obligations in the authentication contract — token
  validation, role derivation, per-action authorisation, idempotency, rate limiting, reference
  minting, upload ticketing and filename policy — each with its state. **The client can only decline
  to send a request, never prevent one.**
- **F-3 · Credential exposure.** Signed trigger URLs published in the repository, resolved to
  distinct flows, with those that carried more than one signature called out — while they were
  live, an older trigger URL stayed valid alongside the newer one. **They are not live now:**
  `ITEM-22` re-issued the estate and all 25 contract keys reconciled to different workflows than
  the corpus records, so the panel reports a retained corpus rather than an open exposure. Counts
  come from the rotation register, never restated here, because they have been wrong before when
  restated.
- **F-4 · Rotation worklist.** Per flow: whether rotation is required, done, or blocked, and by whom.
- **F-5 · Disclosure posture of this deployment.** Whether the running deployment resolves any
  endpoint to a packaged signed URL — the warning `EndpointRegistry.describeAll()` already raises.
- **F-6 · Secret ratchet.** The baseline count and whether it has moved. A ratchet reports; it does
  not gate, because deleting a file revokes nothing.
- **F-7 · Access-anomaly review.** Privilege changes, disabled-account activity attempts, and
  role assignments outside business hours.

#### Functions

`fn-1` read auth posture and missing keys · `fn-2` render the obligation register with state ·
`fn-3` read the rotation register · `fn-4` detect packaged-signature resolution · `fn-5` compare the
secret baseline · `fn-6` scan audit for access anomalies · `fn-7` never render a signature
(AMM-R-011).

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-130 | Refresh posture | — | Re-reads auth posture, registry warnings and rotation state | `estate:view` | A | `audit:posture-refreshed` |
| ACT-131 | Export posture statement | — | A dated, redacted security posture statement | `estate:view` | C·A | `audit:posture-exported` |
| ACT-132 | Mark a rotation complete | Rotation performed in the tenant; evidence attached | Records completion with actor, time and evidence | `estate:manage` | C·S·A·I | `audit:rotation-recorded` |
| ACT-133 | Mark an obligation implemented | Server obligation verifiably met | Records it with the verification used | `estate:manage` | C·S·A·I | `audit:obligation-discharged` |
| ACT-134 | Raise a security finding | — | Creates a tracked finding with severity and owner | `estate:manage` | C·A·I | `audit:security-finding-raised` |
| ACT-135 | Close a security finding | Finding open; resolution recorded | Closes it; both events retained | `estate:manage` | C·S·A·I | `audit:security-finding-closed` |
| ACT-136 | Export access-anomaly review | — | Filtered audit extract for a periodic access review | `audit:view` | A | `audit:access-history-exported` |

> **Not available from this console, by design:** minting, rotating or displaying a credential.
> Rotation happens in Power Automate. This console records that it happened and shows what is
> still exposed.

---

### CP-15 · Retention & Disposition Manager

**Purpose.** What the platform is holding, under which retention class, until when, and what happens
at expiry. `core/retention.js` computes this today and nothing surfaces it.

**Audience.** System Administrator, Registry Supervisor, Auditor.

**Data sources.** `core/retention.js` (`RetentionPolicy`: default 7 y · Legal 10 · Executive
directive 10 · Routine administrative 5 · General 3) · `core/archive.js` ·
`docs/cutover/ARCHIVE_DISPOSITION.md` · `config/receipt-ledger.config.js` ·
`config/state-schema.config.js`.

#### Features

- **F-1 · Retention register.** Records by class, with count, earliest and latest expiry, and
  security classification.
- **F-2 · Expiry horizon.** What falls due in the next 30 / 90 / 365 days, so disposition is planned
  rather than discovered.
- **F-3 · Disposition queue.** Records past retention awaiting a decision, with the evidence needed
  to make it.
- **F-4 · Classification integrity.** Records with no retention class, or one not in the policy — the
  cases where the default silently applied.
- **F-5 · Archive evidence.** For archived records, the archive reference and the receipt proving it
  was written.
- **F-6 · Operational-data retention.** How long audit events, receipts, telemetry and cached
  responses are kept — a separate policy from records retention, and currently defined only by
  buffer sizes (5,000 audit events; 1,000 in state; 200 notifications). Requires a decision (Q-5).
- **F-7 · Legal hold.** Records marked as exempt from disposition, with who placed the hold and why.

#### Functions

`fn-1` classify every record and compute `retentionUntil` · `fn-2` bucket by expiry horizon ·
`fn-3` build the disposition queue · `fn-4` detect unclassified and out-of-policy records ·
`fn-5` join archive references to receipts · `fn-6` report operational-data retention against policy.

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-140 | Recalculate retention | — | Re-derives class and expiry for every record | `settings:manage` | A | `audit:retention-recalculated` |
| ACT-141 | Set a record's retention class | Class in policy | Changes class and recomputes expiry | `settings:manage` | C·S·A·I | `audit:retention-class-set` |
| ACT-142 | Place a legal hold | Reason given | Exempts a record from disposition | `settings:manage` | C·S·A·I | `audit:legal-hold-placed` |
| ACT-143 | Release a legal hold | Hold exists | Returns the record to the normal schedule | `settings:manage` | C·S·A·I | `audit:legal-hold-released` |
| ACT-144 | Archive a record | Past retention or closure reached | Routes through the archive module's owned action | `settings:manage` | C·A·I | `audit:archived` |
| ACT-145 | Export the retention register | — | Full register with classes, expiries and holds | `settings:manage` | A | `audit:retention-exported` |
| ACT-146 | Export the disposition queue | — | What is due, with the evidence for each decision | `settings:manage` | A | `audit:disposition-exported` |

> **Disposal is not in this console.** Destroying a record is a records-management decision with
> legal consequence, executed against the system of record with a signed instrument. CP-15 produces
> the queue and the evidence; it does not delete.

---

---

### CP-16 · Target Manager

**Purpose.** The console's own component: which platform instance am I administering, is it
reachable, is it the one I think it is, and what can I see of it from here. Nothing else in §7
works correctly without it.

**Audience.** System Administrator, IT Support, Release Manager.

**Data sources.** `config/console-targets.config.js` · `core/endpoint-registry.js` ·
`core/endpoint-formation.js` · `core/health-contract.js` · `core/capsule-client.js` ·
package manifests from each target deployment.

#### Features

- **F-1 · Target register.** Every target: label, kind, environment, reach, endpoint count, build
  id, auth posture, last contact. The environment band (§6.2) is rendered on every row, and
  production does not look like the other two.
- **F-2 · Reach statement.** Per target, what this console deployment can actually observe — the
  §6.3 table, made concrete for this installation. `same-origin`, `cross-origin` or `backend-only`,
  and what each costs in visibility. This is the screen that prevents an administrator reading an
  absent figure as a zero.
- **F-3 · Identity verification.** Confirm a target is the deployment it claims to be, by build id
  and package hash, before acting on it. Answers *is this actually production* with evidence rather
  than with a label someone typed.
- **F-4 · Reachability check.** Non-destructive, using `core/health-contract.js` — the
  `validationOnly` probe, so a write endpoint is checked without being executed.
- **F-5 · Address formation.** `core/endpoint-formation.js` applied where the administrator pastes
  a URL: trailing whitespace, a newline, a truncated signature, a copied fragment. Caught at entry,
  not at an officer's desk mid-action.
- **F-6 · Aggregate selection.** Choose several targets and work them as one, with the constituent
  list and the completeness figure carried onto every screen (AMM-R-032).
- **F-7 · Target audit.** Every switch, registration, edit and removal, with actor and time —
  because *which instance was that administrator looking at when they did that* is a question
  incident reviews ask and nothing else can answer.

#### Functions

`fn-1` resolve a target's endpoints through the registry precedence · `fn-2` classify reach from
the console's own origin against the target's · `fn-3` verify identity from build id and manifest
hash · `fn-4` probe reachability non-destructively · `fn-5` validate a pasted address against the
formation rules · `fn-6` compose an aggregate and compute its completeness · `fn-7` redact every
address rendered or exported (AMM-R-029).

#### Executable actions

| ID | Action | Precondition | Effect | Permission | Gov | Audit |
|---|---|---|---|---|---|---|
| ACT-150 | Switch target | Target registered | Every component re-scopes; the URL changes with it | `estate:view` | A | `audit:console-target-switched` |
| ACT-151 | Enter aggregate mode | ≥ 2 targets registered | Screens aggregate, naming constituents and completeness | `estate:view` | A | `audit:console-aggregate-entered` |
| ACT-152 | Register a target | Valid address; formation rules pass | Adds a target to this console installation | `estate:manage` | C·S·A·I | `audit:console-target-registered` |
| ACT-153 | Edit a target | Target exists | Updates label, environment or address | `estate:manage` | C·S·A·I | `audit:console-target-edited` |
| ACT-154 | Remove a target | Target exists | Removes it from this installation. The target itself is untouched | `estate:manage` | C·A·I | `audit:console-target-removed` |
| ACT-155 | Verify target identity | Target reachable | Confirms build id and package hash against what it claims | `estate:view` | A | `audit:console-target-verified` |
| ACT-156 | Check reachability | — | Non-destructive health-contract probe | `estate:view` | A | `audit:console-target-probed` |
| ACT-157 | Export the target register | — | Redacted: labels, kinds, environments, build ids. **Never addresses** | `estate:view` | C·A | `audit:console-targets-exported` |

> **The register is a credential-bearing artefact.** In topologies T-2 and T-3 it holds the
> addresses of every deployment this console administers, which under the direct-invocation model
> means it holds the means to call them. It is packaged, distributed and rotated as one
> (AMM-R-037), it is never exported with addresses intact, and a console installation is scoped to
> the targets its holder is authorised for — not to every deployment that exists.

## 8. Dashboard specification

### 8.1 Dashboard register

| ID | Dashboard | Component | Audience | Refresh | Scope |
|---|---|---|---|---|---|
| **DSH-01** | Control Dashboard | CP-01 | All | 60 s + on demand | Fleet |
| **DSH-02** | Platform Health | CP-02 | IT, Admin | 60 s | Fleet + device |
| **DSH-03** | Live Operations | CP-03 | IT, Supervisor | 30 s | Fleet + device |
| **DSH-04** | Estate Health | CP-04 | Admin, IT | 5 min | Estate |
| **DSH-05** | Access & Identity | CP-05 | User Admin | On demand | Directory |
| **DSH-06** | Audit & Evidence | CP-07 | Auditor | On demand | Ledger |
| **DSH-07** | Notification Compliance | CP-08 | Admin, Supervisor | 5 min | Estate |
| **DSH-08** | SLA & Workload | CP-09 | Supervisor, Director | 60 s | Fleet |
| **DSH-09** | Queue & Durability | CP-10 | IT | 30 s | Fleet + device |
| **DSH-10** | Portal Operations | CP-11 | Portal Operator | 60 s | Portal |
| **DSH-11** | Release Readiness | CP-12 | Release Manager | On demand | Deployment |
| **DSH-12** | Executive Overview | CP-13 | Executive | 5 min | Fleet |
| **DSH-13** | Security Posture | CP-14 | Admin, Auditor | 5 min | Estate |
| **DSH-14** | Retention & Disposition | CP-15 | Admin, Supervisor | Daily | Records |

- **AMM-R-045.** Every dashboard is declared in a new `config/dashboards.config.js` — layout, tiles,
  metric bindings, thresholds, drill-down targets and required permission (AMM-R-003). No dashboard
  structure is written into a module.
- **AMM-R-046.** Refresh intervals respect `PerformanceBudget.backgroundRefreshMinMs` (300,000 ms)
  as the floor for *background* polling. Intervals faster than that are permitted only while the
  dashboard is the visible route and the tab is focused, and stop when it is not.
- **AMM-R-047.** No dashboard issues a write. Every tile reads; every action is explicit.

### 8.2 Tile taxonomy

Six tile types. No others, so the language stays learnable.

| Type | Shows | Rules |
|---|---|---|
| **Stat** | One number with label, denominator and trend | Denominator mandatory (AMM-R-014). Trend needs ≥ 2 samples or it is omitted, never flat-lined |
| **Status** | A verdict: `OK` · `ATTENTION` · `FAILED` · `NOT VERIFIED` · `PARTIAL` | Never `PASS` over a narrowed set. `NOT VERIFIED` is distinct from `OK` (AMM-R-015) |
| **Register** | A ranked, capped list with "showing n of m" | `RenderBudget` caps. Failures ordered first (the `CHECK_CONSEQUENCE` pattern) |
| **Distribution** | A breakdown across a categorical axis | Inline SVG or CSS bars. Every segment labelled; colour is never the only encoding |
| **Series** | A measure over time | Inline SVG sparkline. Axis range stated. Gaps in data drawn as gaps, never interpolated |
| **Posture** | A standing statement of a condition that will not change today | Plain sentence. Used for auth posture, credential exposure, device scope |

- **AMM-R-048.** Colour is never the sole carrier of meaning. Every status also carries text
  (`PASS` / `ATTENTION`) and, where used, shape. Required for the high-contrast theme and for
  `forced-colors`.
- **AMM-R-049.** Every tile is drillable: clicking it opens the component that owns the measure,
  pre-filtered to the population the tile counted. A number that cannot be opened cannot be acted on.

### 8.3 Metric register

Formulas are given so two implementations cannot disagree. `Δ` denotes change since the previous
sample.

#### Platform health

| ID | Metric | Formula | Source | Threshold (§10) |
|---|---|---|---|---|
| MET-001 | Checks passing | `passing / total` over **all** declared checks | CP-02 F-1 | ALR-01 |
| MET-002 | Endpoints configured | `configured / 25` atlas keys — **not** `/19` | `EndpointAtlas` | ALR-02 |
| MET-003 | Endpoints resolving to a packaged signature | count of `endpoint.packaged-signature` warnings | `EndpointRegistry.describeAll()` | ALR-03 |
| MET-004 | Provisioning parity | routes in config ∩ routes in manifest / union | CP-02 F-4 | ALR-04 |
| MET-005 | Boot success rate | `booted sessions / started sessions` over 24 h | Telemetry | ALR-05 |
| MET-006 | Boot time p95 | 95th percentile `__DGO_BOOTED__` timestamp − navigation start | Telemetry | ALR-06 (budget 2,500 ms) |
| MET-007 | Route mount p95 | 95th percentile module mount duration | `PerformanceMonitor` | ALR-07 (budget 700 ms) |

#### Integration and estate

| ID | Metric | Formula | Source | Threshold |
|---|---|---|---|---|
| MET-010 | Sync success rate | `successful loads / attempted loads` over 24 h | `lastLoad` telemetry | ALR-08 |
| MET-011 | Sync duration p95 | 95th percentile `FETCH_ALL` duration | Telemetry | ALR-09 (budget 60 s) |
| MET-012 | Endpoint error rate | `4xx + 5xx + timeouts / calls`, per contract, 24 h | `data-client` telemetry | ALR-10 |
| MET-013 | Flow failure rate | `failed runs / total runs`, per flow, 24 h | Tenant run history (OBL-04) | ALR-11 |
| MET-014 | Flow duration p95 | 95th percentile run duration, per flow | Tenant run history | ALR-12 |
| MET-015 | Estate findings open | count by severity from `core/endpoint-atlas.js` | CP-04 F-1 | ALR-13 |
| MET-016 | Misdirected contract keys | keys whose configured target ≠ atlas-declared target | CP-04 fn-7 | ALR-14 |

#### Durability

| ID | Metric | Formula | Source | Threshold |
|---|---|---|---|---|
| MET-020 | Pending writes | count of queued writes, fleet-wide | `PendingQueue` + telemetry | ALR-15 |
| MET-021 | Oldest pending write age | `now − min(queuedAt)` | `PendingQueue` | ALR-16 |
| MET-022 | Failed receipts | count where outcome `failed` | `ReceiptLedger.stats()` | ALR-17 |
| MET-023 | Acknowledgement queue depth | `OfflineActionQueue.summary().count` | Offline queue | ALR-18 |
| MET-024 | Write retry exhaustion | writes at max retries | `PendingQueue` | ALR-19 |
| MET-025 | Cache hit rate | `hits / (hits + misses)` | `CacheManager.stats()` | — (informational) |
| MET-026 | Storage utilisation | bytes used / quota | CP-10 F-6 | ALR-20 |

#### Work and service level

| ID | Metric | Formula | Source | Threshold |
|---|---|---|---|---|
| MET-030 | Open references | references whose status ∉ {Treated, Processed, Closed, Archived} | `operationalMetrics()` | — |
| MET-031 | Open tasks | tasks whose status ∉ {Completed, Closed, Cancelled} | `operationalMetrics()` | — |
| MET-032 | Breached | open tasks where `due < now` | `metrics-service` | ALR-21 |
| MET-033 | Due within 24 h | open tasks where `0 ≤ due − now ≤ 86,400,000 ms` | `metrics-service` | ALR-22 |
| MET-034 | Unassigned | open tasks with no `assignedTo` | CP-09 fn-1 | ALR-23 |
| MET-035 | Acknowledgement compliance | `acknowledged / assigned` where assignment age > SLA | CP-09 F-6 | ALR-24 |
| MET-036 | Stage cycle time (median, p90) | per lifecycle stage, from audit transition timestamps | CP-09 F-3 | ALR-25 |
| MET-037 | Workload concentration | max officer open count / mean officer open count | CP-09 F-4 | ALR-26 |
| MET-038 | Pending approvals | approvals with status ∈ {pending, pending_review} | `operationalMetrics()` | ALR-27 |
| MET-039 | Pending dispatch | dispatches with status ∈ {dispatch_pending, dispatch_failed} | `operationalMetrics()` | ALR-28 |
| MET-040 | Escalations open | escalations with status `Open` | `state.escalations` | ALR-29 |

#### Intake and portal

| ID | Metric | Formula | Source | Threshold |
|---|---|---|---|---|
| MET-050 | Intake by entry point | count per `entryPoint` id | `runtime.feeds` | — |
| MET-051 | Unplaced records | records declaring no entry point | `runtime.feeds.unplaced` | ALR-30 (**any > 0**) |
| MET-052 | Lane conflicts | records arriving on one lane and declaring another | `runtime.feeds.conflicts` | ALR-31 (**any > 0**) |
| MET-053 | Portal submissions | count per period | Portal Registry | — |
| MET-054 | Confirmation delivery rate | `confirmations delivered / submissions accepted` | Outbox receipts | ALR-32 |
| MET-055 | Stranded submissions | portal submissions with no internal record | CP-11 fn-6 | ALR-33 (**any > 0**) |
| MET-056 | Status divergence | records where published status ≠ mapped internal status | CP-11 fn-3 | ALR-34 (**any > 0**) |
| MET-057 | Upload failure rate | `rejected uploads / attempted uploads` | Portal telemetry | ALR-35 |

#### Governance and compliance

| ID | Metric | Formula | Source | Threshold |
|---|---|---|---|---|
| MET-060 | Governed action failure rate | `failed / (completed + failed)` over 24 h | Audit, phase `failed` | ALR-36 |
| MET-061 | Denied actions | ownership or RBAC denials over 24 h | Audit | ALR-37 |
| MET-062 | Notification compliance | `PROVISIONED / 39` required notifications | `countByStatus()` | ALR-38 |
| MET-063 | Misaddressed notifications | rows in state `MISADDRESSED` | `countByStatus()` | ALR-39 |
| MET-064 | Audit ledger coverage | oldest retained event age | `AuditLog.snapshot()` | ALR-40 |
| MET-065 | Records past retention | records where `retentionUntil < now` and not archived | CP-15 fn-3 | ALR-41 |
| MET-066 | Unclassified records | records with no retention class | CP-15 fn-4 | ALR-42 |
| MET-067 | Commissioning obligations outstanding | open obligations from the gate | CP-12 F-1 | ALR-43 |

### 8.4 DSH-01 Control Dashboard — layout

Normative. The first screen must not require a choice before it informs.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ POSTURE  Authentication is provisioned but inert. Role is read from local │
│          storage and is advisory.                    [Open CP-14 →]       │
├───────────────────────────────────────────────────────────────────────────┤
│ SCOPE    Fleet-wide, 14 sessions, last sample 42 s ago.                   │
│          Figures marked ◑ are this device only.                           │
├────────────────┬────────────────┬────────────────┬────────────────────────┤
│ RUNTIME        │ PORTAL         │ ESTATE         │ RELEASE                │
│ Status: OK     │ Status: ATTN   │ Status: ATTN   │ Status: NOT READY      │
│ MET-001 24/24  │ MET-054 92%    │ MET-015 3 high │ MET-067 2 outstanding  │
├────────────────┴────────────────┴────────────────┴────────────────────────┤
│ WORK IN FLIGHT                                                            │
│ Open refs · Open tasks · Breached · Due 24h · Approvals · Dispatch        │
│ MET-030    MET-031     MET-032    MET-033    MET-038     MET-039          │
├───────────────────────────────────────────────────────────────────────────┤
│ NEEDS ATTENTION                        │ RECENT GOVERNED ACTIVITY         │
│ Open alerts, severity then age.        │ Last 20 audit events, actor and  │
│ Each row carries the one action that   │ plain action label.              │
│ resolves it.                           │ [Open CP-07 →]                   │
└────────────────────────────────────────┴──────────────────────────────────┘
```

- **AMM-R-050.** The posture band is first in the DOM and first in the reading order. It is not
  dismissible while the condition holds.
- **AMM-R-051.** The scope band states sample age and session count. A dashboard that cannot say
  how fresh it is, is not a monitoring surface.
- **AMM-R-052.** Every platform card resolves to one status from one named metric. A card that
  averages several measures into a mood is prohibited.
- **AMM-R-053.** The attention queue is empty-stated honestly: *No open alerts. 43 rules are
  watching.* — never a bare empty panel, which reads identically to a broken one.

### 8.5 Rendering constraints

- **AMM-R-054.** All visualisation is inline SVG or CSS. No charting dependency (AMM-R-002).
- **AMM-R-055.** Dashboards work at 400 px width. Tile grids reflow to one column; registers stack
  with `data-label` attributes as the existing tables do.
- **AMM-R-056.** Every dashboard renders correctly in all three themes and both densities, with
  theme attributes on `<html>` only — never mirrored onto descendants (the defect that silently
  broke dark mode).
- **AMM-R-057.** A dashboard degrades to device-local data when telemetry is unreachable, labels
  itself accordingly (AMM-R-016), and never blocks on a failed monitoring fetch.
- **AMM-R-058.** Long registers obey `RenderBudget` and state the total. `showing 20 of 340` is
  required; a silently truncated list is a defect.

---

## 9. Telemetry and observability data model

This section closes G-M1. It is the largest new engineering in this specification and every
fleet-wide figure in §8 depends on it.

### 9.1 The problem, precisely

`core/audit-log.js`, `core/receipt-ledger.js`, `core/pending-queue.js`,
`core/notification-center.js` and `core/performance-monitor.js` all write to browser memory or
`localStorage`. They are correct, useful and completely invisible to anyone but the person at that
keyboard. A supervisor cannot see that eleven acknowledgements have been queued on a registry
officer's laptop since Thursday. Nothing in the platform can.

### 9.2 Design constraints

- **AMM-R-059.** Telemetry is **additive**. No existing local mechanism is removed or weakened; the
  collector reads from them. With telemetry disabled or unreachable the platform behaves exactly as
  it does today.
- **AMM-R-060.** Telemetry is **not the audit trail**. The audit ledger remains the record of
  governed actions. Telemetry carries operational observations. They are reconciled (CP-07 F-7), not
  merged.
- **AMM-R-061.** Telemetry transmission uses `core/data-client.js` like every other outbound call —
  contract lookup, auth gate, timeout, retry policy, classification — and its failures **never**
  surface to an operator. A monitoring system that interrupts work has failed at its job.
- **AMM-R-062.** Telemetry writes are queued and batched. They never contend with a governed write:
  the pending queue drains business writes first.
- **AMM-R-063.** No document content, attachment body, correspondence text, personal address or
  credential enters telemetry. References and identifiers only. Payloads are represented by their
  SHA-256 digest, exactly as idempotency keys already do.

### 9.3 Event schema

```
TelemetryEvent {
  id            string    ULID, client-generated
  at            ISO-8601  client clock
  receivedAt    ISO-8601  server clock — clock skew is measured, not assumed away
  kind          enum      health | performance | integration | queue | action | session | error
  platform      enum      runtime | portal
  buildId       string    from the package manifest — which deployment produced this
  sessionId     string    ephemeral, per browser session
  actorHash     string    SHA-256 of actor email — attributable, not a directory copy
  role          string    effective role at the time
  route         string    where it happened
  name          string    metric or event name, from a closed vocabulary
  value         number?   for measures
  unit          string?   ms | bytes | count
  outcome       enum?     ok | failed | denied | timeout | queued
  ref           string?   business reference where one applies
  contractKey   string?   endpoint contract where one applies
  detail        object    bounded; no free text over 512 bytes; never payload content
  digest        string?   SHA-256 of the related payload where one exists
}
```

- **AMM-R-064.** `name` comes from a closed vocabulary declared in a new
  `config/telemetry-vocabulary.config.js`, tested for parity with the metric register in §8.3, so a
  metric cannot exist with no event feeding it and an event cannot exist that no metric reads.
- **AMM-R-065.** `actorHash` is a hash, not an address. An administrator resolves it to a person
  through the directory when investigating; telemetry storage never holds the address.

### 9.4 Collection

| Stage | Behaviour |
|---|---|
| **Emit** | Instrumentation points call `Telemetry.record(event)`. Synchronous, in-memory, never throws |
| **Buffer** | Ring buffer, 500 events, plus a `localStorage` spill for offline continuity |
| **Batch** | Flush on: 50 events, 60 s elapsed, route change, `visibilitychange` to hidden, or `beforeunload` |
| **Transmit** | One batched POST through `data-client` to `TELEMETRY_INGEST` (OBL-03) |
| **Degrade** | On failure: retain in buffer, back off exponentially, drop oldest at capacity. Never block, never toast |
| **Retain** | Server-side per §9.6 |

- **AMM-R-066.** Instrumentation is declarative. `core/action-authority.js`, `core/data-client.js`,
  `core/boot.js`, `core/router.js` and `core/pending-queue.js` emit at existing observation points
  they already compute. Business modules are **not** individually instrumented — that is how
  instrumentation rots.

### 9.5 Aggregation

- **AMM-R-067.** Aggregation is server-side. The client sends events; it never computes a fleet
  figure from a download. A dashboard that pulls the fleet's raw events to a browser is a dashboard
  that stops working in month two.
- **AMM-R-068.** `TELEMETRY_QUERY` (OBL-03) returns pre-aggregated series and summaries for a named
  metric, period and grouping. Response shape is declared in `config/endpoints.config.js` like every
  other contract.
- **AMM-R-069.** Every aggregate response carries `sampleCount`, `periodStart`, `periodEnd`,
  `completeness` (proportion of expected sessions reporting) and `generatedAt`. A figure computed
  over 3 of 14 sessions is reported as such — the AMM-R-014 rule, applied to telemetry.

### 9.6 Retention of telemetry

| Data | Retained | Rationale |
|---|---|---|
| Raw events | 30 days | Incident investigation window |
| Hourly aggregates | 13 months | Year-on-year comparison |
| Daily aggregates | 7 years | Matches the default records retention class |
| Archived audit segments (ACT-066) | Per records retention class | Evidence, not telemetry |

- **AMM-R-070.** Telemetry retention is declared in `config/telemetry-policy.config.js` and surfaced
  in CP-15 F-6, so operational-data retention is a stated policy rather than an emergent property of
  buffer sizes.

### 9.7 If telemetry is not built

Stated because a specification that only describes its best case is not usable.

- **AMM-R-071.** Where telemetry is unavailable, every fleet metric degrades to device scope, is
  labelled `◑ this device only` (AMM-R-016), and the affected dashboards carry a standing posture
  statement naming what cannot be seen. CP-01 through CP-15 remain deliverable at device scope; the
  monitoring claim narrows honestly rather than the screens disappearing.

---

## 10. Alerting, thresholds and escalation

This section closes G-M2 — the 54 monitoring records with no threshold, no alerting and no
reporting output.

### 10.1 Rule model

```
AlertRule {
  id              ALR-nn
  metric          MET-nnn            what is watched
  condition       gt | lt | eq | rate | absent | any
  threshold       number | null      null for `any` and `absent`
  window          duration           over what period the condition is evaluated
  sustainedFor    duration           how long it must hold before firing — suppresses flapping
  severity        CRITICAL | HIGH | MEDIUM | LOW    aligned to the notification matrix
  audience        audience id        from the 11 declared audiences
  channel         email | in-app | ledger           SMS excluded: no carrier exists
  escalatesTo     ALR-nn | null      the next rule if unacknowledged
  escalatesAfter  duration
  enabled         boolean
  basis           string             why this obligation exists, cited
}
```

- **AMM-R-072.** Rules live in `config/alert-rules.config.js`, declared not coded (AMM-R-003).
- **AMM-R-073.** Every rule names an `audience` from the 11 in `config/notification-matrix.config.js`
  and a `channel` from the 4 declared there. A rule may not invent a recipient, and may not address a
  fixed mailbox — the defect MET-063 measures.
- **AMM-R-074.** Every rule carries a `basis`: the obligation, promise, clock or policy that makes
  it necessary, cited. A rule with no basis is a preference, and preferences do not wake people up.
- **AMM-R-075.** `sustainedFor` is mandatory on every rate and threshold rule. An alert that fires on
  a single sample is an alert that gets silenced.
- **AMM-R-076.** Every firing writes an audit event and a notification-center entry, regardless of
  whether its channel delivered. *We tried to tell someone* is itself a record.

### 10.2 Initial rule set

Forty-three rules covering every threshold column in §8.3. Severity follows the matrix definitions:
`CRITICAL` a person is told something untrue or a legally significant message never arrives ·
`HIGH` work stalls unseen or a message reaches the wrong person · `MEDIUM` a recipient must go
looking · `LOW` operational visibility.

| ID | Metric | Condition | Sustained | Severity | Audience | Escalates |
|---|---|---|---|---|---|---|
| ALR-01 | MET-001 Checks passing | `< 100%` | 5 min | HIGH | administrator | ALR-43 after 4 h |
| ALR-02 | MET-002 Endpoints configured | `< 25/25` | 5 min | HIGH | administrator | — |
| ALR-03 | MET-003 Packaged signatures | `any` | immediate | CRITICAL | administrator | — |
| ALR-04 | MET-004 Provisioning parity | `< 100%` | immediate | HIGH | administrator | — |
| ALR-05 | MET-005 Boot success | `< 98%` | 15 min | CRITICAL | administrator | — |
| ALR-06 | MET-006 Boot p95 | `> 2,500 ms` | 30 min | MEDIUM | administrator | — |
| ALR-07 | MET-007 Route mount p95 | `> 700 ms` | 30 min | LOW | administrator | — |
| ALR-08 | MET-010 Sync success | `< 95%` | 15 min | HIGH | administrator | ALR-43 after 2 h |
| ALR-09 | MET-011 Sync p95 | `> 60,000 ms` | 30 min | MEDIUM | administrator | — |
| ALR-10 | MET-012 Endpoint error rate | `> 5%` per contract | 15 min | HIGH | administrator | — |
| ALR-11 | MET-013 Flow failure rate | `> 5%` per flow | 15 min | HIGH | administrator | — |
| ALR-12 | MET-014 Flow duration p95 | `> 60,000 ms` | 30 min | MEDIUM | administrator | — |
| ALR-13 | MET-015 Estate findings | `any` of severity high | immediate | HIGH | administrator | — |
| ALR-14 | MET-016 Misdirected keys | `any` | immediate | CRITICAL | administrator | — |
| ALR-15 | MET-020 Pending writes | `> 10` fleet-wide | 30 min | MEDIUM | administrator | ALR-16 |
| ALR-16 | MET-021 Oldest pending age | `> 4 h` | immediate | HIGH | administrator | ALR-43 after 24 h |
| ALR-17 | MET-022 Failed receipts | `> 0` | 15 min | HIGH | administrator | — |
| ALR-18 | MET-023 Ack queue depth | `> 5` | 1 h | MEDIUM | administrator | — |
| ALR-19 | MET-024 Retry exhaustion | `any` | immediate | HIGH | administrator | — |
| ALR-20 | MET-026 Storage utilisation | `> 80%` | 1 h | MEDIUM | operator | — |
| ALR-21 | MET-032 Breached | `> 0` | immediate | HIGH | owner | ALR-29 after 24 h |
| ALR-22 | MET-033 Due within 24 h | `> 0` | immediate | MEDIUM | assignee | ALR-21 at due |
| ALR-23 | MET-034 Unassigned | `> 0` for `> 4 h` | 4 h | HIGH | administrator | — |
| ALR-24 | MET-035 Ack compliance | `< 90%` | 24 h | HIGH | administrator | — |
| ALR-25 | MET-036 Stage cycle time | p90 `> 2×` baseline | 7 d | MEDIUM | administrator | — |
| ALR-26 | MET-037 Workload concentration | `> 2.0` | 24 h | MEDIUM | administrator | — |
| ALR-27 | MET-038 Pending approvals | age `> 3 d` | immediate | MEDIUM | approver | ALR-29 after 7 d |
| ALR-28 | MET-039 Pending dispatch | status `dispatch_failed` | immediate | HIGH | operator | — |
| ALR-29 | MET-040 Escalations open | age `> 48 h` | immediate | HIGH | owner | — |
| ALR-30 | MET-051 Unplaced records | `any` | immediate | HIGH | administrator | — |
| ALR-31 | MET-052 Lane conflicts | `any` | immediate | HIGH | administrator | — |
| ALR-32 | MET-054 Confirmation delivery | `< 99%` | 1 h | **CRITICAL** | administrator | ALR-43 after 4 h |
| ALR-33 | MET-055 Stranded submissions | `any` | immediate | **CRITICAL** | administrator | — |
| ALR-34 | MET-056 Status divergence | `any` | immediate | **CRITICAL** | administrator | — |
| ALR-35 | MET-057 Upload failure rate | `> 2%` | 1 h | HIGH | administrator | — |
| ALR-36 | MET-060 Action failure rate | `> 2%` | 30 min | HIGH | administrator | — |
| ALR-37 | MET-061 Denied actions | `> 0` | immediate | HIGH | administrator | — |
| ALR-38 | MET-062 Notification compliance | `< 100%` | daily | HIGH | administrator | — |
| ALR-39 | MET-063 Misaddressed | `> 0` | daily | HIGH | administrator | — |
| ALR-40 | MET-064 Ledger coverage | `< 30 d` | daily | MEDIUM | administrator | — |
| ALR-41 | MET-065 Past retention | `> 0` | daily | MEDIUM | administrator | — |
| ALR-42 | MET-066 Unclassified records | `> 0` | daily | MEDIUM | administrator | — |
| ALR-43 | MET-067 / escalation sink | unacknowledged escalation | immediate | CRITICAL | administrator | — |

The four `CRITICAL` portal rules (ALR-32, -33, -34 and the confirmation escalation) are rated that
way for one reason, stated in the matrix's own severity definition: *a person is told something
untrue, or a legally significant message never arrives.* A citizen who submits a document, is
promised a confirmation, and receives nothing has been told something untrue by this platform.

### 10.3 Alert lifecycle

```
   evaluate ──▶ FIRING ──acknowledge──▶ ACKNOWLEDGED ──condition clears──▶ RESOLVED
       │           │                          │
       │           └──sustained, unack'd──▶ ESCALATED ──▶ escalatesTo rule
       │                                                        │
       └──condition clears before sustainedFor──▶ (never fires) │
                                                                ▼
                                                    ACKNOWLEDGED / RESOLVED
```

- **AMM-R-077.** Acknowledgement records actor, time and reason. It suppresses re-notification; it
  does **not** resolve. A condition resolves when the condition clears, never because someone
  clicked.
- **AMM-R-078.** Snoozing is time-bounded and expiry is itself an event. An indefinite snooze is
  prohibited — that is how alerting dies quietly.
- **AMM-R-079.** Every alert carries, in its body, the one action that most likely resolves it and a
  deep link to the component that owns it. An alert that says a number is high and nothing else has
  transferred a problem without transferring the means to fix it.
- **AMM-R-080.** Alert state is fleet-shared, not device-local. Two administrators must not
  separately acknowledge the same condition. Requires OBL-03.

---

## 11. Master executable action register

Every action an administrator can execute from the control plane, consolidated. This is the
authoritative list; the per-component tables in §7 are the same actions with their local context.

### 11.1 Summary

| Component | Actions | Destructive | Step-up required |
|---|---:|---:|---:|
| CP-01 Control Dashboard | 6 | 0 | 0 |
| CP-02 System Health | 7 | 0 | 0 |
| CP-03 Live Operations | 8 | 1 | 1 |
| CP-04 Endpoint & Estate | 10 | 1 | 2 |
| CP-05 Identity & Access | 10 | 1 | 5 |
| CP-06 Configuration | 9 | 2 | 2 |
| CP-07 Audit & Evidence | 7 | 0 | 2 |
| CP-08 Notification & Escalation | 8 | 0 | 2 |
| CP-09 SLA & Workload | 7 | 0 | 1 |
| CP-10 Data & Queues | 9 | 2 | 3 |
| CP-11 Portal Operations | 9 | 0 | 3 |
| CP-12 Release & Commissioning | 7 | 0 | 1 |
| CP-13 Reporting & Export | 7 | 0 | 1 |
| CP-14 Security & Posture | 7 | 0 | 3 |
| CP-15 Retention & Disposition | 7 | 0 | 3 |
| CP-16 Target Manager | 8 | 0 | 2 |
| **Total** | **126** | **7** | **31** |

The seven destructive action identifiers are **six distinct operations** — discarding a queued write
appears in both CP-03 and CP-10 as ACT-024 and ACT-092, one operation reachable from two screens.

### 11.2 Action classes

Every action belongs to exactly one class, and the class determines its guard rails.

| Class | Count | Definition | Mandatory guards |
|---|---:|---|---|
| **Observe** | 13 | Reads and renders from data already held. Changes nothing | Redaction (AMM-R-011), scope and target declaration (AMM-R-000, AMM-R-052) |
| **Probe** | 17 | Calls a read-only or `validationOnly` contract to refresh what is known | Read-only and health contracts only (AMM-R-018); audited |
| **Export** | 29 | Produces an artefact — file, clipboard, bundle — from existing data | Redacted by construction; provenance and target attached; audited |
| **Record** | 17 | Writes an administrative annotation: acknowledgement, note, finding, hold, discharge | Confirm; audited; idempotent |
| **Configure** | 26 | Changes platform behaviour, access, a rule or a target | Confirm with consequence and target named; preview; audited; idempotent; scope stated at the control |
| **Operate** | 17 | Acts on the durability or delivery machinery — retry, drain, invalidate, resend, reconcile | Confirm; audited; idempotent |
| **Destructive** | 7 | Removes data or capability irreversibly | Confirm **and** OTP step-up; audited; the confirmation names what is lost and on which target |
| | **126** | | |

#### Reconciliation with `core/admin-actions.js`

The catalogue already carries **44 actions** across 7 domains (§2.2). They are not 44 of these 126
— they are the same capability at a different granularity, and reconciling them is a delivery task,
not a documentation one.

- **AMM-R-083.** The 126 actions specified here are merged into `core/admin-actions.js` rather than
  held in a second table. Where an entry already exists — `estate.override-set` is ACT-032,
  `platform.retry-queue` is ACT-090, `people.assign-role` is ACT-042 — the existing entry is
  **extended**, never duplicated. The reconciliation is recorded in the commit that lands it, action
  by action, so no capability is silently doubled or silently dropped.
- **AMM-R-084.** This specification's `Gov` column (`C`/`S`/`A`/`I`) and the catalogue's `blast`
  field describe different things and both are kept: `blast` says what an action reaches,
  `Gov` says what guards it. Their relationship is fixed — every `irreversible` action carries `S`,
  every `estate` and `tenant` action carries `C`, and every action carries `A`. A catalogue entry
  that breaks that relationship fails `tests/governance.test.mjs`.

### 11.3 The destructive actions

Six operations, seven action identifiers. Called out because these are the ones that can hurt. Each
requires OTP step-up bound to the payload digest, and each confirmation must name specifically what
is lost, not that something will be.

| ID | Action | What is irreversibly lost |
|---|---|---|
| ACT-024 / ACT-092 | Discard a queued write | A business write that never reached the registry. The record it would have created does not exist |
| ACT-035 | Empty every connection address | This device can no longer reach the registry at all — nothing loads, nothing sends, until addresses are restored |
| ACT-043 | Disable user | That person cannot perform any governed action from the moment it applies |
| ACT-056 | Clear this device's data | Profile, cached lists, **queued writes not yet sent**, and this device's audit copy. Registry records survive; queued writes do not |
| ACT-094 | Clear receipt ledger | The evidence that acknowledgements were delivered. The acknowledgements survive; the proof does not |
| ACT-055 | Reset to packaged defaults | Every device-scope override, including endpoint corrections made to work around a live fault |

- **AMM-R-081.** Every destructive action offers its non-destructive alternative in the same
  confirmation, where one exists — *if you only want to undo local changes, use Use the installed
  addresses instead*. The existing `settings.js` dialog does this and it is now a rule.
- **AMM-R-082.** No destructive action is reachable from a dashboard tile. Destructive actions live
  in their owning component, behind an explicit affordance.

### 11.4 Governance declaration requirement

- **AMM-R-085.** All 126 actions are added to `config/action-ownership.config.js` with owner, label,
  service, audit vocabulary, backend requirement and allowed invokers. This takes the governed-action
  count from 62 to 188.
- **AMM-R-086.** All 16 components are added to `config/module-boundaries.config.js` with what each
  owns and explicitly must not own.
- **AMM-R-087.** All 16 components are added to `config/platform-provisioning.config.js` with
  purpose, features and actions. Route ↔ provisioning parity is already asserted in both directions
  by `tests/governance.test.mjs`; a component missing from the manifest fails the suite.
- **AMM-R-088.** Every new audit vocabulary is added to the monitoring catalogue so
  `docs/process/19-MONITORING-AUDIT-AND-PERFORMANCE.md` regenerates with thresholds populated from
  `config/alert-rules.config.js` — turning 54 records with no thresholds into a catalogue where every
  monitored measure names the rule that watches it.

### 11.5 Cross-module invocation

Four control-plane actions deliberately delegate to an existing owner rather than writing directly.
This is the `allowedInvokers` mechanism, and it is the difference between a console and a back door.

| Control-plane action | Delegates to | Owner | Why |
|---|---|---|---|
| ACT-082 Escalate an item | `executive-escalate` | `executive` | One escalation path, one audit event, whichever screen raised it |
| ACT-086 Rebalance workload | `bulk-assign` | `bulk-assignment` | Assignment carries OTP and idempotency discipline the console must not reimplement |
| ACT-103 Promote a stranded submission | `create-correspondence` | `correspondence` | One action creates correspondence, whatever channel it came through |
| ACT-144 Archive a record | `archive-reference` | `archive` | Archiving writes evidence; it is not a state edit |

- **AMM-R-089.** A control-plane component may never duplicate an owned business action. It invokes
  the owner and is registered in that action's `allowedInvokers`, or it does not do it.

---

## 12. Access control specification

### 12.1 Route access

Added to `RoleRouteAccess` in `config/rbac.config.js`.

| Component | systemAdmin | userAdmin | executive | director | operator | viewer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| CP-01 Control Dashboard | ● | ● | ◐ | ◐ | ◐ | ○ |
| CP-02 System Health | ● | ● | ○ | ○ | ○ | ○ |
| CP-03 Live Operations | ● | ● | ○ | ◐ | ○ | ○ |
| CP-04 Endpoint & Estate | ● | ◐ | ○ | ○ | ○ | ○ |
| CP-05 Identity & Access | ● | ● | ○ | ○ | ○ | ○ |
| CP-06 Configuration | ● | ◐ | ○ | ○ | ○ | ○ |
| CP-07 Audit & Evidence | ● | ● | ◐ | ○ | ○ | ○ |
| CP-08 Notification & Escalation | ● | ○ | ○ | ◐ | ○ | ○ |
| CP-09 SLA & Workload | ● | ○ | ● | ● | ◐ | ○ |
| CP-10 Data & Queues | ● | ○ | ○ | ○ | ○ | ○ |
| CP-11 Portal Operations | ● | ○ | ◐ | ◐ | ◐ | ○ |
| CP-12 Release & Commissioning | ● | ○ | ○ | ○ | ○ | ○ |
| CP-13 Reporting & Export | ● | ○ | ● | ● | ◐ | ◐ |
| CP-14 Security & Posture | ● | ◐ | ◐ | ○ | ○ | ○ |
| CP-15 Retention & Disposition | ● | ○ | ◐ | ◐ | ○ | ○ |
| CP-16 Target Manager | ● | ◐ | ○ | ○ | ○ | ○ |

● full · ◐ read-only, role-scoped · ○ no access

- **AMM-R-090.** `◐` is enforced by permission, not by hiding controls. A read-only holder sees the
  component with mutating controls absent — not present-and-failing.
- **AMM-R-091.** Route guards render an explicit denial distinguishing *disabled account*, *not
  enrolled* and *role cannot open this*, as `core/router.js` already does.

### 12.2 Scoping rules

- **AMM-R-092.** `director` sees CP-09 and CP-11 scoped to their directorate via
  `core/directorate-scope.js`. `systemAdmin` and `executive` see all.
- **AMM-R-093.** CP-07 for a non-`systemAdmin` excludes events for records outside the reader's
  directorate scope, and **says so**: *42 events in this period are outside your directorate and are
  not shown.* A silently filtered audit trail is a falsified one.
- **AMM-R-094.** CP-05's effective-access inspector is available to `role:view` holders for any
  user; it reveals grants, never credentials or activity.

### 12.3 Separation of duties

- **AMM-R-095.** An administrator cannot acknowledge an alert raised by their own action's failure
  where the action was `Destructive` class. A second administrator acknowledges. Where only one
  administrator exists, the acknowledgement records that fact rather than being blocked.
- **AMM-R-096.** ACT-113 and ACT-133 (marking an obligation discharged) require evidence
  attachment. An obligation discharged with no evidence is recorded as *asserted*, not *verified*,
  and CP-12 F-1 shows the difference.

---

## 13. Backend obligations

The control plane needs capability the flow estate does not have today. Each obligation is a new
contract in `config/endpoints.config.js` with the same declaration discipline as the existing 19.

| ID | Obligation | Contract | Method | Needed by | Blocking |
|---|---|---|---|---|---|
| **OBL-01** | **Token validation and server-side role derivation** — the open half of G-04 | existing flows | — | Everything in §12 to be *enforcement* rather than advice | All of §12 |
| **OBL-02** | **Identity directory read** — resolve users and roles from a directory rather than `localStorage` | `IDENTITY_DIRECTORY` | GET | CP-05 F-1, F-7 | CP-05 fleet accuracy |
| **OBL-03** | **Telemetry ingest, query and alert state** | `TELEMETRY_INGEST` (POST) · `TELEMETRY_QUERY` (GET) · `ALERT_STATE` (GET/POST) | — | All fleet metrics (§9), alert lifecycle (§10.3) | CP-01 F-2/F-3, CP-02 F-7, CP-03 F-7, §10 |
| **OBL-04** | **Flow run history** — run counts, failure rates, durations, last failure per workflow | `ESTATE_RUN_HEALTH` | GET | CP-04 F-5, MET-013, MET-014 | G-M7 |
| **OBL-05** | **Scheduled report delivery** | `REPORT_SCHEDULE` | POST | CP-13 F-6 | ACT-124 only |
| **OBL-06** | **Portal operations read** — submissions, outbox receipts, support cases | `PORTAL_OPERATIONS` | GET | CP-11 F-1, F-2, F-4, F-6 | G-M4 |
| **OBL-07** | **Notification delivery evidence** — per-message send status from the carriers | `NOTIFICATION_RECEIPTS` | GET | CP-08 F-4, MET-054 | ALR-32 |
| **OBL-08** | **Audience-addressed send** — a send action that addresses the audience the matrix names rather than a fixed mailbox | existing mail flows | — | CP-08 F-3, ACT-071, ACT-075, ACT-102 | MET-063; 70 of 76 mail actions |

### 13.0 Every contract is per-target

- **AMM-R-103.** The Console addresses each contract **per target**, resolved through
  `core/endpoint-registry.js` against that target's endpoint set. There is no single global
  telemetry or estate endpoint: a Console administering three deployments calls three
  `TELEMETRY_QUERY` contracts and aggregates client-side with completeness stated (AMM-R-032).
- **AMM-R-104.** Each target authorises the Console independently. A Console installation holding
  three targets holds three authorisations and can lose one without losing the others; a target
  that refuses is rendered as *not authorised from here*, never as healthy and never as absent.
- **AMM-R-105.** A target of kind `estate` or `toolchain` has no browser state and therefore no
  device-scope view at all. Its components are backend- and artefact-driven in every topology, and
  the Console does not offer a degraded device view that would be empty by construction.

### 13.1 Obligations that must be discharged by the flow, not the client

Restating the constraint from `PLATFORM.md` §6, because it governs every contract
above: there is no proxy. Every request goes directly to the configured flow URL. **Every obligation
the proxy would have discharged belongs to the flow** — token validation, role derivation, per-action
authorisation, idempotency, rate limiting, reference minting, upload ticketing and the Universal
Filename Policy.

- **AMM-R-097.** `TELEMETRY_INGEST` must authorise its caller and rate-limit per session. An
  unauthenticated, unlimited ingest endpoint is a denial-of-service surface reachable by anyone
  holding the trigger URL.
- **AMM-R-098.** `TELEMETRY_QUERY`, `ESTATE_RUN_HEALTH`, `PORTAL_OPERATIONS` and
  `NOTIFICATION_RECEIPTS` are **read-only** and must refuse any non-GET method, so a monitoring
  credential cannot become a write credential.
- **AMM-R-099.** `ALERT_STATE` writes must be idempotent on `(ruleId, firedAt, actor)` so a retried
  acknowledgement does not create a second one.
- **AMM-R-100.** Until OBL-01 is discharged, every new contract above must still authorise its own
  callers. The client can only decline to send a request, never prevent one.

### 13.2 Data-model additions

New SharePoint lists required, following `docs/reference/sharepoint-provisioning-spec.json`
conventions (the estate currently provisions 10 lists / 97 fields):

| List | Purpose | Retained |
|---|---|---|
| `Platform Telemetry Events` | Raw telemetry per §9.3 | 30 days |
| `Platform Telemetry Aggregates` | Hourly and daily rollups | 13 months / 7 years |
| `Platform Alert State` | Rule firings, acknowledgements, escalations | 7 years — it is evidence |
| `Platform Audit Archive` | Ledger segments shipped before ring-buffer eviction (ACT-066) | Per records retention class |
| `Platform Admin Annotations` | Health notes, finding acknowledgements, obligation discharges, legal holds | 7 years |

- **AMM-R-101.** Every new list is added to the provisioning specification and covered by
  `tests/sharepoint-field-spec.test.mjs`, so the control plane's own data model is held to the same
  standard as the business one.

---

## 14. Non-functional requirements

### 14.1 Performance

| ID | Requirement | Budget | Source |
|---|---|---|---|
| NFR-01 | Control-plane route mounts within budget | 700 ms | `PerformanceBudget.routeMountMs` |
| NFR-02 | Dashboard first meaningful paint | 1,000 ms from mount | This spec |
| NFR-03 | Telemetry query response | 3,000 ms p95 | This spec |
| NFR-04 | A monitoring fetch never blocks render | Non-blocking, always | AMM-R-057 |
| NFR-05 | Registers paginate beyond the render budget | 100–120 rows | `RenderBudget` |
| NFR-06 | Background refresh floor | 300,000 ms | `PerformanceBudget.backgroundRefreshMinMs` |
| NFR-07 | Telemetry adds no more than 2% to a governed action's duration | measured | AMM-R-061 |
| NFR-08 | Telemetry batch payload | ≤ 256 KB | Well inside the 6.5 MB payload budget |

### 14.2 Accessibility

| ID | Requirement |
|---|---|
| NFR-10 | One `<nav>` and one `<main>` landmark; skip link to `#main`; `lang="en"` |
| NFR-11 | Every status conveyed by text as well as colour (AMM-R-048) |
| NFR-12 | Live regions announce alert-state changes without stealing focus |
| NFR-13 | Every drawer and dialog traps Tab and restores focus to its opener |
| NFR-14 | Tables carry `data-label` attributes for responsive stacking |
| NFR-15 | Zero images without `alt`; zero buttons without an accessible name |
| NFR-16 | High-contrast theme reaches pure black on white; `forced-colors` block present |
| NFR-17 | No duplicate top-level heading — the open shell defect is not replicated in 15 new components |
| NFR-18 | Every SVG visualisation carries a text equivalent: a table, a list, or a sentence |

### 14.3 Resilience

| ID | Requirement |
|---|---|
| NFR-20 | Every component renders with telemetry unreachable, labelled device-scope (AMM-R-071) |
| NFR-21 | Every component renders offline from local state |
| NFR-22 | A failed monitoring fetch degrades silently to the operator and visibly to IT (AMM-R-061) |
| NFR-23 | No control-plane failure can prevent boot. Registration is lazy; a failing component fails alone |
| NFR-24 | Telemetry buffer overflow drops oldest and records that it did. Silent loss is prohibited |
| NFR-25 | Clock skew between client and server is measured (`at` vs `receivedAt`) and reported, not corrected away |

### 14.4 Security

| ID | Requirement |
|---|---|
| NFR-30 | No signature, token or credential is ever rendered, exported or logged (AMM-R-011) |
| NFR-31 | No document content or personal address enters telemetry (AMM-R-063) |
| NFR-32 | Every export is redacted by construction, not by a filter that can be bypassed |
| NFR-33 | Every destructive action requires OTP step-up bound to the payload digest |
| NFR-34 | Administrative actions are audited with the raw detail; operators see plain consequences (AMM-R-010) |
| NFR-35 | All output is escaped; `tests/output-encoding.test.mjs` covers every new surface |
| NFR-36 | The Console grants no capability that RBAC does not already permit. It is a surface, not an escalation path |
| NFR-37 | The Console never reads across an origin boundary by any mechanism — no iframe bridge, no `postMessage` shim, no injected script (AMM-R-034) |
| NFR-38 | The target register is treated as credential-bearing in T-2 and T-3: packaged, distributed and rotated under `docs/deployment/RUNBOOK.md` |
| NFR-39 | A Console installation is scoped to the targets its holder is authorised for, not to every deployment that exists |

### 14.5 Maintainability

| ID | Requirement |
|---|---|
| NFR-40 | Zero build, zero runtime dependencies (AMM-R-001, AMM-R-002) |
| NFR-41 | Dashboards, metrics, thresholds, rules and actions are config, not code (AMM-R-003) |
| NFR-42 | Counts are derived from config, never restated in a module or a document (§2.4(3)) |
| NFR-43 | Every new module passes `npm run test:imports` — the ES-module graph stays whole |
| NFR-44 | Adding a component without registering it in provisioning, boundaries and ownership fails CI |
| NFR-45 | The Console is built by `npm run package` as a third self-contained artefact with its own manifest, and verified by `npm run package:verify` |
| NFR-46 | The Console imports `core/` and `config/` directly — no vendored copy, no second implementation of a shared service |
| NFR-47 | The Console runs from `file://`-free static hosting like the other two platforms, and from a local package in topology T-3 with no server of its own |
| NFR-48 | A Console release is versioned and fingerprinted independently of the platforms it administers |

---

## 15. Acceptance criteria and verification

Each criterion names the mechanism that proves it. Where a test file does not exist, it is a
deliverable of this specification.

| ID | Criterion | Verified by |
|---|---|---|
| AC-01 | All 126 actions are declared in `config/action-ownership.config.js` with owner, label, service, audit vocabulary and backend | `tests/governance.test.mjs` — extend the existing ownership assertions |
| AC-02 | No action label uses banned developer vocabulary | `tests/governance.test.mjs` — the existing I-07 assertion, extended |
| AC-03 | An unowned control-plane action throws rather than executing | `tests/governance.test.mjs` — existing execution-path coverage |
| AC-04 | A failed action audits the raw detail and toasts exactly one message carrying none of it | `tests/governance.test.mjs` |
| AC-05 | All 16 components appear in routes, provisioning and boundaries — parity in both directions | `tests/governance.test.mjs` — existing parity assertion |
| AC-06 | Every metric in §8.3 has a telemetry vocabulary entry, and every entry has a metric | `tests/telemetry-vocabulary.test.mjs` *(new)* |
| AC-07 | Every alert rule names an existing metric, an audience from the matrix, and a channel with a carrier | `tests/alert-rules.test.mjs` *(new)* |
| AC-08 | No rendered control-plane HTML contains a 43-character SAS signature | `tests/endpoint-console.test.mjs` pattern, extended to every component |
| AC-09 | Every export passes redaction | `tests/endpoint-console.test.mjs` pattern, extended |
| AC-10 | Every destructive action requires step-up and names what is lost | `tests/control-plane-actions.test.mjs` *(new)* |
| AC-11 | Every aggregate declares its denominator | `tests/control-plane-actions.test.mjs` *(new)* |
| AC-12 | Endpoint checks compute over all 25 atlas keys, not 19 | `tests/endpoint-register.test.mjs`, extended |
| AC-13 | Every new permission exists in `Permissions` and is assigned in `Roles` | `tests/governance.test.mjs` |
| AC-14 | No role reaches a control-plane route outside its own row | `tests/governance.test.mjs` — the F-020 assertion |
| AC-15 | Every component renders in all three themes and both densities | `tests/smoke.spec.js`, extended |
| AC-16 | Every component renders at 400 px with no horizontal scroll | `tests/smoke.spec.js`, extended |
| AC-17 | Every component renders with telemetry unavailable and declares device scope | `tests/control-plane-degradation.test.mjs` *(new)* |
| AC-18 | No control-plane failure prevents boot | `tests/smoke.spec.js` — `__DGO_BOOTED__` gate |
| AC-19 | Every component satisfies the accessibility contract | `tests/smoke.spec.js` accessibility assertions, extended |
| AC-20 | All output is escaped | `tests/output-encoding.test.mjs`, extended |
| AC-21 | The module graph resolves | `npm run test:imports` |
| AC-22 | No new signed URLs enter the tree | `npm run test:secrets` — the ratchet |
| AC-23 | New SharePoint lists match the provisioning specification | `tests/sharepoint-field-spec.test.mjs` |
| AC-24 | Health probes call read-only contracts only | `tests/control-plane-actions.test.mjs` *(new)* — assert no write contract is reachable from any probe |
| AC-25 | The regenerated monitoring catalogue carries a threshold for every watched measure | `npm run test:processdocs` after `npm run process:docs` |
| AC-26 | The Console boots standalone, with no platform running, and reports `__DGO_BOOTED__` | `tests/console.spec.js` *(new)* |
| AC-27 | Every screen names its active target and environment | `tests/console.spec.js` *(new)* — assert on rendered HTML |
| AC-28 | A cross-origin target renders unobservable figures as absent, never as zero | `tests/console-reach.test.mjs` *(new)* |
| AC-29 | The Console reads no other origin's storage by any mechanism | `tests/console-reach.test.mjs` *(new)* — assert no iframe, `postMessage` or injected-script path exists |
| AC-30 | An aggregate names its constituents and its completeness | `tests/console-reach.test.mjs` *(new)* |
| AC-31 | The target register never exports an address | `tests/console.spec.js` *(new)* — the redaction assertion, applied to the register export |
| AC-32 | `npm run package` emits a verifiable Console artefact | `tests/packaging.test.mjs`, extended |
| AC-33 | Console and Suite share `core/` — no vendored copy, no second implementation | `tests/single-source-of-truth.test.mjs`, extended |
| AC-34 | Every action in this specification resolves to exactly one `core/admin-actions.js` entry | `tests/governance.test.mjs` — the AMM-R-083 reconciliation |

- **AMM-R-102.** AC-25 is the closure criterion for G-M2. The catalogue is generated from the
  artifacts; once `config/alert-rules.config.js` exists and `scripts/process-discovery.mjs` reads it,
  the 54 `—` cells become populated because the estate genuinely has thresholds, not because the
  document was edited.

---

## 16. Delivery phasing

Sequenced so each phase is independently useful. No phase depends on a later one.

### Phase 0 — The shell *(no backend dependency)*

The application itself, before any component beyond the one that makes the rest coherent.

- `console/index.html` with its boot watchdog, router, shell and lazy registration.
- **CP-16 Target Manager** — the target model, reach classification, identity verification and
  non-destructive reachability check.
- `config/console-targets.config.js`; Console packaging in `npm run package` and
  `package:verify`.
- Topologies T-1 and T-3 working: co-hosted, and portable from a package against a live target.
- **Delivers immediately:** the tool that works when the runtime will not boot — the single
  capability no in-runtime screen can ever have.

### Phase 1 — Re-host and make honest *(no backend dependency)*

The management half, moved from the runtime to the Console and correctly target-scoped.

- CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-10, CP-12 — consuming the same `core/` services the
  Admin Suite consumes, per-target.
- Fix the baseline contradictions: the 19-vs-25 endpoint denominator, and the `schemaVersion` check
  (§2.4, Q-3).
- CP-01 Control Dashboard at device and single-target scope.
- `config/dashboards.config.js`, the six new permissions, and the action reconciliation into
  `core/admin-actions.js` (AMM-R-083).
- **Closes:** G-M8, and the honesty half of G-M1.

### Phase 2 — Thresholds and alerting *(in-app channel only)*

- `config/alert-rules.config.js` with all 43 rules; CP-08; CP-09.
- Alert evaluation client-side, delivered to `core/notification-center.js`; alert state target-local
  and labelled as such.
- Regenerate the monitoring catalogue (AC-25).
- **Closes:** G-M2 at single-target scope; G-M5 becomes measurable and visible.

### Phase 3 — Telemetry *(OBL-03)*

- Telemetry client, vocabulary and policy; ingest, query and alert-state contracts, per target.
- Every device-scope figure promotes to fleet scope; alert state becomes shared; topology **T-2
  becomes viable**, which is what makes one Console able to administer many deployments.
- CP-02 F-7 health history; CP-03 F-7 session map.
- **Closes:** G-M1.

### Phase 4 — Estate and portal *(OBL-04, OBL-06, OBL-07)*

- CP-04 F-5 run health; **CP-11 Portal Operations Console**; CP-08 F-4 delivery ledger.
- **Closes:** G-M7, G-M4, and the evidence half of G-M5.

### Phase 5 — Governance completion

- CP-13, CP-14, CP-15; OBL-08 audience-addressed send — the fix for 70 of 76 mail actions.
- Retire the five older screens into the Suite and the Console (AMM-R-059).
- **Closes:** the remainder of G-M5, and the residue of G-M3.

### Phase 6 — Enforcement *(OBL-01)*

- Authentication activation per the authentication contract.
- Every control in §12 becomes enforcement rather than advice; ACT-049 becomes available; the
  standing posture banner (AMM-R-022) is retired.
- **Closes:** G-M6.

> **Phase 6 is not last because it is least important.** It is last because it is a configuration
> and backend event the other phases do not block on, and blocking a usable Console on it would
> leave the platform with no monitoring for however long activation takes. Every phase before it
> states plainly that controls are advisory.

> **Phase 0 is small and it is not optional.** Every later phase assumes a target model. Building
> components first and retrofitting targeting produces exactly the defect AMM-R-000 exists to
> prevent — screens that report on "whatever this browser happens to be".

## 17. Traceability

### 17.1 Gap → requirement → phase → acceptance

| Gap | Closed by | Phase | Acceptance |
|---|---|---|---|
| G-M1 No fleet view | §9 telemetry; AMM-R-059…052; OBL-03 | 1 (honesty), 3 (closure) | AC-06, AC-11, AC-17 |
| G-M2 No thresholds or alerting | §10; `config/alert-rules.config.js`; AMM-R-072…061 | 2 | AC-07, AC-25 |
| G-M3 Fragmented administration | Largely closed by the Admin Suite; residue closed by retiring the five older screens (AMM-R-059) | 5 | AC-05, AC-33 |
| G-M4 Portal has no admin surface | CP-11; OBL-06 | 4 | AC-15, AC-16 |
| G-M5 Notification obligations unmet | CP-08; OBL-07, OBL-08 | 2 (visibility), 4–5 (closure) | AC-07 |
| G-M6 Browser-side enforcement only | OBL-01; AMM-R-022 states it until then | 6 | AC-13, AC-14 |
| G-M7 Estate health invisible | CP-04 F-5; OBL-04 | 4 | AC-12 |
| G-M8 Scope-narrowed green | AMM-R-014, AMM-R-015; CP-02 F-1/F-2 | 1 | AC-11, AC-12 |
| G-M9 No audit reader | Closed by the Suite's Audit & evidence tab; CP-07 re-hosts it per-target | 1 | AC-01, AC-09 |

### 17.2 Evidence register

Every factual claim in §2 and §3, with its source.

| Claim | Source |
|---|---|
| 31 routes, 5 groups | `config/routes.config.js` |
| 62 governed actions | `config/action-ownership.config.js` |
| Admin Suite: 1,862 lines, 10 tabs | `modules/admin-suite.js` |
| 44 administrative actions, 7 domains, 5 blast levels | `core/admin-actions.js` |
| 65 workflows with trigger schemas | `core/flow-shapes.js`, `config/flow-shapes.data.js` |
| `localStorage` is partitioned by origin, not by path | Web storage specification |
| 6 roles, 13 permissions | `config/rbac.config.js` |
| 19 endpoint contracts | `config/endpoints.config.js` — `EndpointKeys` |
| 25 contract keys, 51 workflows | `config/endpoint-atlas.data.js` |
| Audit ring buffer 5,000 | `core/audit-log.js` |
| State audit cap 1,000 | `PLATFORM.md` §3.3 |
| Notification feed cap 200 | `core/notification-center.js` |
| 39 required notifications; 16 provisioned | `config/notification-matrix.config.js` — `countByStatus()` |
| 4 channels, 11 audiences, 4 severities, 6 states | `config/notification-matrix.config.js` |
| 70 of 76 mail actions hard-code a mailbox | `config/notification-matrix.config.js` header |
| 54 monitoring records, no thresholds | `docs/process/19-MONITORING-AUDIT-AND-PERFORMANCE.md` |
| Performance budgets | `config/performance-budget.config.js` |
| Render budgets | `core/render-budget.js` |
| Retention classes | `core/retention.js` |
| Priority scale | `config/priority.config.js` |
| 225 npm scripts | `package.json` |
| Admin module line counts | `modules/*.js` |
| Portal has 4 public pages, no admin | `document-portal/` |
| `SCAN_INTAKE` absent from `EndpointKeys` | `config/endpoints.config.js` vs `config/action-ownership.config.js` |
| Auth posture inert; escalation demonstrated | `config/auth.config.js`, `docs/audits/CAPABILITY_ASSESSMENT_R11.6.md` G-04 |
| G-03 and G-04 remain open | `docs/audits/CAPABILITY_ASSESSMENT_R11.6.md` closure table |

### 17.3 Configuration deliverables

| File | Status | Contents |
|---|---|---|
| `console/index.html` + `console/app/` | **New** | The third application: entry point, boot watchdog, shell, router, 16 components |
| `config/console-targets.config.js` | **New** | Target register: id, kind, environment, endpoints, reach |
| `config/dashboards.config.js` | **New** | 14 dashboards, tiles, bindings, drill-downs |
| `config/alert-rules.config.js` | **New** | 43 rules per §10.2 |
| `config/telemetry-vocabulary.config.js` | **New** | Closed event-name vocabulary |
| `config/telemetry-policy.config.js` | **New** | Collection, batching, retention |
| `config/action-ownership.config.js` | Extend | +126 actions → 188 |
| `config/module-boundaries.config.js` | Extend | +16 components |
| `config/platform-provisioning.config.js` | Extend | +16 components |
| `config/rbac.config.js` | Extend | +6 permissions, +16 Console routes |
| `config/routes.config.js` | Extend | SYSTEM group reduced as the five older screens retire (AMM-R-059) |
| `config/endpoints.config.js` | Extend | +8 contracts (OBL-02…07 — OBL-03 supplies three), resolved per target |
| `core/admin-actions.js` | Extend | 44 → 126 actions, reconciled entry by entry (AMM-R-083) |
| `scripts/package.mjs` | Extend | Emit and verify the Console as a third artefact |

---

## 18. Open questions, assumptions and risks

### 18.1 Open questions

Stated rather than guessed. Each names who decides and what is blocked.

| ID | Question | Blocks | Decided by |
|---|---|---|---|
| **Q-1** | Is there a distinct **IT Support** role, or does IT operate as `systemAdmin`? The current six roles have no operations-only role, so IT support today means full administrative rights — including user management and configuration they do not need | §12.1 rows; the `monitor:operate` assignment | NITDA IT + platform owner |
| **Q-2** | Is there a **Portal Operator** role, or does the registry operate the portal? CP-11 has no natural role today | CP-11 access; §12.1 | Registry + DGCEO office |
| **Q-3** | `modules/diagnostics.js` asserts `schemaVersion === 3`; the documented schema is v4. Which is correct? | CP-02 F-1 — the check is either vacuous or permanently red | Platform team, from the code |
| **Q-4** | Where does telemetry live — a SharePoint list per §13.2, or Application Insights / Log Analytics in the tenant? A list is consistent with the estate and has no new dependency; a log platform is built for this and is a new service to procure and govern | §9.4–9.6; OBL-03 | NITDA IT architecture |
| **Q-5** | Operational-data retention (audit events, receipts, telemetry) is currently defined only by buffer sizes. What is the policy? | CP-15 F-6; §9.6 | Records management + legal |
| **Q-6** | Does the notification matrix's `registry-fixed` audience remain legitimate for any row, or is every one of the 70 fixed-mailbox sends a defect? | OBL-08 scope; CP-08 F-3 | Registry + DGCEO office |
| **Q-7** | Should alert delivery use the existing `EMAIL` contract or a dedicated alerting flow? Sharing means alerting fails when correspondence email fails — precisely when you need it | OBL-07; §10.1 channel binding | Platform team |
| **Q-8** | Who is the on-call recipient for a `CRITICAL` alert outside working hours, and is there one? | ALR-03, -05, -14, -32, -33, -34, -43 | DGCEO office + NITDA IT |

### 18.2 Assumptions

| ID | Assumption | If wrong |
|---|---|---|
| A-1 | The four ingestion sources and the single lifecycle remain as `config/product-definition.config.json` states | §8.3 work metrics need rework; the component model does not |
| A-2 | Power Automate remains the integration layer | OBL-04 changes shape; every other obligation is platform-neutral |
| A-3 | SharePoint remains the system of record | §13.2 changes; the telemetry model does not |
| A-4 | The zero-build, no-dependency commitment holds | §8.5 rendering constraints relax; nothing else changes |
| A-5 | Authentication will eventually be activated | If not, §12 is permanently advisory and must be labelled so permanently — not quietly |
| A-6 | Fleet size is tens of concurrent sessions, not thousands | §9.4 batching thresholds need revisiting above ~500 sessions |

### 18.3 Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-1** | Telemetry is not funded; the control plane ships device-scope only | Medium | Fleet monitoring does not exist | AMM-R-071 — every phase is useful and honest without it. Phase 1 and 2 deliver real value at device scope |
| **R-2** | Alert fatigue: 43 rules produce noise and get silenced | **High** | Alerting dies quietly, as it has in most systems | `sustainedFor` mandatory (AMM-R-075); every alert carries its resolving action (AMM-R-079); snoozes expire (AMM-R-078); review firing rates at 30 days and tune |
| **R-3** | The control plane becomes an escalation path — a console that can do what RBAC forbids | Medium | Security control bypassed | NFR-36; AMM-R-089 delegation to owners; `tests/governance.test.mjs` ownership assertions |
| **R-4** | Monitoring surfaces present advisory controls as enforcement while auth is inert | **High** | False assurance — the most damaging failure mode available here | AMM-R-022 standing banner; CP-14 F-1 states the consequence in one sentence; the banner is not dismissible |
| **R-5** | 118 new actions overwhelm the ownership table and governance rots | Medium | The spine that makes this platform worth protecting decays | Actions are declared as data; CI fails on an undeclared action; AMM-R-066 keeps instrumentation declarative |
| **R-6** | Telemetry captures personal data by accident | Low | Data-protection breach | AMM-R-063 identifiers only; digests not payloads; `actorHash` not addresses; AC-06 vocabulary is closed |
| **R-7** | Sixteen components is too many to build | Medium | Partial delivery, incoherent surface | Phasing (§16) — each phase is a coherent, shippable subset. Phase 0 alone delivers the tool that works when the runtime will not boot |
| **R-9** | The Console and the Admin Suite drift into two administrative products | **High** | The fragmentation the Suite just closed reopens, one screen wider | Shared `core/` by direct import (AMM-R-024, NFR-46); one action catalogue (AMM-R-083); the §6.5 boundary rule; AC-33 and AC-34 in CI |
| **R-10** | The Console is deployed cross-origin and half its screens are empty | **High** | It is judged useless on first open, by the person who most needed it | §6.3 stated at the top of the deployment procedure; T-1 is the documented default; AMM-R-033 makes every absence explain itself rather than read as zero |
| **R-11** | The target register becomes an inventory of every deployment's credentials on one laptop | Medium | One compromised machine reaches the whole estate | NFR-38 and NFR-39: scoped installations, packaged and rotated as credential-bearing artefacts; addresses never exported; capsule registry (`core/capsule-client.js`) is the posture that removes the problem where a server exists |
| **R-8** | Dashboard figures disagree with the operational screens | Medium | Trust in monitoring collapses on first disagreement | Every metric has one formula (§8.3) and one source; components read the same services the workspaces do |

---

## 19. What this document does not claim

In the house style of this repository, stated plainly:

1. **The Console is not built.** The baseline in §2 is what exists — and a substantial amount now
   does, in `core/` and in the Admin Suite. The standalone application, its target model, and the
   whole monitoring half are work.
2. **The control plane cannot enforce anything the backend does not.** Every requirement in §12 is
   advice until OBL-01 is discharged. A console that reports the platform is secure because its own
   checkboxes are ticked would be a worse artefact than no console.
3. **Monitoring at device scope is not fleet monitoring**, and this document does not pretend the
   two are close. Phases 0–2 deliver an honest single-target Console. Phase 3 delivers monitoring,
   and only then does one Console genuinely administer many deployments (topology T-2).
4. **The 43 alert rules are a starting set, not a tuned one.** No threshold here has been validated
   against production data, because there is no production data. Every one will move.
5. **Eight questions in §18.1 are genuinely open.** Four of them — the two role questions, telemetry
   storage, and the on-call recipient — are decisions this document cannot make and has not
   pre-empted.
6. **The origin constraint in §6.3 is a browser guarantee, not a design choice, and no amount of
   engineering removes it.** A Console on a separate origin cannot see a target's device-local
   state. The honest responses are to co-host it, or to build telemetry. Anything else is a
   cross-origin read dressed up as a feature.

---

**Document ends.** Change control: amend this file and say why in the commit. Where it and the code
disagree, one of them is wrong — and per `docs/README.md`, this document is binding until it is
changed.
