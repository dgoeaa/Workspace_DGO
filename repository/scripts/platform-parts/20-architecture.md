<!-- Moved here from PLATFORM_DOCUMENTATION.md at the repository root on 2026-09-24 and
     embedded into docs/PLATFORM.md, so the estate has one description rather than two.
     Three of its sections were dropped rather than carried: 'What the platform is',
     'Integration' and 'Authentication - provisioned, inert'. The generated half of
     PLATFORM.md states all three from the registers, and the authentication section in
     particular was written on 2 August and had gone stale - it described the client half as
     switched off with activation a configuration change, which stopped being the whole
     picture when the proof chain was built. Everything below is architecture that the
     registers do not hold and that a generator cannot derive. -->
## 1. Applications

Six independently bootable applications share the repository, of which five are the platforms
`scripts/platforms.config.mjs` declares and *§1 · The surfaces* above lists with their ports.
Only the first uses the full runtime.

| Application | Entry | Scale | Role |
|---|---|---|---|
| **DGO R11.6 Runtime** | `index.html` | 135 modules reachable · 29 routes | The platform shell |
| **Document Portal** | `document-portal/index.html` | 34 files | Public submission & tracking (PWA) |
| **Admin Console** | `tools/admin-console.html` | 1 file | Endpoint administration, openable from a file path |
| **Flow Workbench** | `tools/flow-workbench/` | built by `npm run workbench` | Flow inspection and alignment |
| **Flow Capsule Registry** | `tools/flow-capsule/` | Python, `npm run test:capsule` | The capsule registry |
| **AckFlow** | `newack/index.html` | 5 files | Acknowledgement prototype — not a declared platform and served by no port |
| ~~**ECM Activity Hub Portal**~~ | — | — | **Retired at D6(b)**; briefs, meetings and projects are now root modules |

This table said *four* applications until 2026-09-24 and listed neither the Admin Console, the
Flow Workbench nor the Flow Capsule Registry, which had been running on their own ports and
carrying their own test suites for some time. It was carried in from the root
`PLATFORM_DOCUMENTATION.md`, which nothing regenerated; the surfaces table above is read from
the platforms config, so the two disagreed in one document.

The Document Portal is a **progressive web app** — service worker, manifest, offline shell — and is deliberately self-contained so it can deploy standalone. That is why it keeps its own copy of the design tokens rather than sharing the runtime's.

---

## 2. Runtime architecture

Four layers. Data flows down; nothing in a lower layer knows about a higher one.

```
PRESENTATION   index.html · shared/shell.js · modules/*.js · styles/
     │           web-component shell, hash router, 25 lazy route modules
GOVERNANCE     core/action-authority.js · audit-log · idempotency
     │           · receipt-ledger · offline-action-queue · otp-service
INTEGRATION    core/auth.js · endpoint-registry · data-client · fetch-manager
     │           contract resolution, redaction, retry, dedupe, queueing
BACKEND        Power Automate (19 contracts) · SharePoint · one-time-code identity
```

### 3.1 Boot sequence

`core/boot.js`:

1. `PlatformProvisioner.ensure()` — normalise state shape against `config/state-schema.config.js`
2. Register all 25 route modules as lazy `import()` thunks
3. Apply theme and density to `<html>`
4. Run the welcome experience (skippable via `?skipWelcome=1` or `?embed=1`)
5. Mount `<dgo-shell>`, install relationship interceptors and the offline retry listener
6. Resolve any deep link, set `window.__DGO_BOOTED__ = true`
7. Load runtime data in the background — failure degrades to offline, never blocks boot

**A boot watchdog in `index.html` is deliberately a classic (non-module) script.** `boot.js` cannot report its own failure to *resolve*: module resolution happens before any of its code runs, so no `try/catch` fires and no error is logged. The watchdog surfaces failing URLs after 15 seconds. This exists because 12 config modules were once absent and the app simply hung forever with no diagnostic.

### 3.2 Routing and workspaces

`core/router.js` — hash-based, generation-token guarded so a slow module cannot overwrite a newer route.

Twenty-nine routes exist; **24 are visible workspaces**, 5 are a genuine sub-view of one primary workspace, reached from that parent screen's "Continue in" strip and the command palette rather than the sidebar. This split lives in `config/workflow-clarity.config.js` and follows the locked information architecture from the Figma "Application Shell" page, so navigation reflects operator intent rather than module inventory.

| Group | Visible workspaces |
|---|---|
| START HERE | Command Center · ERP–ECM Charter |
| OPERATIONS | Activities · Intake & Assignment · My Work · Acknowledgment Queue · Registry · Comments · Lookup & Direct Action |
| CONTROL | Tracking & Monitoring · FastTrack SLA · Review & Approval · Briefs & Submissions · Meetings · Projects · Reports · Statistics · DGCEO Correspondence & Decision Hub |
| CLOSURE | Dispatch · Correspondence Email Desk |
| SYSTEM | Assistant · Operator HUD · Administration · System Health |

Sub-views — `single-assignment`, `bulk-assignment` (both under Intake & Assignment), `scan-intake` (under Registry), `archive` (under Dispatch), `user-admin` (under Administration) — each declare which workspace surfaces them and why.

### 3.3 State

`core/state.js` — a single object, `structuredClone`-isolated, persisted to `localStorage` under `dgo.r11.viewport.runtime.state` (schema v4). Every non-runtime patch auto-records an audit entry (capped at 1,000). Endpoint overrides are sanitised on hydrate so no signed URL is ever persisted.

---

## 3. The governance spine

This is the platform's most substantial engineering, and the reason the codebase is worth protecting.

### Action ownership — `core/action-authority.js`

Every mutating action must be **owned** by the invoking module, or explicitly list it as an allowed invoker. Otherwise it throws.

```
executeOwnedAction(module, action, runner, meta)
  ├── ensureCurrentUserActive()     → status check, audit on denial
  ├── assertModuleAction()          → ownership and boundary check
  ├── audit  stage: started
  ├── runner()
  └── audit  stage: completed | failed
                    └── on failure: toast the operator, then rethrow
```

Backed by `config/action-ownership.config.js` (per-action owner, label, service, backend, audit vocabulary) and `config/module-boundaries.config.js` (what each module owns and explicitly must not own).

### Failure messaging — the contract

This layer is the only place that reliably sees **every** failed governed action, so it owns what the operator reads when one fails. Two audiences, two channels, and they never carry the same text:

| Channel | Carries | Read by |
|---|---|---|
| `auditAction(… stage:'failed', error: error.message)` | The raw technical detail, verbatim | IT — also surfaced on System Health, the Operator HUD and the pending-write queue |
| The toast | `Could not <action label>. <what it means for the record>` | The operator |

The operator-facing message is **never** derived from `error.message`. It is built from two things:

- the action's `label` in `config/action-ownership.config.js` — a plain noun phrase, presentation-only, mandatory on every action;
- the error's `errorClass` where the throw used `ObsidianError` (`core/errors.js`), which selects a plain consequence sentence. `ObsidianError` carries a typed class and `details`, but **no user-safe message field**, so its `message` is treated as developer text. An untyped error falls back to "Nothing was changed."

**One failure, one toast.** The layer speaks by default. A call site that can say something genuinely more useful — naming the reference, the recovery it just took, what is still outstanding — passes `meta.notify:false` and takes responsibility for telling the operator itself. Seven call sites across six modules do (archive, assistant, correspondence-email, dispatch, settings, bulk-assignment ×2); every other governed call site lets this layer speak. `ActionRuntime.run(module, action, payload, options)` forwards `options.notify` for callers routed through it.

The opt-out is explicit at the call site by design. A time-window de-duplication in the toast helper would hide two messages racing rather than stop them being sent.

> This exists because audit finding **I-07** — developer vocabulary on operator screens — was resolved in every module's copy and then reintroduced here: an unconfigured connection reached a registry officer as `"AI_CHAT: Endpoint AI_CHAT is not configured"`, and the module's own catch showed it a second time. `tests/governance.test.mjs` holds both halves: that the audit keeps the raw detail, and that the toast never does.

### Audit — `core/audit-log.js`

Ring buffer of 5,000 events, indexed by reference, returned frozen. Records actor, event, phase, status transition, entity type and id.

### Idempotency — `core/idempotency.js`

```
idem:<operation>:<ref>:<actor-email>:<5-min bucket>:<sha256 payload digest>
```

Sent with every write so a retry cannot double-apply.

### Offline durability

`pending-queue` → `offline-action-queue` → `receipt-ledger`. Failed writes enqueue with retry metadata; an `online` listener drains them; each attempt writes a receipt (`queued` / `sent` / `failed`). Acknowledgements survive a network outage.

### Step-up authentication — `core/otp-service.js`

Request, verify, and verify-and-execute — with the OTP **bound to a payload digest**, so a verified code cannot be replayed against different data.

### Write discipline — `core/write-manager.js`

Three modes: `local` (state only), `backend` (remote with idempotency), `optimistic` (patch, then roll back on failure or enqueue).

> **The governance model was never the weakness. Its input was.** Every control above is enforced in the browser only. Section 6 addresses this.

---

## 4. Access control

Six roles, thirteen permissions, in `config/rbac.config.js`.

| Role | Route access |
|---|---|
| `systemAdmin` | all |
| `userAdmin` | home, settings, user-admin, diagnostics, operator-hud |
| `executive` | home, executive, response-tracking, approvals, reports, statistics, lookup, assistant, archive |
| `director` | operations + approvals, dispatch, reports, statistics |
| `operator` | operations + registry, comments, correspondence-email |
| `viewer` | home, response-tracking, reports, statistics, lookup |

Permissions: `user:view/create/update/disable` · `role:assign/view` · `settings:manage` · `audit:view` · `dispatch:approve` · `bulk:assign` · `route:manage` · `executive:view/export`.

Route guards in `core/router.js` render an explicit denial rather than a blank page, distinguishing *disabled*, *not enrolled* and *role cannot open*.

---

## 5. Design system

`styles/index.css` declares a deterministic cascade:

```
@layer tokens, brand, base, layout, components, overrides;
```

Tokens layer in order: primitive → semantic → component → density → enhanced → theme(light, dark, hc) → legacy bridge.

**Theme and density live on `<html>` only.** Every themed rule is a bare `[data-theme="…"]` selector written for `:root`. Mirroring those attributes onto descendants makes the selector match directly and beat inheritance — which silently broke dark mode until it was removed. `CONTRIBUTING.md` records this as a rule; the smoke suite asserts the mirrors stay absent.

Three themes (light, dark, high-contrast) × two densities (comfortable, compact).

> **Known debt:** the `overrides` layer holds two authorities whose rule interaction is documented at length in `styles/index.css` and remains unresolved. There is currently no rendered-appearance regression coverage beyond the smoke suite's theme assertion.

---

## 6. Accessibility

Skip link to `#main`, one `<nav>` and one `<main>` landmark, `lang="en"`, three ARIA live regions, zero images without `alt`, zero buttons without an accessible name. Drawers trap Tab and restore focus to the opener. Tables receive `data-label` attributes for responsive stacking. High-contrast theme reaches pure black on white and includes a `forced-colors` block.

**Open:** a duplicate top-level heading on the shell, and a full contrast pass now that the themes actually apply.

---

## 7. Quality gate

```bash
npm test              # imports → secrets → auth → smoke
npm run test:imports  # static ES-module graph check, no browser, ~1s
npm run test:secrets  # SAS signature ratchet
npm run test:auth     # both authentication postures
npm run test:governance # the governance spine, no browser, ~1s
npm run test:smoke    # Playwright, 6 tests
npm run test:links    # linkinator crawl
```

| Check | What it proves |
|---|---|
| `check-imports.mjs` | Every relative import resolves. **167 modules, 0 broken edges.** The check that would have caught the original boot failure in one second. |
| `check-secrets.mjs` | A ratchet, not a gate — fails on *new* signatures, reports known ones. Deleting a file revokes nothing, so failing on known exposure would only make CI permanently red. |
| `auth-posture.test.mjs` | Both postures, 25 assertions, one child process each. |
| `governance.test.mjs` | The spine itself, 108 assertions, no browser: action ownership and boundaries, RBAC, idempotency keys, the audit log, cross-config integrity, provisioning parity, endpoint contracts — and the execution path inside `executeOwnedAction()`: an unowned action refused, an allowed invoker permitted, a failure audited with the raw detail intact, exactly one operator toast carrying none of it, and the rethrow contract held. Includes a negative control so the vocabulary assertions cannot pass vacuously. |
| `smoke.spec.js` | Boot, accessibility entry points, all 29 routes, theme repaint, `?skipWelcome=1`, ECM portal. Gated on `__DGO_BOOTED__`, **not** HTTP 200 — a 200 proves the server served `index.html` and nothing more. |

CI (`.github/workflows/ci.yml`): `imports` gates `smoke` and `links`; `secrets` runs independently.

> **Closed.** This section used to read: *"the governance spine itself has no tests. The smoke suite proves pages render; it proves nothing about whether action ownership still blocks an unowned action."* `governance.test.mjs` now does exactly that, and covers what `executeOwnedAction()` audits and says as well as what it refuses. The gap it closed was real and had a cost: with only the gate tested, the layer could put raw error text on an operator's screen (finding I-07) and CI stayed green.
>
> **Remaining gap:** enforcement is still browser-side only — see section 6. Tests prove the controls work; they cannot prove a client that skips them was ever asked to run them.

---

## 8. Configuration

```bash
cp config/config.example.js config/config.local.js   # git-ignored
```

`index.html` loads it with `onerror="void 0"` — a 404 is expected and allow-listed by both the smoke suite and the link checker.

| File | Purpose |
|---|---|
| `app.config.js` | Version, storage key, schema version, themes, densities |
| `auth.config.js` | The authentication switch |
| `rbac.config.js` | Roles, permissions, route access |
| `routes.config.js` | 25 route declarations |
| `workflow-clarity.config.js` | Visible workspaces vs guided internal routes |
| `endpoints.config.js` | 19 contracts |
| `module-boundaries.config.js` | What each module owns and must not own |
| `action-ownership.config.js` | Per-action owner, plain-language label, service, audit vocabulary |
| `fetch-policy.config.js` | Timeout, retry, dedupe, cache TTL, payload budget |

---

## 9. Repository layout

```
index.html                     Runtime entry + boot watchdog
config/            31 files    Declarative platform configuration
core/              57 files    Boot, router, state, governance, integration
modules/           25 files    Lazy-loaded route modules
shared/             8 files    Shell, adapters, welcome runtime
styles/            18 files    @layer cascade + design tokens
tests/              6 files    Import, secret, auth and smoke suites
modules/briefs.js …             briefs, meetings and projects (ported from the retired ECM Activity Hub)
document-portal/               Public portal (PWA)
newack/                        Acknowledgement prototype
ECM_DOCS_DEV.zip               Archive of record — reference material
```

Documents: `PLATFORM_DOCUMENTATION.md` · `docs/STATUS_REPORT.md` · `docs/architecture/AUTHENTICATION_CONTRACT.md` · `docs/audits/CAPABILITY_ASSESSMENT_R11.6.md` · `docs/audits/REPOSITORY_AUDIT.md` · `docs/audits/INDEX.md` · `README.md` · `CONTRIBUTING.md`

---

## 10. Known limitations

Recorded plainly; each is tracked in `docs/STATUS_REPORT.md`.

1. **Nothing is enforced server-side.** All governance is browser-side. Until `docs/architecture/AUTHENTICATION_CONTRACT.md` §2 is implemented, controls are advisory.
2. ~~**The ECM Portal has no auth work at all**~~ — moot since D6(b): the tree is deleted, so there is one auth surface rather than two.
3. **Four signed URLs remain** in `document-portal/js/data.js` and `newack/config.js`; 22 pilot signatures still require rotation.
4. ~~**The governance spine is untested.**~~ — closed: `tests/governance.test.mjs` covers ownership, boundaries, RBAC, idempotency, the audit log, provisioning parity and the execution path inside `executeOwnedAction()` (108 assertions). Enforcement remains browser-side, which is limitation 1, not this one.
5. **No rendered-appearance regression coverage**; the `overrides` cascade debt is unmeasured.
6. **One duplicate `<h1>`** on the shell.
