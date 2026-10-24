# Commissioning — DGO Digital Operations

Client-side web applications powering NITDA's Digital Operations platform, plus the reference material and flow exports that document it.

> **Read this first.** This README was previously written for a different repository (`dgoeaa/DGO_Targets`) and described a test suite, CI workflows and a bundle manifest that do not exist here. It has been rewritten to describe **this** repository as it actually is. Where something is genuinely undecided it says so rather than guessing. See [`docs/audits/CAPABILITY_ASSESSMENT_R11.6.md`](docs/audits/CAPABILITY_ASSESSMENT_R11.6.md) for the full gap analysis behind these corrections.

---

## ⚠️ Security status — read before publishing this repository

**This repository must not be made public in its current state.**

1. **43 signed Power Automate trigger URLs are committed here — and all 43 have been rotated.** They sit across 28 tracked files, entirely the reference corpus under `docs/reference/foundational/`, which documents a **superseded** flow estate verbatim by explicit decision (D5). A SAS-signed URL is a bearer credential, so while they were live anyone who could read this repository held all 43. They are not live: the estate was re-issued, and `docs/reference/endpoint-register.json` is a post-rotation export from the tenant against which **all 25 contract keys reconciled to different workflows than this corpus records**. Nothing here authenticates an endpoint the platform calls, and `npm run recover` — the one command that ever read them — is retired and exits 2.

   What that does **not** establish: that a flow outside the 25 was also regenerated. Every signature is in git history, where deleting a file reaches nothing. Treat them as burned, not as harmless, and keep the rule that produced this item — a live signature is never committed. *(The count read 55 until 2026-09-03. A signature is 43 base64url characters and the corpus glues prose onto the end of URLs, so the counters matched greedily and indexed one credential under several strings. `npm run commission` and `npm run rotation` now agree at 43; the exposure did not shrink, the count was wrong.)*

   > *Corrected 5 August 2026.* This item previously read "4 live signatures in 2 tracked files — `document-portal/js/data.js` and `newack/config.js`". Both statements are now wrong: `data.js` carries no signature and `newack/` no longer exists. The application tree is clean, which is what `npm run test:secrets` guards; the exposure moved to the reference corpus, which that ratchet deliberately does not scan.
   >
   > *Re-measured 6 August 2026.* **55 across 28 files**, down from 59 across 39 — the corpus trim removed files, not signatures, and the difference is duplicate copies of the same workflow. `npm run test:secrets` now prints this figure on every run instead of reporting "no signatures" over its narrowed scope, so the number no longer depends on which command you happen to run.

   `npm run rotation` prints the worklist as the record of what was covered: the 43 signatures resolve to **39 distinct flows**, 14 of which carried two signatures each. It no longer reports the gap as open — counting signatures in tracked files cannot tell rotation from retention, and under decision D5 the corpus is retained, so a count-based gate would have reported completed work as outstanding forever.

   The delivered packages are deliberately wired to these URLs. Minting a fresh estate before the platform has been exercised live means regenerating triggers again after each contract adjustment, re-exposing every new set through the same working files. Every package stamps its own exposure in `PACKAGE_MANIFEST.json` and `DEPLOY.md`, and `npm run commission` reports it in every posture, so no deployment can be wrong about which it holds.

2. **Authentication is provisioned but INERT.** The auth layer is complete on the client side and switched off so the pilot loop stays frictionless. While inert, caller identity travels as a client-asserted `userEmail` from `localStorage` and RBAC is advisory only — editing one storage key escalates a viewer to `systemAdmin`.

   Activation is a configuration event, not a development one: set `auth.enabled: true` and implement the server obligations. **There is no identity-provider tenant, no directory registration and no administrator approval** — identity is `OTP_GENERATE` and `OTP_VERIFY`, two Power Automate flows that arrive in the package with every other URL. See **[`docs/architecture/AUTHENTICATION_CONTRACT.md`](docs/architecture/AUTHENTICATION_CONTRACT.md)**. Diagnostics shows the live posture.

**Item 1 is discharged** — G-03's rotation is done; the corpus is retained deliberately, and the repository stays private because git history is not revocable. **Item 2 is open** — see G-04 of the capability assessment.

---

## This estate is being commissioned, not developed

The code works and has for some time. What stands between it and production is configuration held in a tenant, and decisions held by people — none of it a code defect, each item naming the party who can discharge it.

| Read this | For |
|---|---|
| **[`docs/deployment/COMMISSIONING.md`](docs/deployment/COMMISSIONING.md)** | where you stand, and the path from here |
| **[`docs/deployment/CLEAR-THE-LAST-BLOCKER.md`](docs/deployment/CLEAR-THE-LAST-BLOCKER.md)** | the wiring path — all 25 keys, start to finish |
| **[`docs/deployment/ACTION_PLAN.md`](docs/deployment/ACTION_PLAN.md)** | the open items in the order that unblocks the most, each with its actor |
| **[`docs/deployment/PRODUCTION_READINESS_REGISTER.json`](docs/deployment/PRODUCTION_READINESS_REGISTER.json)** | the register of record — every item, its status, and the evidence for it |
| **[`docs/deployment/COMMISSIONING_SURFACE.md`](docs/deployment/COMMISSIONING_SURFACE.md)** | which of the tracked files the open work actually touches, and how to read the rest |
| **[`docs/deployment/CLOSED.md`](docs/deployment/CLOSED.md)** | what has been discharged, when, and on what evidence — so a closure is checkable without re-deriving it |
| `npm run commission` · `npm run readiness` | the same, measured rather than asserted |

**Where a document and a command disagree, the command governs.** `npm run test:closure` holds every document — and the commissioning gate itself — to the register, so that a closed item cannot come back as an open one. It exists because ten of them did.

**Running it for development?** `npm run values:template ~/dgo-values.txt` writes a values file carrying all **25** endpoint keys — 18 internal, 7 portal, across 20 distinct workflows — with every trigger URL complete except its `sig=` signature, taken from `docs/reference/endpoint-register.json`. Paste each flow's signature in with `npm run values:sign`, then `npm run setup -- --values ~/dgo-values.txt --force`. `npm run verify:endpoints` then proves that wiring against the live flows.

`npm run recover` is **retired and refuses to run** (exit 2). It scraped URLs from `docs/reference/foundational/`, which describes a superseded estate: all 25 keys now point at different workflows, so a config built from it looks complete and answers 401 on every call. The single authority is `docs/reference/endpoint-register.json`; the single commissioning path is **[`docs/deployment/CLEAR-THE-LAST-BLOCKER.md`](docs/deployment/CLEAR-THE-LAST-BLOCKER.md)**.

---

## What's in this repo

### Applications

| App | Entry point | Description |
|-----|------------|-------------|
| **DGO R11.6 Runtime** | `index.html` | Obsidian Harmonized Design System runtime — platform shell with routing, client-side RBAC, state, module boundaries, accessibility and theming. 31 routes, including the [Admin Suite](docs/reference/ADMIN_SUITE.md) — one interface for the endpoint estate, the flow catalogue, live checks, commissioning, the capsule registry, people and platform control. |
| **Document Portal** | `document-portal/index.html` | Public document submission and tracking portal (PWA — service worker, manifest, offline). |

All are zero-build: no bundler, no transpilation, no server-side rendering. They need a real HTTP server (not `file://`) because browsers block ES-module imports across origins.

### Supporting material

| Path | Contents |
|---|---|
| `docs/reference/ADMIN_SUITE.md` | What the Admin Suite is, which tools it merged, and the five rules it holds itself to. |
| `docs/reference/HEALTH_CONTRACT.md` | The non-destructive health contract and the identity handshake a flow must implement to be checkable. |
| `docs/reference/` | **Reference material of record.** The BRD/FRD hybrid, the platform architecture pack, the DGCEO data model, the SharePoint provisioning specification (10 lists, 97 fields), the flow trigger contracts, and the operations manifest with its signed URLs redacted. Extracted from `ECM_DOCS_DEV.zip`, which was removed from the tree — it carried signed Power Automate trigger URLs for 25 workflows and its irreplaceable content is now readable and diffable. The archive remains in git history. |

---

## Run it

### Option A — in the browser, nothing installed

On GitHub: **Code → Codespaces → Create codespace on main**.

`.devcontainer/devcontainer.json` runs `npm install && npm run setup` on create and
`npm start` on every attach. When port 8080 forwards, the platform opens. No terminal,
no Node, no local clone — works from a tablet or phone.

**It opens in demo mode.** `npm run setup` scaffolds the two config files with no endpoint
URLs in them, which is deliberate for a fresh codespace: the platform boots, renders and
transmits nothing. To point it at the live flow estate, follow
[`docs/deployment/CLEAR-THE-LAST-BLOCKER.md`](docs/deployment/CLEAR-THE-LAST-BLOCKER.md) in the
codespace terminal and reload. (This section previously said the codespace "wires the pilot
endpoints"; it does not, and never did — only `npm run setup -- --values <file>` wires
anything.)

### Option B — on your own machine

Needs Node 22 or newer — the tooling's floor, not the platform's. The two delivered
platforms are static sites with no build step and need no runtime at all; Node is here
for the test suite, the packager and the link checker, one of whose dependencies now
requires 22.

**One command:**

```bash
npm install && npm run go
```

`npm run go` scaffolds the config files and starts the server. Nothing else to configure.

With no endpoint URLs supplied the platform runs in **demo mode**: it boots, renders and
transmits nothing. That is the intended state for a fresh clone — the platform is not
inert because something is broken, but because nothing has been wired to a flow yet.

To wire real endpoints, follow `docs/deployment/MINIMAL-PILOT.md` to regenerate each
trigger, then pass them in. The browser calls each Power Automate flow directly, so those
URLs *are* the credential: both target files are git-ignored, and every flow behind them
must authenticate and authorise its own callers.

```bash
npm run setup                                    # scaffold config only
npm run values:template ~/dgo-values.txt         # all 25 keys, every URL bar its signature
npm run values:sign -- ~/dgo-values.txt FETCH_ACTIVITIES   # paste one signature (repeat per flow)
npm run check:values -- ~/dgo-values.txt         # confirm all 25 filled, prints no URLs
npm run setup -- --values ~/dgo-values.txt --force   # wire your own endpoints
npm run verify:endpoints                         # call each flow and report what came back
npm run commission                               # readiness gate for live usage
npm start                                        # serve
```

`npm run setup` never overwrites an existing config unless you pass `--force` — without it a
re-run prints `already exists — left untouched` and exits 0, so it reads as success while
changing nothing. Pass `--force` any time the file already exists.

`--force` rewrites the whole file from the values you supply, so the values file must be
complete: a key you leave out is written empty, not carried over. `npm run values:template`
emits all 25 keys precisely so nothing can be left out by accident, and `npm run check:values`
names any key still awaiting its signature before you commit to a write.

There is no partial-wiring shortcut. `--recover`, which used to backfill unsupplied keys from
the reference corpus, is retired and refuses to run: that corpus describes a superseded estate,
so backfilling from it produced a config that looked complete and answered 401.

**Handing the platform to someone else?** `npm run setup` wires a working tree; `npm run
package` builds the artefact you give away:

```bash
npm run package                                       # both platforms, wired and runnable
npm run package -- --values ~/dgo-values.txt          # wired to URLs you supply
npm run package:verify -- --verify dist/dgo-document-portal
```

Each package is self-contained — the platform's files, its endpoint URLs configured in, a
manifest hashing every byte, and a record of what is wired. **The default build is runnable:**
with no values supplied it wires every endpoint the documented estate provides, 17 of 18 on
the internal platform and 5 of 6 on the portal.

It refuses a malformed URL, two keys with different source flows landing on the same one, and
a package that cannot resolve its own module graph. It does *not* refuse a disclosed
signature — that is stamped on the package instead. See
[`docs/deployment/PACKAGING.md`](docs/deployment/PACKAGING.md).

Authentication stays **inert** for local testing: no sign-in, no token, identity from the
local profile. Exactly as the pilot has always behaved. Turning it on is a deploy-time
decision — see [`docs/deployment/COMMISSIONING.md`](docs/deployment/COMMISSIONING.md).

Then open:

- Root runtime — <http://localhost:8080/>
- Document portal — <http://localhost:8080/document-portal/>

To serve only the ECM portal on port 8080:

```bash
npm run serve:portal
```

---

## Run tests

Requires Node >= 22 — the same floor `package.json` declares and CI installs. (This line
said 20 while everything else in the repository said 22; `linkinator` pulls in `undici@8`,
which needs 22.19 and fails with a `markAsUncloneable` TypeError below it.)

See [`tests/README.md`](tests/README.md) for the design.

```bash
npm test              # the whole gate: 61 Node suites, then the Playwright suite
npm run test:node     # the same 61 suites without the browser — no npm install needed
npm run test:imports  # static ES-module graph check (no browser, ~1s)
npm run test:secrets  # fails on a NEW SAS signature in a tracked file
npm run test:auth     # asserts both authentication postures
npm run test:smoke    # Playwright smoke suite (150 browser tests)
npm run test:links    # linkinator crawl of all six entry points
```

`npm run test:imports` is the cheapest and the most load-bearing: it verifies every relative import resolves on disk. The runtime once shipped with 12 config modules that were imported but never committed, and because those are *static* imports the failure happened before `core/boot.js` could run its `try/catch` — nothing threw, nothing logged, and the app simply hung on its boot spinner. `index.html` now also carries a 15-second boot watchdog that surfaces the failing URLs instead of hanging.

If your environment ships a browser but cannot download Playwright's pinned Chromium:

```bash
export DGO_CHROME_PATH=/path/to/chrome
export DGO_CHROME_NO_SANDBOX=1   # only if needed
npm run test:smoke
```

---

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

| Job | What it does |
|---|---|
| `imports` | Module graph, then eight more suites and a real build of both packages — fails fast, gates the rest |
| `gate` | `npm run test:node` — every one of the 61 non-browser suites |
| `smoke` | Playwright smoke suite, uploads the report on failure |
| `links` | Link/asset crawl of all six entry points, localhost only |
| `secrets` | `node tests/check-secrets.mjs` — fails on a *new* SAS signature |

The `gate` job is new. Before it, CI ran nine suites by name and `npm test` ran sixty-one,
so fifty-two — including the three that check generated artefacts are current — ran only
where someone remembered to type `npm test`. All three were red on this branch for several
commits and nothing reported it.

---

## Configuration

### Root runtime

The runtime reads endpoint URLs from `window.DGO_CONFIG.endpoints`, set before the ES-module graph loads.

1. Copy `config/config.example.js` → `config/config.local.js`.
2. Fill in your **rotated** Power Automate URLs. See `config/config.example.js` for the full key list.

`config/config.local.js` is git-ignored, so it is absent in CI and on a fresh clone. `index.html` loads it with `onerror="void 0"`, so a 404 for it is expected and harmless — the smoke suite and link checker both allow it.

`config/endpoints.config.js` contains **no** hardcoded URLs; it reads from `window.DGO_CONFIG.endpoints` and resolves through `core/endpoint-registry.js`, which redacts `sig`/`sv`/`sp`/`code` before any URL is logged or exported.

## Repo structure

```
.
├── index.html                          Root runtime entry (+ boot watchdog)
├── assets/                             Shared SVG assets
├── config/                             Platform configuration modules (38 files)
│   ├── auth.config.js                  Auth switch — inert until release
│   ├── config.example.js               Documents the endpoint key structure
│   ├── endpoints.config.js             Reads from window.DGO_CONFIG.endpoints
│   ├── rbac.config.js                  Roles, permissions, route access
│   ├── flow-shapes.data.js             GENERATED — every trigger schema in the tenant
│   ├── ops-runbook.config.js           The commissioning runbook the Admin Suite holds
│   ├── routes.config.js                The 31 declared routes
│   └── workflow-clarity.config.js      Visible workspaces vs guided internal routes
├── core/                               Boot, router, state, services (73 files)
│   └── auth.js                         Token acquisition, identity, request gating
├── modules/                            Route modules, lazy-loaded (31 files)
│   └── admin-suite.js                  The single administration console
├── shared/                             Shell, components, design-system adapter
├── styles/                             CSS @layer cascade
│   └── dgo-design-system/              Self-hosted design tokens + fonts
├── document-portal/                    Public document portal (PWA)
├── tests/
│   ├── README.md                       Suite design and the secrets ratchet
│   ├── auth-posture.test.mjs           Inert + enforced posture assertions
│   ├── check-imports.mjs               Static module-graph check
│   ├── check-secrets.mjs               SAS signature ratchet
│   ├── commissioning.test.mjs          setup + readiness gate, and that the
│   │                                   documented npm scripts actually exist
│   ├── secrets-baseline.txt            Known-affected files (may only shrink)
│   └── smoke.spec.js                   Playwright smoke suite
├── scripts/
│   ├── setup.mjs                       Writes both config.local.js files
│   ├── lib/endpoint-recovery.mjs       Resolves the documented estate onto contract keys
│   ├── verify-endpoints.mjs            Calls each live flow and reports the response
│   ├── commission-check.mjs            Live-usage readiness gate
│   ├── build-flow-shapes.mjs           Derives the flow request-shape catalogue
│   └── check-links.mjs                 Link / asset checker
├── tools/
│   ├── flow-capsule/                   Capsule registry service, CLI, Termux installer
│   ├── flow-workbench/                 Standalone flow workbench + loopback relay
│   └── admin-console.html              Standalone endpoint console
├── .github/workflows/ci.yml            CI
├── docs/                               Everything written down — see docs/README.md
│   ├── architecture/                   Target architecture + AUTHENTICATION_CONTRACT.md
│   ├── deployment/                     COMMISSIONING.md, MINIMAL-PILOT.md, LOCAL-DEV.md
│   ├── audits/                         The audit record — start at INDEX.md
│   ├── reference/                      Flow contracts + the raw estate harvest
│   ├── cutover/, forensic/, visual/    Disposition, evidence, generated console
│   ├── policies/                       Universal Filename Policy deliverables
│   └── STATUS_REPORT.md                Position and finding register
├── README.md                           This file
├── CONTRIBUTING.md                     How to work in this repository
├── PLATFORM_DOCUMENTATION.md           What the platform is and how it fits together
├── LICENSE                             Proprietary — NITDA, all rights reserved
├── package.json
└── playwright.config.js
```

Those four markdown files are the whole of the repository root. Everything else
written down lives under `docs/`, indexed by [`docs/README.md`](docs/README.md).

---

## Troubleshooting

### "Failed to load module" / CORS error when opening `index.html` directly

ES modules are blocked by CORS on `file://` URLs. Serve over HTTP:

```bash
npm start                  # http-server on port 8080
# or
python3 -m http.server 8080
```

### The app shows "DGO could not start" after 15 seconds

The boot watchdog fired: the module graph did not resolve. Run `npm run test:imports` — it names the missing file and every module that imports it.

### Brand fonts render as system fonts

Expected, and the same in both platforms. Neither tree fetches anything from an external
host: there is no Tailwind CDN, no `unpkg.com`, and no Google Fonts stylesheet. The
render-blocking `@import` of `fonts.googleapis.com` was removed from the runtime because it
stalled boot by ~13 s wherever that host is unreachable, and removed from the portal for the
same reason — the portal precaches its stylesheets into an offline shell, so a visitor with
no network got the cached CSS and then waited on a host they could not reach.

Typography therefore falls back through the stacks in `--dgo-family-*` (Outfit → Alwyn New →
Inter → `system-ui` for display, Inter → IBM Plex Sans → `system-ui` for body). Only the
monospace face is a real webfont, and it is self-hosted at
`document-portal/ds/fonts/CascadiaMono-Regular.woff2`. To restore the exact brand faces,
self-host their `woff2` files alongside it and add an `@font-face` — do not add the
`@import` back. `tests/hardening.test.mjs` fails if anything in either tree fetches CSS or
fonts off-origin.

---

## Not yet decided

These are open questions, recorded here rather than guessed at:

- **Deployment.** There is no Pages workflow, `.nojekyll`, or staging allow-list in this repository. If GitHub Pages is adopted, decide which of the two applications are published and add a staging step — a new top-level runtime directory will 404 in production while working locally otherwise. Note the security status above: publishing before rotation would expose live credentials. *(This bullet said "five apps" until the count was re-measured: `index.html` and `document-portal/` are the only deployable entry points left — `ECM_ActivityHub_Portal/` and `newack/` were retired.)*
- **The ECM Activity Hub is gone.** Retired at decision D6(b); its briefs, meetings and projects capabilities are root modules. Earlier documentation describes it as a live second application — that is historical. See `docs/architecture/CONSOLIDATION_ANALYSIS.md`.
- **Rendered-appearance regression coverage.** None exists beyond the smoke suite's theme check. `styles/index.css` documents unresolved, measured cascade debt in its `overrides` layer.
