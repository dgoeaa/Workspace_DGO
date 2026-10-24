import { test, expect } from '@playwright/test';

/**
 * Workspace wayfinding and scrolling — the platform audit of 2026-10-20.
 *
 * The owner reported that Intake stacked the record, its forms and its preview in one column that scrolled with the
 * list, with stiff scrolling on top. The audit found the same faults across the platform. Each test below pins one of
 * them: the list and the record scroll on their own, a long pane or page can be jumped through, scrolling hands on at
 * the end of an inner box, the frame never slides, real panels are not hidden as demo cards, a table keeps readable
 * columns, and a record can be opened from the keyboard.
 */

const boot = async (page, size = { width: 1440, height: 900 }) => {
  await page.setViewportSize(size);
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  // Boot's deferred load ends by patching runtime from an earlier snapshot; seed after it settles.
  await expect.poll(() => page.evaluate(async () => {
    const { State } = await import('./core/state.js');
    return !!State.get().runtime?.lastLoad;
  }), { timeout: 15_000 }).toBe(true);
};

const LONG = 'Remarks long enough to wrap across several lines of the record pane. '.repeat(30);
const seed = page => page.evaluate(long => import('./core/state.js').then(({ State }) => {
  const n = Array.from({ length: 14 }, (_, i) => i);
  State.patch({
    activities: n.map(i => ({ id: `ACT-${i}`, referenceId: `NITDA-2026-1${i}`, title: `Activity record ${i}`, status: 'Pending',
      assignedTo: 'a.officer@nitda.gov.ng', category: 'Policy / Regulation', description: long })),
    correspondence: n.map(i => ({ id: `CORR-${i}`, referenceId: `NITDA-2026-2${i}`, subject: `Correspondence ${i}`,
      sender: 'Federal Ministry', category: 'Policy / Regulation', status: 'Received', priority: 'normal', description: long,
      receivedAt: '2026-08-01', channel: 'Document' })),
    tracking: n.map(i => ({ id: `TRK-${i}`, referenceId: `NITDA-2026-3${i}`, title: `Tracked task ${i}`, status: 'Pending',
      assignedTo: 'a.officer@nitda.gov.ng', due: '2026-10-1' + (i % 9), description: long })),
  }, { module: 'test', action: 'seed' });
}), LONG);

const go = async (page, route, ui) => {
  if (ui) await page.evaluate(([k, v]) => import('./core/ui-state.js').then(({ UIState }) => UIState.set(k, v)), ui);
  await page.evaluate(r => { location.hash = '#/' + r; }, route);
  await page.waitForSelector('[data-outlet] .route-stage .workspace');
  await page.waitForTimeout(300);
};

test.describe('master-detail screens scroll pane by pane', () => {
  test('on Activities the list and the record are separate, bounded scrollers', async ({ page }) => {
    await boot(page);
    await seed(page);
    await go(page, 'activities', ['activity-records', { selected: 'ACT-0', md: 'detail' }]);
    const r = await page.evaluate(() => {
      const split = document.querySelector('.route-stage > .workspace > [data-md]');
      const main = document.querySelector('.dgo-main');
      const list = split.firstElementChild.querySelector(':scope > .list-col') || split.firstElementChild;
      const detail = split.querySelector(':scope > .detail-col');
      return {
        splitFits: split.getBoundingClientRect().height <= main.clientHeight + 1,
        listScrolls: list.scrollHeight > list.clientHeight,
        detailScrolls: detail.scrollHeight > detail.clientHeight,
      };
    });
    expect(r.splitFits, 'the split is taller than the visible workspace, so the page scrolls both panes together').toBe(true);
    expect(r.listScrolls).toBe(true);
    expect(r.detailScrolls).toBe(true);
  });

  test('the list keeps its place when a record is opened', async ({ page }) => {
    await boot(page);
    await seed(page);
    await go(page, 'activities', ['activity-records', { selected: null, md: 'list' }]);
    const list = page.locator('.route-stage > .workspace > [data-md] > :first-child > .list-col');
    await list.evaluate(el => { el.scrollTop = 400; el.dispatchEvent(new Event('scroll')); });
    await page.waitForTimeout(100);
    await page.locator('[data-record="ACT-8"]').click();
    await page.waitForTimeout(300);
    expect(await list.evaluate(el => el.scrollTop)).toBeGreaterThan(300);
  });

  test('wheel at the end of an inner box carries on to its pane', async ({ page }) => {
    await boot(page);
    await seed(page);
    await go(page, 'correspondence', ['correspondence', { selected: 'CORR-0', md: 'detail', tab: 'tracker', triage: false, assigning: false }]);
    const body = await page.locator('.record-body').boundingBox();
    await page.mouse.move(body.x + body.width / 2, body.y + Math.min(40, body.height / 2));
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(30); }
    await page.waitForTimeout(400);
    const moved = await page.evaluate(() => document.querySelector('.detail-col').scrollTop + document.querySelector('.dgo-main').scrollTop);
    expect(moved, 'scrolling stopped at the end of the remarks box').toBeGreaterThan(0);
  });
});

test.describe('sections are one jump away', () => {
  test('Intake: Assign opens the form beside the list, moves to it and focuses its first field', async ({ page }) => {
    await boot(page);
    await seed(page);
    await go(page, 'correspondence', ['correspondence', { selected: 'CORR-0', md: 'detail', tab: 'tracker', triage: false, assigning: false }]);
    await page.locator('.cc-detail-nav [data-jump="assign"]').click();
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const pane = document.querySelector('.detail-col').getBoundingClientRect();
      const sec = document.querySelector('[data-section="assign"]').getBoundingClientRect();
      const form = document.querySelector('[data-assignment-form]');
      return { top: sec.top - pane.top, focused: document.activeElement?.name, cols: getComputedStyle(form).gridTemplateColumns.split(' ').length };
    });
    expect(r.top).toBeLessThan(120);
    expect(r.focused).toBe('type');
    expect(r.cols, 'the hidden preview still held half the form, one field per row').toBeGreaterThan(1);
  });

  test('a long page gets an "On this page" bar that moves to the section', async ({ page }) => {
    await boot(page);
    await go(page, 'ecm-erp-charter');
    const nav = page.locator('nav.section-nav--page');
    await expect(nav).toBeVisible();
    const buttons = nav.locator('.section-jump');
    expect(await buttons.count()).toBeGreaterThanOrEqual(3);
    await buttons.nth(2).click();
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => document.querySelector('.dgo-main').scrollTop)).toBeGreaterThan(0);
    await expect(buttons.nth(2)).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('the frame and the content stay whole', () => {
  test('scrollIntoView cannot slide the shell frame', async ({ page }) => {
    await boot(page);
    await seed(page);
    await go(page, 'activities', ['activity-records', { selected: 'ACT-0', md: 'detail' }]);
    const moved = await page.evaluate(() => {
      document.querySelector('.detail-col > :last-child')?.scrollIntoView({ block: 'start' });
      return ['dgo-shell', '.dgo-shell-grid', '.dgo-workarea'].map(s => document.querySelector(s).scrollTop);
    });
    expect(moved).toEqual([0, 0, 0]);
  });

  test('Admin Suite shows its commissioning warnings', async ({ page }) => {
    await boot(page);
    await go(page, 'admin-suite');
    const hidden = await page.evaluate(() => [...document.querySelectorAll('[data-outlet] .panel')]
      .filter(p => getComputedStyle(p).display === 'none' && p.querySelector('h3')).length);
    expect(hidden, 'panels with a heading are hidden as if they were design-system demo cards').toBe(0);
  });

  test('a table with one long column keeps its other columns readable', async ({ page }) => {
    await boot(page);
    await seed(page);
    await go(page, 'reports');
    const narrowest = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.report-template table')].find(x => /Remarks/i.test(x.textContent));
      return t ? Math.min(...[...t.querySelectorAll('th')].map(th => th.getBoundingClientRect().width)) : null;
    });
    expect(narrowest).not.toBeNull();
    expect(narrowest, 'a column was crushed to one letter per line').toBeGreaterThan(50);
  });
});

test.describe('records open from the keyboard', () => {
  test('Tab reaches a record row and Enter opens it, keeping focus on the row', async ({ page }) => {
    await boot(page);
    await seed(page);
    await go(page, 'activities', ['activity-records', { selected: null, md: 'list' }]);
    const row = page.locator('[data-record="ACT-3"]');
    await expect(row).toHaveAttribute('tabindex', '0');
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.detail-col')).toContainText('Activity record 3');
    expect(await page.evaluate(() => document.activeElement?.dataset.record)).toBe('ACT-3');
    await expect(page.locator('[data-record="ACT-3"]')).toHaveAttribute('aria-current', 'true');
  });
});

test.describe('the phone header steps aside', () => {
  test('scrolling down hides the ministry bar and top bar on a phone; scrolling up brings them back', async ({ page }) => {
    await boot(page, { width: 390, height: 844 });
    await go(page, 'ecm-erp-charter');
    const state = () => page.evaluate(() => ({
      chrome: document.querySelector('dgo-shell').dataset.chrome || 'shown',
      topbar: document.querySelector('.dgo-topbar').getBoundingClientRect().height,
      footerVisible: document.querySelector('.dgo-footer').getBoundingClientRect().bottom <= innerHeight + 1,
    }));
    await page.mouse.move(200, 500);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 150); await page.waitForTimeout(40); }
    await page.waitForTimeout(400);
    const down = await state();
    expect(down.chrome).toBe('hidden');
    expect(down.topbar).toBeLessThan(2);
    expect(down.footerVisible).toBe(true);
    for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -150); await page.waitForTimeout(40); }
    await page.waitForTimeout(400);
    const up = await state();
    expect(up.chrome).toBe('shown');
    expect(up.topbar).toBeGreaterThan(40);
  });

  test('wider screens keep the header', async ({ page }) => {
    await boot(page, { width: 1024, height: 768 });
    await go(page, 'ecm-erp-charter');
    await page.mouse.move(500, 500);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 150); await page.waitForTimeout(40); }
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.querySelector('dgo-shell').dataset.chrome || 'shown')).toBe('shown');
  });
});
