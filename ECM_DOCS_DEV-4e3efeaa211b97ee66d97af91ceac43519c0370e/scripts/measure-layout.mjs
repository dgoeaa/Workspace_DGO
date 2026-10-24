#!/usr/bin/env node
/**
 * How far down the window each Workspace screen's work starts (essentials plan UX-110, LAYOUT_REVIEW.md §3, §5).
 *
 * Opens every route at 1366x768 and 1440x900 and records where the content starts: the top of the first block in the
 * screen that is not its title, a control bar, a filter group or a section menu. Prints one row per route and the
 * median, and with --json writes the measurement for the record.
 *
 *   node scripts/measure-layout.mjs [--base http://localhost:8090] [--json out.json]
 *
 * Needs a running Workspace with data, for example: PORT=8090 node scripts/dev-server.mjs
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { VisibleWorkspaces } from '../config/workflow-clarity.config.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const BASE = arg('--base', 'http://localhost:8090');
const OUT = arg('--json', '');
const BUDGET = 176;
const ROUTES = [...new Set(VisibleWorkspaces.flatMap((w) => (w.tabs || [{ route: w.route }]).map((t) => t.route)))];
/* What sits above the work: the title, control bars, filter groups and section menus. Anything else is content. */
const CHROME = /(^|\s)(dgo-page-head|toolbar|cc-controlbar|cc-controls|rt-filters|source-view-switcher|section-nav|chips|form-row)(\s|$)/;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
const result = { measuredAt: new Date().toISOString(), base: BASE, budgetPx: BUDGET, sizes: {} };
for (const [w, h] of [[1366, 768], [1440, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${BASE}/index.html?skipWelcome=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__DGO_BOOTED__ === true, null, { timeout: 15000 });
  const rows = [];
  for (const route of ROUTES) {
    await page.evaluate((r) => { location.hash = '#/' + r; }, route);
    await page.waitForTimeout(1500);
    const m = await page.evaluate((chromeSrc) => {
      const chrome = new RegExp(chromeSrc);
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.height > 0 && getComputedStyle(e).display !== 'none'; };
      let root = document.querySelector('[data-outlet] .route-stage') || document.querySelector('[data-outlet]');
      while (root && root.children.length === 1) root = root.children[0];
      const kids = [...(root?.children || [])].filter(vis);
      const first = kids.find((k) => !chrome.test(typeof k.className === 'string' ? k.className : ''));
      const top = first ? Math.round(first.getBoundingClientRect().top) : null;
      return { contentTop: top, visible: top == null ? null : Math.max(0, innerHeight - top) };
    }, CHROME.source);
    rows.push({ route, ...m });
  }
  const tops = rows.map((r) => r.contentTop).filter((x) => x != null).sort((a, b) => a - b);
  const median = tops[Math.floor(tops.length / 2)];
  result.sizes[`${w}x${h}`] = { median, worst: tops[tops.length - 1], overBudget: rows.filter((r) => r.contentTop > BUDGET).map((r) => r.route), rows };
  await page.close();
}
await browser.close();

for (const [size, s] of Object.entries(result.sizes)) {
  console.log(`\n${size}  median ${s.median}px  worst ${s.worst}px  budget ${BUDGET}px  over budget: ${s.overBudget.length}`);
  for (const r of s.rows) console.log(`  ${r.route.padEnd(22)} content starts ${String(r.contentTop).padStart(4)}px · ${String(r.visible).padStart(4)}px visible`);
}
if (OUT) { writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n'); console.log(`\nwrote ${OUT}`); }
