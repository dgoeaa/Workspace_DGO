/**
 * File custody on the record (essentials plan UX-204, owner decision UX-D2).
 *
 * The record's physical file is a panel on its page. With no file, Open a file sends Registry's open-file and the
 * server's number is shown. Route file records a minute and sends move-file; the file then awaits receipt, and Record
 * receipt sends move-file RECEIVED. Close file sends move-file CLOSED. Each step is on the record's timeline.
 */
import { test, expect } from '@playwright/test';

const REF = 'NITDA-2026-00621';
const KEY = '0000a621-0000-4000-8000-000000000621';
const calls = [];

async function boot(page) {
  calls.length = 0;
  await page.route('**/config/config.local.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `window.DGO_CONFIG = ${JSON.stringify({ endpoints: { DYNAMIC_ACTIONS: 'https://flows.test.invalid/dynamic-actions' } })};` }));
  await page.route('https://flows.test.invalid/**', (route) => {
    const body = JSON.parse(route.request().postData() || '{}'), p = body.payload || body;
    calls.push(p);
    const data = p.operation === 'open-file' ? { operation: 'open-file', entityKey: KEY, fileRef: 'NITDA/REG/2026/0621' } : { operation: p.operation, ok: true };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) });
  });
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await page.evaluate(async (ref) => {
    const { State } = await import('/core/state.js');
    const { openRecordPage } = await import('/shared/record-page.js');
    State.patch({
      activities: [{ id: '621', sourceId: 621, referenceId: ref, title: 'Hard-copy request from the Senate committee', status: 'Treated', created: '2026-10-10T09:00:00Z' }],
      correspondence: [{ id: '621', referenceId: ref, subject: 'Hard-copy request from the Senate committee', sender: 'Senate Committee on ICT', status: 'In Treatment', channel: 'Document' }],
      tracking: [], registryFiles: [], fileMovements: [], registryMinutes: [],
    });
    openRecordPage(ref);
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
const ops = () => calls.map((c) => c.movementAction ? `${c.operation}:${c.movementAction}` : c.operation);

test('a file is opened, routed, received and closed from the record, each step on its timeline', async ({ page }) => {
  await boot(page);
  const panel = page.locator('[data-record-page] section[aria-labelledby="rp-file"]');
  const timeline = page.locator('[data-record-page] .record-page__timeline li b');
  await expect(panel).toContainText('No official file has been opened for this record.');

  await panel.locator('[data-file-open]').click();
  await confirmAll(page);
  await expect.poll(ops).toEqual(['open-file']);
  await expect(panel).toContainText('NITDA/REG/2026/0621');
  await expect(panel).toContainText('Central Registry');
  await expect(timeline).toContainText([/File opened: NITDA\/REG\/2026\/0621/]);

  await panel.locator('[data-file-route]').click();
  const form = panel.locator('[data-file-route-form]');
  await form.locator('[name="to"]').fill('Legal Services');
  await form.locator('[name="action"]').selectOption('FOR_REVIEW');
  await form.locator('[name="minute"]').fill('Please review the committee request.');
  await form.locator('button[type="submit"]').click();
  await confirmAll(page);
  await expect.poll(ops).toEqual(['open-file', 'move-file:FOR_REVIEW']);
  expect(calls[1].toOrgKey).toBe('Legal Services');
  await expect(panel).toContainText('awaiting receipt by Legal Services');
  await expect(timeline).toContainText([/File sent to Legal Services · for review/]);

  await panel.locator('[data-file-receive]').click();
  await confirmAll(page);
  await expect.poll(ops).toEqual(['open-file', 'move-file:FOR_REVIEW', 'move-file:RECEIVED']);
  await expect(timeline).toContainText([/File received by Legal Services/]);

  await panel.locator('[data-file-close]').click();
  await confirmAll(page);
  await expect.poll(ops).toEqual(['open-file', 'move-file:FOR_REVIEW', 'move-file:RECEIVED', 'move-file:CLOSED']);
  await expect(panel.locator('[data-file-route], [data-file-close]')).toHaveCount(0);
  await expect(timeline).toContainText([/File closed: NITDA\/REG\/2026\/0621/]);
});
