import { test, expect } from '@playwright/test';

import { EndpointAtlas } from '../config/endpoint-atlas.data.js';

/* Derived, not typed — see the note in tests/admin-console.spec.js. These read `In use 20` and
   `Name collisions 14` as literals and went red when the estate improved to 21 and 13. The same
   three expressions the console renders from now supply the expected values, so this fails only
   when the console and the register disagree. */
const ATLAS = {
  all: EndpointAtlas.workflows.length,
  bound: EndpointAtlas.workflows.filter((w) => w.bound).length,
  collision: EndpointAtlas.workflows.filter(
    (w) => !w.bound && w.names.some((n) => EndpointAtlas.keys.some((k) => k.key === n))).length,
};

test.describe('Endpoint Console', () => {
  test('mounts, and never renders a signature', async ({ page }) => {
    /* Network failures are the environment, not the console: this container has no egress to
       Power Automate, so the platform's own boot load fails and says so. Filtering them keeps
       this assertion about the module under test — a module error would still be caught. */
    const NETWORK = /ERR_|Failed to load resource|NetworkError|Failed to fetch|net::/i;
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !NETWORK.test(m.text())) errors.push(m.text()); });

    await page.goto('/?skipWelcome=1#/endpoint-console');
    await page.waitForSelector('.dgo-page-head__title', { timeout: 20000 });

    const title = await page.textContent('.dgo-page-head__title');
    expect(title).toContain('Endpoint Console');
    expect(errors, 'no console/page errors').toEqual([]);

    const html = await page.content();
    expect(html, 'no 43-char signature rendered').not.toMatch(/sig=[A-Za-z0-9_-]{20,}/);

    // every tab mounts
    for (const t of ['keys','estate','health','config','reference','findings']) {
      await page.click(`[data-tab="${t}"]`);
      await page.waitForTimeout(120);
      const h = await page.content();
      expect(h, `tab ${t} leaks no signature`).not.toMatch(/sig=[A-Za-z0-9_-]{20,}/);
    }
    expect(errors, 'no errors after visiting every tab').toEqual([]);
  });

  test('shows the estate the register describes', async ({ page }) => {
    await page.goto('/?skipWelcome=1#/endpoint-console');
    await page.waitForSelector('.dgo-page-head__title', { timeout: 20000 });
    await page.click('[data-tab="estate"]');
    await page.waitForTimeout(150);
    const body = await page.textContent('.workspace');
    expect(body, 'every workflow the register describes').toContain(`All ${ATLAS.all}`);
    expect(body, 'workflows a contract key actually calls').toContain(`In use ${ATLAS.bound}`);
    expect(body, 'workflows carrying a contract-key name while serving no key')
      .toContain(`Name collisions ${ATLAS.collision}`);
  });
});
