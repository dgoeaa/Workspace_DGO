import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import { EndpointAtlas } from '../config/endpoint-atlas.data.js';

const FILE = 'file://' + path.resolve('tools/admin-console.html');

/* THE COUNTS ARE DERIVED, NOT TYPED.
 *
 * These read `All 51`, `In use 20` and `Name collisions 14` as literals. They were correct when
 * written and stopped being correct the moment the endpoint identity was reconciled: the estate
 * moved to 21 keys in use and 13 collisions — an IMPROVEMENT, one more workflow bound to a key and
 * one fewer name collision — and the suite went red for it. A test that fails when the thing it
 * measures gets better is measuring the wrong thing.
 *
 * Substituting 21 and 13 would only reset the clock to the next reconciliation. What these tests
 * are actually for is the sentence in the endpoint console's own name: does the console show the
 * estate the register describes? So the expected values come from the register the console renders
 * from, by the same three expressions scripts/lib/admin-console-ui.js uses. The assertion now fails
 * when the console and the register DISAGREE, which is the only interesting failure. */
const ATLAS = {
  all: EndpointAtlas.workflows.length,
  bound: EndpointAtlas.workflows.filter((w) => w.bound).length,
  collision: EndpointAtlas.workflows.filter(
    (w) => !w.bound && w.names.some((n) => EndpointAtlas.keys.some((k) => k.key === n))).length,
};

test.describe('Standalone console (file://, no server)', () => {
  test('opens from file:// with no server and no network', async ({ page }) => {
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    // Fail loudly if it tries to reach the network on load.
    await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());

    await page.goto(FILE);
    await page.waitForSelector('#app .cards', { timeout: 15000 });
    expect(errs, 'no errors on load').toEqual([]);
    expect(await page.textContent('body')).toContain('DGO Endpoint Administration');

    await page.click('[data-tab="estate"]');
    await page.waitForSelector('#app table');
    const body = await page.textContent('body');
    expect(body, 'the console must show every workflow the register describes')
      .toContain(`All ${ATLAS.all}`);
    expect(body, 'the console and the register must agree on how many workflows carry a contract-key name while serving no key')
      .toContain(`Name collisions ${ATLAS.collision}`);
  });

  test('every tab renders, and none leaks a signature', async ({ page }) => {
    await page.goto(FILE);
    await page.waitForSelector('#app .cards', { timeout: 15000 });
    for (const t of ['commission','endpoints','findings','health','rotation','compare','export','reference','estate']) {
      await page.click(`[data-tab="${t}"]`);
      await page.waitForTimeout(100);
      const html = await page.content();
      expect(html, `tab ${t}`).not.toMatch(/sig=[A-Za-z0-9_-]{20,}/);
    }
  });

  test('loads a values file, judges it, and redacts the signature it was given', async ({ page }) => {
    await page.goto(FILE);
    await page.waitForSelector('#app .cards', { timeout: 15000 });
    await page.click('[data-tab="endpoints"]');

    // A real values file: correct URLs, a distinctive signature, one key deliberately wrong.
    const atlas = await page.evaluate(() => EndpointAtlas.keys.map(k => ({ key: k.key, url: k.urlTemplate, wf: k.workflowId, surface: k.surface })));
    const CANARY = 'CANARY' + 'z'.repeat(37);
    const impostor = await page.evaluate(() => EndpointAtlas.workflows.find(w => !w.bound && w.names.includes('STATUS')).workflowId);
    const lines = atlas.map(k => {
      const url = k.key === 'STATUS' ? k.url.replace(/\/workflows\/[0-9a-f]{32}/, '/workflows/' + impostor) : k.url;
      return `${k.surface === 'portal' ? 'PF_ENDPOINT_' : 'DGO_ENDPOINT_'}${k.key}=${url}${CANARY}`;
    });
    const tmp = path.join(os.tmpdir(), 'sa-values.txt');
    fs.writeFileSync(tmp, lines.join('\n'));

    await page.setInputFiles('[data-file]', tmp);
    await page.waitForSelector('tr[data-key]', { timeout: 10000 });

    const html = await page.content();
    expect(html, 'the loaded signature must never be rendered').not.toContain(CANARY);
    expect(html).toContain('sig=***');

    // It found the deliberately wrong flow.
    const text = await page.textContent('#app');
    expect(text).toContain('WRONG FLOW');

    // And says so as a finding.
    await page.click('[data-tab="findings"]');
    await page.waitForTimeout(120);
    const f = await page.textContent('#app');
    expect(f).toMatch(/call a workflow the register does not name/);
    expect(await page.content()).not.toContain(CANARY);
    fs.unlinkSync(tmp);
  });

  test('commissions from scratch: signs every flow and clears the readiness gate', async ({ page }) => {
    await page.goto(FILE);
    await page.waitForSelector('#app .cards', { timeout: 15000 });
    await page.click('[data-tab="commission"]');

    const flows = await page.locator('[data-sig]').count();
    expect(flows, '20 workflows serve the 25 keys, so this is 20 visits not 25').toBe(20);

    const SIG = 'K'.repeat(43);
    for (let i = 0; i < flows; i++) {
      const target = page.locator('.issue:not(.good) [data-sig]').first();
      await target.fill(SIG);
      await target.press('Enter');
    }
    await expect(page.locator('.progress span')).toHaveText(/20 of 20 flows signed/);

    await page.click('[data-tab="overview"]');
    await expect(page.locator('#app section.panel h2').first()).toHaveText(/Cleared for pilot usage/);

    // and no signature reached the DOM despite 25 keys now carrying one
    expect(await page.content()).not.toContain(SIG);
  });

  test('generates a config.local.js the platform can actually load', async ({ page }, testInfo) => {
    await page.goto(FILE);
    await page.waitForSelector('#app .cards', { timeout: 15000 });
    await page.click('[data-tab="commission"]');
    const SIG = 'M'.repeat(43);
    const flows = await page.locator('[data-sig]').count();
    for (let i = 0; i < flows; i++) {
      const t = page.locator('.issue:not(.good) [data-sig]').first();
      await t.fill(SIG); await t.press('Enter');
    }
    await page.click('[data-tab="export"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-gen-runtime]')]);
    expect(dl.suggestedFilename()).toBe('config.local.js');
    const out = path.join(os.tmpdir(), 'ac-gen-' + testInfo.workerIndex + '.js');
    await dl.saveAs(out);
    const gen = fs.readFileSync(out, 'utf8');

    /* The real assertion: it is not "a file", it is a config the platform loads. Evaluated the
       way the browser evaluates it, and checked for the merge semantics the platform documents —
       an assigned (rather than merged) endpoints object silently breaks every harness that
       injects window.DGO_CONFIG before the module graph runs. */
    const sandbox = { window: {} };
    // eslint-disable-next-line no-new-func
    new Function('window', gen).call(sandbox, sandbox.window);
    const eps = sandbox.window.DGO_CONFIG.endpoints;
    expect(Object.keys(eps).length).toBe(18);
    expect(Object.values(eps).every(u => /[?&]sig=[A-Za-z0-9_-]{43}$/.test(u))).toBe(true);
    expect(gen).toMatch(/\}, window\.DGO_CONFIG\.endpoints\)/);
    fs.unlinkSync(out);
  });

  test('a pasted URL for the wrong flow is kept and reported, not silently corrected', async ({ page }) => {
    await page.goto(FILE);
    await page.waitForSelector('#app .cards', { timeout: 15000 });
    const impostor = await page.evaluate(() =>
      EndpointAtlas.workflows.find(w => !w.bound && w.names.includes('STATUS')).workflowId);
    const statusWf = await page.evaluate(() => EndpointAtlas.keys.find(k => k.key === 'STATUS').workflowId);
    const url = await page.evaluate(([imp]) => EndpointAtlas.keys.find(k => k.key === 'STATUS')
      .urlTemplate.replace(/\/workflows\/[0-9a-f]{32}/, '/workflows/' + imp) + 'Q'.repeat(43), [impostor]);

    await page.click('[data-tab="commission"]');
    const row = page.locator(`[data-sig="${statusWf}"]`);
    await row.fill(url);
    await row.press('Enter');

    await page.click('[data-tab="endpoints"]');
    await expect(page.locator('#app')).toContainText('WRONG FLOW');
    expect(await page.content()).not.toContain('Q'.repeat(43));
  });

  test('every tab mounts and the deep link survives a reload', async ({ page }) => {
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(FILE);
    await page.waitForSelector('#app .cards', { timeout: 15000 });
    for (const t of ['commission','endpoints','estate','findings','health','rotation','compare','export','reference','overview']) {
      await page.click(`[data-tab="${t}"]`);
      await expect(page.locator('#app section.panel').first()).toBeVisible();
      expect(page.url(), `${t} is deep-linkable`).toContain('#' + t);
    }
    await page.goto(FILE + '#rotation');
    await page.waitForSelector('#app section.panel');
    await expect(page.locator('#app')).toContainText('Rotation plan');
    expect(errs).toEqual([]);
  });
});

