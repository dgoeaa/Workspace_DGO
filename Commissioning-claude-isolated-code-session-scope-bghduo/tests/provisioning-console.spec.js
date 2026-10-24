import { test, expect } from '@playwright/test';

/* The provisioning console, driven.
 *
 * tests/provisioning-console.test.mjs asserts the console cannot say less than the markdown.
 * This asserts the part that only exists once a browser runs it: that a 195,000-line reference
 * can actually be moved through. Every check below is one of the things that was impossible in
 * the markdown — search across all 131 packages, filter, jump to a section, jump to one action
 * out of 252, and link someone to exactly that.
 *
 * The page is a static file with no build step, so it is served from the repo root like the
 * rest of the suite. */
const PAGE = '/docs/reference/provisioning/index.html';

async function open(page, hash = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(PAGE + hash);
  await page.waitForSelector('.item', { timeout: 20000 });
  return errors;
}

test.describe('Provisioning console', () => {
  test('lists every package, and search reaches past the name', async ({ page }) => {
    const errors = await open(page);

    /* The list is live on first paint: tier one is in the head precisely so this is true
       before the 6 MB of configured values has arrived. */
    expect(await page.locator('.item').count()).toBe(131);

    /* The search the markdown could not do. A list GUID is what a flow is configured with; a
       list NAME is what a person holds. Both find the flow. */
    await page.fill('#q', 'DGO_UserDirectory');
    await page.waitForTimeout(220);
    const byListName = await page.locator('.item').count();
    expect(byListName, 'searching by list name finds the flows that touch it').toBeGreaterThan(5);

    await page.fill('#q', 'OTP');
    await page.waitForTimeout(220);
    expect(await page.locator('.item').count()).toBeGreaterThan(0);
    expect(await page.locator('#resultcount').innerText()).toMatch(/of 131/);

    await page.click('#qclear');
    await page.waitForTimeout(150);
    expect(await page.locator('.item').count()).toBe(131);
    expect(errors).toEqual([]);
  });

  test('filters combine as a reader reads them', async ({ page }) => {
    await open(page);
    const all = await page.locator('.item').count();

    await page.click('.chip:has-text("Internal")');
    await page.waitForTimeout(120);
    const internal = await page.locator('.item').count();
    expect(internal).toBeLessThan(all);

    /* Two estates means BOTH. A plain AND across every active filter would give the empty set,
       which is the thing that makes filter bars feel broken. */
    await page.click('.chip:has-text("Portal")');
    await page.waitForTimeout(120);
    expect(await page.locator('.item').count()).toBeGreaterThan(internal);
  });

  test('a flow renders all thirteen sections, and the page never scrolls sideways', async ({ page }) => {
    const errors = await open(page);
    await page.click('.item:has-text("Universal Dynamic")');
    await page.waitForSelector('#actions', { timeout: 30000 });

    expect(await page.locator('section.sec').count()).toBe(13);
    /* 252 actions, the section that could not be navigated at all in the markdown. */
    expect(await page.locator('.action').count()).toBe(252);

    /* The markdown's defining layout failure: a 300-character configured value in a table cell
       sets the column width and moves the whole document sideways. Here every wide thing has
       its own scrollbar and the page has none. */
    const scrollsX = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(scrollsX, 'the page itself must never scroll horizontally').toBe(false);

    await page.fill('.actionbar input', 'response');
    await page.waitForTimeout(150);
    expect(await page.locator('#actions .n').innerText()).toMatch(/of 252/);
    expect(errors).toEqual([]);
  });

  test('a link drops you on the exact action, and lands in view', async ({ page }) => {
    const errors = await open(page, '#/flows/web-subsidiary-doc-actions/actions/Scope_Global%2FResponse');
    await page.waitForSelector('#actions', { timeout: 30000 });
    await page.waitForTimeout(400);

    const open_ = await page.locator('.action[open]').count();
    expect(open_, 'the linked action is expanded').toBeGreaterThanOrEqual(1);

    /* Arriving must JUMP. Smooth-scrolling 24,000px is a ride through content nobody asked
       for, and it is still going when the reader starts reading. */
    const y = await page.evaluate(() => {
      const n = document.querySelector('.action[open]');
      return n ? Math.round(n.getBoundingClientRect().top) : null;
    });
    expect(y).not.toBeNull();
    expect(y, 'the linked action is on screen').toBeGreaterThan(-60);
    expect(y).toBeLessThan(900);
    expect(errors).toEqual([]);
  });

  test('opening another flow starts at its top, not where the last one was', async ({ page }) => {
    await open(page, '#/flows/universal-dynamic-multi-actions-executor');
    await page.waitForSelector('#actions', { timeout: 30000 });
    await page.evaluate(() => { document.querySelector('.main').scrollTop = 6000; });
    await page.waitForTimeout(150);

    await page.fill('#q', 'CG_Submission');
    await page.waitForTimeout(220);
    await page.locator('.item').first().click();
    await page.waitForSelector('#identity', { timeout: 30000 });
    await page.waitForTimeout(400);

    expect(await page.evaluate(() => Math.round(document.querySelector('.main').scrollTop)),
      'a new flow opens at its top').toBe(0);
  });

  test('a slug shared by two packages addresses both', async ({ page }) => {
    /* Portal_UPLOAD_ECM_DOCS is a deployed flow AND the clipboard scope built for it. Keyed on
       the slug alone, one silently showed the other's configuration. */
    await open(page, '#/flows/portal-upload-ecm-docs');
    await page.waitForSelector('#identity', { timeout: 30000 });
    const deployed = await page.locator('.fact dd').nth(3).innerText();

    await page.goto(PAGE + '#/packages/portal-upload-ecm-docs');
    await page.waitForSelector('#identity', { timeout: 30000 });
    await page.waitForTimeout(300);
    const paste = await page.locator('.fact dd').nth(3).innerText();

    expect(deployed).not.toBe(paste);
  });

  test('works on a phone: one column, and a way back', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);

    expect(await page.locator('#rail').isVisible(), 'the list is the page until a flow is picked').toBe(true);
    await page.click('.item:has-text("CG_Submission")');
    await page.waitForSelector('#identity', { timeout: 30000 });
    await page.waitForTimeout(300);

    expect(await page.locator('#rail').isVisible(), 'the list gives the screen to the flow').toBe(false);
    expect(await page.locator('.backbtn').isVisible(), 'and there is a way back to it').toBe(true);

    const scrollsX = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(scrollsX, 'no horizontal scroll on a 390px screen').toBe(false);

    await page.click('.backbtn');
    await page.waitForTimeout(200);
    expect(await page.locator('#rail').isVisible()).toBe(true);
    expect(errors).toEqual([]);
  });

  test('renders no signature, on any flow', async ({ page }) => {
    await open(page);
    for (const slug of ['flows/cg-submission-endpoint', 'flows/ip-scan-intake', 'flows/web-subsidiary-doc-actions']) {
      await page.goto(`${PAGE}#/${slug}`);
      await page.waitForSelector('#identity', { timeout: 30000 });
      await page.waitForTimeout(250);
      expect(await page.content(), `${slug} renders no signature`).not.toMatch(/sig=[A-Za-z0-9_-]{20,}/);
    }
  });
});
