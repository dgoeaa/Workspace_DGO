/**
 * The record page closes the cycle (essentials plan UX-203).
 *
 * Reply writes the Correspondence Email Desk's letter against the record and sends it through the EMAIL endpoint, as the
 * desk does; Record dispatch records a completed task's hand-over, as Dispatch does (one implementation,
 * core/dispatch-actions.js); and Close & archive, offered only once a response is recorded, seals the record through
 * Archive's closure gate. Each step joins the record's timeline and moves its stage bar.
 */
import { test, expect } from '@playwright/test';

const REF = 'NITDA-2026-00611';
const calls = [];

async function boot(page, { taskStatus = 'Completed' } = {}) {
  calls.length = 0;
  await page.route('**/config/config.local.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `window.DGO_CONFIG = ${JSON.stringify({ endpoints: { DYNAMIC_ACTIONS: 'https://flows.test.invalid/dynamic-actions', EMAIL: 'https://flows.test.invalid/email' } })};` }));
  await page.route('https://flows.test.invalid/**', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push({ url: route.request().url(), body });
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { ok: true, requestId: 'req-611' } }) });
  });
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await page.evaluate(async ({ ref, taskStatus }) => {
    const { State } = await import('/core/state.js');
    State.patch({
      activities: [{ id: '611', sourceId: 611, referenceId: ref, title: 'Request for a cloud-hosting clearance', status: 'Treated', created: '2026-10-10T09:00:00Z' }],
      correspondence: [{ id: '611', referenceId: ref, subject: 'Request for a cloud-hosting clearance', sender: 'Federal Ministry of Health', senderEmail: 'ict@health.gov.ng', status: 'In Treatment', channel: 'Document' }],
      tracking: [{ id: '711', sourceId: 711, referenceId: ref, title: 'Assess the hosting plan', assignedTo: 'dgsregistry@nitda.gov.ng', created: '2026-10-11T09:00:00Z', status: taskStatus, acknowledged: true, ackedAt: '2026-10-12T09:00:00Z', due: '2026-10-30' }],
      approvals: [], dispatches: [], correspondenceEmails: [], archives: [],
    });
  }, { ref: REF, taskStatus });
}
const confirmAll = async (page) => {
  for (let i = 0; i < 4; i++) {
    const yes = page.locator('[data-dialog] [data-yes]').first();
    if (!(await yes.count())) return;
    await yes.click();
    await page.waitForTimeout(150);
  }
};
const open = (page) => page.evaluate(async (ref) => { const { openRecordPage } = await import('/shared/record-page.js'); return openRecordPage(ref); }, REF);
const timeline = (page) => page.locator('[data-record-page] .record-page__timeline li b');
const stage = (page, id) => page.locator(`[data-record-page] .record-page__stages li`).nth(['received', 'triaged', 'assigned', 'progress', 'decision', 'responded', 'closed'].indexOf(id));

test('Close & archive waits for a response; Reply sends the letter and records it on the timeline', async ({ page }) => {
  await boot(page);
  expect(await open(page)).toBe(true);
  const rp = page.locator('[data-record-page]');
  await expect(rp.locator('[data-record-act="reply"]')).toBeVisible();
  await expect(rp.locator('[data-record-act="close"]'), 'no response recorded yet').toHaveCount(0);
  await expect(stage(page, 'responded')).toHaveAttribute('data-state', 'todo');

  await rp.locator('[data-record-act="reply"]').click();
  const form = rp.locator('[data-record-reply]');
  await expect(form.locator('[name="recipientEmail"]')).toHaveValue('ict@health.gov.ng');
  await form.locator('[name="body"]').fill('The clearance is granted, subject to the attached conditions.');
  await form.locator('button[type="submit"]').click();
  await confirmAll(page);

  await expect.poll(() => calls.filter((c) => /\/email$/.test(c.url)).length, { timeout: 10_000 }).toBe(1);
  const sent = calls.find((c) => /\/email$/.test(c.url)).body;
  const p = sent.payload || sent;
  expect(p.operation).toBe('sendCorrespondenceEmail');
  expect(p.referenceId).toBe(REF);
  expect(p.email.to).toBe('ict@health.gov.ng');

  await expect(timeline(page)).toContainText([/Reply sent: /]);
  await expect(stage(page, 'responded')).toHaveAttribute('data-state', 'done');
  await expect(rp.locator('[data-record-act="close"]')).toBeVisible();
});

test('Record dispatch is the Dispatch screen\'s; Close & archive then seals the record', async ({ page }) => {
  await boot(page);
  await open(page);
  const rp = page.locator('[data-record-page]');
  await rp.locator('[data-record-act="dispatch"]').click();
  const form = rp.locator('[data-record-dispatch]');
  await form.locator('[name="channel"]').selectOption('Courier');
  await form.locator('[name="recipient"]').fill('Federal Ministry of Health, Abuja');
  await form.locator('button[type="submit"]').click();
  await confirmAll(page);

  await expect(timeline(page)).toContainText([/Dispatched by Courier/]);
  await expect.poll(() => page.evaluate(async () => (await import('/core/state.js')).State.get().dispatches.map((d) => `${d.taskId}:${d.channel}:${d.status}`))).toEqual(['711:Courier:dispatched']);
  await expect(rp.locator('[data-record-act="confirm-receipt"]')).toBeVisible();

  await rp.locator('[data-record-act="close"]').click();
  const close = rp.locator('[data-record-close-form]');
  await expect(close.locator('button[type="submit"]')).toBeEnabled();
  await close.locator('[name="summary"]').fill('Clearance issued and delivered by courier.');
  await close.locator('button[type="submit"]').click();
  await confirmAll(page);

  await expect.poll(() => page.evaluate(async (ref) => (await import('/core/state.js')).State.get().archives.some((a) => a.ref === ref), REF)).toBe(true);
  await expect(timeline(page)).toContainText([/Closed and archived/]);
  await expect(stage(page, 'closed')).toHaveAttribute('data-state', 'done');
  await expect(rp.locator('[data-record-act="close"], [data-record-act="reply"]')).toHaveCount(0);
  await expect(rp).toContainText('Closed and archived.');
});

test('a record with open work cannot be archived, and the page says what is open', async ({ page }) => {
  await boot(page, { taskStatus: 'In Progress' });
  await page.evaluate(async () => { const { State } = await import('/core/state.js'); State.patch({ dispatches: [{ id: 'd1', taskId: '999', referenceId: 'NITDA-2026-00611', status: 'no-dispatch', reason: 'Answered by phone', at: '2026-10-20T09:00:00Z' }] }); });
  await open(page);
  const rp = page.locator('[data-record-page]');
  await rp.locator('[data-record-act="close"]').click();
  await expect(rp.locator('[data-record-close-form] button[type="submit"]')).toBeDisabled();
  await expect(rp.locator('#rp-close').locator('..')).toContainText('open task');
});
