import { test, expect } from '@playwright/test';

/**
 * Workspace wayfinding and scrolling — the platform audit of 2026-10-20.
 *
 * The owner reported that Intake stacked the record, its forms and its preview in one column that scrolled with the
 * list, with stiff scrolling on top. The audit found the same faults across the platform. Each test below pins one of
 * them: the list and the record scroll on their own, a long pane or page can be jumped through, scrolling hands on at
 * the end of an inner box, the frame never slides, real panels are not hidden as demo cards, a table keeps readable
 * columns, and a record can be opened from the keyboard.
 *
 * Since the cut-over (essentials plan UX-401) the master-detail screens are lists that open a record page over them, so
 * the pane tests are about the record page: it is its own bounded scroller, and the list behind it keeps its place.
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

const openRecord = (page, key) => page.evaluate(async (k) => { const { openRecordPage } = await import('./shared/record-page.js'); openRecordPage(k); }, key);

test.describe('the record page scrolls on its own', () => {
  test('a long record is a bounded scroller over the list', async ({ page }) => {
    await boot(page);
    await seed(page);
    await go(page, 'correspondence');
    await openRecord(page, 'NITDA-2026-10');
    await page.waitForSelector('[data-record-page] h1');
    const r = await page.evaluate(() => {
      const rp = document.querySelector('[data-record-page]'), area = document.querySelector('.dgo-workarea');
      return { fits: rp.getBoundingClientRect().height <= area.getBoundingClientRect().height + 1, scrolls: rp.scrollHeight > rp.clientHeight };
    });
    expect(r.fits, 'the record page is taller than the work area, so the shell scrolls instead').toBe(true);
    expect(r.scrolls).toBe(true);
  });

  test('the list keeps its place when a record is opened and closed', async ({ page }) => {
    await boot(page);
    await seed(page);
    await go(page, 'orchestrator', ['tasks', { view: 'team', q: '' }]);
    await page.evaluate(() => { document.querySelector('.dgo-main').scrollTop = 200; });
    const before = await page.evaluate(() => document.querySelector('.dgo-main').scrollTop);
    await page.locator('[data-open-record="TRK-8"]').click();
    await page.waitForSelector('[data-record-page] h1');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-record-page]')).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelector('.dgo-main').scrollTop)).toBe(before);
  });
});

test.describe('sections are one jump away', () => {
  test('Assign opens its form on the record, moves to it and focuses its first field', async ({ page }) => {
    await boot(page);
    await seed(page);
    await go(page, 'correspondence');
    await openRecord(page, 'NITDA-2026-10');
    await page.locator('[data-record-page] [data-record-act="assign"]').click();
    await page.waitForSelector('[data-record-page] [data-assignment-form]');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const form = document.querySelector('[data-record-page] [data-assignment-form]');
      return { focused: form.contains(document.activeElement), cols: getComputedStyle(form).gridTemplateColumns.split(' ').length };
    });
    expect(r.focused, 'the first field of the form has focus').toBe(true);
    expect(r.cols, 'the hidden preview still held half the form, one field per row').toBeGreaterThan(1);
  });

  test('a long page gets an "On this page" bar that moves to the section', async ({ page }) => {
    await boot(page);
    await seed(page);
    await go(page, 'home');
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
    await go(page, 'correspondence');
    await openRecord(page, 'NITDA-2026-10');
    await page.waitForSelector('[data-record-page] h1');
    const moved = await page.evaluate(() => {
      document.querySelector('[data-record-page] .record-page__main > :last-child')?.scrollIntoView({ block: 'start' });
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
  test('Tab reaches a row and Enter opens its record; closing returns focus to the row', async ({ page }) => {
    await boot(page);
    await seed(page);
    await go(page, 'orchestrator', ['tasks', { view: 'team', q: '' }]);
    const row = page.locator('[data-open-record="TRK-3"]');
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-record-page] h1')).toContainText('Tracked task 3');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-open-record="TRK-3"]')).toBeFocused();
  });
});

test.describe('the phone header steps aside', () => {
  test('scrolling down hides the ministry bar and top bar on a phone; scrolling up brings them back', async ({ page }) => {
    await boot(page, { width: 390, height: 844 });
    await go(page, 'ecm-erp-charter');
    const state = () => page.evaluate(() => ({
      chrome: document.querySelector('dgo-shell').dataset.chrome || 'shown',
      topbar: document.querySelector('.dgo-topbar').getBoundingClientRect().height,
      screenInView: document.querySelector('.dgo-main').getBoundingClientRect().bottom <= innerHeight + 1,
    }));
    await page.mouse.move(200, 500);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 150); await page.waitForTimeout(40); }
    await page.waitForTimeout(400);
    const down = await state();
    expect(down.chrome).toBe('hidden');
    expect(down.topbar).toBeLessThan(2);
    expect(down.screenInView).toBe(true);
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
