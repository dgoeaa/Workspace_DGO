/**
 * The Inbox and the Overview (essentials plan UX-301, UX-303), at Intake's and the Command Center's addresses since the
 * cut-over (UX-401).
 *
 * Inbox: one list over the four intakes with counted filters; a record's row opens its record page; a message's row
 * registers it (Intake's own write) and opens the record; ticking rows offers Assign selected (Bulk assignment's form,
 * with their IDs); Register a document offers Counter / scan and Internal; Physical files filters to records with a file;
 * a Portal record's page sets its public status.
 * Overview: each figure opens the list it counts; Reports is there with its two named reports and one email action.
 */
import { test, expect } from '@playwright/test';

const writes = [];
async function boot(page) {
  writes.length = 0;
  await page.route('**/config/config.local.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `window.DGO_CONFIG = ${JSON.stringify({ endpoints: { DYNAMIC_ACTIONS: 'https://flows.test.invalid/dynamic-actions' } })};` }));
  await page.route('https://flows.test.invalid/**', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    writes.push(body);
    const op = body.operation || body.payload?.operation;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: op === 'register' ? { referenceId: 'NITDA-REG-0900', entityKey: 'REC-900' } : { operation: op, ok: true } }) });
  });
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await page.evaluate(async () => {
    const { State } = await import('/core/state.js');
    const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
    State.patch({
      correspondence: [
        { id: 'P-1', referenceId: 'P-1', subject: 'Portal request for a clearance', channel: 'portal', entryPoint: 'public-portal', status: 'Received', receivedAt: day(-1), category: 'Request', senderEmail: 'citizen@example.org' },
        { id: 'S-1', referenceId: 'S-1', subject: 'Letter handed in at the counter', channel: 'scan', status: 'In Treatment', receivedAt: day(-2), category: 'Letter' },
      ],
      activities: [
        { id: '501', referenceId: 'S-1', title: 'Letter handed in at the counter', status: 'Not Treated' },
        { id: '502', referenceId: 'P-1', title: 'Portal request for a clearance', status: 'Not Treated' },
      ],
      portalRegister: [{ id: 'P-1', referenceId: 'P-1', subject: 'Portal request for a clearance', channel: 'portal', entryPoint: 'public-portal', status: 'received', statusLabel: 'Received', senderEmail: 'citizen@example.org' }],
      emails: [{ id: 'm-7', subject: 'Invitation to the summit', fromAddress: 'events@example.org', fromName: 'Events', receivedDateTime: day(0) }],
      tracking: [{ id: '601', sourceId: 601, referenceId: 'S-1', title: 'Reply to the letter', assignedTo: 'other@nitda.gov.ng', status: 'In Progress', acknowledged: true, due: day(-1) }],
      registryFiles: [{ id: 'f1', correspondenceId: 'S-1', referenceId: 'S-1', registryNumber: 'NITDA/REG/0042', currentHolder: 'Registry', status: 'Open' }],
    });
  });
}
const go = (page, route) => page.evaluate((r) => { location.hash = '#/' + r; }, route);
const confirmAll = async (page) => { for (let i = 0; i < 4; i++) { const yes = page.locator('[data-dialog] [data-yes]').first(); if (!(await yes.count())) return; await yes.click(); await page.waitForTimeout(150); } };

test('Inbox: one list, counted filters, rows open records, a message registers', async ({ page }) => {
  await boot(page);
  await go(page, 'correspondence');
  await expect(page.locator('[data-outlet] h1').first()).toHaveText('Inbox');
  const rows = page.locator('[data-inbox-row]');
  await expect(rows).toHaveCount(3);
  await expect(page.locator('[data-inbox-status] option[value="open"]')).toHaveText('Open (3)');
  await expect(page.locator('[data-inbox-status] option[value="unassigned"]')).toHaveText('Unassigned (1)');
  await expect(page.locator('[data-inbox-row] button, [data-inbox-row] a').filter({ hasText: /Triage|Assign|Archive|Accept/ })).toHaveCount(0);

  await page.click('[data-inbox-files]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Letter handed in at the counter');
  await expect(rows.first()).toContainText('Physical file');
  await page.click('[data-inbox-files]');

  await page.selectOption('[data-inbox-source]', 'customer-service-emails');
  await expect(rows).toHaveCount(1);
  await page.selectOption('[data-inbox-source]', 'all');

  /* A record's row opens its record page. */
  await page.locator('[data-open-record="P-1"]').click();
  const rp = page.locator('[data-record-page]');
  await expect(rp.locator('h1')).toHaveText('Portal request for a clearance');
  await expect(rp.locator('#rp-portal')).toBeVisible();
  await expect(rp.locator('[data-portal-form] select[name="status"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(rp).toHaveCount(0);
  await expect(page.locator('[data-open-record="P-1"]')).toBeFocused();

  /* A message's row registers it with Intake's own write, then opens the record. */
  await page.locator('[data-open-message="m-7"]').click();
  await page.waitForSelector('[data-dialog="confirm"]');
  await confirmAll(page);
  await expect.poll(() => writes.map((w) => w.operation || w.payload?.operation).join(','), { timeout: 10_000 }).toContain('register');
  await expect(rp.locator('h1')).toHaveText('Invitation to the summit');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-open-message]')).toHaveCount(0);
  await expect(page.locator('[data-open-record="NITDA-REG-0900"]')).toBeVisible();
});

test('Inbox: Assign selected and Register a document mount the forms that do the writing', async ({ page }) => {
  await boot(page);
  await go(page, 'correspondence');
  await page.check('[data-inbox-pick="501"]');
  await page.check('[data-inbox-pick="502"]');
  await expect(page.locator('[data-inbox-selected-count]')).toHaveText('2 selected');
  await page.click('[data-inbox-assign]');
  await expect(page.locator('#inbox-assign')).toHaveText('Assign selected (2)');
  await expect(page.locator('[data-inbox-assign-host] textarea[name="ids"]')).toHaveValue('501\n502');
  await page.click('[data-inbox-clear-selection]');
  await expect(page.locator('#inbox-assign')).toHaveCount(0);

  await page.click('[data-inbox-register]');
  await expect(page.locator('[data-inbox-register-as]')).toHaveCount(2);
  await expect(page.locator('[data-inbox-register-host] [data-files]')).toBeAttached();
  await page.check('[data-inbox-register-as][value="internal-origination"]');
  await expect(page.locator('[data-inbox-register-host] [data-create-form]')).toBeVisible();
});

test('Overview: each figure opens the list it counts; Reports is a section of it', async ({ page }) => {
  await boot(page);
  await go(page, 'home');
  await expect(page.locator('[data-outlet] h1').first()).toHaveText('Overview');
  await expect(page.locator('[data-figure="overdue"] .dgo-metric__value')).toHaveText('1');
  await expect(page.locator('[data-figure="unassigned"] .dgo-metric__value')).toHaveText('1');
  await expect(page.locator('[data-intake]')).toHaveCount(4);
  await expect(page.locator('[data-attention-row="601"]')).toContainText('Overdue');
  await expect(page.locator('[data-overview-reports] [data-report]')).toHaveText(['Summary', 'Full list']);
  await expect(page.locator('[data-overview-reports] [data-email]')).toHaveCount(1);
  await expect(page.locator('[data-export]')).toHaveCount(1);

  await page.click('[data-figure="overdue"]');
  await expect(page).toHaveURL(/#\/orchestrator/);
  await expect(page.locator('[data-task-view="overdue"]')).toHaveClass(/active/);
  await expect(page.locator('[data-task-row]')).toHaveCount(1);

  await go(page, 'home');
  await page.click('[data-figure="unassigned"]');
  await expect(page).toHaveURL(/#\/correspondence/);
  await expect(page.locator('[data-inbox-status]')).toHaveValue('unassigned');
  await expect(page.locator('[data-inbox-row]')).toHaveCount(1);
});
