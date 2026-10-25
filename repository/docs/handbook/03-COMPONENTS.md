# 3 · Components

## 3.1 Folio Workspace: how the code is layered

```
index.html                 entry page: boot screen, 15-second start-up watchdog (pauses for sign-in)
.htaccess                  browser caching rules for the deployed site
config/                    configuration as ES modules: routes, roles, service contracts, policies
  config.local.js          generated per deployment: signed addresses + auth switch (never committed)
core/                      the runtime: state, sign-in, data access, domain rules, audit
shared/                    the shell (navigation, header, toasts), dialogs and shared UI runtimes
modules/                   one file per screen (route id = file name)
styles/  assets/           design system CSS, fonts, icons, brand images
```

Rules the code follows (conventions, read from the code; no single check enforces them all):

- A **module** draws one screen and calls **core** services. It does not call `fetch` for business
  data itself; everything goes through `core/data-client.js`. The two exceptions are the Admin
  Suite's request composer and the Endpoint Console's probe, which call a service without a
  sign-in proof on purpose (§3.4).
- **config/** holds data, not behaviour. A rule that changes per role, status or category lives there.
- **core/boot.js** is the composition root: it is the only core file that imports the screens
  (to register their routes). Other core files do not import from **modules/**.

Drawn diagrams of these layers, and of trust zones and the lifecycle, are in
[`docs/architecture/components.html`](../architecture/components.html) and
[`docs/architecture/architecture.html`](../architecture/architecture.html).

## 3.2 Core services

| File | Responsibility |
| --- | --- |
| `core/boot.js` | Start-up: sign-in first (when enforced), register routes, draw the shell, resolve the deep link, then start the data load (`loadRuntimeData`). |
| `core/router.js` | Hash routes (`#/home`, `#/lookup`, …); asks `config/rbac.config.js` whether the role may open a route. |
| `core/state.js` | The single client state object. Persists to `localStorage` (`dgo.r11.viewport.runtime.state`), except `runtime`, which is never persisted. Signed addresses are never persisted. |
| `core/auth.js` | The sign-in gate for every governed call: token cache, `ensureAuthenticated`, `authHeaders`, the verified role. |
| `core/otp-identity.js` | The e-mailed-code provider: request a code, submit it, hold the proof in `localStorage` (`dgo.r11.identity.proof`), shared by every tab, follow a sign-in or sign-out made in another tab, sign out everywhere. |
| `config/auth.config.js` | Sign-in settings: provider `otp`, header `X-DGO-Proof`, renewal 120 s before expiry. Off by default; the deployed `config.local.js` turns it on. |
| `core/endpoint-registry.js` | Resolves a contract key to its address: deployment manifest, then an audited operator override, then the packaged address. |
| `core/data-client.js` | The only path to a service: sign-in check, address, confirmation for writes, a correlation ID, timeout and retry, the proof header, the envelope. |
| `core/server-writes.js`, `core/server-payloads.js` | Every write a screen records on the server (task updates, document state, minutes, approvals and decisions, briefs, meetings, projects, reminders, new records, registry files, audit events), built for the running Dynamic Actions package. |
| `core/fetch-manager.js` | De-duplicates identical requests and applies the read cache. |
| `core/cache-manager.js` | In-memory read cache (FETCH_ALL: 10 minutes). Cleared on reload. |
| `core/data-loader.js` | `loadRuntimeData()`: calls FETCH_ALL (falls back to FETCH_ACTIVITIES), maps the reply into state, records `runtime.lastLoad`. `requestSync()` is behind every refresh button. |
| `core/contracts.js` | Unwraps the standard reply envelope. |
| `core/flow-confirmation.js` | Shows a confirmation before any write or operation call. |
| `core/domain.js`, `core/entity-store.js` | Business rules: status from `Progress`, normalising documents and tasks, directorate filtering for display. |
| `core/audit-log.js` | In-browser audit trail of governed actions (sign-in events, loads, writes). |
| `core/pending-queue.js`, `core/offline-action-queue.js` | Writes that failed for want of a connection, kept for retry. A write the server refused (4xx) is shown, not kept, and an entry pushed out of the 250-entry queue is recorded in the audit trail. |
| `core/deeplink-resolver.js` | Opens the right screen and record from an e-mailed link (`?DGOPID=…`). |
| `core/scan-intake-service.js` | Lodging a scanned document through SCAN_INTAKE. |
| `shared/shell.js` | The frame: navigation by role, header buttons (search, help, ⟳ refresh, notifications, profile), toasts. |
| `shared/sign-in-dialog.js` | The "Sign in to continue" dialog. |

## 3.3 Screens (31 routes, 13 workspaces)

The menu holds 13 workspaces, one per stage of the work (`config/workflow-clarity.config.js`, module rationalisation
Phase 2, 2026-10-20). Each workspace is a set of tabs, and each tab is one route: every route keeps its own address, role
rule and action owner. A role sees a workspace when it may open at least one of its tabs; the menu entry opens the first.

| Group | Workspace | Tabs (route) | Purpose |
| --- | --- | --- | --- |
| START HERE | Command Center | Overview (`home`) · ERP–ECM Charter (`ecm-erp-charter`) | What needs attention now; the ERP–ECM boundary as reference. |
| OPERATIONS | Intake | To triage (`correspondence`) · Counter deposit (`scan-intake`) · Routed (`activities`) · Assignment Desk (`single-assignment`) · Bulk assignment (`bulk-assignment`) | Every incoming record in one list: triage, decide, assign, or route to SIWES, NYSC or archive. |
| | My Work | My tasks (`orchestrator`) · Acknowledge (`acknowledgment`) · Comments (`comments`) | Acknowledge, start, update and complete assigned work (Mine, Team, Overdue, Escalated). |
| | Registry | File custody (`registry`) | File jackets: open, route, receive and close; every move recorded. |
| | Lookup | Lookup & Direct Action (`lookup`) | Find any record by reference, sender or subject, and act on it. |
| CONTROL | SLA & Tracking | Monitoring (`response-tracking`) · SLA risk (`fasttrack`) | Responses and ageing; work at risk of missing its target. |
| | Decisions | Approvals (`approvals`) · DG/CEO (`executive`) · Briefs (`briefs`) | Everything waiting for a decision. |
| | Meetings | Meetings (`meetings`) | Request and record meetings; agreed actions are recorded for their owners. |
| | Projects | Projects (`projects`) | Projects and the measures they are tracked against. |
| | Insight | Statistics (`statistics`) · Reports (`reports`) | Trends, and the formal M1–M10 reports from one report engine. |
| CLOSURE | Outbound | Send by email (`correspondence-email`) · Record a dispatch (`dispatch`) · Close & archive (`archive`) | Outward correspondence, dispatch records and closure with evidence. |
| SYSTEM | Admin Suite | Suite (`admin-suite`) · Administration (`settings`) · Health (`diagnostics`) · Runtime (`operator-hud`) · Endpoints (`endpoint-console`) · Users (`user-admin`) | Monitoring, control and management. |
| | Assistant | Assistant (`assistant`) | Guidance on the operating model. |

What each screen records on the server, and how, is in `core/server-writes.js`: every write is built in the shape the
running Dynamic Actions package accepts, and `tests/server-writes.test.mjs` runs each through the flow simulator.

Each route's code is `modules/<route>.js`. Who may open which route is in the
[Data model](04-DATA-MODEL.md#47-roles-personas-and-statuses).

## 3.4 The two deliberate exceptions to "everything through the data client"

| Screen | What it sends | Why |
| --- | --- | --- |
| Endpoint Console probe (`modules/endpoint-console.js`) | `{"action":"<contract action>"}` to every read service, **with no sign-in proof** | It tests that each address is reachable and answers JSON. With sign-in enforced, the expected answer is **401**. A 401 there means the service is alive and protecting itself, not that it is broken. |
| Admin Suite request composer (`modules/admin-suite.js`) | A body an administrator writes, checked against the trigger schema | For administrators testing a service by hand. Also carries no proof. |

## 3.5 NITDA Document Portal (`document-portal/`)

A public progressive web app (service worker, manifest, offline shell), deployed under `/CG/`.

| Page | Purpose |
| --- | --- |
| `index.html` | Landing page |
| `submit.html` | Submit correspondence with attachments (e-mail verification first) |
| `track.html` | Track a submission by reference and e-mail |
| `support.html` | Raise a support case |
| `404.html` | Not found |

Its seven services: `SUBMISSION`, `UPLOAD`, `STATUS`, `SUPPORT`, `VERIFY`, `VERIFY_CONFIRM` and
`WRITEBACK`. The first six are public and rate-limited per IP address (20, 60, 30, 10, 5 and 5 per
hour respectively). `WRITEBACK` is how Folio sets the status a submitter sees (20 per hour). Its
records live in the `Portal …` lists ([Data model §4.3](04-DATA-MODEL.md#43-portal-lists)).

## 3.6 DGO Correspondence Mailer (`mailer/`)

A single-page app that sends one personalised official letter per addressee, each with its own
signed attachment, and logs every send. Deployed at `/mailer.html`. Its seven services:
`MAIL_SEND`, `MAIL_LOG`, `MAIL_DIRECTORY`, `MAIL_TEMPLATES`, `MAIL_PROVISION`, `MAIL_AUTH` and
`MAIL_DATA`. **Outbound letters are sent only through the Mailer**: Folio's Dispatch screen records
that a dispatch happened; it does not send mail itself (owner decision on ITEM-25, 2026-10-08).
See [`mailer/README.md`](../../mailer/README.md).

## 3.7 Platform-team tools

| Tool | What it is for | Start |
| --- | --- | --- |
| Folio Estate Console (`tools/admin-console.html`) | One-file console over every service address and the flow catalogue | `npm run start:console` |
| Folio Flow Workbench (`tools/flow-workbench/`) | Inspect, compose, validate and send requests to catalogued flows | `npm run start:workbench` (Python 3.7+, binds 127.0.0.1) |
| Folio Vault (`tools/flow-capsule/`) | SQLite registry holding each signed URL behind an alias it never returns | `npm run start:capsule` (Python 3.11+) |
| Folio Central Administration Centre (`tools/admin-centre/`) | Monitors every platform; alerts, incidents, changes, a hash-chained audit trail | `npm run start:centre` (Python 3.9+, loopback only); see [`docs/admin-centre/`](../admin-centre/README.md) |
| Platform Hub | The front door listing every platform and whether it is up | `node scripts/run-platform.mjs hub` |

## 3.8 Power Automate flows

The Workspace's 15 delivered addresses resolve to 13 flows. The table is taken from the build ledger
(`registers/config-build-ledger.json`), which is written from a live read of the tenant.

| Contract key | Flow | Reads or writes |
| --- | --- | --- |
| `FETCH_ALL` | IP_FETCH_ALL_BOOTSTRAP | Reads the Workspace's data, scoped by role |
| `FETCH_ACTIVITIES`, `GET_DOCS` | IP_Get_Docs_Endpoint | Reads documents (FETCH_ALL's fallback) |
| `REFERENCE_DATA` | IP_Reference_Data_Endpoint | Reads categories, departments, lookups |
| `FETCH_EMAIL_ATTACHMENTS` | IP_Retrieve_Email_Attachment_Endpoint | Reads attachments |
| `SINGLE_ASSIGNMENT` | Single_Task_Assignment | Creates a task for one assignee |
| `BULK_ASSIGNMENT` | BULK_OPS_DATA_RETRIEVAL_HTTP | Creates tasks in bulk |
| `DYNAMIC_ACTIONS`, `SUBSIDIARY_ACTIONS` | IP_Dynamic_Global_Actions_Endpoint | Task and record operations (§3.9) |
| `USER_ADMIN` | IP_User_Admin_Endpoint | Adds and changes people in the directory |
| `EMAIL` | IP_SEND_EMAIL | Sends an e-mail from the Workspace |
| `EMAIL_RELATED_TASK` | IP_Create__Task__for_received_Email_Endpoint | Creates a task from an e-mail |
| `OTP_GENERATE` | IP_OTP_GENERATE | Mails a sign-in code |
| `OTP_VERIFY` | IP_OTP_VERIFY | Exchanges a code for a proof |
| `SCAN_INTAKE` | IP_SCAN_INTAKE | Lodges a scanned document from the registry desk |

Contract keys the client knows but the go-live build leaves empty: `AI_CHAT`, `AI_DOC_ANALYSIS` and
`AI_EMAIL_ANALYSIS` (ITEM-88), and `DISPATCH_OUTBOUND` and `ARCHIVE_REFERENCE`, which are served as
operations of DYNAMIC_ACTIONS instead.

Scheduled and event flows with no address: `Folio_Incoming_Correspondence_Scan_Processing_Flow`
(watches `/E-DOCUMENT STATION`, every minute), `AUTO_SCHEDULED_SWEEP`, the Portal daily sweep, and the
GOV provisioning flows.

**Every flow record (definitions, packages, captures, evidence) is in
[`docs/folio-Master-Flows-and-Endpoints/`](../folio-Master-Flows-and-Endpoints/README.md).** A
per-flow description, including FETCH_ALL action by action, is in its `provisioning/flows/` folder.

## 3.9 DYNAMIC_ACTIONS operations

The operations the released package recognises (`createArray(…)` in its operation switch):
`update`, `update-task`, `transitionstatus`, `logauditevent`, `register`, `upsert-record`,
`open-file`, `move-file`, `link`, `void`, `reparent` and `merge`.

Mapped onto those: **dispatch** and **dispatch-outbound** set the document's Status to *Treated*;
**archive-reference** sets it to *Treated* and its IdState to *ARCHIVED* (ITEM-25, proven live
2026-10-08).

Still answering **501** (ITEM-25, decision E1 in the [walkthrough](01-GO-LIVE-WALKTHROUGH.md)):
`activity-archive`, `activity-siwes` and `activity-nysc`.
