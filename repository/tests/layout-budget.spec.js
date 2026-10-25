/**
 * The space above the work (essentials plan UX-110, docs/architecture/LAYOUT_REVIEW.md §5).
 *
 * On a 1366x768 laptop every office list screen starts its work within 176px of the top of the window: the 56px top
 * bar, one title row (the workspace's name and its tabs) and at most one control bar. Before phase 1 the median screen
 * started at 386px and the worst showed 60px of its list. The sidebar holds every entry without scrolling.
 *
 * "The work" is the first block of the screen that is not its title, a control bar, a filter group or a section menu —
 * the same rule scripts/measure-layout.mjs uses to measure every route.
 */
import { test, expect } from '@playwright/test';

const BUDGET = 176;
/* Since the cut-over (essentials plan UX-401) the office's list screens are the three places; every other route lands on one. */
const LIST_SCREENS = ['correspondence', 'orchestrator', 'home'];
const CHROME = /(^|\s)(dgo-page-head|toolbar|cc-controlbar|cc-controls|rt-filters|source-view-switcher|section-nav|chips|form-row)(\s|$)/;

test.describe('the space above the work', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test(`every office list screen starts its work within ${BUDGET}px at 1366x768`, async ({ page }) => {
    test.setTimeout(180000);
    await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
    await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
    const over = [];
    for (const route of LIST_SCREENS) {
      await page.evaluate((r) => { location.hash = '#/' + r; }, route);
      await page.waitForSelector('[data-outlet] .route-stage .workspace');
      await page.waitForTimeout(400);
      const top = await page.evaluate((src) => {
        const chrome = new RegExp(src);
        let root = document.querySelector('[data-outlet] .route-stage');
        while (root && root.children.length === 1) root = root.children[0];
        const first = [...(root?.children || [])]
          .filter((e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== 'none')
          .find((e) => !chrome.test(typeof e.className === 'string' ? e.className : ''));
        return first ? Math.round(first.getBoundingClientRect().top) : null;
      }, CHROME.source);
      if (top == null || top > BUDGET) over.push(`${route}: ${top}px`);
    }
    expect(over, `screens whose work starts below ${BUDGET}px`).toEqual([]);
  });

  test('the sidebar holds every entry without scrolling', async ({ page }) => {
    await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
    await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
    const nav = await page.evaluate(() => { const n = document.querySelector('.dgo-sidebar__nav'); return { scroll: n.scrollHeight, client: n.clientHeight }; });
    expect(nav.scroll, 'the sidebar scrolls at 1366x768').toBeLessThanOrEqual(nav.client + 1);
  });
});
