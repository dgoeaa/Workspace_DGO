# NITDA Folio Module Rationalisation Plan

**Baseline:** Handover build 2026.10.21-2, source commit 31e80475  
**Plan date:** 22 October 2026  
**Objective:** Consolidate, refine and reorganise modules, submodules, features, functions and actions to improve operational efficiency, clarify ownership, reduce duplication, simplify navigation and create enforceable domain boundaries without disrupting critical operations.

## 1. Executive direction

The current source contains 31 top-level runtime modules, a substantial configuration estate and several cross-cutting shared scripts. The platform already carries a useful module-boundary concept, but implementation remains highly granular at navigation level and combines domain functions, channel adapters, operational lenses and administration tools as peer modules.

The target design reduces the visible product structure to **eight business capability groups** plus platform services. Existing capabilities are not deleted merely because modules are merged. They are moved behind clear domain interfaces, with redirects and compatibility adapters retained until behavioural parity is proven.

### Target capability groups

1. **Workspace**: home, operational cockpit and contextual assistance.
2. **Correspondence**: intake, email, scan, acknowledgement and case management.
3. **Work Management**: assignments, activities, queues, projects and engagements.
4. **Decision Management**: briefs, approvals and executive review.
5. **Records**: registry, dispatch, closure and archive.
6. **Oversight**: response tracking, reporting, statistics and operational orchestration.
7. **Administration**: identity, configuration, integrations, provisioning, diagnostics and audit.
8. **Governance**: boundaries, policies, terminology and controlled reference material.
9. **Platform Services**: API client, state, events, reference data, validation, notifications, accessibility and reusable UI.

## 2. Design principles

- **One capability, one authoritative owner.** A write action has one domain owner even when many modules can display it.
- **Views do not become owners.** Dashboards, executive lenses and activity feeds compose data but do not duplicate business rules.
- **Channel adapters remain thin.** Email, scan and portal intake normalize inputs into the correspondence domain.
- **Actions use a common command contract.** Each command declares owner, permission, input schema, state preconditions, endpoint, audit event and failure behaviour.
- **Read models may be shared; write models may not.** Reporting and search can aggregate, while writes go through authoritative services.
- **Configuration is schema-validated and layered.** Product defaults, environment configuration, tenant policy and user preference are separated.
- **No big-bang rewrite.** Rationalisation proceeds behind compatibility routes, feature flags and parity tests.
- **Archive and registry boundaries remain strict.** Convenience refactoring must not dilute evidential custody, retention or closure controls.

## 3. Proposed target structure

```text
src/
  app/
    bootstrap/
    routing/
    workspace/
  domains/
    correspondence/
      application/
      channels/email/
      channels/scan/
      acknowledgements/
      model/
      ui/
    work/
      assignments/
      activity/
      queues/
      projects/
      engagements/
    decisions/
      cases/
      approvals/
      executive/
    records/
      registry/
      dispatch/
      archive/
    oversight/
      tracking/
      reporting/
      operations/
    administration/
      identity-access/
      configuration/
      integrations/
      provisioning/
      health/
      audit/
  platform/
    api/
    auth/
    events/
    state/
    reference-data/
    notifications/
    validation/
    observability/
    ui/
  config/
    schemas/
    defaults/
    environment/
    policy/
  compatibility/
    routes/
    actions/
```

## 4. Module disposition

The accompanying `MODULE_DISPOSITION.csv` provides an executable inventory. The main decisions are:

- Merge `single-assignment` and `bulk-assignment` into one assignment capability with single and bulk modes.
- Treat `correspondence-email` and `scan-intake` as correspondence channel adapters rather than peer business domains.
- Consolidate `activities` and `response-tracking` around one immutable event/timeline model, while preserving SLA policy as a separate service.
- Consolidate `reports` and `statistics` into one reporting domain with shared metric definitions and renderers.
- Split the 1,919-line `admin-suite.js` into bounded administration submodules.
- Unite `endpoint-console` and `diagnostics` under integration operations and observability, with privileged actions audited.
- Merge `user-admin`, RBAC configuration and identity provisioning into identity and access administration.
- Move `ecm-erp-charter` out of day-to-day runtime navigation and make it governed architecture/reference content.
- Keep `registry`, `dispatch` and `archive` distinct because custody, dispatch evidence and retention/closure have different controls.
- Keep `orchestrator` as a coordinator only. It should issue domain commands and consume events, not directly mutate domain-owned records.

## 5. Submodule and feature rationalisation

### Correspondence

**Authoritative aggregate:** Correspondence Case.

Submodules:
- Intake and classification
- Channel adapters: email, scan, portal and outgoing DGCEO correspondence
- Triage and routing request
- Acknowledgement and receipt ledger
- Attachments and evidence
- Correspondence communication templates

Eliminate separate channel-specific validation, duplicate correspondence forms and divergent status labels. All channels must produce a common `IntakeEnvelope` and then call the same case-creation command.

### Work Management

**Authoritative aggregates:** Assignment, Task, Activity Event, Project.

Submodules:
- Assignment composer with single and bulk modes
- Work inbox and queue views
- Activity timeline
- Fast-track queue policy
- Project register
- Engagement actions

Replace repeated local synchronization functions with one work-state store and event reducer. Assignment validation, assignee resolution, cascading and notifications must be shared by single and bulk paths.

### Decision Management

**Authoritative aggregates:** Decision Case and Approval.

Submodules:
- Brief/decision case builder
- Approval inbox and decision action
- Executive review workspace
- Decision evidence and audit history

Briefs and meetings may retain different templates but should use a common submission, review, decision and conversion-to-task state machine.

### Records

**Authoritative aggregates:** Registry Record, Dispatch Record and Archive Package.

Submodules:
- Registration and minutes
- Custody and classification metadata
- Dispatch generation and proof
- Closure checklist
- Archive packaging, retention and controlled reopen

Do not merge registry and archive writes. Share identifiers and evidence contracts only.

### Oversight

Submodules:
- SLA and response tracking
- Operational metrics catalogue
- Reports and exports
- Operational coordination

Metric definitions must live in one catalogue. Reports and dashboards consume the same definitions to avoid contradictory totals.

### Administration

Split `admin-suite` into:
- `identity-access`: users, roles, assignments and access reviews
- `configuration`: product defaults, tenant policy and preferences
- `integrations`: endpoint registry, connection status and approved overrides
- `provisioning`: SharePoint/flow provisioning operations
- `health`: diagnostics, probes and failure groups
- `audit`: immutable administrative action log

Administrative actions must use explicit permissions, confirmation for destructive operations, correlation IDs, before/after evidence and rollback guidance.

## 6. Function and action consolidation

Create the following shared services before moving UI modules:

- `ApiClient`: timeout, retry, correlation ID, error normalization and authentication handling.
- `CommandBus`: command ownership, validation, authorization and audit emission.
- `EventBus`: domain event publication and view-store updates.
- `EntityStore`: normalized read models and cache policy.
- `ReferenceDataService`: lookup loading, normalization and caching.
- `FormEngine`: field schema, validation, error display and accessibility.
- `NotificationService`: template selection, delivery channel, retry and failure grouping.
- `TelemetryService`: structured logs, performance budgets and health events.
- `DownloadService`: safe file naming, MIME handling and export audit.
- `DialogService`: modal lifecycle, focus management and confirmation patterns.

Commonly repeated function names such as `bind`, `render`, `syncLocal`, `createForm`, `download`, `close`, `resolve` and `wire` should not be merged solely by name. Each instance must first be classified as UI lifecycle, domain logic or infrastructure. Only equivalent infrastructure or UI behaviours should move to shared services.

### Canonical action contract

```text
ActionDefinition
  id
  domainOwner
  label
  permission
  inputSchema
  preconditions
  command
  endpointKey
  successEvent
  failurePolicy
  auditCategory
  idempotencyPolicy
```

`action-ownership.config.js`, `action-routing.config.js`, endpoint configuration and module boundaries should be generated or validated from this canonical registry rather than maintained as independent overlapping sources.

## 7. Configuration rationalisation

Reorganise the configuration estate into:

- **Domain policy:** status vocabulary, priorities, categories, assignment cascade and routing.
- **Integration registry:** endpoint keys, flow shapes, source routing and platform mappings.
- **Experience configuration:** navigation, routes, entry points, welcome experience and notices.
- **Operations:** caching, fetch policy, performance budgets, notification delivery and support routing.
- **Governance:** action ownership, module boundaries, RBAC and audit requirements.

Actions:
1. Define JSON Schemas or equivalent runtime validators for every configuration family.
2. Remove duplicated labels, endpoint metadata and status definitions.
3. Establish precedence: defaults → environment → tenant policy → permitted user preference.
4. Prohibit secrets and signed URLs in source configuration.
5. Generate human-readable catalogues from machine-readable configuration.
6. Add referential-integrity tests for route IDs, module IDs, endpoint keys, permissions and action owners.

## 8. Navigation and terminology

Limit primary navigation to:

- Home
- Correspondence
- Work
- Decisions
- Records
- Oversight
- Administration, role-gated

Expose modules such as email intake, scan intake, bulk assignment, statistics and endpoint inspection as subroutes/actions rather than primary peers.

Adopt one vocabulary for case, correspondence, assignment, task, activity, approval, dispatch, closure and archive. Alias legacy terms in search and redirects, not in the authoritative model.

## 9. Delivery roadmap

### Phase 0: Safety baseline, 2 weeks

- Restore or obtain the missing build manifest, lockfile, tests and runtime assets.
- Establish a reproducible baseline build and smoke suite.
- Record current routes, actions, permissions, endpoints and critical workflows.
- Freeze new top-level modules unless approved through architecture review.

**Exit:** clean baseline build, test evidence and rollback package.

### Phase 1: Inventory and ownership, 2 weeks

- Assign every feature, function and action to one domain owner.
- Complete route/action/endpoint/configuration matrices.
- Identify delegates, read-only views, deprecated actions and orphaned functionality.
- Approve canonical terminology and module IDs.

**Exit:** 100% ownership coverage; no unclassified write actions.

### Phase 2: Platform services, 3–4 weeks

- Introduce API client, command contract, event model, validation, notifications and telemetry.
- Add compatibility adapters for existing modules.
- Add configuration schemas and referential-integrity tests.

**Exit:** new shared services used by at least two representative modules, with parity tests.

### Phase 3: Low-risk consolidation, 3 weeks

- Merge reports/statistics.
- Merge endpoint-console/diagnostics.
- Merge user-admin/RBAC/provisioning entry points.
- Move charter/reference content out of primary navigation.

**Exit:** reduced navigation with legacy redirects and no loss of authorized actions.

### Phase 4: Core workflow consolidation, 4–6 weeks

- Consolidate single/bulk assignments.
- Normalize email/scan intake into correspondence.
- Unify activities and tracking timeline.
- Consolidate decision-case submission and review patterns.

**Exit:** end-to-end parity for intake → register → assign → track → decide → dispatch → close → archive.

### Phase 5: Administration decomposition, 4 weeks

- Split admin suite into the six target submodules.
- Apply least privilege, audit events, confirmations and rollback guidance.
- Remove duplicate endpoint overrides and provisioning controls.

**Exit:** every privileged action has explicit permission, evidence and owner.

### Phase 6: Retirement and optimization, 2–3 weeks

- Remove compatibility code after two stable releases.
- Delete superseded routes/configuration only after usage and audit review.
- Optimize loading by capability and measure performance.
- Publish the final module catalogue and support runbook.

**Exit:** no active legacy route dependency; documentation and implementation agree.

## 10. Controls and acceptance criteria

No module is merged or retired until all are true:

- Current capabilities and role permissions are inventoried.
- Behavioural parity tests pass for success, validation, authorization and failure paths.
- Data and audit history remain accessible.
- Deep links and bookmarks redirect safely.
- Monitoring shows no material increase in errors or processing time.
- Product owner, domain owner, security reviewer and operations owner approve.
- Rollback is tested.

### Programme success measures

- Reduce top-level navigation from 31 technical modules to no more than 7 user-facing groups plus role-gated administration.
- Assign 100% of write actions to a single authoritative domain.
- Eliminate duplicate business-rule implementations for assignment, intake, status transition and reporting metrics.
- Reduce time to locate the correct action in task-based usability tests.
- Reduce privileged administrative surfaces and require audit evidence for every privileged command.
- Achieve one configuration source for each route, endpoint, action owner, permission and status definition.
- Maintain zero regression in critical commissioning journeys.

## 11. Governance

- **Architecture owner:** approves boundaries and exceptions.
- **Domain owners:** correspondence, work, decisions, records, oversight and administration.
- **Product owner:** approves navigation, terminology and capability retention.
- **Security owner:** approves identity, endpoint and privileged-action changes.
- **Operations owner:** approves monitoring, rollback and support readiness.
- **Change board:** authorizes retirement of legacy routes or actions.

Use an architecture decision record for every merge, split, move or retirement. Maintain a deprecation register with owner, replacement, notice date, removal date, telemetry and rollback path.

## 12. Immediate backlog

1. Recover the missing build/test inputs before structural refactoring.
2. Create the canonical module/action inventory from the supplied module-boundary, navigation, route and action configuration.
3. Decompose `admin-suite.js` first on paper, then behind existing routes.
4. Introduce the assignment service and migrate single/bulk assignment as the first workflow consolidation.
5. Introduce `IntakeEnvelope` and migrate email and scan intake adapters.
6. Establish the shared event timeline used by activities and response tracking.
7. Create one metrics catalogue for reports and statistics.
8. Consolidate integration diagnostics and endpoint operations.
9. Add schema and referential-integrity checks to CI.
10. Measure usage before retiring any module, action or route.

## 13. Decision

Proceed with **incremental domain consolidation**, not a wholesale rewrite. Retain operationally distinct records functions, reduce peer-level modules, centralize cross-cutting services and enforce ownership through configuration validation and tests. The first release should improve structure without changing business outcomes; later releases may simplify workflows after measured parity and user acceptance.
