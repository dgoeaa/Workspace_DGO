# Folio Central Administration Centre — full-scope assessment

**Assessed:** the *Folio Admin Centre Complete Documentation Suite* 1.0 (29 September 2026), kept unchanged in [`source-1.0/`](../governance/RETIRED_RECORDS.md) and verified against its own `MANIFEST.json` (all five SHA-256 values match).
**Against:** the brief that the Centre be the *full-scope administration, management and monitoring* plane for every platform in the Folio portfolio — back end, front end, UI, user journey, branding, feedback, flow execution and interactivity — and part of the baseline branch.
**Outcome:** the Centre is now built in this repository at [`tools/admin-centre/`](../../tools/admin-centre/) as version **2.0.0**, every gap below is closed in code or stated as a boundary, and the four guides are reissued as [`01`](01-design.md)–[`04`](04-user-guides.md).

## 1. What the supplied suite was

Four Word documents describing a *build that was not supplied*: `server.py`, `static/`, `scripts/start.sh`, `scripts/verify.py`, the database and the token are named throughout, and none of them was in the archive or in this repository. The suite was therefore a specification, and it was assessed as one: first for internal consistency, then for coverage of the brief.

## 2. Defects in the suite itself

| # | Finding | Evidence | Resolution in 2.0 |
|---|---|---|---|
| D1 | The build the guides operate does not exist. | Every procedure starts from `Folio_Central_Admin_Centre_Operational_Build.zip`; the suite contains only `.docx`. | Built: `tools/admin-centre/`. |
| D2 | Configuration count contradicts itself. | Design §11: "11 configuration records". Provisioning §7: "13 settings persisted". The settings table lists 13 keys. | Every key in `config/settings.json` is persisted (18 in 2.0: the 13 documented plus 5 operational); `verify.py` checks "every settings key is persisted" rather than a number. |
| D3 | Maker–checker cannot be enforced with one token. | User Guide §6 requires "different accountable identities"; Design §7 has one bearer token and a free-text `actor`. | Named operator tokens with roles; an operator's actor is its own name (the body cannot impersonate); only the named checker may decide; the maker never may. |
| D4 | Health can never be populated. | Provisioning §7: health is "0 until an observation is ingested"; the API has no ingestion route and nothing probes. | A background monitor probes every platform; `POST /api/health` ingests external evidence; Vault verification records endpoint health. |
| D5 | Records cannot progress. | The API creates alerts, incidents and changes but has no route to acknowledge, resolve, approve, implement or close any of them. | Lifecycles with enforced transitions, required notes, reassignment and a per-record timeline. |
| D6 | Audit verification is CLI-only. | Auditor Guide §7: run `scripts/verify.py`. | `GET /api/audit/verify` and a *Verify chain* button; `verify.py` still recomputes independently. |
| D7 | "Registered" is the only endpoint state and cannot change. | Platform Admin Guide §8. | Endpoint states Registered / Commissioned / Suspended / Retired; platform states Registered / Active / Maintenance / Retired; both audited. |
| D8 | The estate is a frozen copy. | 32 records "persisted by the build process", with no link to the registers they came from. | Provisioned from `docs/folio-Master-Flows-and-Endpoints/registers/endpoint-workflow-ids.json` and `mailer/flows/flows.catalogue.json` at first start; *Reconcile* re-reads them and retires (never deletes) keys that disappear. |
| D9 | The guides tell operators to back up with `cp` while the server runs. | Provisioning §10 copies a live WAL database. | `POST /api/backups` takes a consistent online SQLite backup (mode 0600) and lists them with SHA-256; restore stays offline by design. |
| D10 | Token rotation requires downtime. | Provisioning §11 stops the server. | `POST /api/access/rotate-bootstrap` rotates live; the old token is refused at once. The offline procedure still works. |
| D11 | Credentials are prohibited in records but nothing stops them. | User Guide §13. | Server-side and client-side guards refuse signed URLs, bearer tokens, passwords, client secrets, Vault and operator tokens and the bootstrap token itself — in every free-text field, before the audit chain sees them. |
| D12 | Failures of mutations are said to be audited, but the algorithm commits the domain record before auditing. | Developer Guide §7 and §8. | The domain record and its audit event commit in one transaction; a rule broken inside a mutation is audited as `Failed`, a role refusal as `Denied`. |
| D13 | Loopback binding is the only network control. | Design §7. | Also: Host-header allow-list (DNS rebinding), same-origin check on writes, CSP `script-src 'self'`, `frame-ancestors 'none'`, 64 KB body limit, failed-token rate limit (20 per 5 min per client), constant-time token comparison, refusal to bind a non-loopback address unless explicitly overridden. |

## 3. Coverage against the brief

| Aspect | 1.0 (as specified) | 2.0 (as built) |
|---|---|---|
| **Portfolio coverage** | Six platforms listed. | Six platforms governed, held to `scripts/platforms.config.mjs` by `tests/admin-centre.test.mjs` (ports, entry points, names); the Centre itself is the seventh runnable platform (`npm run start:centre`). |
| **Monitoring** | A health table nobody writes. | Scheduled and on-demand probes; Healthy / Degraded / Unavailable / Stale / Unknown; platform identity check (a port held by the wrong platform reads Degraded); 24-hour uptime, p50/p95 latency and a trend per asset; monitor alerts raised on failure and resolved on recovery, suppressed in Maintenance. |
| **Flow execution** | Out of scope. | As the flow owner: live state, run history, run steps, turn on/off, resubmit, cancel; failed runs become health and alerts (§5). Vault verification of an alias — the flow's own non-destructive `verify` operation — with the signed URL never leaving Vault. Ingestion of flow-run evidence by API. |
| **Management** | Create-only records. | Full lifecycles, reassignment, notes, escalation, maker–checker, versioned configuration with history, platform and endpoint state, estate reconciliation, backups, retention. |
| **Administration** | One shared token. | Seven roles, named operator tokens (issue, rotate, disable, enable), live bootstrap rotation, per-role permission map shown in the UI. |
| **Evidence** | Hash chain and a CLI verifier. | The same chain algorithm, verifiable in the UI and by API, record timelines that interleave notes and audit events, JSON evidence bundle and per-table CSV (formula-injection safe), provisioning evidence file. |
| **Front end** | "Token-gated navigation, counts and tabular views." | A full client: overview with needs-attention and live daily checklist, portfolio cards, health board and log, record registers with filters/sort/search, record sheets, estate with data-quality findings, configuration editor, audit trail with paging, Vault, Access, Operations, Guide; global search; deep links for every record. |
| **User journey** | Paste token → read tables. | Unlock (with accountable name) → overview "needs attention" → one click into the record or platform → act in a dialog with a reason → toast and timeline confirm it → lock or idle-lock. Each role's journey is written out in [04](04-user-guides.md). |
| **Branding** | Unspecified. | NITDA master brand with the DGO Digital Ops lockup and the `dgo-ops` platform variant, taken from `styles/dgo-design-system/` as a synced package (`npm run brand:sync`); `npm run test:brand` enforces tokens-only colour. Light and dark themes (remembered per browser) and Windows forced-colours mode follow the kit. |
| **Feedback** | Error table in the guide. | Inline field errors, credential warnings before submit, server messages with a correlation reference, toasts for every outcome, busy states on buttons, skeletons while loading, empty states that say what an empty register does *not* mean, connection-lost banner, idle-lock warning. |
| **Interactivity** | Static tables. | Sortable columns (mouse and keyboard), filter chips with counts, search-as-you-type, record sheets, keyboard shortcuts (`/`, `g` + letter, `r`, `?`), 30-second live refresh that pauses while you type or a dialog is open. |
| **Accessibility** | "Keyboard-accessible buttons." | Skip link, landmarks, labelled controls, `aria-invalid` and described-by errors, `aria-live` status, native modal dialogs with focus handling, `aria-sort`, focusable rows, meter semantics, reduced-motion from the kit, no horizontal scroll at 320 px. |
| **Baseline** | — | Wired into `npm test` (`test:admincentre` in `test:node`, `tests/admin-centre.spec.js` in the Playwright suite), the launcher, the devcontainer, the README and `.gitignore`. |

## 4. Tests that hold it

| Suite | What it proves |
|---|---|
| `tools/admin-centre/tests/test_flow_owner.py` (14 cases) | Mailer deployment and tenant identity in the estate; device-code sign-in with fall-through to the second public app; sync resolves ambiguous identities and reads mailer trigger workflows; drift detection; failed run → Unavailable + alert → recovery; turn on/off, steps, resubmit (with confirmation), cancel; roles; nothing outside the governed estate; no token, refresh token or signature in the database; no admin path ever called; flow service must be a Microsoft host. |
| `tools/admin-centre/tests/test_admin_centre.py` (39 cases) | Provisioning counts and file modes; restart persistence; 1.0 → 2.0 migration; 401 on every route; Host and Origin refusal; security headers; path traversal; rate limiting; keep-alive safety; validation messages; credential refusal; every lifecycle; maker–checker; roles and impersonation; operator and bootstrap rotation; configuration bounds; Unknown ≠ Healthy; probe → alert → recovery; wrong-platform detection; Maintenance suppression; staleness; ingestion; retention; Vault verification; reconciliation; tamper detection; backup, export and CSV injection; checklist; search. |
| `tests/admin-centre.test.mjs` | Parity with the launcher registry; documented settings; no inline script/style/handlers; one encoder; session-only token; client and server credential guards agree on every sample; state is git-ignored and untracked; wiring; every API route documented. |
| `tests/admin-centre.spec.js` | The administrator's journey in Chromium, end to end, with zero console errors; the platform administrator's flow-owner journey (code, connection, sync, failed-run badge, steps, confirmed resubmit); no sideways scroll on a 360 px phone. |
| `tools/admin-centre/scripts/verify.py` | The installation: files, settings, permissions, integrity, counts against the registers, the chain, and no credential in any record. |

## 5. Flow ownership and the tenant (2.1)

The first issue of this assessment placed tenant flow-run history outside the Centre and said the seven mailer flows had no workflow IDs "because the flows are not yet deployed". Both were wrong, and are corrected here.

- **The mailer flows are deployed.** The flow owner's "List My Flows" export of 2026-09-26 (`docs/folio-Master-Flows-and-Endpoints/audits/flow-usage-analysis-2026-09-26.json`) lists all seven — `DGO_MAIL_AUTH` `7d90f8f0-…`, `DGO_MAIL_DATA` `d44a67e3-…`, `DGO_MAIL_DIRECTORY` `0cb4c4a8-…`, `DGO_MAIL_LOG` `98ce8b40-…`, `DGO_MAIL_PROVISION` `c5a0f936-…`, `DGO_MAIL_SEND` `0fb53e16-…`, `DGO_MAIL_TEMPLATES` `176f7af5-…` — all **Started**, with *Owner* relation. The Centre read only `mailer/flows/flows.catalogue.json`, which records the build, not the deployment. It now reads the export and the crosswalk as well, carries each endpoint's tenant flow id and deployment state, and reads the mailer's trigger workflow ids live.
- **Run history needs a flow owner, not a tenant administrator.** The repository already signs in as the flow owner (device code, Microsoft's public apps, user-scoped paths — `scripts/lib/device-sign-in.mjs`, the mailer setup). The Centre now does the same: *Flows* connects as the owner, lists the flows, settles and verifies identities from each flow's live trigger, reads run history into health and alerts, drills into run steps, and turns flows on or off, resubmits and cancels runs — all audited, none of it on an admin path. See [03 §12](03-provisioning-and-configuration.md#12-microsoft-365-and-power-platform-boundary).
- **Identity is now evidence, not assumption.** 24 endpoints are tied to one tenant flow from the registers; 8 have two candidates and are settled live; every tie is marked verified or drift after the first sync.

## 6. What remains outside, and why

- **Anything that needs tenant administration** is not used: no `/scopes/admin/` API, no admin consent, no app registration, no environment-wide listing. Flows the signed-in owner cannot see are reported as *not visible to this account*.
- **Four candidate flow ids are absent from the owner's 2026-09-26 listing** — the only candidates for `BULK_ASSIGNMENT` (`5aab9e61-…`) and `EMAIL_RELATED_TASK` (`2fbb5485-…`), and one of two for `FETCH_ALL` and for `VERIFY`. A sync shows their live position; if the owner cannot see them they are owned by another account, which must sign in to act on them.
- **Hosting beyond loopback.** Refused by default; requires an approved reverse-proxy design and `FOLIO_ADMIN_ALLOW_NONLOOPBACK=1` plus `FOLIO_ADMIN_ALLOWED_HOSTS`.
