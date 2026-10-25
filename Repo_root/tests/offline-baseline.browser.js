import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context, baseURL }) => {
  if (baseURL !== 'http://127.0.0.1:18080') throw new Error('Offline-only configuration is required');
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== baseURL || !['GET', 'HEAD'].includes(route.request().method())) {
      return route.abort('blockedbyclient');
    }
    if (/\/config\.local[^/]*\.js$/i.test(url.pathname)) {
      return route.fulfill({
        status: 200, contentType: 'application/javascript', body: 'window.DGO_CONFIG = {};',
      });
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
});

test('isolated baseline boots and mounts the shell without tenant configuration', async ({ page }) => {
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await expect(page.locator('dgo-shell')).toHaveCount(1);
  await expect(page.locator('#app .fatal')).toHaveCount(0);
});

test('offline context blocks remote requests and substitutes local configuration', async ({ page }) => {
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.invalid/offline-negative-control');
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  const substituted = await page.evaluate(async () =>
    (await (await fetch('/config/config.local.js')).text()) === 'window.DGO_CONFIG = {};');
  expect(substituted).toBe(true);
});

test('recovered portal pages load local assets and run without configured endpoints', async ({ page }) => {
  const failures = [];
  const pageErrors = [];
  page.on('pageerror', () => pageErrors.push('uncaught page error'));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === 'http://127.0.0.1:18080' && response.status() >= 400
        && !/\/BUILD-ID\.json$/.test(url.pathname)) failures.push(url.pathname);
  });
  for (const name of ['index', 'submit', 'track', 'support', 'privacy', '404']) {
    const response = await page.goto(`/document-portal/${name}.html`, { waitUntil: 'networkidle' });
    expect(response.status()).toBe(200);
    await expect(page.locator('main')).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof window.PF?.esc === 'function')).toBe(true);
  }
  expect(failures).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('recovered platform register displays its historical scope before source claims', async ({ page }) => {
  const response = await page.goto('/docs/reference/PLATFORM_REGISTER.html', { waitUntil: 'networkidle' });
  expect(response.status()).toBe(200);
  const notice = page.locator('#bk-main > aside[role="note"]');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('not verified current Workspace_DGO approval or acceptance');
  await expect.poll(() => notice.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2;
    return x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight
      && element.contains(document.elementFromPoint(x, y));
  })).toBe(true);
  await expect(page).toHaveTitle('Folio Platform Register');
});
