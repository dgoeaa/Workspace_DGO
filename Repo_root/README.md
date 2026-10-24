# ECM_DOCS_DEV — NITDA Folio

> **Workspace_DGO review:** this is copied project documentation, not current
> release authorization. Start at the [repository root](../README) and
> [release review](../RELEASE_REVIEW.txt). Public exposure and rotation verification
> remain owner blockers; copied private/rotation/readiness claims below are not
> verified for this repository. The supplied snapshot is incomplete. **NO-GO.**

Client-side web applications powering NITDA Folio, NITDA's correspondence and registry platform, plus the reference material and flow exports that document it. *Formerly DGO Digital Operations — see [`docs/reference/PLATFORM_NAMING.md`](docs/reference/PLATFORM_NAMING.md) and the [platform register](docs/reference/PLATFORM_REGISTER.html).*

> **Three documents describe this estate.** [`docs/PLATFORM.md`](docs/PLATFORM.md) is what it
> is, [`docs/deployment/PLAN.md`](docs/deployment/PLAN.md) is what is left to do, and
> **[`docs/deployment/RUNBOOK.md`](docs/deployment/RUNBOOK.md) is the only document in this
> repository that carries a commissioning step** — on a desktop or a phone alike. Any command
> below that wires something is that runbook's; this page names it, and restates none of it.

> **Read this first.** This README was previously written for a different repository (`dgoeaa/DGO_Targets`) and described a test suite, CI workflows and a bundle manifest that do not exist here. It has been rewritten to describe **this** repository as it actually is. Where something is genuinely undecided it says so rather than guessing. See [`docs/audits/CAPABILITY_ASSESSMENT_R11.6.md`](docs/audits/CAPABILITY_ASSESSMENT_R11.6.md) for the full gap analysis behind these corrections.

---

## ⚠️ Security status — read before publishing this repository

**This repository must not be made public in its current state.**

1. **43 signed Power Automate trigger URLs are committed here — and all 43 have been rotated.** They sit across 28 tracked files, entirely the reference corpus under `docs/reference/foundational/`, which documents a **superseded** flow estate verbatim by explicit decision (D5). A SAS-signed URL is a bearer credential, so while they were live anyone who could read this repository held all 43. They are not live: the estate was re-issued, and `docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json` is a post-rotation export from the tenant against which **all 25 contract keys reconciled to different workflows than this corpus records**. Nothing here authenticates an endpoint the platform calls, and `npm run recover` — the one command that ever read them — is retired and exits 2.

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

Three documents describe this estate, and only three. They replaced thirty-six on 2026-09-24,
several of which described the same thing in different words.

| Read this | For |
|---|---|
| **[`docs/PLATFORM.md`](docs/PLATFORM.md)** | **what the estate IS** — the surfaces, how a request travels, identity, the wired keys, what it stores, and where the work stands across all five of its registers. Carries no commands |
| **[`docs/deployment/PLAN.md`](docs/deployment/PLAN.md)** | **what is left to do** — one entry per open item, in the order that unblocks the most, each with its actor and the condition that closes it |
| **[`docs/deployment/RUNBOOK.md`](docs/deployment/RUNBOOK.md)** | **how to do it** — the only document in this repository that carries a commissioning step. Eight parts: the cutover in front of you, the execution guide, portal commissioning, notifications, the governance estate, the click-by-click flow build, the minimal pilot, and commissioning from a phone |

Beneath them, the records the three are generated from:

| | |
|---|---|
| **[`docs/deployment/PRODUCTION_READINESS_REGISTER.json`](docs/deployment/PRODUCTION_READINESS_REGISTER.json)** | the register of record — every item, its status, and the evidence for it |
| **[`docs/deployment/OUTSTANDING_SOURCES.json`](docs/deployment/OUTSTANDING_SOURCES.json)** · **[`outstanding-rollup.json`](docs/deployment/outstanding-rollup.json)** | the register above is one of five places this estate records outstanding work. These declare all five and total them — **60 open**, where the register alone holds 24 |
| **[`SECURITY.md`](SECURITY.md)** | reporting a vulnerability, and the standing rule that a live signature is never committed |
| `npm run commission` · `npm run readiness` · `npm run outstanding` | the same, measured rather than asserted |

**Where a document and a command disagree, the command governs.** `npm run test:closure` holds every document — and the commissioning gate itself — to the register, so that a closed item cannot come back as an open one. It exists because ten of them did.

**Running it for development?** `npm run values:template ~/dgo-values.txt` writes a values file carrying all **25** endpoint keys — 18 internal, 7 portal, across 20 distinct workflows — with every trigger URL complete except its `sig=` signature, taken from `docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json`. Paste each flow's signature in with `npm run values:sign`, then `npm run setup -- --values ~/dgo-values.txt --force`. `npm run verify:endpoints` then proves that wiring against the live flows.

`npm run recover` is **retired and refuses to run** (exit 2). It scraped URLs from `docs/reference/foundational/`, which describes a superseded estate: all 25 keys now point at different workflows, so a config built from it looks complete and answers 401 on every call. The single authority is `docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json`; the single commissioning path is **[`docs/deployment/RUNBOOK.md`](docs/deployment/RUNBOOK.md)**.

---

## What's in this repo

### Applications

Eight things in this tree can be started, each on a port of its own. The table is declared
once, in `scripts/platforms.config.mjs`, and generated here by `npm run platforms:readme`; `npm run platforms` prints it, and
`tests/platforms.test.mjs` fails the build if it stops matching the tree.

<!-- platforms:begin (generated: npm run platforms:readme) -->
| Platform | Audience | Entry point | Run | Port | Needs |
|---|---|---|---|---|---|
| **Folio Workspace** | Staff | `index.html` | `npm run start:runtime` | 8080 | Node 22+ |
| **NITDA Document Portal** | Public | `document-portal/index.html` | `npm run start:portal` | 8081 | Node 22+ |
| **DGO Correspondence Mailer** | Staff | `mailer/index.html` | `npm run start:mailer` | 8083 | Node 22+ |
| **Folio Vault** | Engineering | `tools/flow-capsule/app/flowcapsule.py` | `npm run start:capsule` | 8787 | Python 3.11+ |
| **Folio Central Administration Centre** | Administration | `tools/admin-centre/server.py` | `npm run start:centre` | 8844 | Python 3.9+ |
<!-- platforms:end -->

**Every platform above ships in one release:** `releases/folio-platform-suite-1.0.3.zip` (`npm run platform:release`). Unpack it and run `./start.sh` (or `start.cmd`) to start all five with nothing else installed but Node.js 22+ and Python 3.11+. It carries no signed trigger URL. `./folio` inside it administers the whole suite: live URL values, wiring, start and stop, live checks, the Mailer, Centre and Vault set-up, backups and autostart. See [`scripts/platform-release/README.md`](scripts/platform-release/README.md).

- **Folio Workspace** (formerly DGO R11.6 Runtime) — Obsidian Harmonized Design System runtime: platform shell with routing, client-side RBAC, state, module boundaries, accessibility and theming. 31 routes, including the [Admin Suite](docs/reference/ADMIN_SUITE.md) — one interface for the endpoint estate, the flow catalogue, live checks, commissioning, the capsule registry, people and platform control.
- **NITDA Document Portal** — Public document submission and tracking portal (PWA — service worker, manifest, offline). It gets an origin of its own because its service worker takes the scope it is served at, and a subpath is not the shape it deploys in.
- **Folio Estate Console** (formerly Admin Console) — Part of the Administration Centre since 2026-10-20 (Reference → Estate Console), no longer a platform of its own. A single self-contained file over the endpoint estate and the flow catalogue, which also opens straight from disk. `npm run console` rebuilds it from the endpoint register.
- **DGO Correspondence Mailer** — A single-page app for sending personalised official letters from the DGO to government institutions: one tailored email per addressee, each with its own signed letter attached, plus common enclosures. Published once beside the platform, as one file (`https://folio-platform.page.gd/mailer.html`) and used from any device: operators sign in with a code mailed to them, and mailings, files, reports, directory and templates live in SharePoint. Its only back end is seven Power Automate flows, every one started by an HTTP request (sign-in, send, shared data, log, directory, templates, provisioning). The directory is seeded from the *Nigerian Government Letter Mailing Guide*. Delivered as `releases/dgo-correspondence-mailer-2.1.5.zip` (`npm run mailer:package`), whose automatic setup (`setup.cmd`) signs in once, creates or upgrades the flows, provisions SharePoint, and writes the mailer ready to publish. See [`mailer/README.md`](mailer/README.md).
- **Folio Vault** (formerly Flow Capsule Registry) — A SQLite-backed service holding each signed flow URL as an alias it never returns. An API, not a page. See [`tools/flow-capsule/README.md`](tools/flow-capsule/README.md). Optional for the Workspace; required for the Portal before public launch — see [`docs/architecture/VAULT_ADOPTION.md`](docs/architecture/VAULT_ADOPTION.md).
- **Folio Central Administration Centre** — The governed control plane over the four platforms above, and the one place for the tools it absorbed on 2026-10-20: the Estate Console (a hosted section), Test a flow (in place of the Flow Workbench, retired 2026-10-22) and the Portfolio (in place of the Platform Hub, retired 2026-10-22). It probes each one on its loopback port and turns what it sees into health, alerts and recoveries; holds alerts, incidents and maker–checker changes with full lifecycles; provisions the 32-endpoint estate from the registers and reconciles against them; signs in as the flow owner (device code, Microsoft's public apps, user-scoped paths only — no tenant administrator) to read every governed flow's live state and run history and to turn flows on or off, resubmit and cancel runs; verifies flow aliases through Vault without seeing a signed URL; issues role-scoped operator tokens; and writes every privileged action to a SHA-256 hash chain it can verify and export. Loopback only, bearer-authenticated, standard library only. See [`tools/admin-centre/README.md`](tools/admin-centre/README.md) and the documentation suite in [`docs/admin-centre/`](docs/admin-centre/README.md).

The three browser platforms are zero-build: no bundler, no transpilation, no server-side rendering. They need a real HTTP server (not `file://`) because browsers block ES-module imports across origins. The two Python platforms are standard library only — nothing to install.

### Supporting material

| Path | Contents |
|---|---|
| `docs/reference/ADMIN_SUITE.md` | What the Admin Suite is, which tools it merged, and the five rules it holds itself to. |
| `docs/folio-Master-Flows-and-Endpoints/reference/HEALTH_CONTRACT.md` | The non-destructive health contract and the identity handshake a flow must implement to be checkable. |
| `docs/reference/` | **Reference material of record.** The BRD/FRD hybrid, the platform architecture pack, the DGCEO data model, the SharePoint provisioning specification (10 lists, 97 fields), the flow trigger contracts, and the operations manifest with its signed URLs redacted. Extracted from `ECM_DOCS_DEV.zip`, which was removed from the tree — it carried signed Power Automate trigger URLs for 25 workflows and its irreplaceable content is now readable and diffable. The archive remains in git history. |

---

## Run it

### Option A — in the browser, nothing installed (recommended)

On GitHub: **Code → Codespaces → Create codespace on main**.

`.devcontainer/devcontainer.json` runs `npm install && npm run setup` on create and
`npm start` on every attach. When port 8080 forwards, the platform opens. No terminal,
no Node, no local clone — works from a tablet or phone.

Every platform's port is forwarded, so `npm run start:all` in the codespace terminal brings
up all five platforms (the Workspace and the four others) and each appears in the Ports panel under its own name.

**It opens in demo mode.** `npm run setup` scaffolds the two config files with no endpoint
URLs in them, which is deliberate for a fresh codespace: the platform boots, renders and
transmits nothing. To point it at the live flow estate, follow
[`docs/deployment/RUNBOOK.md`](docs/deployment/RUNBOOK.md) in the
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

To wire real endpoints, follow `docs/deployment/RUNBOOK.md` to regenerate each
trigger, then pass them in. The browser calls each Power Automate flow directly, so those
URLs *are* the credential: both target files are git-ignored, and every flow behind them
must authenticate and authorise its own callers.

```bash
npm run values:template ~/dgo-values.txt         # all 25 keys, every URL bar its signature
npm run values:sign -- ~/dgo-values.txt FETCH_ACTIVITIES   # paste one signature (repeat per flow)
npm run check:values -- ~/dgo-values.txt         # confirm all 25 filled, prints no URLs
npm run setup -- --values ~/dgo-values.txt --force   # wire your own endpoints
npm run verify:endpoints                         # call each flow and report what came back
npm run commission                               # readiness gate for live usage
npm start                                        # serve
```

### One command instead of four

`npm run wire` finds your values wherever they are, writes both configs, and checks both
surfaces — in that order, so the order is not something you have to remember:

```bash
npm run wire -- --dry    # what it found and what it would write; changes nothing
npm run wire             # write both configs, then check both
```

It refuses, rather than writing, when it finds no values at all. That case matters: the
four-command path above includes `npm run setup --force`, and `--force` with nothing to
supply rewrites both configs from nothing — so a working tree that *was* wired quietly
becomes one that is not, and still exits 0. `npm run wire` cannot reach `--force` with
nothing to write.

It replaces none of the tools above; it runs them. Every verdict it prints comes from
`npm run check:config`, and like that command it never prints a URL.

### In a Codespace: one secret, set once

A Codespace has no home directory to put a values file in before the container starts, so
the values have to arrive through the environment. Doing that one key at a time means
creating 25 GitHub secrets by hand. Instead, put the **whole values file in a single
secret** called `DGO_VALUES`:

1. On your own machine, build and fill the values file as above, ending with
   `npm run check:values -- ~/dgo-values.txt`.
2. Paste its entire contents as a new repository secret named `DGO_VALUES` at
   <https://github.com/settings/codespaces>.
3. Create the codespace.

That is the whole procedure. `postCreateCommand` runs `npm run setup`, which reads
`DGO_VALUES`, so the codespace comes up **already wired** — no command typed. Run
`npm run wire -- --dry` to confirm which state you are in, or `npm run wire` to re-wire
after changing the secret (a running codespace needs a rebuild to see a new secret value).

The format is exactly what `npm run values:template` writes, so `npm run check:values`
validates it before it ever becomes a secret. Per-key `DGO_ENDPOINT_<KEY>` variables still
work and are still read; the single secret is an addition, not a replacement.

**Before you do this, decide whether you should.** A signature is a bearer credential, and
a Codespace is a remote machine you do not control — `config.local.js` lands on its disk.
Codespaces secrets are encrypted at rest and scoped to you and this repository, which is a
different proposition from pasting a signature into a chat or a ticket, but it is not the
same as keeping it on your workstation. `docs/deployment/RUNBOOK.md` §0.2
sets out the posture; if yours is *signatures never leave the workstation*, use a local
clone and the values file.

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
[`docs/deployment/RUNBOOK.md`](docs/deployment/RUNBOOK.md).

Authentication stays **inert** for local testing: no sign-in, no token, identity from the
local profile. Exactly as the pilot has always behaved. Turning it on is a deploy-time
decision — see [`docs/deployment/RUNBOOK.md`](docs/deployment/RUNBOOK.md).

Then open:

- Root runtime — <http://localhost:8080/>
- Document portal — <http://localhost:8080/document-portal/>

### Option C — one platform at a time

`npm start` serves the checkout root, which puts the runtime at `/` and the portal at a
subpath. To run any platform on an origin of its own:

```bash
npm run platforms          # what can be run, and where each one answers
npm run start:runtime      # http://localhost:8080/
npm run start:portal       # http://localhost:8081/
npm run start:mailer       # http://localhost:8083/
npm run start:capsule      # http://localhost:8787/health      needs Python 3.11+
npm run start:centre       # http://localhost:8844/            needs Python 3.9+
npm run start:all          # all five at once, each on its own port
npm run start:public       # group: the Document Portal
npm run start:staff        # group: Workspace, Mailer
npm run start:control      # group: Vault, Admin Centre (loopback only)
```

Each command waits for its platform to answer before reporting it ready, and Ctrl-C stops
everything it started. A port that is already taken is named as such before anything is
started, rather than left to fail in the background — which is how the Python platforms
used to report a port clash: as a traceback, after the launcher had already said ready.

`npm run start:all` starts what it can and reports what it could not. With no Python on
`PATH` the three browser platforms still come up and the two Python
platforms (Vault, Administration Centre) are listed as skipped;
set `DGO_PYTHON` if your interpreter is not `python3` or `python`.

Everything binds loopback. The Capsule holds signed flow URLs and
writes its bootstrap tokens to its data directory on first start. `npm run start:capsule`
puts that directory under the system temp directory rather than in the checkout, for the
same reason `.gitignore` names `config.local.js`; `npm run start:centre` does the same with the
Centre's database and bootstrap token, and points the Centre at the Capsule's bootstrap
credentials so its Vault view works without anyone copying a token. `--host` will bind something other than
loopback and warns when it does.

Two older commands are unchanged and still worth having. `npm run serve:portal` serves the
portal alone on port 8080 through `http-server`:

```bash
npm run serve:portal
```

And `npm run dev` serves the runtime and the portal on **one** origin with every endpoint
they call answered from memory — the mode that removes CORS from the picture entirely while
you work against stub endpoints. Neither of those is what the `start:` commands above do, and all
three are kept.

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
│   ├── admin-centre/                   Central Administration Centre (Portfolio, Estate Console, Test a flow)
│   └── admin-console.html              Standalone endpoint console
├── .github/workflows/ci.yml            CI
├── docs/                               Everything written down — see docs/README.md
│   ├── architecture/                   Target architecture + AUTHENTICATION_CONTRACT.md
│   ├── deployment/                     RUNBOOK.md, PLAN.md, LOCAL-DEV.md
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
