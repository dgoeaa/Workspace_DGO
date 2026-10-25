# 7 · Developer guide

> **Status:** handbook chapter, 2026-10-10. It carries steps, and owns none: flow changes are owned by [`FLOWS_UPDATE.md`](../folio-Master-Flows-and-Endpoints/deployment/FLOWS_UPDATE.md), builds by [`PACKAGING.md`](../deployment/PACKAGING.md), cutover by [`RUNBOOK.md`](../deployment/RUNBOOK.md).

For anyone changing Folio's code, configuration, flow packages or records. Read
[Architecture](02-ARCHITECTURE.md) and [Components](03-COMPONENTS.md) first.

## 7.1 Ground rules

The repository's working rules are in [`CLAUDE.md`](../../CLAUDE.md). Where `CONTRIBUTING.md` differs (it
still describes feature branches and pull requests), **`CLAUDE.md` governs**:

1. **One branch:** all work is committed and pushed to `claude/system-remediation-gaps-ahpmsy`. No other
   branch, no pull requests, never a force-push. Pull with `--rebase` before you start and before you push.
2. **Closed register items stay closed** unless new, committed evidence contradicts them.
3. **Flow and endpoint records live only in `docs/folio-Master-Flows-and-Endpoints/`.** `npm run
   test:masterflows` fails on one anywhere else. (This handbook links to them; it holds none.)
4. **Flow packages are frozen at a release.** Change them only for a defect found in the tenant or an
   owner decision, and prefer a `Flow Configuration` row to a package change.
5. **Generated files are never edited by hand.** Re-run their generator (§7.7).
6. **Secrets never enter git:** signed URLs, `config.local.js`, sign-in sessions, proofs.
   `npm run test:secrets` checks.

## 7.2 Set up

Requirements: **Node 22 or later**; Python 3.9+ only for the Workbench, Vault and Administration Centre.

```bash
git clone https://github.com/dgoeaa/ECM_DOCS_DEV.git
cd ECM_DOCS_DEV
git checkout claude/system-remediation-gaps-ahpmsy
npm ci
```

## 7.3 Run it

| Command | What you get |
| --- | --- |
| `npm run dev` | The Workspace on `http://localhost:8080/` **with a local stand-in for every service** (`scripts/dev-server.mjs`), so screens work without the tenant. Data is kept in a local file (`DGO_DEV_DATA`). |
| `DGO_DEV_AUTH=1 npm run dev` | The same, with **sign-in enforced**. The dev server accepts the fixed code `000000`. |
| `npm start` | A plain static server: the Workspace as files, with no services behind it (demo mode without `config/config.local.js`). |
| `npm run platforms` | Every surface and its port. Start one with `npm run start:<id>`: `runtime` 8080, `portal` 8081, `console` 8082, `mailer` 8083, `workbench` 8765, `capsule` 8787, `centre` 8844. |
| `npm run setup` | Scaffolds a local `config/config.local.js` (git-ignored). |

More detail: [`docs/deployment/LOCAL-DEV.md`](../deployment/LOCAL-DEV.md).

## 7.4 Check it

| Command | What it runs | When |
| --- | --- | --- |
| `npm run test:node` | The full gate: about 175 checks (imports, hygiene, references, secrets, generated-file drift, registers, packages, simulated flow runs) | Before every push. Run it **on the branch**: one check stamps the branch name. |
| `npx playwright test` | The browser suite (192 tests in 17 spec files on 2026-10-10). In a cloud session set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium`. | Before pushing any change to screens, `core/` or `shared/`. |
| `DGO_BASE_URL=https://folio-platform.page.gd npx playwright test` | The same suite against a deployed site | Commissioning (MANUAL-3) |
| `npm run test:links` | Every relative link in the docs | After changing documents |
| `npm run outstanding` | Totals the open items in every register | Before choosing work |

A gate failure names the command that fixes it. If it is a generated file, run that command; do not edit
the file by hand.

## 7.5 Change a screen

1. The route id is the file name: `modules/<route>.js` exports `mount(el)`.
2. A new route needs: an entry in `config/routes.config.js`, the import in `core/boot.js` (the `modules`
   map), a place in `config/workflow-clarity.config.js` (visible group, or hidden with the screen it is
   reached through), and a row in `config/rbac.config.js` `RoleRouteAccess` for each role that may open it.
3. Call services only through `core/data-client.js` (or `core/api.js`). Never call `fetch` for business
   data from a module.
4. Add or extend a browser test in `tests/*.spec.js`.

## 7.6 Change a flow

Flows are changed by **released packages**, not by hand in the designer.

```
edit the builder ─▶ build ─▶ simulate ─▶ release ─▶ check ─▶ apply ─▶ prove live ─▶ record
```

| Step | Command | Notes |
| --- | --- | --- |
| Edit | `scripts/build-identification-phase4.mjs` (internal flows) or `…-phase3.mjs` (Portal) | Each flow's package is built from these |
| Build | `npm run idphase4` / `npm run idphase3` | Writes `packages/identification-phase4/*.paste.json` |
| Simulate | `npm run test:idphase4` / `npm run test:idphase3` | Runs each package in a flow simulator against seeded lists |
| Release | `npm run idrelease -- --reason "…"` | Freezes every package's fingerprint in `registers/identification-release.json`. Say in your report which packages changed and why. |
| Check | `npm run flows:update` | Reads every live flow and compares it with its package. Writes nothing. |
| Apply | `npm run flows:update -- apply` | Backs up, writes, reads back. **Refuses** a package that would exceed **500 actions** or an expression longer than **8,192 characters**. Runs `config:drift` itself. |
| Prove | A live call against a test record, then remove the record | |
| Record | `npm run flows:update -- record <report>` | Files the report as evidence and updates `registers/identification-paste-ledger.json` |

Sign-in for `flows:update` and `config:*`: set `FOLIO_MS_SESSION` to a saved sign-in file. Without one,
it offers a code on a Microsoft page. Behind a proxy, set `NODE_USE_ENV_PROXY=1`. Only flows the account
owns or co-owns can be read or written.

Full procedure: [`docs/folio-Master-Flows-and-Endpoints/deployment/FLOWS_UPDATE.md`](../folio-Master-Flows-and-Endpoints/deployment/FLOWS_UPDATE.md).

## 7.7 Build and deliver the Workspace

| Step | Command |
| --- | --- |
| Has any address moved since the last delivered build? | `npm run config:drift` (reports `REBUILD SUGGESTED` if so) |
| Build the deployable files | `npm run config:rebuild -- --out <private folder> --mailer <published mailer.html>` |
| Commit the record of what was built | `git add docs/folio-Master-Flows-and-Endpoints/registers/config-build-ledger.json` |

`config:rebuild` reads every signed address live, builds and verifies the packages, and writes, outside the
repository (mode 0600):

- `FOLIO-WORKSPACE-v<version>-upload-to-site-root.zip`: upload its **contents** to the Workspace host's root,
  **including the hidden `.htaccess`**; it carries `mailer.html` when `--mailer` names it;
- `FOLIO-PORTAL-v<version>-upload-to-portal-site-root.zip`: the Portal with its files at the site root
  (`folio-portal.page.gd`); `FOLIO-PORTAL-v<version>-upload-to-site-root.zip` is the same Portal under `CG/`;
- `FOLIO-MAILER-v<version>-endpoints.config.local.js`: the Mailer's addresses.

The zips hold signed addresses: hand them over privately and delete them once deployed.

**Every package is identified** (`scripts/lib/package-identity.mjs`). One rebuild is one version,
`YYYY.MM.DD-N` (the build date and its number that day). It appears in:

| Where | What it shows |
| --- | --- |
| The zip's file name | `FOLIO-WORKSPACE-v2026.10.20-1-…zip` |
| `BUILD-ID.json` inside each site | version, package, commit, build time, `codeFingerprint` (the files without their config: the same code gives the same value in every build), `configDigest` (the config file hashed: two builds of the same code with different addresses differ here), and for the Workspace the Mailer's digest |
| The deployed site | Workspace: the account menu reads **Build v… · commit**; Portal: the foot of every page reads **Build v…** |
| `registers/config-build-ledger.json` | `version`, and per package its file name, fingerprints and file count |

To check what is deployed, compare the build the site shows with the ledger, or open `/BUILD-ID.json` on the site.

## 7.8 Add a contract key (a new service)

This touches several records. The 2026-10-08 USER_ADMIN addition needed all of these:

1. `config/endpoints.config.js`: the contract (action, method, write, timeout).
2. The flow's package, built and simulated (§7.6), and the flow created and applied.
3. `docs/folio-Master-Flows-and-Endpoints/registers/internal-flow-register.json`: a row, and a changelog entry.
4. `docs/reference/identification/identifier-catalogue.json` `contractKeyProcess`: the process it belongs
   to, with a version bump and a "what changed" note in the specification.
5. `scripts/dev/endpoints.mjs`: a stand-in for the dev server, so the browser suite can call it.
6. The notification matrix: its failure-alert row.
7. Counts pinned by tests (for example the number of contract keys) and their reasons.
8. A new build (§7.7): `config:drift` reports the new key until it is delivered.

Run `npm run test:node`; each missing record fails a named check.

## 7.9 Generated files

Never edit these by hand. If a pull conflicts in one, take either side and re-run its generator.

| File or folder | Generator |
| --- | --- |
| `docs/PLATFORM.md` | `npm run platform` |
| `docs/process/` | `npm run process:docs` |
| `docs/visual/platform-data.js` | `npm run visual` |
| `docs/deployment/outstanding-rollup.json` | `npm run outstanding` |
| Identification packages | `npm run idphase3`, `npm run idphase4` |
| E-mail bodies in packages | `npm run emailcatalogue` |
| Estate Console | `npm run console` |

The failing check always names the command.

## 7.10 Debugging a live problem

Collect evidence before changing anything:

1. **Did the request reach the flow?** Read the flow's run history (or `api.flow.microsoft.com` runs). No
   run means the browser never sent it, or the gateway refused it.
2. **What did the flow receive and answer?** The run's trigger outputs (headers, body) and each action's
   inputs and outputs, from the run record. The host `…environment.api.powerplatformusercontent.com` must be
   reachable.
3. **What did the browser record?** In the browser console:
   `(await import('/core/state.js')).State.get().runtime.lastLoad` holds the last load's outcome and message.
4. **Reproduce with the real code.** Run the deployed site's own files in Playwright, replacing only the
   flow calls with recorded replies, then repeat with real calls. One variable at a time.

A worked example of this method is in [Troubleshooting §10.2](10-TROUBLESHOOTING.md#102-data-does-not-load-after-sign-in).
