/**
 * The record page (essentials plan UX-202; the only way a record is opened since the cut-over, UX-401).
 *
 * A row of the Inbox opens it, and the page shows the document, its task and one timeline, with the actions this role
 * may take at this stage. An action sends the write its owning screen sends (here, start work: update-task) and the page moves
 * on. Escape closes it and focus goes back to where it was opened.
 */
import { test, expect } from '@playwright/test';

const REF = 'NITDA-2026-00501';
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
  await page.evaluate(async (ref) => {
    const { State } = await import('/core/state.js');
    State.patch({
      activities: [{ id: '501', sourceId: 501, referenceId: ref, title: 'Request for a data-sharing agreement', status: 'Treated', created: '2026-10-10T09:00:00Z', description: 'A ministry asks for a data-sharing agreement.' }],
      tracking: [{ id: '601', sourceId: 601, referenceId: ref, title: 'Draft the agreement', assignedTo: 'dgsregistry@nitda.gov.ng', created: '2026-10-11T09:00:00Z', status: 'Not Started', acknowledged: true, ackedAt: '2026-10-12T09:00:00Z', due: '2026-10-30' }],
      comments: [{ id: 'c1', referenceId: ref, body: 'Legal to review the draft.', author: 'Registry', ts: '2026-10-13T09:00:00Z' }],
    });
  }, REF);
}
const confirmAll = async (page) => {
  for (let i = 0; i < 4; i++) {
    const yes = page.locator('[data-dialog] [data-yes]').first();
    if (!(await yes.count())) return;
    await yes.click();
    await page.waitForTimeout(150);
  }
};
const go = (page, route) => page.evaluate((r) => { location.hash = '#/' + r; }, route);

test('the record opens whole, an action reaches the server, Escape closes it', async ({ page }) => {
  await boot(page);

  await go(page, 'correspondence');
  /* An Inbox row opens its record by reference. */
  const open = page.locator(`[data-open-record="${REF}"]`);
  await expect(open).toBeVisible();
  await open.click();

  const rp = page.locator('[data-record-page]');
  await expect(rp.locator('h1')).toHaveText('Request for a data-sharing agreement');
  await expect(rp.locator('#rp-doc')).toBeVisible();
  await expect(rp.locator('#rp-task')).toBeVisible();
  const timeline = rp.locator('.record-page__timeline li b');
  await expect(timeline).toContainText(['Assigned: Draft the agreement', 'Acknowledged', 'Minute']);

  // acknowledged and not started: Start work is offered, Mark done is not
  await expect(rp.locator('[data-record-act="start"]')).toBeVisible();
  await expect(rp.locator('[data-record-act="complete"]')).toHaveCount(0);
  await rp.locator('[data-record-act="start"]').click();
  await confirmAll(page);
  await expect.poll(() => writes.map((w) => w.operation || w.payload?.operation).join(','), { timeout: 10_000 }).toContain('update-task');
  const sent = writes.find((w) => (w.operation || w.payload?.operation) === 'update-task');
  expect((sent.payload || sent).progress).toBe('In progress');
  expect((sent.payload || sent).docId).toBe('601');
  await expect(rp.locator('[data-record-act="complete"]')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(rp).toHaveCount(0);
  await expect(open).toBeFocused();
});

test('escalate reaches the server and joins the timeline; a notification link opens the record', async ({ page }) => {
  await boot(page);

  /* A notification link lands its task in deepLinkContext; once the data has loaded, the record page opens on it. */
  await page.evaluate(async () => {
    const { State } = await import('/core/state.js');
    State.patch({ deepLinkContext: { taskId: '601', route: 'acknowledgment' } });
    dispatchEvent(new Event('dgo:data-loaded'));
  });
  const rp = page.locator('[data-record-page]');
  await expect(rp.locator('h1')).toHaveText('Request for a data-sharing agreement');

  await rp.locator('[data-record-act="escalate"]').click();
  await confirmAll(page);
  await expect.poll(() => writes.filter((w) => (w.operation || w.payload?.operation) === 'update-task').length, { timeout: 10_000 }).toBeGreaterThan(0);
  const sent = writes.find((w) => (w.operation || w.payload?.operation) === 'update-task');
  /* Urgent is sent in the task list's own vocabulary, as SLA risk's escalation sends it. */
  expect(String((sent.payload || sent).priority).toLowerCase()).toBe('critical');
  await expect(rp.locator('.record-page__timeline li b')).toContainText(['Escalated to level 1']);
});
