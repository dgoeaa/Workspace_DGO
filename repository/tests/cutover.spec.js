/**
 * The cut-over (essentials plan UX-401, UX-402).
 *
 * The sidebar is Overview, Inbox and Tasks. Every other office route still opens and lands on the place its work moved
 * to, with that list's filter set (ESSENTIALS_MAP §6.2); a link naming a record opens it on its record page.
 * Administration is in the profile menu, not the sidebar, and its Health tab carries Runtime too.
 */
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.route('**/config/config.local.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.DGO_CONFIG = {};' }));
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await page.evaluate(async () => {
    const { State } = await import('/core/state.js');
    State.patch({
      activities: [{ id: '501', sourceId: 501, referenceId: 'REF-501', title: 'Request for a data-sharing agreement', status: 'Treated', created: '2026-10-10T09:00:00Z' }],
      tracking: [{ id: '601', sourceId: 601, referenceId: 'REF-501', title: 'Draft the agreement', assignedTo: 'dgsregistry@nitda.gov.ng', status: 'Not Started', due: '2030-10-30', created: '2026-10-11T09:00:00Z' }],
    });
  });
}
const go = (page, route) => page.evaluate((r) => { location.hash = '#/' + r; }, route);

test('the sidebar is Overview, Inbox and Tasks; Administration is in the profile menu', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.dgo-sidebar__item')).toHaveText(['Overview', 'Inbox', 'Tasks']);
  await page.click('[data-persona]');
  const admin = page.locator('[data-admin-entry]');
  await expect(admin).toBeVisible();
  await admin.click();
  await expect(page).toHaveURL(/#\/admin-suite/);
  await expect(page.locator('.dgo-wtab')).toHaveText(['Suite', 'Settings', 'Health', 'Users']);
  await go(page, 'diagnostics');
  await expect(page.locator('#health-runtime')).toHaveText('Runtime');
});

const LANDS = [
  ['scan-intake', 'correspondence', '[data-inbox-register-host]'],
  ['activities', 'correspondence', '[data-inbox-status]'],
  ['single-assignment', 'correspondence', '[data-inbox-list]'],
  ['bulk-assignment', 'correspondence', '[data-inbox-list]'],
  ['registry', 'correspondence', '[data-inbox-files].active'],
  ['acknowledgment', 'orchestrator', '[data-task-view="unacknowledged"].active'],
  ['comments', 'orchestrator', '[data-task-view="mine"].active'],
  ['response-tracking', 'orchestrator', '[data-task-view="team"].active'],
  ['fasttrack', 'orchestrator', '[data-task-view="at-risk"].active'],
  ['approvals', 'orchestrator', '[data-task-view="awaiting-decision"].active'],
  ['executive', 'orchestrator', '[data-task-view="awaiting-decision"].active'],
  ['correspondence-email', 'orchestrator', '[data-task-view="ready-to-close"].active'],
  ['dispatch', 'orchestrator', '[data-task-view="ready-to-close"].active'],
  ['archive', 'orchestrator', '[data-task-view="ready-to-close"].active'],
  ['statistics', 'home', '[data-figure]'],
  ['reports', 'home', '[data-overview-reports]'],
  ['ecm-erp-charter', 'home', '[data-figure]'],
  ['briefs', 'home', '[data-figure]'],
  ['meetings', 'home', '[data-figure]'],
  ['projects', 'home', '[data-figure]'],
  ['assistant', 'home', '[data-figure]'],
  ['operator-hud', 'diagnostics', '#health-runtime'],
  ['endpoint-console', 'admin-suite', '.dgo-wtab'],
];
test('every old route lands on the place its work moved to', async ({ page }) => {
  await boot(page);
  for (const [from, to, sel] of LANDS) {
    await go(page, 'home');
    await go(page, from);
    await expect(page, `${from} → ${to}`).toHaveURL(new RegExp(`#/${to}$`));
    await expect(page.locator(sel).first(), `${from} draws ${sel}`).toBeAttached();
  }
  /* Routed was the assigned records: the Inbox opens on In progress. */
  await go(page, 'activities');
  await expect(page.locator('[data-inbox-status]')).toHaveValue('in-progress');
  /* Lookup is the header search now. */
  await go(page, 'lookup');
  await expect(page).toHaveURL(/#\/correspondence$/);
  await expect(page.locator('[data-command-input]')).toBeFocused();
});

test('a link that names a task opens its record, whichever old screen it points at', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { State } = await import('/core/state.js');
    State.patch({ deepLinkContext: { taskId: '601', route: 'acknowledgment' } });
    location.hash = '#/acknowledgment';
    dispatchEvent(new Event('dgo:data-loaded'));
  });
  await expect(page).toHaveURL(/#\/orchestrator$/);
  await expect(page.locator('[data-record-page] h1')).toHaveText('Request for a data-sharing agreement');
});
