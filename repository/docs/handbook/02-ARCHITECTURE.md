# 2 · Architecture

## 2.1 The shape of the system

Folio is a set of **static browser applications** that call **Power Automate flows** directly. The
flows read and write **SharePoint lists**, and send mail through **Exchange Online**. There is no
application server, no database server and no API gateway of Folio's own.

```
                ┌───────────────────────────────────────────────────────────┐
  Staff ──────▶ │ Folio Workspace  (static site: HTML, ES modules, CSS)      │
                │ folio-platform.page.gd                                        │
                └──────────────┬────────────────────────────────────────────┘
  Public ─────▶ Document Portal             Mailer (mailer.html)
                folio-portal.page.gd        folio-platform.page.gd
                               │
                 HTTPS POST to a signed trigger URL (one per service)
                               ▼
                ┌───────────────────────────────────────────────────────────┐
                │ Power Automate  (environment Default-ca6a4b3f…)            │
                │  sign-in check → directory lookup → role decision →         │
                │  read/write lists → standard reply envelope → telemetry     │
                └──────┬───────────────────────┬─────────────────┬──────────┘
                       ▼                       ▼                 ▼
               SharePoint Online        Exchange Online     OneDrive (scans)
               (lists, libraries)       (mail send)         /E-DOCUMENT STATION
```

Three decisions explain most of the design:

1. **The browser is only a client.** Every rule that matters (who the caller is, what their role
   allows, what data they may see) is decided **inside the flow**. Route guards in the browser
   only shape what people see; they do not protect data.
2. **A trigger URL is a credential.** Possession of a signed URL lets anyone call that flow.
   The flow therefore never trusts the request body for identity; it takes the caller from the
   sign-in proof (§2.3).
3. **Zero build, zero runtime dependencies.** The Workspace runs as written: native ES modules,
   no bundler, no framework. What the repository holds is what the browser runs, apart from one
   generated file, `config/config.local.js`, which carries the signed addresses (§2.5).

## 2.2 The surfaces

| Surface | Users | Hosted at | Source in this repository |
| --- | --- | --- | --- |
| **Folio Workspace** | Staff: registry, officers, directors, executives, administrators | `https://folio-platform.page.gd/` (primary host, owner decision 2026-10-08) | repository root: `index.html`, `config/`, `core/`, `modules/`, `shared/`, `styles/`, `assets/` |
| **NITDA Document Portal** | The public: submit correspondence, track it, request support | `https://folio-portal.page.gd/` (owner, 2026-10-19) | `document-portal/` |
| **DGO Correspondence Mailer** | DGO staff sending official letters | `https://folio-platform.page.gd/mailer.html`, one file beside the Workspace (owner, 2026-10-19) | `mailer/` |
| Folio Estate Console | Platform team | opened from a file | `tools/admin-console.html` |
| Folio Flow Workbench | Platform team | local only (127.0.0.1) | `tools/flow-workbench/` |
| Folio Vault | Platform team | local, optional | `tools/flow-capsule/` |
| Folio Central Administration Centre | Platform team | local only | `tools/admin-centre/` |

Each runs on its own port during development: `npm run platforms` lists them (see the
[Developer guide](07-DEVELOPER-GUIDE.md)).

## 2.3 Identity: sign-in by e-mailed code

There is no external identity provider in the request path. Identity is a **proof** issued after a
one-time code:

```
 Workspace                      OTP_GENERATE                 OTP_VERIFY
 ─────────                      ────────────                 ──────────
 e-mail address  ─────────────▶ makes a 6-digit code,
                                stores it in OTP_Transactions,
                                mails it to that address
 code            ──────────────────────────────────────────▶ checks the code (refused after
                                                             5 attempts); looks the address
                                                             up in DGO_UserDirectory with
                                                             Status = active;
                                                             if known, writes a proof row to
                                                             DGO_SessionProofs
                                                             (Email, Purpose=internal-session,
                                                              ExpiresAtUtc = now + 4 h,
                                                              Consumed = false)
 ◀──────────────────────────────────── token, expiresAt, claims {email, name, role, roles}
 stores the proof in localStorage
 ('dgo.r11.identity.proof'), sends it as header  X-DGO-Proof  on every later call
```

Every other service does the same check first (as built in FETCH_ALL, for example):

1. Read `IDENTITY_PROOF_REQUIRED` from `Flow Configuration` (it is `true` in production).
2. Take the token from `X-DGO-Proof` (or `Authorization: Bearer …`).
3. Look it up in `DGO_SessionProofs`: same token, `Consumed eq 0`, `Purpose eq 'internal-session'`,
   and `ExpiresAtUtc` later than now.
4. The caller is the proof row's `Email`, never anything in the request body.
5. Look the caller up in `DGO_UserDirectory` (`Status eq 'active'`) to get their **Role** and
   **Persona**. Not found or not active: **401**.

Facts that follow from this (read from the live flows on 2026-10-10):

- OTP_GENERATE mails a code only to an **active** `DGO_UserDirectory` member (2026-10-10). Its reply
  is the same for any address, so the sign-in box does not reveal who is a user. OTP_VERIFY checks the
  directory again before it issues a proof.

- A proof lasts **4 hours**. After that, the next call answers 401 and the Workspace asks for a new code.
- The proof lives in `localStorage` (owner, 2026-10-20), so every tab of the Workspace in the same browser shares one
  sign-in, and it survives a reload and a browser restart until its 4 hours run out. **Sign out** (the account menu)
  ends it in every tab at once; a sign-in or sign-out in one tab reaches the others through the browser's `storage` event.
- Revoking access is immediate: set the person's `Status` to anything but `active`, and their next
  call answers 401.
- The authentication contract, with its numbered obligations, is in
  [`docs/architecture/AUTHENTICATION_CONTRACT.md`](../architecture/AUTHENTICATION_CONTRACT.md).

## 2.4 Authorisation: roles, personas and data scope

Three layers, decided in this order:

| Layer | Decided by | Effect |
| --- | --- | --- |
| **Active directory entry** | the flow, from `DGO_UserDirectory.Status` | Not active: 401 for everything. |
| **Data scope** | the flow (FETCH_ALL `Compose_FetchAll_Scope`) | **all**: systemAdmin, userAdmin, executive, operator, or persona admin, executive or registry. **directorate**: director (today their own items only, ITEM-91). **own**: everyone else, who receives only their own tasks, those tasks' documents and comments, and only their own e-mail address in the directory. |
| **Screens** | the browser (`config/rbac.config.js` `RoleRouteAccess`) | Which menu entries a role sees. This is presentation; the flow has already decided the data. |

The six roles, their personas and permissions are listed in the
[Data model](04-DATA-MODEL.md#47-roles-personas-and-statuses).

## 2.5 Configuration and delivery

| What | Where | Who changes it |
| --- | --- | --- |
| Signed service addresses | `config/config.local.js` in the deployed site (generated, never committed) | `npm run config:rebuild`, which reads them live from the tenant |
| Digest of what was last delivered | `docs/folio-Master-Flows-and-Endpoints/registers/config-build-ledger.json` (digests only, no URL) | written by `config:rebuild`; compared by `config:drift` |
| Sign-in enforcement | `window.DGO_CONFIG.auth = { enabled: true, roleSource: "verified" }` in `config.local.js` | the build |
| Browser caching | `.htaccess` at the site root: `no-cache` for HTML, JS, CSS and JSON | the build (`scripts/package.mjs` includes it) |
| Server-side switches | SharePoint `Flow Configuration` list (`Title` = key, `ConfigValue` = value), for example `IDENTITY_PROOF_REQUIRED`, `ALLOWED_ORIGIN…`, `DATASET_…_SITE_URL` and `…_LIST_ID`, `ENVIRONMENT_CODE` | administrators with list access |
| Flow logic | released packages in `docs/folio-Master-Flows-and-Endpoints/packages/`, applied with `npm run flows:update` | platform team, through a release (`npm run idrelease`) |

A delivered Workspace build is one zip, uploaded to the site root. Because the addresses are
inside it, **the zip is private**.

## 2.6 The standard reply envelope

Every Folio service answers in the same shape:

```json
{
  "ok": true,
  "status":  { "http": 200, "code": "OK", "message": "Success" },
  "request": { "requestId": "…", "trackingId": "", "action": "fetchAll", "operation": "read", "source": "…" },
  "timing":  { "receivedAtUtc": "…", "completedAtUtc": "…", "durationMs": 0 },
  "data":    { },
  "errors":  [ ],
  "meta":    { "ts": "…", "runId": "…", "flowName": "…", "contractVersion": "2026-08-21.1" }
}
```

`core/contracts.js` unwraps it on the client. A refusal keeps the shape, with `ok: false`, an HTTP
status of 401, 403, 404, 409, 429 or 500, and the reason in `errors`.

## 2.7 Observability

| Signal | Where |
| --- | --- |
| Every run of every flow | Power Automate run history (kept 28 days) |
| A record of each run, with secrets masked | SharePoint `Portal Flow Telemetry`, written by each flow's `Scope_Flow_Data_Capture` |
| Mail sent by a flow | `Portal Outbox Receipts` |
| Governed changes | `DGO_AuditLog`, plus audit columns on the records themselves |
| In the browser | **System Health** (`#/diagnostics`): runtime checks, collections, the endpoint table and probes |

## 2.8 Limits that shape the design

| Limit | Value | Consequence |
| --- | --- | --- |
| Actions in one flow | 500 | `USER_ADMIN` became its own flow when DYNAMIC_ACTIONS would have reached 524. `flows:update` refuses a package over the limit before writing. |
| Characters in one expression | 8,192 | `flows:update` refuses a package with a longer expression. |
| Indexed columns per list | 20 | Global Tracking Queue is full, which is why directors' directorate view waits on ITEM-91. |
| Items read per call | FETCH_ALL reads the newest 500 documents and 500 tasks | Older records are reached through Lookup. |
| Proof lifetime | 4 hours | People sign in again after 4 hours. |
| FETCH_ALL reply | about 6.4 MB, 15 to 25 seconds, for an "all" caller | The first screen fills about 20 seconds after sign-in. |

## 2.9 Related records

- Estate description (generated): [`docs/PLATFORM.md`](../PLATFORM.md)
- Target architecture: [`docs/architecture/TARGET_ARCHITECTURE.md`](../architecture/TARGET_ARCHITECTURE.md)
- Access specification: [`docs/architecture/PLATFORM_ACCESS_SPEC.md`](../architecture/PLATFORM_ACCESS_SPEC.md)
- Every flow and service record: [`docs/folio-Master-Flows-and-Endpoints/`](../folio-Master-Flows-and-Endpoints/README.md)
