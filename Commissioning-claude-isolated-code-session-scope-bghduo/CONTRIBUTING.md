# Contributing to Commissioning

Thank you for contributing! This document explains the branch → PR → CI → merge workflow.

---

## Development workflow

### 1. Clone and set up

```bash
git clone https://github.com/dgoeaa/Commissioning.git
cd Commissioning
npm install
npx playwright install --with-deps chromium
```

### 2. Create a feature branch

```bash
git checkout -b your-username/short-description
```

### 3. Run the dev server locally

```bash
npm start
# Root runtime:  http://localhost:8080/
```

### 4. Make your changes

Every app here is zero-build. Edit HTML/CSS/JS and refresh the browser — no rebuild step.

### 5. Run tests before pushing

```bash
npm test              # import checker + secret ratchet + smoke suite — must pass
npm run test:links    # link / asset check
```

If your environment ships a browser but cannot download Playwright's pinned Chromium:

```bash
export DGO_CHROME_PATH=/path/to/chrome
export DGO_CHROME_NO_SANDBOX=1   # only if needed
npm run test:smoke
```

See [`tests/README.md`](tests/README.md) for what each check does and why.

**If you add a module, run `npm run test:imports` before anything else.** It resolves every relative import against disk and takes about a second. The runtime once shipped with 12 config modules that were imported but never committed; because those are *static* imports the failure happened before `core/boot.js` could run its `try/catch`, so nothing threw, nothing logged, and the app hung on its boot spinner. That check exists to make this class of failure loud.

### 6. Open a pull request

Push your branch and open a PR against `main`. `.github/workflows/ci.yml` runs automatically:

| Job | What it does |
|-----|--------------|
| `imports` | Module graph, then eight more suites and a real build of both packages — fails fast and gates the rest |
| `gate` | `npm run test:node` — every one of the 61 non-browser suites |
| `smoke` | Playwright smoke suite; uploads the report as an artifact on failure |
| `links` | Link / asset crawl of all six entry pages, localhost only |
| `secrets` | `node tests/check-secrets.mjs` — fails on a *new* SAS signature |

Every job must be green before merge. None is informational any more: the `links` crawl
stopped reaching external hosts when the last off-origin fetch was removed from both trees,
and `gate` exists because CI used to run nine suites by name while `npm test` ran sixty-one
— so fifty-two, including three that check generated artefacts are still current, ran only
where somebody remembered to type `npm test`.

---

## Code style

- No build step, no bundler, no transpilation.
- Keep ES-module imports relative (`./` or `../`). Do not use absolute paths (`/`).
- Do not add dependencies without discussion — the goal is zero runtime dependencies.
- All JS/CSS changes must leave `npm test` green.

---

## Adding tests

**Static checks first.** If a property can be verified without rendering, add it to `tests/check-imports.mjs` or a sibling script. Those run in about a second and never flake.

**If you add a route**, six things move together and every one of them is asserted: `config/routes.config.js`, `config/workflow-clarity.config.js` (visible workspace or hidden technical route), `config/rbac.config.js`, `config/platform-provisioning.config.js`, `config/module-boundaries.config.js`, and the lazy import in `core/boot.js`. Then regenerate the derived documentation — `npm run architecture && npm run visual && npm run process:docs` — and update the asserted route counts in `tests/governance.test.mjs`. Those counts are hard-coded on purpose: a route is a permanent addition to the information architecture, and a count that followed the config silently would let one be added without anyone deciding it belongs.

**If you change a generated data module** (`config/endpoint-atlas.data.js`, `config/flow-shapes.data.js`), do not edit it — regenerate it (`npm run reconcile`, `npm run flowshapes`). Both have a `--check` mode wired into `npm test` that fails if the committed file has drifted from its source.

**Browser assertions** go in `tests/smoke.spec.js`:

```js
test('my new assertion', async ({ page }) => {
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect
    .poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 })
    .toBe(true);
  // ... your assertions
});
```

Use `?skipWelcome=1` so the welcome overlay does not block the shell — both welcome layers honour it.

Gate on `window.__DGO_BOOTED__` rather than on an HTTP 200. A 200 proves the server served `index.html`; it says nothing about whether the module graph resolved. That distinction is exactly what the original failure exploited.

---

## Theming

Theme and density live on `<html>` **only**, as `data-theme` / `data-density`. Do not mirror them onto `<body>`, `<dgo-shell>` or any other element.

Every themed rule in the design system is a bare `[data-theme="…"]` selector written for `:root`. A mirror on a descendant matches that selector directly and beats the value inherited from `<html>`, which silently breaks dark and high-contrast mode for everything below it. The smoke suite asserts the mirrors stay absent.

Change the theme through `setTheme()` / `setDensity()` in `shared/design-system-adapter.js`, or by setting the attribute on `document.documentElement`.

---

## Secrets and configuration

**Never commit a Power Automate SAS URL or API key.** A SAS-signed URL is a bearer credential — possession alone authorizes invoking the flow.

Local configuration goes in `config/config.local.js`, which is git-ignored — copy `config/config.example.js` and fill it in. Because it is ignored, real URLs placed there stay local; do not `git add -f` it. Note that git-ignoring protects the repository, not the machine: F-033 records a live signature found sitting in an untracked local config, so delete these when a tree is retired.

`npm run test:secrets` fails if a new signature enters a tracked file. It does *not* fail on the files already listed in `tests/secrets-baseline.txt` — those are known, recorded in `docs/audits/CAPABILITY_ASSESSMENT_R11.6.md` (G-03), and must be **rotated in Power Automate** before removal, since deleting a file revokes nothing. The baseline may only shrink.

---

## Reporting issues

Open a GitHub Issue describing:

1. What you expected to happen.
2. What actually happened.
3. Steps to reproduce (including browser, OS, and `node --version`).
