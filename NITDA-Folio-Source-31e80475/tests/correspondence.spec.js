/**
 * Manual correspondence logging — the reference it carries. F-031, then module rationalisation F-16 (2026-10-20).
 *
 * The reference used to be minted in the browser: first `NITDA-${Date.now().toString().slice(-6)}`, which collided, then a
 * provisional NITDA-YYYY-n read off the records this device had loaded. The record stayed on the device and was sent as
 * upsert_record, which the running flow refuses. Log New Memo now registers the record with Dynamic Actions (`register`),
 * and the reference is the one the server issues from its own counter. This spec answers that flow itself.
 */

import { test, expect } from '@playwright/test';

async function openWorkspace(page) {
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => { location.hash = '#/correspondence'; });
  await page.waitForSelector('[data-outlet] .route-stage .workspace');
}

/**
 * Clear whatever confirmation is on screen.
 *
 * Saving a record raises TWO dialogs in sequence, and both are real product behaviour:
 * "Confirm new correspondence" from the module, then "Confirm DYNAMIC_ACTIONS execution"
 * from core/flow-confirmation.js, which gates every write-contract invocation. The second
 * is not what these tests are about, but its backdrop swallows pointer events — so leaving
 * it up means the next click is intercepted rather than delivered.
 */
async function clearDialogs(page) {
  for (let i = 0; i < 4; i++) {
    const open = page.locator('[data-dialog]');
    if (!(await open.count())) return;
    const dismiss = open.first().locator('[data-no]');
    if (!(await dismiss.count())) return;
    await dismiss.click();
    await page.waitForTimeout(120);
  }
}

let issued = 30;
const requests = [];
async function serveRegister(page, status = 200) {
  requests.length = 0; issued = 30;
  await page.route('**/config/config.local.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `window.DGO_CONFIG = ${JSON.stringify({ endpoints: { DYNAMIC_ACTIONS: 'https://flows.test.invalid/dynamic-actions' } })};` }));
  await page.route('https://flows.test.invalid/**', (route) => {
    const body = JSON.parse(route.request().postData() || '{}'); requests.push(body);
    if (status >= 400) return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ status, data: { code: 'INVALID_REQUEST', message: 'register needs a subject of up to 255 characters.' } }) });
    const ref = `NITDA-${new Date().getFullYear()}-${String(++issued).padStart(5, '0')}`;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { operation: 'register', referenceId: ref, entityKey: `0000000${issued}-0000-4000-8000-000000000000`.slice(-36) } }) });
  });
}

/** Fill and submit the log form once, answering every confirmation. */
async function logOne(page, subject) {
  await page.click('[data-create]');
  await page.waitForSelector('[data-create-form]');
  await page.evaluate(s => {
    const f = document.querySelector('[data-create-form]');
    f.sender.value = 'Federal Ministry of Health';
    f.contact.value = 'registry@health.gov.ng';
    f.subject.value = s;
    f.remarks.value = 'Logged at the desk.';
  }, subject);
  await page.click('[data-create-form] button.btn:not(.ghost)');
  for (let i = 0; i < 3; i++) {
    const dlg = await page.waitForSelector('[data-dialog="confirm"]', { state: 'visible', timeout: 3_000 }).catch(() => null);
    if (!dlg) break;
    await dlg.$eval('[data-yes]', b => b.click());
    await page.waitForFunction(el => !el.isConnected, dlg, { timeout: 5_000 });
  }
}

const logged = page => page.evaluate(async () => {
  const { State } = await import('./core/state.js');
  return (State.get().correspondence || [])
    .filter(c => /Counter test/.test(c.subject || ''))
    .map(c => ({ id: c.id, referenceId: c.referenceId, provisional: c.referenceProvisional, recordType: c.recordType }));
});

test.describe('manual correspondence logging', () => {
  test('the reference is the one the server issues, in the registry shape', async ({ page }) => {
    await serveRegister(page);
    await openWorkspace(page);
    await logOne(page, 'Counter test one');
    await expect.poll(async () => (await logged(page)).length).toBe(1);
    const [rec] = await logged(page);
    expect(rec.referenceId).toMatch(new RegExp(`^NITDA-${new Date().getFullYear()}-\\d{5}$`));
    expect(rec.referenceId, 'the retired six-digit timestamp form must not return').not.toMatch(/^NITDA-\d{6}$/);
    expect(rec.id).toBe(rec.referenceId);
    expect(rec.recordType, 'it is an Intake Register record').toBe('REC');
    const p = requests.at(-1)?.payload || {};
    expect(p.operation).toBe('register');
    expect(p.subject).toBe('Counter test one');
    expect(p.channel).toBe('internal');
  });

  test('logging several in quick succession does not repeat a reference', async ({ page }) => {
    await serveRegister(page);
    await openWorkspace(page);
    for (const n of ['Counter test A', 'Counter test B', 'Counter test C']) await logOne(page, n);
    await expect.poll(async () => (await logged(page)).length).toBe(3);
    const recs = await logged(page);
    expect(new Set(recs.map(r => r.referenceId)).size, 'every reference must be distinct').toBe(3);
  });

  test('nothing is minted on the device: no provisional reference exists any more', async ({ page }) => {
    await serveRegister(page);
    await openWorkspace(page);
    await logOne(page, 'Counter test provisional');
    await expect.poll(async () => (await logged(page)).length).toBe(1);
    const [rec] = await logged(page);
    expect(rec.provisional).toBeFalsy();
  });

  test('a refusal logs nothing and says why (F-16, F-22)', async ({ page }) => {
    await serveRegister(page, 400);
    await openWorkspace(page);
    await logOne(page, 'Counter test refused');
    await expect(page.locator('[data-toast-host] .dgo-toast--error').last()).toContainText('did not accept it');
    expect(await logged(page)).toEqual([]);
    expect(await page.evaluate(async () => (await import('./core/state.js')).State.get().pending || [])).toEqual([]);
  });

  test('with no address for the server, nothing is logged and the officer is told', async ({ page }) => {
    await openWorkspace(page);
    await logOne(page, 'Counter test no address');
    await expect(page.locator('[data-toast-host] .dgo-toast--error').last()).toContainText('no address for the server');
    expect(await logged(page)).toEqual([]);
  });
});
