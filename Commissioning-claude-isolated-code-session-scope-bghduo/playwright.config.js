import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Playwright's default testMatch globs **/*.test.* as well as **/*.spec.*, which would
  // pick up the plain-Node suites in tests/ (auth-posture.test.mjs), import them, and run
  // their top-level code — including process.exit(), which silently truncates the smoke
  // run. Restrict Playwright to .spec.js so the two kinds of test cannot collide.
  testMatch: '**/*.spec.js',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'never' }], ['line']],
  use: {
    headless: true,
    /* The deployed hostname when one is given, otherwise the local server below.
       Deployment is exactly where config.local.js presence differs, so a suite that can only
       ever run locally cannot answer whether the DEPLOYED build boots — which is the question
       docs/deployment/PORTAL-TENANT-RUNBOOK.md §8 asks before declaring the estate live. */
    baseURL: process.env.DGO_BASE_URL || 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use an already-installed Chrome/Chromium when one is pointed at, so the suite
        // runs in sandboxes and images that ship a browser but cannot download
        // Playwright's pinned build. CI leaves these unset and uses the pinned browser
        // installed by `npx playwright install --with-deps chromium`.
        launchOptions: {
          ...(process.env.DGO_CHROME_PATH ||
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
          process.env.CHROME_PATH
            ? {
                executablePath:
                  process.env.DGO_CHROME_PATH ||
                  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
                  process.env.CHROME_PATH,
              }
            : {}),
          ...(process.env.DGO_CHROME_NO_SANDBOX ? { args: ['--no-sandbox'] } : {}),
        },
      },
    },
  ],
  /* No local server when a remote base URL is given: starting one would serve this working
     tree at a port nothing is pointed at, and a green run would say nothing about the host
     under test. Undefined rather than false — Playwright treats the key's absence as "do not
     manage a server", which is precisely the intent. */
  webServer: process.env.DGO_BASE_URL ? undefined : {
    command: 'npm run start',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
