/**
 * Email in the intake list (essentials plan UX-201), in the Inbox since the cut-over (UX-401).
 *
 * A message from the monitored mailbox is a row of the Inbox's one list, marked Not registered, under the Email source.
 * Opening it registers it (the register write, Dynamic Actions), and the row becomes the registered record, with its
 * reference, in the same list. There is no separate Emails view, and the Source filter is the four intakes.
 */
import { test, expect } from '@playwright/test';

const writes = [];
const EMAIL = { id: 'AAMkAGI2-UX201', subject: 'Request for a data-protection briefing', fromAddress: 'dpo@ministry.gov.ng', fromName: 'Ministry DPO', receivedDateTime: '2026-10-21T08:15:00Z', bodyPreview: 'We request a briefing on the new guidelines.', hasAttachments: true, importance: 'normal', internetMessageId: '<ux201@ministry.gov.ng>' };

async function boot(page) {
  writes.length = 0;
  await page.route('**/config/config.local.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `window.DGO_CONFIG = ${JSON.stringify({ endpoints: { DYNAMIC_ACTIONS: 'https://flows.test.invalid/dynamic-actions' } })};` }));
  await page.route('https://flows.test.invalid/**', (route) => {
    writes.push(JSON.parse(route.request().postData() || '{}'));
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { operation: 'register', referenceId: 'NITDA-2026-00777', entityKey: '00000777-0000-4000-8000-000000000000' } }) });
  });
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await page.evaluate(async (email) => {
    const { State } = await import('/core/state.js');
    const { UIState } = await import('/core/ui-state.js');
    UIState.set('inbox', { source: 'all', status: 'open', category: '', files: false, q: '', panel: '', selected: [] });
    State.patch({ emails: [email], activities: [{ id: '901', sourceId: 901, referenceId: 'NITDA-2026-00901', title: 'Letter handed in at the counter', status: 'Not Treated', created: '2026-10-20T09:00:00Z', channel: 'Document' }] });
    location.hash = '#/correspondence';
  }, EMAIL);
  await page.waitForSelector('[data-inbox-list]');
}
const confirmAll = async (page) => {
  for (let i = 0; i < 4; i++) {
    const yes = page.locator('[data-dialog] [data-yes]').first();
    if (!(await yes.count())) return;
    await yes.click();
    await page.waitForTimeout(150);
  }
};
const row = (page) => page.locator(`[data-inbox-row="email:${EMAIL.id}"]`);

test('a message is a row of the intake list, under the Email source, marked Not registered', async ({ page }) => {
  await boot(page);
  await expect(row(page)).toBeVisible();
  await expect(row(page)).toContainText('Not registered');
  await expect(page.locator('[data-emails]')).toHaveCount(0);

  const options = await page.locator('[data-inbox-source] option').allTextContents();
  expect(options.map((o) => o.replace(/ \(\d+\)$/, ''))).toEqual(['All', 'Portal', 'Email', 'Counter / scan', 'Internal']);
  await page.selectOption('[data-inbox-source]', 'customer-service-emails');
  await expect(row(page)).toBeVisible();
  await expect(page.locator('[data-inbox-row="NITDA-2026-00901"]')).toHaveCount(0);
  await page.selectOption('[data-inbox-source]', 'physical-scanned-documents');
  await expect(row(page)).toHaveCount(0);
  await expect(page.locator('[data-inbox-row="NITDA-2026-00901"]')).toBeVisible();
});

test('opening it registers it; once registered it is the record, with its reference, in the same list', async ({ page }) => {
  await boot(page);
  await row(page).locator(`[data-open-message="${EMAIL.id}"]`).click();
  await page.waitForSelector('[data-dialog="confirm"]');
  await confirmAll(page);

  const op = (w) => w.operation || w.payload?.operation;
  await expect.poll(() => writes.map(op).join(',')).toContain('register');
  const found = writes.find((w) => op(w) === 'register'), sent = found.payload || found;
  expect(sent.channel).toBe('email');
  expect(sent.subject).toBe(EMAIL.subject);
  expect(sent.senderEmail).toBe(EMAIL.fromAddress);

  const rp = page.locator('[data-record-page]');
  await expect(rp.locator('h1')).toHaveText(EMAIL.subject);
  await expect(rp.locator('[data-record-act="assign"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row(page)).toHaveCount(0);
  await expect(page.locator('[data-inbox-row="NITDA-2026-00777"]')).toContainText(EMAIL.subject);
});
