/**
 * Tasks (essentials plan UX-302), at My Work's address since the cut-over (UX-401).
 *
 * One list with its eight views, each counted, and a row opens its record page; closing the page returns to the list
 * with what was done shown on the row.
 */
import { test, expect } from '@playwright/test';

const writes = [];
async function boot(page) {
  writes.length = 0;
  await page.route('**/config/config.local.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `window.DGO_CONFIG = ${JSON.stringify({ endpoints: { DYNAMIC_ACTIONS: 'https://flows.test.invalid/dynamic-actions' } })};` }));
  await page.route('https://flows.test.invalid/**', (route) => {
    writes.push(JSON.parse(route.request().postData() || '{}'));
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { operation: 'update-task', ok: true } }) });
  });
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await page.evaluate(async () => {
    const { State } = await import('/core/state.js');
    const me = State.get().profile.email;
    const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
    State.patch({
      activities: [{ id: '501', sourceId: 501, referenceId: 'REF-501', title: 'Request for a data-sharing agreement', status: 'Treated', created: day(-10) }],
      tracking: [
        { id: '601', sourceId: 601, referenceId: 'REF-501', title: 'Draft the agreement', assignedTo: me, status: 'Not Started', acknowledged: true, due: day(10), created: day(-9) },
        { id: '602', referenceId: 'REF-502', title: 'Overdue review', assignedTo: 'other@nitda.gov.ng', status: 'Not Started', due: day(-2), created: day(-9) },
        { id: '603', referenceId: 'REF-503', title: 'Due within the day', assignedTo: me, status: 'In Progress', acknowledged: true, due: day(0.5), created: day(-9) },
      ],
    });
  });
}
const go = (page, route) => page.evaluate((r) => { location.hash = '#/' + r; }, route);

test('one list, eight counted views, a row opens its record', async ({ page }) => {
  await boot(page);
  await go(page, 'orchestrator');
  await expect(page.locator('[data-outlet] h1').first()).toHaveText('Tasks');
  const views = page.locator('[data-task-view]');
  await expect(views).toHaveCount(8);
  await expect(views).toHaveText(['Mine (2)', 'Team (3)', 'Not yet acknowledged (1)', 'Overdue (1)', 'At risk (1)', 'Escalated (0)', 'Awaiting decision (0)', 'Ready to close (0)']);
  await page.click('[data-task-view="overdue"]');
  await expect(page.locator('[data-task-row]')).toHaveCount(1);
  await expect(page.locator('[data-task-row]')).toContainText('Overdue review');
  await page.click('[data-task-view="team"]');
  await expect(page.locator('[data-task-row]')).toHaveCount(3);
  await expect(page.locator('[data-task-row]').first()).toContainText('Overdue review');

  /* The row opens the record page, which is where the work is done. */
  await page.locator('[data-open-record="601"]').click();
  const rp = page.locator('[data-record-page]');
  await expect(rp.locator('h1')).toHaveText('Request for a data-sharing agreement');
  await rp.locator('[data-record-act="start"]').click();
  for (let i = 0; i < 3; i++) { const yes = page.locator('[data-dialog] [data-yes]').first(); if (!(await yes.count())) break; await yes.click(); await page.waitForTimeout(150); }
  await expect.poll(() => writes.some((w) => (w.operation || w.payload?.operation) === 'update-task'), { timeout: 10_000 }).toBe(true);
  await page.keyboard.press('Escape');
  await expect(rp).toHaveCount(0);
  await expect(page.locator('[data-task-row="601"]')).toContainText('In Progress');
  await expect(page.locator('[data-open-record="601"]')).toBeFocused();
});
