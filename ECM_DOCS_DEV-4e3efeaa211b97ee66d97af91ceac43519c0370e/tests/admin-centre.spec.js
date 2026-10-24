// @ts-check
/**
 * Folio Central Administration Centre — the operator's journey in a real browser.
 *
 * Starts the Centre on a free loopback port with a throwaway state directory, then walks the
 * path the user guides describe: refused token, unlock, every view, raise an alert, acknowledge
 * it, escalate it, submit a change and see maker–checker hold, verify the audit chain, lock.
 * Any console error other than the deliberate 401, and any CSP violation, fails the run.
 */
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let proc; let fake; let base; let token; let home;

const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = /** @type {net.AddressInfo} */ (s.address()); s.close(() => resolve(port)); });
});

test.beforeAll(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-admin-spec-'));
  const port = await freePort();
  const fakePort = await freePort();
  base = `http://127.0.0.1:${port}`;
  // A stand-in for Microsoft sign-in and the flow service (tools/admin-centre/tests/fake_microsoft.py).
  fake = spawn('python3', ['fake_microsoft.py', String(fakePort)], { cwd: path.join(ROOT, 'tools/admin-centre/tests'), stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve) => fake.stdout.on('data', (d) => { if (String(d).includes('READY')) resolve(); }));
  proc = spawn('python3', ['server.py'], {
    cwd: path.join(ROOT, 'tools/admin-centre'),
    env: { ...process.env, FOLIO_ADMIN_HOME: home, FOLIO_ADMIN_PORT: String(port), FOLIO_ADMIN_MONITOR: '0', FOLIO_ADMIN_ACCESS_LOG: '0',
      FOLIO_ADMIN_FLOW_API: `http://127.0.0.1:${fakePort}`, FOLIO_ADMIN_LOGIN: `http://127.0.0.1:${fakePort}` },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/healthz')).ok) break; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  token = fs.readFileSync(path.join(home, 'config/admin.token'), 'utf8').trim();
});

test.afterAll(() => {
  proc?.kill('SIGTERM');
  fake?.kill('SIGTERM');
  if (home) fs.rmSync(home, { recursive: true, force: true });
});

test('an administrator can operate the Centre end to end', async ({ page }) => {
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/401/.test(m.text())) problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));

  await page.goto(base + '/');
  await expect(page.locator('#lock-title')).toHaveText('Central Administration Centre');
  await expect(page.locator('.lock .bk-sub')).toBeVisible();

  await page.fill('#token', 'not-the-token');
  await page.fill('#actor', 'portfolio-administrator');
  await page.click('#unlock');
  await expect(page.locator('#unlock-error')).toContainText('401 unauthorized');

  await page.fill('#token', token);
  await page.click('#unlock');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('.bk-kpi').first()).toContainText('4');
  await expect(page.locator('#whoami')).toContainText('Super Administrator');

  for (const [view, heading] of [['portfolio', 'Portfolio'], ['health', 'Health'], ['alerts', 'Alerts'], ['incidents', 'Incidents'],
    ['changes', 'Changes'], ['estate', 'Flow & endpoint estate'], ['configuration', 'Configuration'], ['audit', 'Audit & evidence'],
    ['vault', 'Folio Vault'], ['access', 'Access'], ['operations', 'Operations'], ['help', 'Operating guide']]) {
    await page.goto(`${base}/#/${view}`);
    await expect(page.locator('#view h1')).toHaveText(heading);
  }
  await page.goto(`${base}/#/estate`);
  await expect(page.locator('#view .count')).toContainText('33 of 33'); /* Folio_Failure_Watch joined the estate 2026-10-18: 32 -> 33 */

  // Raise an alert; the credential guard refuses a signed URL before it leaves the browser.
  await page.goto(`${base}/#/alerts`);
  await page.click('[data-action="new-alert"]');
  await page.fill('#fld-owner', 'platform-administrator');
  await page.fill('#fld-asset', 'platform:portal');
  await page.fill('#fld-message', 'https://h.api.powerplatform.com/w/triggers/manual/paths/invoke?sv=1.0&sig=AbCdEfGh12345678');
  await page.fill('#fld-reason', 'Submissions are timing out');
  await page.click('#dlg-submit');
  await expect(page.locator('#fld-message-err')).toContainText('Never place credentials');
  await page.fill('#fld-message', 'Portal submissions are timing out');
  await page.click('#dlg-submit');
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('#sheet-title')).toHaveText('Alert #1');

  await page.click('[data-action="transition"][data-to="Acknowledged"]');
  await page.fill('#fld-reason', 'Investigating the gateway');
  await page.click('#dlg-submit');
  await expect(page.locator('#sheet .flow [aria-current]')).toHaveText('Acknowledged');

  await page.click('[data-action="escalate"]');
  await page.fill('#fld-description', 'Public submissions delayed');
  await page.fill('#fld-reason', 'Public impact');
  await page.click('#dlg-submit');
  await expect(page.locator('#sheet-title')).toHaveText('Incident #1');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).not.toBeVisible();

  // Maker–checker: the maker cannot name themself, and cannot approve.
  await page.goto(`${base}/#/changes`);
  await page.click('[data-action="new-change"]');
  await page.fill('#fld-changeType', 'Operational activation');
  await page.fill('#fld-target', 'Folio Central Administration Centre');
  await page.fill('#fld-checker', 'portfolio-administrator');
  await page.fill('#fld-reason', 'Register the approved activation');
  await page.click('#dlg-submit');
  await expect(page.locator('#fld-checker-err')).toContainText('someone other than you');
  await page.fill('#fld-checker', 'change-manager');
  await page.click('#dlg-submit');
  await expect(page.locator('#sheet-title')).toHaveText('Change #1');
  await expect(page.locator('#sheet button[disabled]', { hasText: 'Approve' })).toHaveAttribute('title', /maker may not decide/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).not.toBeVisible();

  await page.goto(`${base}/#/audit`);
  await page.click('[data-action="verify-chain"]');
  await expect(page.locator('#chain-result')).toContainText('The chain verifies');

  await page.click('#lock-btn');
  await expect(page.locator('#lock')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('folio.admin.token'))).toBeNull();

  expect(problems).toEqual([]);
});

test('a platform administrator connects as flow owner and works the flows', async ({ page }) => {
  test.setTimeout(90_000);
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(base + '/');
  await page.fill('#token', token);
  await page.fill('#actor', 'platform-administrator');
  await page.click('#unlock');
  await page.goto(`${base}/#/flows`);
  await expect(page.locator('#view h1')).toHaveText('Flows');
  await expect(page.locator('.owner')).toContainText('Not connected');
  await page.click('[data-action="owner-sign-in"]');
  await page.fill('#fld-reason', 'Read run history for the estate flows');
  await page.click('#dlg-submit');
  await expect(page.locator('#devcode')).toHaveText('ABCD-EFGH');
  await expect(page.locator('.owner')).toContainText('Connected as flow owner', { timeout: 30_000 });
  await expect(page.locator('.owner')).toContainText('identities resolved', { timeout: 30_000 });
  await page.reload();
  await expect(page.locator('[data-count="flows"]')).toHaveText('1');
  await page.click('tr[data-open="flows/0fb53e16-fa57-41a9-9880-752c3a4d4749"]');
  await expect(page.locator('#sheet-title')).toHaveText('DGO_MAIL_SEND');
  await page.locator('#sheet [data-action="run-steps"]').first().click();
  await expect(page.locator('#sheet .run-steps').first()).toContainText('Mailbox unavailable');
  await page.locator('#sheet [data-action="run-resubmit"]').first().click();
  await page.fill('#fld-confirm', 'resubmit');
  await page.fill('#fld-reason', 'Replay after the mailbox came back');
  await page.click('#dlg-submit');
  await expect(page.locator('#fld-confirm-err')).toContainText('RESUBMIT');
  await page.fill('#fld-confirm', 'RESUBMIT');
  await page.click('#dlg-submit');
  await expect(page.locator('#dlg')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).not.toBeVisible();
  await page.goto(`${base}/#/estate`);
  await expect(page.locator('#view')).toContainText('Every tied flow is Started');
  expect(problems).toEqual([]);
});

test('the Centre fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(base + '/');
  await page.fill('#token', token);
  await page.fill('#actor', 'portfolio-administrator');
  await page.click('#unlock');
  await expect(page.locator('#app')).toBeVisible();
  for (const view of ['overview', 'portfolio', 'health', 'operations']) {
    await page.goto(`${base}/#/${view}`);
    await expect(page.locator('#view h1')).toBeVisible();
    const width = await page.evaluate(() => document.querySelector('.bk-main')?.scrollWidth ?? 0);
    expect(width, view).toBeLessThanOrEqual(360);
  }
});
