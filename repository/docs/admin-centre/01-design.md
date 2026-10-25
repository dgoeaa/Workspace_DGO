# Admin Centre design — version 2.1

**Status:** current, version 2.1. Its steps operate the Administration Centre only; estate commissioning steps live in [`docs/deployment/RUNBOOK.md`](../deployment/RUNBOOK.md).

Architecture, information model, security, interfaces, operations and design decisions of the Folio Central Administration Centre as built in [`tools/admin-centre/`](../../tools/admin-centre/). Supersedes the 1.0 design in [`source-1.0/`](../governance/RETIRED_RECORDS.md); what changed and why is in [05-assessment.md](05-assessment.md).

## 1. Purpose

The Centre is the governed control plane over the Folio portfolio. It keeps the canonical local record of the platforms, their endpoint estate, runtime configuration, health observations, alerts, incidents, controlled changes and the audit trail, and it gathers health evidence itself instead of waiting for someone to type it in: it probes the platforms, and — signed in as the account that owns the flows — reads every governed flow's live state and run history and acts on those flows as their owner.

## 2. System context

| Platform ID | Platform | Type | Entry point | Port | Probe | Launcher |
|---|---|---|---|---|---|---|
| workspace | Folio Workspace | Browser application | `index.html` | 8080 | `/` | `npm run start:runtime` |
| portal | NITDA Document Portal | Public PWA | `document-portal/index.html` | 8081 | `/` | `npm run start:portal` |
| console | Folio Estate Console | Administration console | `tools/admin-console.html` | 8082 | `/admin-console.html` | `npm run start:console` |
| mailer | DGO Correspondence Mailer | Browser application | `mailer/index.html` | 8083 | `/` | `npm run start:mailer` |
| workbench | Folio Flow Workbench | Browser tool and local relay | `tools/flow-workbench/index.html` | 8765 | `/api/health` | `npm run start:workbench` |
| vault | Folio Vault | Local credential-alias API | `tools/flow-capsule/app/flowcapsule.py` | 8787 | `/health` | `npm run start:capsule` |

The Centre itself listens on **127.0.0.1:8844** (`npm run start:centre`). `tests/admin-centre.test.mjs` fails if this table and `scripts/platforms.config.mjs` disagree.

## 3. Architecture

```
 Browser (static/)            Centre process (server.py)                     Evidence
 ─────────────────            ───────────────────────────────────────        ─────────────
 index.html  app.js  ──HTTP──▶ Handler ─ Host/Origin/size checks              data/folio_admin.db
 app.css  brand/      Bearer   │        ─ authenticate (bootstrap|operator)   (WAL, FK on, 0600)
                               │        ─ permission (role → PERMISSIONS)     audit chain
                               ▼                                              backups/*.db (0600)
                             App ─ validation, credential guard               evidence/provisioning.json
                               │  ─ mutate(): record + audit in one tx
                               ├─ Monitor thread ─ probes 127.0.0.1:<port> ─▶ the six platforms
                               ├─ Vault client ─ /health, /admin/flows, verify ─▶ Folio Vault :8787
                               └─ FlowOwner ─ device-code sign-in ─▶ login.microsoftonline.com
                                             user-scoped ProcessSimple ─▶ api.flow.microsoft.com
                                             (flows, triggers/listCallbackUrl, runs, actions, start/stop, resubmit, cancel)
```

- **Presentation.** A dependency-free client served by the same process. No inline script or style, so the server's CSP (`script-src 'self'`) holds.
- **Application.** Python 3 standard library `ThreadingHTTPServer`; one route table; every `/api/` route authenticated before it is matched.
- **Persistence.** SQLite with WAL and foreign keys; one connection per request; writes serialised by a process lock and `BEGIN IMMEDIATE`.
- **Monitoring.** A daemon thread probes each platform every `healthIntervalSeconds`, records observations, raises and resolves monitor alerts, and applies retention daily.
- **Integration.** Folio Vault is called with an admin credential read from the environment; the Centre never sees a signed URL.
- **Flow owner.** The account that owns the flows signs in with a device code through Microsoft's public sign-in apps (the same two, in the same order, as `scripts/lib/device-sign-in.mjs` and the mailer's setup). Every call is on the user-scoped `/providers/Microsoft.ProcessSimple/environments/{env}/flows/...` paths — never `/scopes/admin/` — so the Centre can see and act on exactly the flows that account owns. No app registration, no admin consent, no tenant administrator, no secret. Tokens are held in memory only.

## 4. Components

| Component | Path | Responsibility |
|---|---|---|
| Runtime server | `server.py` | HTTP, authentication, roles, validation, persistence, audit, monitor, Vault client, exports |
| Client | `static/index.html`, `static/app.js`, `static/app.css` | Lock screen, shell, thirteen views, dialogs, record sheets, search, live refresh |
| Brand package | `static/brand/` | Written by `npm run brand:sync` from `styles/dgo-design-system/`; never edited by hand |
| Settings | `config/settings.json` | Non-secret runtime values (§8) |
| Bootstrap token | `$FOLIO_ADMIN_HOME/config/admin.token` | 43-character URL-safe token, mode 0600, generated on first start |
| Database | `$FOLIO_ADMIN_HOME/data/folio_admin.db` | Governed records and the audit chain, mode 0600 |
| Backups | `$FOLIO_ADMIN_HOME/backups/` | Online SQLite backups, mode 0600, directory 0700 |
| Provisioning evidence | `$FOLIO_ADMIN_HOME/evidence/provisioning.json` | Source registers with SHA-256, counts, identifiers, boundary statement |
| Start | `scripts/start.sh` | Starts the server from its own directory with `umask 077` |
| Verifier | `scripts/verify.py` | Independent, read-only installation check; PASS / FAIL / NOT PROVISIONED |
| Tests | `tests/test_admin_centre.py` | Server behaviour (see [05 §4](05-assessment.md#4-tests-that-hold-it)) |

`$FOLIO_ADMIN_HOME` defaults to the package directory, where those paths are git-ignored; `npm run start:centre` points it at a per-checkout directory under the system temp directory.

## 5. Data model

| Table | Fields | Notes |
|---|---|---|
| `platforms` | id, name, type, entry_point, port, status, updated_at, launcher_id, probe_path, owner | Status: Registered, Active, Maintenance, Retired |
| `endpoints` | id, scope, endpoint_key, flow_name, workflow_id, method, route, platform_id → platforms, state, updated_at, register_method, routing_segment, shares_flow_with, operations, vault_alias, flow_id, flow_candidates, flow_id_source, tenant_state, tenant_modified, tenant_observed_at, identity_verified | Unique (scope, endpoint_key). `route` is the trigger path only — never the query string that carries the signature. `workflow_id` addresses execution (the trigger URL); `flow_id` addresses management (the tenant flow GUID) — the two are not derivable from each other (see the crosswalk) |
| `configurations` | key, value (JSON), scope, version, updated_at, updated_by | Scope: runtime, restart-bound, tenant-boundary |
| `configuration_history` | id, key, version, value, actor, reason, changed_at | One row per change |
| `health` | id, asset_type, asset_id, state, latency_ms, message, checked_at, source | Source: monitor, probe, ingest, vault |
| `audit` | id, event_id, actor, action, target, reason, result, correlation_id, previous_hash, event_hash, created_at | Append-only; result Succeeded, Failed or Denied |
| `alerts` | id, severity, asset, message, state, owner, created_at, updated_at, source, correlation_id, created_by, resolved_at | Source: manual, monitor (a platform probe), flow-runs (a Folio flow's newest finished run failed), flow-state (a Folio flow is not in the state the flow catalogue expects) |
| `incidents` | id, severity, title, description, state, owner, created_at, updated_at, alert_id → alerts, correlation_id, created_by, resolved_at | |
| `changes` | id, change_type, target, reason, state, maker, checker, created_at, updated_at, risk, rollback_plan, scheduled_for, decided_by, decided_at, implemented_at, correlation_id | |
| `record_notes` | id, record_type, record_id, actor, kind, note, created_at | Kind: created, transition, assigned, escalated, note |
| `operators` | id, name, role, token_digest, enabled, created_by, created_at, last_seen_at | SHA-256 of a 256-bit token; the token itself is never stored |
| `tenant_flows` | flow_id, display_name, state, created, modified, trigger_workflow_id, trigger_path, synced_at | Every flow the owner's listing returned, and each Folio flow the listing leaves out (a flow shared with the account), read by its id. The trigger workflow and path are read from the callback URL, whose signature is discarded unread |
| `folio_flows` | flow_id, name, flow_group, trigger_desc, purpose, expected_state, state, updated_at | Every Folio flow in `registers/flow-catalogue.json`, read at provisioning, at every start and on Estate › Reconcile; state Registered or Retired. The Centre watches all of them, with or without an endpoint |
| `flow_runs` | flow_id, run_id, status, start_time, end_time, duration_ms, trigger_name, origin_history, error_code, error_message, synced_at | Run history of every Folio flow; error text has credential-shaped content redacted |
| `meta` | key, value | schema_version, provisioned_at |

A 1.0 database is migrated forward in place: missing columns are added, nothing is dropped or rewritten.

### Lifecycles

| Record | Transitions | Note required entering |
|---|---|---|
| Alert | Open → Acknowledged → Resolved; Acknowledged → Open; Open → Resolved; Resolved → Open | Resolved |
| Incident | Open → Investigating → Mitigated → Resolved → Closed; Open → Resolved; Mitigated → Investigating; Resolved → Investigating | Resolved, Closed |
| Change | Submitted → Approved \| Rejected \| Cancelled; Approved → Implemented \| Cancelled; Implemented → Verified \| RolledBack | Rejected, Verified, RolledBack |

Approval and rejection are open only to the named checker, never to the maker. Cancellation is open to the maker or a super administrator.

### Effective health

| State | Meaning |
|---|---|
| Healthy | A current observation says so (HTTP < 400 within `degradedLatencyMs`) |
| Degraded | Slow, HTTP 4xx, or the port is held by a different platform (`X-DGO-Platform` mismatch) |
| Unavailable | No connection, timeout, or HTTP 5xx |
| Stale | The latest observation is older than `staleAfterSeconds` |
| Unknown | No observation exists — never shown as Healthy |

## 6. API

Every `/api/` route requires `Authorization: Bearer <token>`. Mutations take JSON with a `reason` (5–1000 characters) and, with the bootstrap token, an `actor`; an operator token's actor is always its own name. An optional `correlationId` (6–80 of `A-Za-z0-9._:-`) is honoured, otherwise one is generated. Errors are `{"error", "message", "status", "correlationId"}`.

### Reads (every role)

| Route | Returns |
|---|---|
| `GET /healthz` | Liveness, **no token**, no data |
| `POST /api/launch` | **No token**: trades the one-time code `scripts/folio-admin.mjs` put in the browser link (`#launch=…`) for the bootstrap token and the operator's name. The code is single-use and expires within 15 minutes; a wrong one counts as a failed sign-in; the sign-in is audited as `session.launch` |
| `GET /api/session` | Role, permissions, system facts, enumerations |
| `GET /api/summary` | Counts, open counts, alert severities, endpoints by scope, platform health, recent audit, chain head, monitor state |
| `GET /api/platforms` · `/api/endpoints` · `/api/configurations` · `/api/health` · `/api/audit` · `/api/alerts` · `/api/incidents` · `/api/changes` | `{items, total, limit, offset}`; filters by column (comma-separated values), `q` search, `open=1`, `limit` ≤ 2000, `offset` |
| `GET /api/alerts/{id}` · `/api/incidents/{id}` · `/api/changes/{id}` | Record, notes, audit events, allowed transitions, links |
| `GET /api/health/status` | Effective state per asset with 24 h uptime, p50/p95 and trend |
| `GET /api/audit/verify` | `{valid, events, head}` or `{valid:false, mismatchAt, problem}` |
| `GET /api/configurations/{key}/history` | Versions of one setting |
| `GET /api/checklist` | Daily and weekly control checks, computed live |
| `GET /api/metrics` | Uptime, requests, refusals, database size, monitor |
| `GET /api/backups` | Backups with size, mode and SHA-256 |
| `GET /api/vault` | Vault reachability, aliases, reconciliation with the estate |
| `GET /api/search?q=` | Matches across platforms, endpoints, records and settings |
| `GET /api/tenant` | Flow-owner connection: state, account, sign-in app, pending device code, last sync and its result — never a token |
| `GET /api/flows` | Every governed flow with state, identity, newest run and 24 h counts; endpoints whose flow is not yet unique |
| `GET /api/flows/{flowId}/runs` | Stored run history (`?live=1` syncs first) |
| `GET /api/flows/{flowId}/runs/{runId}` | The run's steps, live: status, times and error — signed input/output links are dropped |

### Mutations

| Route | Permission | Effect |
|---|---|---|
| `POST /api/alerts` | alert.create | severity, asset, message, owner |
| `POST /api/incidents` | incident.create | severity, title, description, owner, optional alertId (escalation) |
| `POST /api/changes` | change.create | changeType, target, checker (≠ maker), risk, rollbackPlan, scheduledFor |
| `POST /api/{alerts\|incidents\|changes}/{id}/transition` | alert.update · incident.update · change.decide/progress/create | `to`, `note` where required |
| `POST /api/{alerts\|incidents}/{id}/assign` | alert.update · incident.update | owner |
| `POST /api/{alerts\|incidents\|changes}/{id}/notes` | note.create | note |
| `POST /api/health` | health.ingest | assetType, assetId, state, latencyMs, message |
| `POST /api/probe` · `POST /api/probe/{id}` | probe.run | Probe all platforms or one |
| `POST /api/platforms/{id}/status` | inventory.update | status, owner |
| `POST /api/endpoints/{id}/state` | inventory.update | state, vaultAlias |
| `POST /api/estate/reconcile` | inventory.update | Re-read the registers |
| `PUT /api/configurations/{key}` | config.update | value (runtime keys only; restart-bound → 409) |
| `POST /api/vault/verify` | vault.verify | alias |
| `GET /api/test` | read | — (the operator's Folio sign-in state and the read-only flows that may be tested) |
| `POST /api/test/sign-in` | flow.test | email (OTP_GENERATE through the Vault mails a code) |
| `POST /api/test/verify` | flow.test | email, code (OTP_VERIFY through the Vault; the proof is held in memory only) |
| `POST /api/test/sign-out` | read | — |
| `POST /api/test/run` | flow.test | key (a read-only contract only), payload, reason — called through the Vault by alias, audited, reply not stored |
| `GET /api/operators` | access.manage | Operators and the role map |
| `POST /api/operators` | access.manage | name, role → token shown once |
| `POST /api/operators/{id}/{action}` | access.manage | rotate (new token shown once), disable, enable |
| `POST /api/access/rotate-bootstrap` | access.manage | New bootstrap token, old refused at once |
| `POST /api/backups` | backup.create | Online backup |
| `POST /api/tenant/sign-in` | tenant.connect | Start the flow owner's device-code sign-in; returns the code to enter |
| `POST /api/tenant/sign-out` | tenant.connect | Forget the flow owner's session (also cancels a pending sign-in) |
| `POST /api/tenant/sync` | tenant.sync | List the owner's flows, settle and verify identities, read run history, update health and alerts |
| `POST /api/flows/{flowId}/{action}` | flow.operate | `turn-on` or `turn-off` a governed flow |
| `POST /api/flows/{flowId}/runs/{runId}/{action}` | flow.operate | `resubmit` (needs `"confirm": "RESUBMIT"`) or `cancel` a run |
| `POST /api/retention/run` | retention.run | Prune observations past `retentionDays` |
| `GET /api/export` | evidence.export | JSON evidence bundle (audited) |
| `GET /api/export/{table}.csv` | evidence.export | One table as CSV; cells starting `= + - @` are neutralised |

### Roles

| Role | May, beyond reading everything |
|---|---|
| Super Administrator (bootstrap token) | Everything |
| Operations Controller | Create and update alerts; open incidents; submit changes; notes; ingest health; probe; sync flow runs |
| Incident Manager | Create and update alerts and incidents; notes |
| Change Manager | Submit, decide (as named checker) and progress changes; notes |
| Platform Administrator | Create alerts; submit and progress changes; notes; ingest; probe; platform and endpoint state; reconcile; Vault verify; connect as flow owner; sync; turn flows on/off; resubmit and cancel runs |
| Auditor | Verify the chain; export evidence |
| Viewer / Executive | Read only |

## 7. Security design

- **Network.** Binds 127.0.0.1 and refuses anything else without `FOLIO_ADMIN_ALLOW_NONLOOPBACK=1`. Answers only Host `127.0.0.1`, `localhost` or `[::1]` on its port (plus `FOLIO_ADMIN_ALLOWED_HOSTS`), which defeats DNS rebinding. Writes with a foreign `Origin` are refused.
- **Authentication.** Constant-time comparison of the bootstrap token; operators by SHA-256 digest of a 256-bit token; 20 refused tokens in 5 minutes from one client → 429 for the rest of the window.
- **Authorisation.** One permission map; a refused mutation is audited `Denied` with the caller's identity.
- **Integrity.** A record and its audit event commit together; a broken rule inside a mutation is audited `Failed` in its own transaction. The chain is `SHA-256(event_id|actor|action|target|reason|result|correlation_id|previous_hash|created_at)` from `GENESIS`, as in 1.0.
- **Flow owner.** Only the two public client ids and the flow-service scope the repository already uses; a flow service or sign-in host outside Microsoft's domains is refused at start; continuation links to another host are refused; access and refresh tokens are memory-only; a trigger callback URL is reduced to its workflow id and path inside one function; run-step input/output links (signed) are never passed on; the Centre acts only on flows that back a governed endpoint (404 otherwise); resubmission demands an explicit confirmation because it replays the original request.
- **Credential hygiene.** Signed trigger URLs, bearer tokens, passwords, client secrets, `fc_`/`fac_` tokens and the bootstrap token are refused in every free-text field, by the client before sending and by the server before storing. Signed URLs are never stored; endpoint routes are paths only. Authorization headers, bodies and query strings are never logged.
- **Browser.** CSP `default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; form-action 'none'`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. All rendering goes through one encoder. The token is held in `sessionStorage` only and removed on Lock, on a 401, and after `sessionIdleMinutes` of inactivity.
- **Files.** Token, database and backups 0600; the backup directory 0700; `start.sh` sets `umask 077`, so state directories it creates are 0700, and `npm run start:centre` creates its state directory 0700.

## 8. Runtime configuration

| Key | Value | Scope |
|---|---|---|
| systemName | Folio Central Administration Centre | restart-bound |
| version | 2.1.0 | restart-bound |
| bindHost | 127.0.0.1 | restart-bound |
| port | 8844 | restart-bound |
| database | data/folio_admin.db | restart-bound |
| adminTokenFile | config/admin.token | restart-bound |
| environmentId | Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1 | tenant-boundary |
| sharePointConnectionId | 3f1943c5955a4cb8b301e8f22f2b590d | tenant-boundary |
| healthIntervalSeconds | 300 (30–86400) | runtime |
| staleAfterSeconds | 900 (60–604800) | runtime |
| retentionDays | 2555 (2555–36500) | runtime |
| timezone | Africa/Lagos (IANA) | runtime |
| auditHashAlgorithm | sha256 | restart-bound |
| probeTimeoutSeconds | 5 (1–60) | runtime |
| degradedLatencyMs | 1500 (100–60000) | runtime |
| autoAlert | true | runtime |
| sessionIdleMinutes | 15 (1–480) | runtime |
| vaultUrl | http://127.0.0.1:8787 (loopback only) | runtime |
| flowApiBase | https://api.flow.microsoft.com (Microsoft hosts only) | restart-bound |
| loginBase | https://login.microsoftonline.com (Microsoft hosts only) | restart-bound |
| runHistoryIntervalSeconds | 900 (300–86400) | runtime |
| runHistoryDepth | 25 (1–50) | runtime |

Estate at provisioning: **6 platforms, 32 endpoints** — 18 internal and 7 portal from `docs/folio-Master-Flows-and-Endpoints/registers/endpoint-workflow-ids.json`, 7 mailer from `mailer/flows/flows.catalogue.json`. Tenant identity and deployment state come from `docs/folio-Master-Flows-and-Endpoints/registers/flow-identity-crosswalk.json` and the newest `docs/audits/flow-usage-analysis-*.json` (the flow owner's "List My Flows" export): at provisioning 24 endpoints are tied to exactly one tenant flow — including all seven `DGO_MAIL_*` flows, deployed and **Started** as of 2026-09-26 — and 8 have two candidate flows, which the first sync settles by comparing each candidate's live trigger workflow with the register. The tenant id is taken from the environment name (`Default-<tenant id>`).

## 9. Operational behaviour

Inventory and evidence are separate: a *Registered* endpoint is known, not healthy. Only an observation is evidence, and the absence of one is *Unknown*. While the flow owner is connected, each governed flow's newest finished run becomes an observation for every endpoint it backs (Succeeded → Healthy, Failed → Unavailable, TimedOut/Cancelled → Degraded), and a failed newest run raises one *flow-runs* alert that the next successful run resolves. The monitor raises one alert per outage (High if Unavailable, Medium if Degraded), attributed to `health-monitor`, and resolves it with a note when the platform next answers healthy; scheduled observations are not individually audited, but every alert the monitor raises or resolves is. Maintenance and Retired platforms are probed but not alerted on.

## 10. Constraints and boundaries

The Centre does everything a flow owner can do on the flows they own — list, read state, read run history and run steps, turn on or off, resubmit, cancel — and nothing that needs tenant administration: no `/scopes/admin/` API, no admin consent, no app registration, no environment-wide listing, no connector consent on someone else's behalf. What the owner's account cannot see is reported as *not visible to this account*, never guessed. No tenant secret is stored. See [03 §12](03-provisioning-and-configuration.md#12-microsoft-365-and-power-platform-boundary).

## 11. Acceptance

- `python3 scripts/verify.py` prints PASS.
- The server answers on 127.0.0.1:8844 and every `/api/` route refuses a missing or wrong token with 401.
- The summary reports 6 platforms and 32 endpoints.
- `npm run test:admincentre` and `npx playwright test tests/admin-centre.spec.js` pass.
- The audit chain verifies after any sequence of mutations.
