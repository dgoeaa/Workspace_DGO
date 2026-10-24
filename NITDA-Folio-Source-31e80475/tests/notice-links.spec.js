// Staff e-mail links that replaced SharePoint list links (owner, 2026-10-20; config/notice-links.config.js and
// docs/folio-Master-Flows-and-Endpoints/deployment/NOTICE_LINKS.md).
//
// Runs its own dev server with sign-in ENFORCED (DGO_DEV_AUTH=1, code 000000), as tests/boot-data-deeplinks.spec.js
// does, and signs in as the Registry desk (systemAdmin in the dev seed), the person these notices reach.
//
//   ?notice=<key>&record=<id>   the Admin Suite opens with the notice's panel, offering the record and the list
//   ?notice=<unknown>           nothing is opened and no SharePoint address is offered
//   ?portal=<reference>         Intake opens on Portal submissions and names the reference

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = 'dgsregistry@nitda.gov.ng';
let proc, base, dataDir;

const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });

async function openSignedIn(browser, query) {
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto(`${base}/index.html?${query}&skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  const dialog = p.locator('[data-dialog="sign-in"]');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await p.fill('#dgo-signin-email', REGISTRY);
  await p.click('[data-send]');
  await expect(p.locator('#dgo-signin-code')).toBeVisible();
  await p.fill('#dgo-signin-code', '000000');
  await p.click('[data-verify]');
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => p.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  return { c, p };
}

test.beforeAll(async () => {
  const port = await freePort();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgo-notice-'));
  base = `http://localhost:${port}`;
  proc = spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DGO_DEV_AUTH: '1', DGO_DEV_DATA: path.join(dataDir, 'store.json') },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/index.html`)).ok) break; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
});

test.afterAll(() => { proc?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('a governance notice opens the Admin Suite and offers the record and the list', async ({ browser }) => {
  const { c, p } = await openSignedIn(browser, 'notice=http-flow-registry&record=17');
  await expect(p).toHaveURL(/#\/admin-suite$/);
  const panel = p.locator('[data-notice="http-flow-registry"]');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('#17');
  await expect(panel.locator('[data-notice-open="item"]')).toHaveAttribute('href', 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE/Lists/DGO_HTTPFlowRegistry/DispForm.aspx?ID=17');
  await expect(panel.locator('[data-notice-open="list"]')).toHaveAttribute('href', /DGO_HTTPFlowRegistry\/AllItems\.aspx$/);
  await panel.locator('[data-notice-related]').click();
  await expect(p.locator('[data-section="estate"][aria-current="true"]')).toHaveCount(1);
  await expect(panel).toBeVisible();
  await panel.locator('[data-notice-close]').click();
  await expect(p.locator('[data-notice]')).toHaveCount(0);
  await c.close();
});

test('a list notice with no record offers the list only; a non-numeric record is ignored', async ({ browser }) => {
  const { c, p } = await openSignedIn(browser, 'notice=portal-support-case&record=1%20OR%201');
  const panel = p.locator('[data-notice="portal-support-case"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-notice-open="item"]')).toHaveCount(0);
  await expect(panel.locator('[data-notice-open="list"]')).toHaveAttribute('href', /Portal%20Support%20Cases\/AllItems\.aspx$/);
  await c.close();
});

test('an unknown notice key opens nothing', async ({ browser }) => {
  const { c, p } = await openSignedIn(browser, 'notice=https%3A%2F%2Fevil.example');
  const panel = p.locator('[data-notice="unknown"]');
  await expect(panel).toBeVisible();
  await expect(p.locator('[data-notice-open]')).toHaveCount(0);
  await c.close();
});

test('a Portal Registry notice opens Portal submissions on its reference', async ({ browser }) => {
  const { c, p } = await openSignedIn(browser, 'portal=NITDA-DGO-2026-9999');
  await expect(p).toHaveURL(/#\/correspondence$/);
  await expect(p.getByRole('heading', { name: 'Portal submissions' })).toBeVisible();
  await expect(p.locator('[data-portal-linked-missing]')).toContainText('NITDA-DGO-2026-9999');
  await c.close();
});
