/**
 * The four in-app notices of the notification matrix (config/notification-matrix.config.js).
 *
 * RN-023 a dispatch fails, RN-030 a governed action fails, RN-031 an outcome stays findable,
 * RN-032 a write held on the device. None of them is an e-mail: each is a toast that the shell
 * writes to the notification centre before showing it (shared/shell.js toast()). So the proof
 * is the screen and the feed, not a delivery record.
 *
 * Run against a deployment (DGO_BASE_URL with a session proof), every flow call except the read
 * flows is refused in the browser, so a failed write here is a refused request and nothing
 * reaches the registry.
 */
import { test, expect } from '@playwright/test';

const READ_FLOWS = ['aa662769f13a4666bfadf3039cd8d247', 'c4c26f93ba1e4d7db5247536c30cdc11', '885fad5ec91f460490e8c772d5d10cb8', 'd2c773332f6f4fbf97ee4a5baa01f70b', '34dd28b4a5664927b66e581c74a0ab94'];
test.beforeEach(async ({ page }) => {
  await page.route(/powerplatform\.com|logic\.azure\.com/, (route) => READ_FLOWS.some((id) => route.request().url().includes(id)) ? route.continue() : route.abort('blockedbyclient'));
});

async function boot(page) {
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 30_000 }).toBe(true);
}

const feed = (page) => page.evaluate(async () => (await import('./core/notification-center.js')).NotificationCenter.all());

/* A governed action whose runner fails with a typed error, through the real governance layer. */
const failGoverned = (page, moduleName, action, errorClass) => page.evaluate(async ([m, a, c]) => {
  const { executeOwnedAction } = await import('./core/action-authority.js');
  const { createError } = await import('./core/errors.js');
  try { await executeOwnedAction(m, a, async () => { throw createError(c, 'raw technical detail 0xDEAD'); }); return 'resolved'; }
  catch (e) { return e.errorClass; }
}, [moduleName, action, errorClass]);

test.describe('in-app notices', () => {
  test('RN-030 · a failed governed action is told to the operator in plain words, never the raw error', async ({ page }) => {
    await boot(page);
    expect(await failGoverned(page, 'orchestrator', 'update-task', 'FLOW_UNAVAILABLE')).toBe('FLOW_UNAVAILABLE');
    const toast = page.locator('[data-toast-host] .dgo-toast--error').last();
    await expect(toast).toContainText('The server could not be reached, so nothing was changed.');
    await expect(toast).not.toContainText('0xDEAD');
    const [top] = await feed(page);
    expect(top.tone).toBe('error');
    expect(top.read, 'an error arrives unread, so it can be found again').toBe(false);
  });

  test('RN-023 · a failed dispatch says it has not gone out', async ({ page }) => {
    await boot(page);
    expect(await failGoverned(page, 'dispatch', 'send-dispatch', 'DISPATCH_FAILED')).toBe('DISPATCH_FAILED');
    await expect(page.locator('[data-toast-host] .dgo-toast--error').last())
      .toContainText('It has not gone out, and the record still shows it as waiting to be sent.');
    expect((await feed(page))[0].message).toContain('It has not gone out');
  });

  test('RN-031 · an outcome stays findable after the toast has gone, a route change and a reload', async ({ page }) => {
    await boot(page);
    const text = `Task updated — it is saved against NOTICE-${Date.now()}`;
    await page.evaluate((t) => document.querySelector('dgo-shell').toast(t, 'success', { module: 'lookup' }), text);
    await expect(page.locator('[data-toast-host] .dgo-toast')).toContainText(text);
    await page.evaluate(() => { location.hash = '#/lookup'; });
    await page.reload({ waitUntil: 'networkidle' });
    await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 30_000 }).toBe(true);
    expect((await feed(page)).some((r) => r.message === text)).toBe(true);
    await page.click('[data-notify-open]');
    await expect(page.locator('[data-notify-panel]')).toContainText(text);
  });

  /* RN-032, revised by module rationalisation (2026-10-20). A write is sent to the server first. When the connection fails,
     core/data-client.js holds it once and the officer is told it is held; the task does not change on screen until the server
     has it. A deployment with no address for the flow holds nothing, because nothing could ever send it, and says so. */
  for (const configured of [false, true]) test(`RN-032 · a write that cannot reach the server is held on the device once, and the officer is told where it is${configured ? ' (endpoint configured)' : ' (no address configured)'}`, async ({ page }) => {
    if (configured && !process.env.DGO_SESSION_PROOF) {
      await page.route('**/config/config.local.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `window.DGO_CONFIG = ${JSON.stringify({ endpoints: { DYNAMIC_ACTIONS: 'https://notice.test.invalid/dynamic-actions' } })};` }));
      await page.route('https://notice.test.invalid/**', (route) => route.abort('failed'));
    }
    await boot(page);
    await page.evaluate(async () => {
      const { State } = await import('./core/state.js');
      State.patch({ tracking: [{ id: 'TSK-NOTICE', sourceId: 702, referenceId: 'NITDA-2026-NOTICE', title: 'Notice proof', assignedTo: 'officer@nitda.gov.ng', status: 'Not started', priority: 'normal', description: 'x', due: '2026-12-01', created: '2026-10-01T09:00:00Z' }], pending: [] }, { module: 'test', action: 'seed' });
      const { UIState } = await import('./core/ui-state.js');
      UIState.set('lookup', { selType: 'tasks', selId: 'TSK-NOTICE', md: 'detail' });
      location.hash = '#/lookup';
    });
    await page.waitForSelector('[data-outlet] .route-stage [data-update-task]');
    await page.selectOption('[data-update-task] [name="status"]', 'In progress');
    await page.click('[data-update-task] button');
    for (let i = 0; i < 3; i++) {
      const dlg = await page.waitForSelector('[data-dialog="confirm"]', { state: 'visible', timeout: 4_000 }).catch(() => null);
      if (!dlg) break;
      await dlg.$eval('[data-yes]', (b) => b.click());
      await page.waitForFunction((el) => !el.isConnected, dlg, { timeout: 5_000 });
    }
    const pending = () => page.evaluate(async () => (await import('./core/state.js')).State.get().pending || []);
    if (configured) {
      await expect.poll(async () => (await pending()).length, { timeout: 20_000 }).toBe(1);
      const [held] = await pending();
      expect(held.key).toBe('DYNAMIC_ACTIONS');
      expect(held.ref).toBe('NITDA-2026-NOTICE');
      await expect.poll(async () => (await feed(page)).some((r) => /held and will be sent again when the connection returns/.test(r.message))).toBe(true);
    } else {
      await expect.poll(async () => (await feed(page)).some((r) => /no address for the server/.test(r.message)), { timeout: 10_000 }).toBe(true);
      expect((await pending()).length, 'a write no address can ever send is not held').toBe(0);
    }
    expect(await page.evaluate(async () => (await import('./core/state.js')).State.get().tracking[0].status), 'the task changes only once the server has it').toBe('Not started');
  });
});
