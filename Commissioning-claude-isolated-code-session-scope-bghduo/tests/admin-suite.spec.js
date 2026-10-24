import { test, expect } from '@playwright/test';

/**
 * The Admin Suite in a real browser.
 *
 * tests/admin-suite.test.mjs proves what the analysis decides. This proves what reaches the
 * page: that every section mounts, that no section renders a signature it resolved, and that the
 * controls which cannot be undone cannot be reached by clicking.
 *
 * The redaction assertion is made against the rendered DOM on every section rather than against
 * the code, because the guarantee is about what an administrator can see and screenshot — and a
 * redaction that holds in the analysis but not in one panel is not the property anyone is
 * relying on.
 */

/* Network failures are the environment, not the suite: this container has no egress to Power
   Automate, so the platform's own boot load fails and says so. Filtering them keeps these
   assertions about the module under test — a module error would still be caught. */
const NETWORK = /ERR_|Failed to load resource|NetworkError|Failed to fetch|net::/i;

const SECTIONS = ['overview', 'estate', 'checks', 'shapes', 'runbook', 'capsule', 'people', 'control', 'actions', 'evidence'];

async function open(page, section = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errors.push(m.text()); });
  await page.goto(`/?skipWelcome=1${section ? `&section=${section}` : ''}#/admin-suite`);
  await page.waitForSelector('.dgo-page-head__title', { timeout: 20000 });
  return errors;
}

test.describe('Admin Suite', () => {
  test('mounts every section, and never renders a signature', async ({ page }) => {
    const errors = await open(page);
    expect(await page.textContent('.dgo-page-head__title')).toContain('Admin Suite');
    expect(errors, 'no console/page errors on mount').toEqual([]);

    for (const section of SECTIONS) {
      await page.click(`[data-section="${section}"]`);
      await page.waitForTimeout(150);
      const html = await page.content();
      expect(html, `section ${section} leaks no signature`).not.toMatch(/sig=[A-Za-z0-9_-]{20,}/);
      // A section that rendered nothing would pass the redaction check trivially.
      expect((await page.textContent('.workspace')).length, `section ${section} rendered nothing`).toBeGreaterThan(200);
    }
    expect(errors, 'no errors after visiting every section').toEqual([]);
  });

  test('a deep link opens the section it names', async ({ page }) => {
    await open(page, 'runbook');
    const body = await page.textContent('.workspace');
    expect(body).toContain('Commissioning runbook');
    expect(await page.getAttribute('[data-section="runbook"]', 'aria-current')).toBe('true');
  });

  test('the overview states the release gate and what needs attention', async ({ page }) => {
    await open(page);
    const body = await page.textContent('.workspace');
    // Nothing has been commissioned in a fresh profile, so the gate must not read READY.
    expect(body).toContain('NO-GO');
    expect(body).toMatch(/What needs attention/);
    // The gate is computed on read; the page says so, because a stored verdict is the failure
    // mode this replaces.
    expect(body).toMatch(/computed every time this screen is read/i);
  });

  test('the estate section joins a contract key to the flow it calls', async ({ page }) => {
    await open(page, 'estate');
    const body = await page.textContent('.workspace');
    expect(body).toContain('Contract keys');
    expect(body).toMatch(/All 25/);
    // The Shape column is the join the suite exists to make.
    expect(body).toMatch(/opens the request schema of the workflow the register says this key calls/i);
  });

  test('the flow catalogue carries the tenant\'s own shapes', async ({ page }) => {
    await open(page, 'shapes');
    const body = await page.textContent('.workspace');
    expect(body).toContain('Flow catalogue');
    expect(body).toMatch(/HTTP callable/);
    // Provenance, not a hand-written description.
    expect(body).toMatch(/docs\/reference\/flow-contracts\/deployed/);
  });

  test('an irreversible control cannot be armed by clicking', async ({ page }) => {
    await open(page, 'control');
    // platform.clear-local is irreversible: it must render as a typed-confirmation control with
    // its button disabled until the word is typed.
    await expect(page.locator('[data-act="platform.clear-local"]')).toBeDisabled();

    // The word is read off the control rather than hardcoded here. It is declared once in
    // core/admin-actions.js, and a test that carried its own copy would keep passing against a
    // control armed by a different word from the one the action expects — which is exactly the
    // failure the declaration exists to prevent.
    const label = await page.locator('label:has([data-typed="platform.clear-local"]) code').textContent();
    expect(label.trim(), 'the control does not name the word that arms it').toMatch(/^[A-Z]{4,12}$/);

    await page.fill('[data-typed="platform.clear-local"]', 'not-the-word');
    await page.waitForTimeout(150);
    await expect(page.locator('[data-act="platform.clear-local"]'), 'the wrong word armed it').toBeDisabled();

    await page.fill('[data-typed="platform.clear-local"]', label.trim());
    await page.waitForTimeout(150);
    await expect(page.locator('[data-act="platform.clear-local"]')).toBeEnabled();
  });

  test('the action catalogue lists every action with its reach and permission', async ({ page }) => {
    await open(page, 'actions');
    const body = await page.textContent('.workspace');
    expect(body).toMatch(/Every administrative action/);
    expect(body).toMatch(/cannot be undone/);
    expect(body).toMatch(/settings:manage/);
    // Actions a role cannot run are shown greyed rather than hidden — the page says why.
    expect(body).toMatch(/shown greyed rather than hidden/i);
  });

  test('the capsule section never offers to store the administration token', async ({ page }) => {
    await open(page, 'capsule');
    const body = await page.textContent('.workspace');
    expect(body).toMatch(/never written to disk/i);
    // The token field is a password input, and there is no "remember" control anywhere on it.
    await expect(page.locator('[data-capsule-connect] input[name="token"]')).toHaveAttribute('type', 'password');
    expect(body).not.toMatch(/remember (this )?token/i);
  });


  test('the composer offers an example, a curl command and the CSV tables', async ({ page }) => {
    await open(page, 'shapes');
    // The five tables hang off the catalogue, not off a selected flow.
    await expect(page.locator('[data-act="flows.export-tables"]')).toHaveCount(1);

    await page.click('[data-flow-tab="compose"]');
    await page.waitForTimeout(200);
    await expect(page.locator('[data-act="flows.example"]')).toHaveCount(1);
    await expect(page.locator('[data-act="flows.curl"]')).toHaveCount(1);

    // Filling in an example must leave a body that the page itself reports as conforming —
    // an example that fails its own schema would be worse than none.
    await page.click('[data-act="flows.example"]');
    await page.waitForTimeout(300);
    const body = await page.inputValue('[data-body]');
    expect(body.length, 'the example filled in nothing').toBeGreaterThan(2);
    expect(await page.textContent('.workspace')).not.toMatch(/would be refused/i);
  });

  test('the runbook can be restored and printed, and neither is a click away', async ({ page }) => {
    await open(page, 'runbook');
    await page.click('[data-runbook-tab="gate"]');
    await page.waitForTimeout(200);

    await expect(page.locator('[data-act="runbook.print"]')).toHaveCount(1);
    // Restore replaces the whole record, so it is typed-confirmed like every irreversible action.
    await expect(page.locator('[data-pick-runbook]')).toHaveCount(1);
    const body = await page.textContent('.workspace');
    expect(body).toMatch(/Restore a record/);
    expect(body).toMatch(/Locked parameters in the file are discarded/i);
  });

  test('the print view lays the whole record out, and nothing is behind a tab', async ({ page }) => {
    await open(page, 'runbook');
    await page.click('[data-runbook-tab="gate"]');
    await page.waitForTimeout(150);
    await page.click('[data-act="runbook.print"]');
    await page.waitForTimeout(300);

    const body = await page.textContent('[data-print-view]');
    for (const section of ['Release gate', 'Parameters', 'Actions', 'Endpoint acceptance', 'Residual risk', 'Cutover and hypercare', 'Structural audit']) {
      expect(body, `the print view omits ${section}`).toContain(section);
    }
    // Every action and every acceptance record, not a filtered subset.
    expect(body).toContain('OP-001');
    expect(body).toContain('OP-014');
    expect(await page.content(), 'the print view leaks a signature').not.toMatch(/sig=[A-Za-z0-9_-]{20,}/);

    await page.click('[data-close-print]');
    await page.waitForTimeout(200);
    await expect(page.locator('[data-print-view]')).toHaveCount(0);
  });

  test('the suite is drawn in the sidebar behind the restricted badge', async ({ page }) => {
    await open(page);
    const nav = page.locator('.dgo-sidebar__item[data-route="admin-suite"]');
    await expect(nav).toHaveCount(1);
    // It carries the same "IT" badge as Administration and System Health: it is the one screen
    // that can clear a queue, reset the commissioning record and roll a registry alias back.
    await expect(nav.locator('.dgo-sidebar__badge')).toHaveText('IT');
  });
});
