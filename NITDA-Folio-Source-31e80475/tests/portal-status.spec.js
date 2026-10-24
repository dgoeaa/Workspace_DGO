/**
 * Portal submissions in Intake & Assignment (DECISIONS.md D1, ITEM-6): an officer sets the status a portal submitter sees.
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

async function openPortalTab(page) {
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await page.evaluate(async (rows) => { const { State } = await import('/core/state.js'); State.patch({ portalRegister: rows }); location.hash = '#/correspondence'; }, ROWS);
  await page.waitForSelector('[data-outlet] .route-stage .workspace');
  await page.click('[data-portal]');
  await page.waitForSelector('[data-portal-row]');
}

test('the Portal submissions tab lists the register rows and says plainly when updates are unavailable', async ({ page }) => {
  await openPortalTab(page);
  await expect(page.locator('[data-portal-row]')).toHaveCount(2);
  await expect(page.locator('[data-portal-row="NITDA-2026-00018"]')).toContainText('Bridging the digital divide');
  await expect(page.locator('[data-portal-row="NITDA-2026-00017"]')).toContainText('Withdrawn by the submitter');
  await expect(page.locator('[data-portal-row="NITDA-2026-00017"] [data-portal-set]')).toHaveCount(0);
  await expect(page.getByText('has no SCAN_INTAKE address configured')).toBeVisible();
  await expect(page.locator('[data-portal-set="NITDA-2026-00018"]')).toBeDisabled();
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
  await openPortalTab(page);
  const row = page.locator('[data-portal-row="NITDA-2026-00018"]');
  await expect(row.locator('[data-portal-set]')).toBeEnabled();
  await row.locator('[data-portal-status]').selectOption('review');
  await row.locator('[data-portal-note]').fill('Assigned to the Legal desk.');
  await row.locator('[data-portal-set]').click();
  await page.click('[data-dialog="confirm"] [data-yes]');
  await expect.poll(() => sent?.method).toBe('PUT');
  expect(sent.headers['x-dgo-action']).toBe('writeback');
  expect(sent.body).toEqual({ referenceId: 'NITDA-2026-00018', status: 'review', label: '', note: 'Assigned to the Legal desk.' });
  await expect(page.locator('[data-portal-row="NITDA-2026-00018"]')).toContainText('Under review.');
  const stored = await page.evaluate(async () => { const { State } = await import('/core/state.js'); return State.get().portalRegister.find((r) => r.referenceId === 'NITDA-2026-00018'); });
  expect(stored.status).toBe('review');
});
