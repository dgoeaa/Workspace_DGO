# Platform Access & Navigation — Plan, Requirements and Specification

**Status:** Phases 1–6 implemented (see §8); phase 7 waits on auth activation · **Date:** 2026-09-30 · **Scope:** how people find, open and move between every platform in this repository.

## 1. Problem

Seven platforms could be started in this tree (`npm run platforms`). Each has its own port, audience and purpose, and the only index of them is a README table. A person must already know a platform exists, which port it is on, and whether they are meant to use it. As platforms multiply this gets worse. The access model is also unclear: public, staff, admin and engineering tools sit side by side with no stated boundary.

## 2. Goals

1. **One front door.** A single launcher (the Hub) lists every platform with its purpose, audience, live status and link.
2. **One source of truth.** `scripts/platforms.config.mjs` stays the only place a platform is declared. The Hub, the runtime's Platforms menu, the README table and the devcontainer all derive from it, and tests enforce that.
3. **Audience boundaries.** Every platform declares who it is for. Public, staff, admin and engineering surfaces never leak into each other.
4. **In-app switching.** Staff move between tools from inside the DGO Runtime without knowing any ports.
5. **Growth rule.** Adding a platform is a config change with an owner and a justification, not a new silo.

**Non-goals:** single sign-on across platforms (it follows auth activation, G-04), rewriting any existing platform, and production hosting infrastructure (§9 specifies the shape only).

## 3. Platform classification

| id | Platform | Audience | Category | Exposure | Primary / fallback |
|---|---|---|---|---|---|
| `portal` | NITDA Document Portal | `public` | Service | Public internet | Primary |
| `runtime` | Folio Workspace (DGO Runtime) | `staff` | Operations (home for all internal users) | Internal | Primary |
| `mailer` | DGO Correspondence Mailer | `staff` | Correspondence | Internal | Primary |
| `hub` | Platform Hub | `staff` | Navigation | Localhost | Primary |
| `console` | Folio Estate Console | `admin` | Administration | Internal | Fallback for the Admin Suite |
| `centre` | Folio Central Administration Centre | `admin` | Administration | Localhost | Primary |
| `workbench` | Folio Flow Workbench | `engineering` | Commissioning | Localhost | Primary |
| `capsule` | Folio Vault (Flow Capsule) | `engineering` | Commissioning (API) | Localhost | Primary |

The values of record are in `scripts/platforms.config.mjs`; this table is a snapshot.

Audience → role mapping (from `config/rbac.config.js`):

| Audience | Roles |
|---|---|
| `public` | anyone, no role |
| `staff` | `viewer`, `operator`, `director`, `executive`, `userAdmin`, `systemAdmin` |
| `admin` | `userAdmin`, `systemAdmin` |
| `engineering` | `systemAdmin` |

## 4. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | Every entry in `Platforms` MUST declare `audience`, `category`, `purpose` (≤140 chars, plain language: "use this to…"), `owner`, `exposure` (`public`\|`internal`\|`local`), `probe` (health path) and optional `fallbackFor` and `prodUrl`. |
| FR-2 | `npm run hub` MUST serve the Platform Hub on port **8079**. `npm run start:all` MUST start the Hub too. |
| FR-3 | The Hub MUST render one card per platform, grouped by audience in the order staff → admin → engineering → public. Each card shows name, purpose, audience badge, port/URL, "Open" link and live status. |
| FR-4 | Live status MUST be *Up* / *Down* / *Unknown*, probed every 15 s via the Hub server (`GET /api/status`), never from the browser directly (this avoids CORS against the Python services). A down platform MUST show its start command, e.g. `npm run start:workbench`. |
| FR-5 | The Hub MUST read the platform list at request time from `platforms.config.mjs` (`GET /api/platforms`). It MUST NOT contain a hard-coded platform list. |
| FR-6 | The Hub MUST offer a text filter and an audience filter, and remember the last filter in `localStorage` (try/catch guarded). |
| FR-7 | The DGO Runtime shell MUST gain a **Platforms** switcher (header menu) listing the platforms the current role may see, built from a generated browser module `config/platforms.data.js`. The current platform is marked; `engineering` and `local` entries show "localhost only". |
| FR-8 | Visibility in the Hub and switcher MUST be filtered by the audience → role table in §3. While `auth.enabled` is `false`, the UI MUST label the filter "advisory" (same posture as current RBAC). |
| FR-9 | The Document Portal MUST NOT link to any internal platform, and the Hub MUST NOT be reachable from the portal's origin. |
| FR-10 | The Admin Console card MUST state that it is the fallback for the Admin Suite, and link to the Admin Suite route first. |
| FR-11 | The README platform table MUST be generated (`npm run platforms -- --markdown`) and checked, not hand-written. |
| FR-12 | Each platform page SHOULD carry a small "← Platform Hub" link where it is safe to (runtime, console, workbench). Not for the portal or capsule. |

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Zero-build, no new npm dependencies. Hub server uses `node:http` only (Node 22+). |
| NFR-2 | The Hub binds `127.0.0.1` by default, and `--host` is honoured as in `run-platform.mjs`. |
| NFR-3 | The Hub server never proxies platform traffic. It only probes health paths with a 2 s timeout. |
| NFR-4 | Accessibility: WCAG 2.1 AA; cards are keyboard-reachable; status is conveyed by text as well as colour. |
| NFR-5 | Uses the Obsidian design tokens in `styles/`; light and dark themes. |
| NFR-6 | Works at 360 px width with no horizontal scroll. |
| NFR-7 | No secret, signed URL or capsule token is ever displayed. `scripts/check-secrets` scope includes `tools/hub/`. |

## 6. Technical specification

### 6.1 Config schema additions (`scripts/platforms.config.mjs`)

```js
Object.freeze({
  id: 'workbench',
  // …existing fields…
  audience: 'engineering',          // 'public' | 'staff' | 'admin' | 'engineering'
  category: 'Commissioning',
  purpose: 'Use this to send test requests to the Power Automate flows and read their replies.',
  owner: 'DGO Platform Engineering',
  exposure: 'local',                // 'public' | 'internal' | 'local'
  probe: '/',                       // path returning 2xx when healthy
  fallbackFor: null,                // e.g. console → 'runtime#/admin-suite'
  prodUrl: null,                    // filled at deployment (§9)
})
```

New exports: `Audiences` (ordered list with role mapping), `visibleTo(role)`, `toBrowserData()`.

### 6.2 Hub (`tools/hub/`)

```
tools/hub/
  index.html        # static shell, fetches /api/platforms and /api/status
  hub.js            # rendering, filters, 15 s polling
  hub.css           # uses design tokens
scripts/hub-server.mjs
```

The Hub is also added to `Platforms` as `id: 'hub', port: 8079, kind: 'node', command: ['node', ['scripts/hub-server.mjs']]`.

API:

| Route | Response |
|---|---|
| `GET /` | `tools/hub/index.html` (plus static assets under `/tools/hub/`, `/styles/`) |
| `GET /api/platforms` | `[{id,name,purpose,audience,category,exposure,url,startCommand,fallbackFor}]`, with no `env`, `command` or `serveFrom` |
| `GET /api/status` | `{ "<id>": { "state": "up"|"down"|"unknown", "ms": 42, "checkedAt": "ISO" } }` |

Probe: `GET http://<host>:<port><probe>`, 2 s timeout. A 2xx or 3xx response is `up`, a connection refusal is `down`, and anything else is `unknown`. Results are cached for 10 s.

### 6.3 Runtime switcher

- `scripts/build-platforms-data.mjs` generates `config/platforms.data.js` (`export const PlatformLinks = [...]`) and supports `--check`.
- `shared/shell.js` adds an **Other platforms** section to the header Account menu (the persona button), so it's available at every width, with items from `PlatformLinks` filtered by `platformsVisibleTo(role)`. The Runtime itself and the public portal are left out. Links open in a new tab so the current workspace, and any item it was deep-linked to, stays open.
- URLs resolve via `prodUrl` when set; otherwise `http://${location.hostname}:${port}${openPath}`.

### 6.4 Generated documentation

`scripts/run-platform.mjs --markdown` prints the README table. The README section sits between the markers `<!-- platforms:begin -->` and `<!-- platforms:end -->`.

## 7. Tests (acceptance)

Extend `tests/platforms.test.mjs` and add `tests/hub.test.mjs`:

| # | Assertion |
|---|---|
| T-1 | Every platform has all FR-1 fields with valid enum values; `purpose` ≤140 chars. |
| T-2 | Ports are unique, including 8079 for the Hub. |
| T-3 | `package.json` has `hub` and `start:hub`, and `start:all` includes the Hub. |
| T-4 | `config/platforms.data.js` matches `build-platforms-data.mjs --check`. |
| T-5 | The README block between the markers equals `--markdown` output. |
| T-6 | `hub-server` `/api/platforms` returns every id and leaks no `env`/`command` keys. |
| T-7 | `/api/status` reports `down` for a port with no listener, within 3 s. |
| T-8 | `visibleTo('viewer')` excludes `admin` and `engineering`; `visibleTo('systemAdmin')` includes all. |
| T-9 | No file under `document-portal/` references the Hub or any internal port (8079, 8080, 8082, 8765, 8787). |
| T-10 | Playwright smoke: the Hub renders one card per platform, the filter narrows them, and the runtime Platforms menu opens and lists the permitted entries. |

Wire as `test:hub` into `test:node`.

## 8. Implementation plan

| Phase | Work | Output | Size |
|---|---|---|---|
| **1. Config** ✅ | Add FR-1 fields to all entries, add `Audiences`/`visibleTo`, extend `platforms.test.mjs` (T-1, T-2, T-8) | Classified registry | S |
| **2. Hub** ✅ | `hub-server.mjs`, `tools/hub/*`, npm scripts, devcontainer port 8079, `hub.test.mjs` (T-3, T-6, T-7) | `npm run hub` works | M |
| **3. Generated docs** ✅ | `--markdown`, README markers, T-5 | README can't drift | S |
| **4. Runtime switcher** ✅ | `build-platforms-data.mjs`, `platforms.data.js`, shell menu, T-4, T-10 | In-app navigation | M |
| **5. Boundaries** ✅ | Portal isolation check (T-9), "← Hub" back-links (FR-12), advisory label (FR-8) | Clean audience separation | S |
| **6. Governance** ✅ | Add the §10 rule to `CONTRIBUTING.md` | Controlled growth | XS |
| **7. Production** *(after G-04 auth)* | Fill `prodUrl`, enforce the role filter server-side, DNS per §9 | Deployed front door | Depends on the tenant |

**Superseded 2026-10-22 (owner):** the Platform Hub is retired; its code, scripts and tests are removed and the Administration Centre is the one front door. The text below is the record of what was built.

Phases 1 and 2 are done: `npm run hub` / `npm run start:hub`, tested by `tests/platforms.test.mjs` and `tests/hub.test.mjs` (T-1–T-3, T-6–T-9). The Hub is exempt from Centre governance because it holds no data. Phases 3–6 have no external dependency and can ship now. Each phase is one commit that passes `npm test`.

## 8a. Priority: deep links must work across the folio

Deep links are a standing priority. Every phase must keep them working, and the phase that touches them owns proving it:

| Link | Today | Requirement |
|---|---|---|
| Task acknowledgement (`?TaskID=` / `ACK` / `AssnPID` → `acknowledgment`) | Resolved by `core/deeplink-resolver.js` per `config/deeplink.config.js`. Verified after phase 4: `/?TaskID=DEMO-123` opens the Acknowledgement Queue on that task. | DL-1: an acknowledgement link opens the named task and records the receipt, including after sign-in once auth is active (the link must survive the OTP round trip). |
| Item from a notification (`?DGOPID=` / `ITEMID` / `ref` → `lookup`) | Same resolver. | DL-2: every notification (email, Teams, in-app bell) carries a link that opens the exact item, not a list. DL-3: the in-app notification centre opens items by the same resolver, not a separate path. |
| Links into other platforms | None. The Hub and Platforms menu open a platform's home page. | DL-4: the Hub accepts `/?to=<platformId>&<params>` and forwards the parameters, so one link format works in every notification regardless of which platform hosts the item. |
| Production hosts (§9) | Links are built from `localhost` ports. | DL-5: links in notifications are built from `prodUrl`, never a port, and a test fails if a notification template contains `localhost`. |

**Status (implemented):**

- **Link shapes.** `core/deeplink-parse.js` is the one parser. It accepts the shapes the live flows actually send: `item`, `items` (a list; the first is opened), `ref=TASK-n` (a task), and page names such as `acknowledge.html`, `index_Bulk.html` and `support.html`. Before this, an assignment notice (`?item=2109&ref=TASK-2109`) opened Lookup instead of the task.
- **Stale context.** A new link replaces the previous link's context instead of merging into it. Merging carried an old task id into a new link.
- **DL-2, items.** Lookup opens the linked item (`findLinkedRecord`). If the item hasn't loaded, it says so and offers to load the latest records. Before this, item links arrived at an empty Lookup.
- **DL-3, the bell.** An entry with a reference has an **Open** button that uses the same resolver as a link.
- **DL-4, the Hub.** `/?to=<platformId>&…` forwards to that platform with the parameters. Only platform ids in the registry are accepted.
- **DL-5, the estate.** `npm run deeplinks:audit` writes [`docs/folio-Master-Flows-and-Endpoints/deployment/DEEPLINK_AUDIT.md`](../folio-Master-Flows-and-Endpoints/deployment/DEEPLINK_AUDIT.md): every link the deployed flows send, what it opens, and what is wrong with it. `buildDeepLink()` is the one link format, and it refuses a local base.
- **DL-1, sign-in: done and tested with auth enforced** (`tests/deeplinks-signin.spec.js`, dev server with `DGO_DEV_AUTH=1`). The earlier assumption here, "the OTP runs on the first governed action", was wrong in four ways. Every call, including the code calls, demanded sign-in first. Nothing showed a real sign-in. Only systemAdmin could open the Acknowledgment Queue. And the acknowledging actor came from the local profile, not the signed-in identity. All four are fixed; see `docs/deployment/PLATFORM_ACCESS_RUNBOOK.md`, "Found and fixed while testing sign-in".
- **Tests.** `tests/deeplinks.test.mjs` (`npm run test:deeplinks`, in the gate) covers the resolver table, the live shapes, bounds, the Lookup matcher and the link builder. Each path was also checked in Chromium against the dev server's seeded records.

**Production host: `https://folio-gateway.rf.gd/`** (owner, 2026-10-08; it replaces `https://internal-platform.rf.gd/`, decided 2026-09-30). `https://internal-ops.rf.gd` and `https://activityweb.page.gd` are allowed origins too, but links go to the primary. It is recorded as `productionBase` in `config/deeplink.config.js` and as the Workspace's `prodUrl` in the registry. The Mailer stays at `https://internal-platform.rf.gd/mailer.html` until its host is decided. The Workspace package publishes forwarding pages under the old hosts' page names (`acknowledge.html`, `index_Bulk.html`, `support.html`), so a flow is repointed by changing **only the host** in its links. When the Workspace runs from that host, its Platforms menu leaves out local-only tools.

**Open (tenant):** fix the flows. The status, the order and the step-by-step procedure (publish, edit, test, re-export) are in [`docs/deployment/PLATFORM_ACCESS_RUNBOOK.md`](../deployment/PLATFORM_ACCESS_RUNBOOK.md). The worklist is [`DEEPLINK_AUDIT.md`](../folio-Master-Flows-and-Endpoints/deployment/DEEPLINK_AUDIT.md): 14 actions in 5 flows reach people's inboxes, and 5 of them are broken today. The single-task email's **Acknowledge Receipt** and **Support Access** buttons have empty links, the incoming-document link carries `veggie` after the id, and one base address is a pasted Markdown link. The placeholder `yourdomain.com` links reported earlier are in sample actions that nothing reads.

## 9. Production addressing (target shape)

| Host | Serves | Access |
|---|---|---|
| `portal.<domain>` | Document Portal | Public |
| `ops.<domain>` | DGO Runtime (+ Admin Suite) | Internal network / authenticated |
| `ops.<domain>/hub` | Platform Hub | Internal network / authenticated |
| `ops.<domain>/console` | Admin Console | Admin roles |
| *(not deployed)* | Workbench, Capsule | Engineer workstations only (`127.0.0.1`) |

## 10. Governance rule for new platforms

A new runnable thing is accepted only when:

1. It is declared in `platforms.config.mjs` with every FR-1 field, including a named `owner`.
2. Its PR states why it cannot be a Runtime route or an Admin Suite panel. The default answer is that it becomes one.
3. `npm test` passes, which means the Hub, switcher, README and devcontainer have all picked it up automatically.
4. Its `exposure` is justified, and anything `public` is reviewed against FR-9.

Platforms that are unused for two releases are reviewed for retirement or merger into the Admin Suite.

## 11. Risks

| Risk | Mitigation |
|---|---|
| The role filter is spoofable while auth is inert | Labelled advisory (FR-8); engineering tools stay local-only (NFR-2) |
| Probing Python services from the browser fails on CORS | Server-side probing (FR-4) |
| Another list goes stale | Everything is generated and checked (FR-5, FR-11, T-4, T-5) |
| The Hub becomes a sixth silo | It holds no data and no logic beyond links and status |
