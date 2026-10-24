/**
 * Portal submissions (DECISIONS.md D1, ITEM-6): an officer sets the status a portal submitter sees, on the record's Public
 * status panel since the cut-over (essentials plan UX-401; it was Intake's Portal submissions tab).
 *
 * The rows are FETCH_ALL's Portal Registry projection (State.portalRegister); the write goes to the intake flow at the
 * SCAN_INTAKE address with X-DGO-Action: writeback (core/portal-status-service.js). The flow is intercepted here: these
 * check the wiring a person uses, not the flow (tests/identification-phase3.test.mjs simulates that).
 */
import { test, expect } from '@playwright/test';

const FLOW = 'https://defaulttest.a1.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/88401ce1f44148539c0da53c9491f8e6/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=' + 'Abcdefghijklmnopqrstuvwxyz0123456789_-ABCD'.slice(0, 43);
const ROWS = [
  { id: 'NITDA-2026-00018', referenceId: 'NITDA-2026-00018', subject: 'Bridging the digital divide', channel: 'Portal', status: 'received', statusLabel: '', senderEmail: 'citizen@example.org', submittedAtUtc: '2026-10-08T04:41:51Z', entryPoint: 'public-portal' },
  { id: 'NITDA-2026-00017', referenceId: 'NITDA-2026-00017', subject: 'Withdrawn request', channel: 'Portal', status: 'withdrawn', statusLabel: 'Withdrawn by the submitter', senderEmail: 'other@example.org', submittedAtUtc: '2026-10-07T10:00:00Z', entryPoint: 'public-portal' },
];

async function openRecord(page, ref) {
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await page.evaluate(async (rows) => { const { State } = await import('/core/state.js'); State.patch({ portalRegister: rows }); location.hash = '#/correspondence'; }, ROWS);
  await page.waitForSelector('[data-inbox-list]');
  await page.locator(`[data-open-record="${ref}"]`).click();
  await page.waitForSelector('[data-record-page] #rp-portal');
}

test('a Portal submission is in the Inbox, its record shows the public status, and says plainly when updates are unavailable', async ({ page }) => {
  await openRecord(page, 'NITDA-2026-00018');
  const panel = page.locator('[data-record-page] section[aria-labelledby="rp-portal"]');
  await expect(panel).toContainText('Received');
  await expect(page.getByText('has no SCAN_INTAKE address configured')).toBeVisible();
  await expect(panel.locator('[data-portal-form] button[type="submit"]')).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.locator('[data-open-record="NITDA-2026-00017"]').click();
  await expect(page.locator('[data-record-page] #rp-portal')).toBeVisible();
  await expect(page.locator('[data-record-page] [data-portal-form]')).toHaveCount(0);
  await expect(page.locator('[data-record-page] section[aria-labelledby="rp-portal"]')).toContainText('Withdrawn by the submitter');
});

test('setting a status sends the write-back to the intake flow and shows the new status', async ({ page }) => {
  await page.route('**/config/config.local.js', (route) => route.fulfill({ contentType: 'application/javascript',
    body: `window.DGO_CONFIG = Object.assign(window.DGO_CONFIG || {}, { endpoints: { SCAN_INTAKE: ${JSON.stringify(FLOW)} } });` }));
  let sent = null;
  await page.route('**/powerautomate/automations/direct/workflows/88401ce1f44148539c0da53c9491f8e6/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'PUT' } });
    sent = { method: req.method(), headers: req.headers(), body: JSON.parse(req.postData() || '{}') };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ok: true, referenceId: 'NITDA-2026-00018', data: { referenceId: 'NITDA-2026-00018', status: 'review', label: 'Under review.', updatedBy: 'dgsregistry@nitda.gov.ng' } }) });
  });
  await openRecord(page, 'NITDA-2026-00018');
  const form = page.locator('[data-record-page] [data-portal-form]');
  await expect(form.locator('button[type="submit"]')).toBeEnabled();
  await form.locator('select[name="status"]').selectOption('review');
  await form.locator('input[name="note"]').fill('Assigned to the Legal desk.');
  await form.locator('button[type="submit"]').click();
  await page.click('[data-dialog="confirm"] [data-yes]');
  await expect.poll(() => sent?.method).toBe('PUT');
  expect(sent.headers['x-dgo-action']).toBe('writeback');
  expect(sent.body).toEqual({ referenceId: 'NITDA-2026-00018', status: 'review', label: '', note: 'Assigned to the Legal desk.' });
  await expect(page.locator('[data-record-page] section[aria-labelledby="rp-portal"]')).toContainText('Under review.');
  const stored = await page.evaluate(async () => { const { State } = await import('/core/state.js'); return State.get().portalRegister.find((r) => r.referenceId === 'NITDA-2026-00018'); });
  expect(stored.status).toBe('review');
});
