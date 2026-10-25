// Boot, data loading and deep links, end to end (docs/architecture/BOOT_DATA_DEEPLINK_TRACE.md).
//
// Runs its own dev server with sign-in ENFORCED (DGO_DEV_AUTH=1, code 000000) on a free port and a throwaway data file,
// as tests/deeplinks-signin.spec.js does. One sign-in at the start yields a proof; the tests that start signed in put it
// in localStorage before the page loads, as a second tab of a signed-in browser would find it.
//
// What it proves, by trace section:
//   §2 boot      cold boot signed out draws nothing before sign-in; a held proof boots straight in; an expired one asks
//                again and is removed; the signed-in person, not the packaged profile, is shown
//   §3 data      FETCH_ALL loads; FETCH_ALL failing falls back to FETCH_ACTIVITIES; both failing says so on the linked
//                screen rather than "Loading…"; a slow load shows "Loading…" and then the record; the DG/CEO screen
//                loads once, not without end
//   §4 links     every accepted link parameter, the forwarder pages, a task reference, signed in and signed out; a route
//                with parameters after it; an unknown route; a reload after moving on stays where the officer is
//
// Since the cut-over (essentials plan UX-401) a link's screen is the place its work moved to: a task link lands on Tasks,
// a record link on the Inbox, a support link on the Overview with Ask the support team open; the record opens on its page.

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSIGNEE = 'a.bello@nitda.gov.ng';
const KEY = 'dgo.r11.identity.proof';
let proc, base, dataDir, proof;

const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });

async function signIn(page, email = ASSIGNEE) {
  const dialog = page.locator('[data-dialog="sign-in"]');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.fill('#dgo-signin-email', email);
  await page.click('[data-send]');
  await expect(page.locator('#dgo-signin-code')).toBeVisible();
  await page.fill('#dgo-signin-code', '000000');
  await page.click('[data-verify]');
  await expect(dialog).toHaveCount(0);
}
const booted = (page) => expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
const loaded = (page) => expect.poll(() => page.evaluate(async () => (await import('/core/state.js')).State.get().runtime?.lastLoad?.key || ''), { timeout: 20_000 }).not.toBe('');
const lastLoad = (page) => page.evaluate(async () => (await import('/core/state.js')).State.get().runtime?.lastLoad);
const withProof = async (context, value = proof) => context.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* no storage */ } }, [KEY, value]);

test.beforeAll(async ({ browser }) => {
  const port = await freePort();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgo-boot-'));
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
  const page = await browser.newPage();
  await page.goto(`${base}/index.html?skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await signIn(page);
  proof = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await page.close();
  if (!proof) throw new Error('no proof after sign-in');
});

test.afterAll(() => {
  proc?.kill('SIGTERM');
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

/* ── §2 Boot ─────────────────────────────────────────────────────────────────────────── */
test('§2 cold boot signed out: sign-in before anything is drawn, then the shell, the data and the signed-in person', async ({ page }) => {
  const fetchAll = [];
  page.on('request', (r) => { if (/FETCH_ALL/.test(r.url())) fetchAll.push(Boolean(r.headers()['x-dgo-proof'])); });
  await page.goto(`${base}/index.html?skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-dialog="sign-in"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('dgo-shell')).toHaveCount(0);
  expect(fetchAll.length).toBe(0);
  await signIn(page);
  await booted(page);
  await loaded(page);
  expect((await lastLoad(page)).key).toBe('FETCH_ALL');
  expect(fetchAll.length).toBeGreaterThan(0);
  expect(fetchAll.every(Boolean)).toBe(true);
  await expect(page.locator('[data-name]')).toContainText(/bello/i);
  await expect(page.locator('[data-role]')).toContainText(ASSIGNEE);
  await expect(page.locator('[data-role]')).not.toContainText('dgsregistry');
});

test('§2 a proof held by the browser boots straight in; an expired one asks again and is removed', async ({ browser }) => {
  const a = await browser.newContext(); await withProof(a);
  const p = await a.newPage();
  await p.goto(`${base}/index.html?skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await booted(p);
  await expect(p.locator('[data-dialog="sign-in"]')).toHaveCount(0);
  await a.close();

  const expired = JSON.stringify({ ...JSON.parse(proof), expiresAt: Date.now() - 60_000 });
  const b = await browser.newContext();
  await b.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, expired]);
  const q = await b.newPage();
  await q.goto(`${base}/index.html?skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await expect(q.locator('[data-dialog="sign-in"]')).toBeVisible({ timeout: 15_000 });
  expect(await q.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  await b.close();
});

test('§2 a proof a tab held in sessionStorage before the change is kept and moved to the shared storage', async ({ browser }) => {
  const c = await browser.newContext();
  await c.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) sessionStorage.setItem(k, v); }, [KEY, proof]);
  const p = await c.newPage();
  await p.goto(`${base}/index.html?skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await booted(p);
  await expect(p.locator('[data-dialog="sign-in"]')).toHaveCount(0);
  expect(await p.evaluate((k) => [Boolean(localStorage.getItem(k)), sessionStorage.getItem(k)], KEY)).toEqual([true, null]);
  await c.close();
});

test('§2 Sign out (account menu) clears the records the last load brought and returns to the sign-in', async ({ browser }) => {
  const c = await browser.newContext();
  /* Seeded once: a reload after Sign out must find no proof, as it would in a real browser. */
  await c.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, proof]);
  const p = await c.newPage();
  await p.goto(`${base}/index.html?skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await booted(p); await loaded(p);
  expect(await p.evaluate(async () => (await import('/core/state.js')).State.get().tracking.length)).toBeGreaterThan(0);
  await p.locator('[data-persona]').first().click();
  await p.locator('[data-sign-out]').click();
  await expect(p.locator('[data-dialog="sign-in"]')).toBeVisible({ timeout: 15_000 });
  const after = await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem('dgo.r11.viewport.runtime.state') || '{}'); return { tracking: (s.tracking || []).length, activities: (s.activities || []).length, proof: localStorage.getItem(k) }; }, KEY);
  expect(after).toEqual({ tracking: 0, activities: 0, proof: null });
  await c.close();
});

/* ── §3 Data loading ─────────────────────────────────────────────────────────────────── */
test('§3 FETCH_ALL failing falls back to FETCH_ACTIVITIES, and says which loaded', async ({ browser }) => {
  const c = await browser.newContext(); await withProof(c);
  const p = await c.newPage();
  await p.route('**/api/dgo/FETCH_ALL', (r) => r.fulfill({ status: 503, body: '{}' }));
  await p.goto(`${base}/index.html?skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await booted(p); await loaded(p);
  const l = await lastLoad(p);
  expect(l.ok).toBe(true);
  expect(l.key).toBe('FETCH_ACTIVITIES');
  expect(l.fallbackReason).toBeTruthy();
  await c.close();
});

test('§3 both loads failing: a task link says the task has not loaded, not "Loading…"', async ({ browser }) => {
  const c = await browser.newContext(); await withProof(c);
  const p = await c.newPage();
  await p.route('**/api/dgo/FETCH_ALL', (r) => r.fulfill({ status: 503, body: '{}' }));
  await p.route('**/api/dgo/FETCH_ACTIVITIES', (r) => r.fulfill({ status: 503, body: '{}' }));
  await p.goto(`${base}/index.html?item=99999&skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await booted(p); await loaded(p);
  expect((await lastLoad(p)).ok).toBe(false);
  await expect(p.getByText('The task this link points to has not loaded')).toBeVisible({ timeout: 10_000 });
  await expect(p.locator('[data-linked-loading]')).toHaveCount(0);
  await expect(p.locator('.fatal')).toHaveCount(0);
  await c.close();
});

test('§3 a slow load shows "Loading…" on the linked screen, then the record', async ({ browser }) => {
  const c = await browser.newContext(); await withProof(c);
  const p = await c.newPage();
  await p.route('**/api/dgo/FETCH_ALL', async (r) => { await new Promise((x) => setTimeout(x, 4000)); await r.continue(); });
  await p.goto(`${base}/index.html?item=204&ref=TASK-204&skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await booted(p);
  await expect(p.locator('[data-linked-loading]')).toBeVisible({ timeout: 4_000 });
  await loaded(p);
  await expect(p.locator('[data-linked-loading]')).toHaveCount(0);
  await expect(p.getByText('The task this link points to has not loaded')).toHaveCount(0);
  await expect(p.locator('[data-record-page]')).toHaveCount(1, { timeout: 10_000 });
  await c.close();
});

test('§3 the DG/CEO address (now Tasks) loads once when opened, not again on every redraw', async ({ browser }) => {
  const c = await browser.newContext();
  const p = await c.newPage();
  let n = 0;
  p.on('request', (r) => { if (/FETCH_ALL/.test(r.url())) n++; });
  await p.goto(`${base}/index.html?skipWelcome=1#/executive`, { waitUntil: 'domcontentloaded' });
  await signIn(p, 'dg@nitda.gov.ng');
  await booted(p); await loaded(p);
  await expect(p.locator('[data-route-host="orchestrator"]')).toHaveCount(1, { timeout: 10_000 });
  await p.waitForTimeout(6000);
  expect(n).toBeLessThanOrEqual(2);
  await c.close();
});

/* ── §4 Deep links ───────────────────────────────────────────────────────────────────── */
const LINKS = [
  ['TaskID=204', 'orchestrator'], ['taskId=204', 'orchestrator'], ['ACK=204', 'orchestrator'], ['AssnPID=204', 'orchestrator'],
  ['item=204&ref=TASK-204', 'orchestrator'], ['items=204,205&batch=B1', 'orchestrator'], ['ref=TASK-204', 'orchestrator'],
  ['DGOPID=NITDA%2FREG%2F2026%2F0101', 'correspondence'], ['ITEMID=NITDA%2FREG%2F2026%2F0101', 'correspondence'], ['ref=NITDA%2FREG%2F2026%2F0101', 'correspondence'],
  ['referenceId=NITDA%2FREG%2F2026%2F0101', 'correspondence'], ['USERSUPPORT=1', 'home'], ['support=1', 'home'],
  ['page=acknowledge.html&item=204', 'orchestrator'], ['page=support.html', 'home'],
];

test('§4 every link type, signed in, opens its screen', async ({ browser }) => {
  test.setTimeout(120_000);
  const c = await browser.newContext(); await withProof(c);
  for (const [q, route] of LINKS) {
    const p = await c.newPage();
    await p.goto(`${base}/index.html?${q}&skipWelcome=1`, { waitUntil: 'domcontentloaded' });
    await booted(p);
    await expect(p, q).toHaveURL(new RegExp(`#/${route}$`));
    await expect(p.getByText('Access denied'), q).toHaveCount(0);
    await expect(p.getByText('Workspace not found'), q).toHaveCount(0);
    await p.close();
  }
  await c.close();
});

test('§4 every link type, signed out, opens its screen after sign-in', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const [q, route] of LINKS) {
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.goto(`${base}/index.html?${q}&skipWelcome=1`, { waitUntil: 'domcontentloaded' });
    await signIn(p);
    await booted(p);
    await expect(p, q).toHaveURL(new RegExp(`#/${route}$`));
    await expect(p.getByText('Access denied'), q).toHaveCount(0);
    await c.close();
  }
});

test('§4 the forwarder page acknowledge.html lands on the task', async ({ browser }) => {
  const c = await browser.newContext(); await withProof(c);
  const p = await c.newPage();
  await p.goto(`${base}/acknowledge.html?item=204&skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await booted(p);
  await expect(p).toHaveURL(/page=acknowledge\.html.*#\/orchestrator$/);
  await c.close();
});

test('§4 a route with parameters after it opens that route; an unknown route offers the way home', async ({ browser }) => {
  const c = await browser.newContext(); await withProof(c);
  const p = await c.newPage();
  await p.goto(`${base}/index.html?skipWelcome=1#/correspondence?view=routed`, { waitUntil: 'domcontentloaded' });
  await booted(p);
  await expect(p.getByText('Workspace not found')).toHaveCount(0);
  await expect(p.locator('[data-route-host="correspondence"]')).toHaveCount(1, { timeout: 10_000 });
  await p.goto(`${base}/index.html?skipWelcome=1#/no-such-screen`, { waitUntil: 'domcontentloaded' });
  await booted(p);
  await expect(p.getByText('Workspace not found')).toBeVisible();
  await p.getByRole('link', { name: 'Go to the Overview' }).click();
  await expect(p).toHaveURL(/#\/home$/);
  await c.close();
});

test('§4 a reload after moving on from a link stays where the officer is; the same link in a new tab opens it', async ({ browser }) => {
  const c = await browser.newContext(); await withProof(c);
  const p = await c.newPage();
  await p.goto(`${base}/index.html?item=204&ref=TASK-204&skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await booted(p);
  await expect(p).toHaveURL(/#\/orchestrator$/);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await booted(p);
  await expect(p).toHaveURL(/#\/orchestrator$/);
  await p.evaluate(() => { location.hash = '#/correspondence'; });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await booted(p);
  await p.waitForTimeout(800);
  await expect(p).toHaveURL(/#\/correspondence$/);
  const q = await c.newPage();
  await q.goto(`${base}/index.html?item=204&ref=TASK-204&skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await booted(q);
  await expect(q).toHaveURL(/#\/orchestrator$/);
  await c.close();
});

test('§4 a new link opened on the screen it names redraws that screen for the new link', async ({ browser }) => {
  const c = await browser.newContext(); await withProof(c);
  const p = await c.newPage();
  await p.route('**/api/dgo/FETCH_ALL', (r) => r.fulfill({ status: 503, body: '{}' }));
  await p.route('**/api/dgo/FETCH_ACTIVITIES', (r) => r.fulfill({ status: 503, body: '{}' }));
  await p.goto(`${base}/index.html?item=11111&skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await booted(p); await loaded(p);
  await p.goto(`${base}/index.html?item=22222&skipWelcome=1#/acknowledgment`, { waitUntil: 'domcontentloaded' });
  await booted(p); await loaded(p);
  await expect(p.locator('.workspace')).toContainText('22222', { timeout: 10_000 });
  await expect(p.locator('.workspace')).not.toContainText('11111');
  await c.close();
});

test('§2 a link opened by a first-time officer goes to the task, not under the welcome tour; a plain visit shows the tour', async ({ browser }) => {
  const c = await browser.newContext(); await withProof(c);
  const p = await c.newPage();
  await p.goto(`${base}/index.html?item=204&ref=TASK-204`, { waitUntil: 'domcontentloaded' });
  await booted(p);
  await expect(p).toHaveURL(/#\/orchestrator$/);
  await p.waitForTimeout(1000);
  await expect(p.locator('.dgo-welcome')).toHaveCount(0);
  const q = await c.newPage();
  await q.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
  await booted(q);
  await expect(q.locator('.dgo-welcome')).toHaveCount(1, { timeout: 5_000 });
  await c.close();
});
