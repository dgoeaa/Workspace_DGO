/**
 * Header search opens the record (essentials plan UX-304).
 *
 * The header's search box finds records, not only workspaces: by reference, sender or subject, grouped as documents and
 * tasks, with a message not yet registered listed as one. A result opens on the record page; a message opens on the
 * Inbox, where its row registers it.
 */
import { test, expect } from '@playwright/test';

const REF = 'NITDA-2026-00501';

async function boot(page) {
  await page.route('**/config/config.local.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.DGO_CONFIG = {};' }));
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await page.evaluate(async (ref) => {
    const { State } = await import('/core/state.js');
    State.patch({
      activities: [{ id: '501', sourceId: 501, referenceId: ref, title: 'Request for a data-sharing agreement', sender: 'Federal Ministry of Works', status: 'Treated', created: '2026-10-10T09:00:00Z' }],
      tracking: [{ id: '601', sourceId: 601, referenceId: ref, title: 'Draft the agreement', assignedTo: 'dgsregistry@nitda.gov.ng', created: '2026-10-11T09:00:00Z', status: 'Not Started', due: '2026-10-30' }],
      emails: [{ id: 'm-9', subject: 'Invitation to the summit', fromAddress: 'events@example.org', fromName: 'Events', receivedDateTime: '2026-10-12T09:00:00Z' }],
    });
  }, REF);
}
const search = async (page, q) => {
  await page.click('[data-palette]');
  const input = page.locator('[data-command-input]');
  await expect(input).toBeFocused();
  await input.fill(q);
};

test('finds a record by sender and opens it on its record page', async ({ page }) => {
  await boot(page);
  await search(page, 'ministry of works');
  const docs = page.locator('[data-search-group="documents"] [data-search-hit]');
  await expect(docs).toHaveCount(1);
  await expect(docs.first()).toContainText('Request for a data-sharing agreement');
  await expect(page.locator('[data-search-group="tasks"] [data-search-hit]')).toHaveCount(1);
  await docs.first().click();
  await expect(page.locator('[data-command-palette]')).toBeHidden();
  await expect(page.locator('[data-record-page] h1')).toHaveText('Request for a data-sharing agreement');

  /* Enter opens the first result: a reference finds its document first. */
  await page.keyboard.press('Escape');
  await search(page, REF);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-record-page] h1')).toHaveText('Request for a data-sharing agreement');
});

test('a task opens on its record; a message opens on the Inbox to be registered', async ({ page }) => {
  await boot(page);
  await search(page, 'draft the agreement');
  await page.locator('[data-search-group="tasks"] [data-search-hit]').first().click();
  await expect(page.locator('[data-record-page] h1')).toHaveText('Request for a data-sharing agreement');
  await page.keyboard.press('Escape');

  await search(page, 'summit');
  const msg = page.locator('[data-search-group="messages"] [data-search-hit]');
  await expect(msg).toHaveCount(1);
  await msg.click();
  await expect(page).toHaveURL(/#\/correspondence/);
  await expect(page.locator('[data-open-message="m-9"]')).toBeVisible();
});

test('a query that matches nothing says so, and workspaces are still offered', async ({ page }) => {
  await boot(page);
  await search(page, 'zzqx-nothing');
  await expect(page.locator('.dgo-cmdk__empty')).toContainText('No record or workspace matches');
  await page.locator('[data-command-input]').fill('tasks');
  await expect(page.locator('[data-open-route]').first()).toBeVisible();
});
