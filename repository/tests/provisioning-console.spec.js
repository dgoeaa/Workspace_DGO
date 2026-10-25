import { test, expect } from '@playwright/test';

/* The provisioning console, driven.
 *
 * tests/provisioning-console.test.mjs asserts the console cannot say less than the markdown.
 * This asserts the part that only exists once a browser runs it: that a 195,000-line reference
 * can actually be moved through. Every check below is one of the things that was impossible in
 * the markdown — search across every package, filter, jump to a section, jump to one action,
 * and link someone to exactly that.
 *
 * THE PACKAGE COUNT IS READ FROM THE DATA, NOT TYPED HERE. It was typed here — `toBe(131)` in
 * three places — and the dataset grew to 132, so the suite failed on a page that was working
 * correctly and reporting the truth. A number that describes generated data belongs to that
 * data; asserting a literal only pins the day the literal was written.
 *
 * The page is a static file with no build step, so it is served from the repo root like the
 * rest of the suite. */
const PAGE = '/docs/folio-Master-Flows-and-Endpoints/provisioning/index.html';

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
    const packages = await page.evaluate(() => window.DGO_PROVISIONING_INDEX.meta.totals.packages);
    /* Counted, not pinned: retiring flows (2026-10-05) took the index from over 100 packages to 99, and a pinned
       number failed every run after for a reason that had nothing to do with the console. */
    const listed = await page.evaluate(() => window.DGO_PROVISIONING_INDEX.index.length);
    expect(packages, 'the shipped index declares how many packages it carries').toBe(listed);
    expect(packages).toBeGreaterThan(50);
    expect(await page.locator('.item').count()).toBe(packages);

    /* The search the markdown could not do. A list GUID is what a flow is configured with; a
       list NAME is what a person holds. Both find the flow. */
    await page.fill('#q', 'DGO_UserDirectory');
    await page.waitForTimeout(220);
    const byListName = await page.locator('.item').count();
    expect(byListName, 'searching by list name finds the flows that touch it').toBeGreaterThan(5);

    await page.fill('#q', 'OTP');
    await page.waitForTimeout(220);
    expect(await page.locator('.item').count()).toBeGreaterThan(0);
    expect(await page.locator('#resultcount').innerText()).toMatch(new RegExp(`of ${packages}`));

    await page.click('#qclear');
    await page.waitForTimeout(150);
    expect(await page.locator('.item').count()).toBe(packages);
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
    /* The largest live flow. Universal Dynamic Multi Actions Executor (252 actions), which this test used to open,
       was retired on 2026-10-05; its action count now comes from the index rather than a pinned number. */
    const big = await page.evaluate(() => window.DGO_PROVISIONING_INDEX.index.find((x) => x.id === 'flows/ip-dynamic-global-actions-endpoint').actionCount);
    await page.goto(PAGE + '#/flows/ip-dynamic-global-actions-endpoint');
    await page.waitForSelector('#actions', { timeout: 30000 });

    expect(await page.locator('section.sec').count()).toBe(13);
    expect(await page.locator('.action').count()).toBe(big);

    /* The markdown's defining layout failure: a 300-character configured value in a table cell
       sets the column width and moves the whole document sideways. Here every wide thing has
       its own scrollbar and the page has none. */
    const scrollsX = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(scrollsX, 'the page itself must never scroll horizontally').toBe(false);

    await page.fill('.actionbar input', 'response');
    await page.waitForTimeout(150);
    expect(await page.locator('#actions .n').innerText()).toMatch(new RegExp(`of ${big}`));
    expect(errors).toEqual([]);
  });

  test('a link drops you on the exact action, and lands in view', async ({ page }) => {
    const errors = await open(page, '#/flows/ip-dynamic-global-actions-endpoint/actions/Scope_Dynamic_Flow%2FScope_Finalize_Response_Dynamic%2FResponse_Dynamic');
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
    await open(page, '#/flows/ip-dynamic-global-actions-endpoint');
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

  test('a deployed flow and the package built for it are addressed separately', async ({ page }) => {
    /* Entries are addressed by folder and slug, not slug alone: keyed on the slug, a deployed flow and the clipboard
       scope built for it once showed one another's configuration. The pair this test used (Portal_UPLOAD_ECM_DOCS)
       was retired on 2026-10-05; CG_Submission_Endpoint and its package are the live pair. */
    await open(page, '#/flows/cg-submission-endpoint');
    await page.waitForSelector('#identity', { timeout: 30000 });
    const deployed = await page.locator('.fact dd').nth(3).innerText();

    await page.goto(PAGE + '#/packages/submission-cg-submission-endpoint-de9ef13b-paste');
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
    for (const slug of ['flows/cg-submission-endpoint', 'flows/ip-scan-intake', 'flows/ip-dynamic-global-actions-endpoint']) {
      await page.goto(`${PAGE}#/${slug}`);
      await page.waitForSelector('#identity', { timeout: 30000 });
      await page.waitForTimeout(250);
      expect(await page.content(), `${slug} renders no signature`).not.toMatch(/sig=[A-Za-z0-9_-]{20,}/);
    }
  });
});
