// Deep links through sign-in (DL-1), with authentication ENFORCED.
// Spec: docs/architecture/PLATFORM_ACCESS_SPEC.md §8a. Runbook: docs/deployment/PLATFORM_ACCESS_RUNBOOK.md.
//
// Runs its own dev server with DGO_DEV_AUTH=1 on a free port and a throwaway data file, so it
// neither needs nor disturbs the server the rest of the smoke suite uses. The sign-in code is
// the dev server's fixed 000000.
//
// What it proves, in the order an assignee lives it:
//   1. an acknowledgement link opened while signed out asks for sign-in before drawing anything
//   2. a wrong code is refused, and says so
//   3. after sign-in the Workspace is on the Acknowledgment Queue, on the linked task, not denied
//   4. Acknowledge Receipt sends ONE request, carrying the proof, for that task, as the signed-in
//      assignee, and ignores an actor the link tried to name
//   5. a reload keeps the sign-in and the link

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSIGNEE = 'a.bello@nitda.gov.ng';
let proc, base, dataDir;

const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });

test.beforeAll(async () => {
  const port = await freePort();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgo-dl1-'));
  base = `http://localhost:${port}`;
  proc = spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DGO_DEV_AUTH: '1', DGO_DEV_DATA: path.join(dataDir, 'store.json') },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/index.html`)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('dev server did not start');
});

test.afterAll(() => {
  proc?.kill('SIGTERM');
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

async function signIn(page, code) {
  const dialog = page.locator('[data-dialog="sign-in"]');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.fill('#dgo-signin-email', ASSIGNEE);
  await page.click('[data-send]');
  await expect(page.locator('#dgo-signin-code')).toBeVisible();
  await page.fill('#dgo-signin-code', code);
  await page.click('[data-verify]');
  return dialog;
}

test('an acknowledgement link opened while signed out lands on its task after sign-in, and acknowledges as the signed-in assignee', async ({ page }) => {
  const posts = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push({ /* The proof travels in X-DGO-Proof: a signed trigger rejects an Authorization header as MISE unauthorized (release 9). */ auth: Boolean(r.headers()['x-dgo-proof']), body: r.postData() || '' }); });

  /* The link an assignment email sends, plus an actor it has no right to name. */
  await page.goto(`${base}/index.html?item=204&ref=TASK-204&actorEmail=dg%40nitda.gov.ng&actorName=Forged&skipWelcome=1`, { waitUntil: 'domcontentloaded' });

  // 1. Sign-in comes first; nothing has been drawn for an unknown user.
  await expect(page.locator('[data-dialog="sign-in"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('dgo-shell')).toHaveCount(0);

  // 2. A wrong code is refused.
  await signIn(page, '123456');
  await expect(page.locator('[data-step="code"] [data-error]')).toContainText('not accepted');

  // 3. The right code: on the linked task, not denied.
  await page.fill('#dgo-signin-code', '000000');
  await page.click('[data-verify]');
  await expect(page.locator('[data-dialog="sign-in"]')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/acknowledgment/);
  await expect(page.getByText('Access denied')).toHaveCount(0);
  await expect(page.getByText('Task opened from a link').locator('..')).toContainText('204');

  // Identity calls carry no proof; everything after sign-in does.
  const identity = posts.filter(p => /"identifier"/.test(p.body));
  expect(identity.length).toBeGreaterThan(0);
  expect(identity.every(p => !p.auth)).toBe(true);

  // 4. Acknowledge Receipt.
  const before = posts.length;
  await page.locator('.workspace button', { hasText: 'Acknowledge Receipt' }).click();
  for (let i = 0; i < 3; i++) {
    const confirm = page.locator('.dgo-dialog [data-yes], .dgo-dialog button:has-text("Continue"), .dgo-dialog button:has-text("Execute")').first();
    if (await confirm.count()) await confirm.click(); else break;
  }
  await expect(page.locator('.dgo-toast').filter({ hasText: 'Acknowledgment recorded' })).toBeVisible({ timeout: 10_000 });
  const sent = posts.slice(before);
  expect(sent.length).toBe(1);
  expect(sent[0].auth).toBe(true);
  expect(sent[0].body).toContain('204');
  expect(sent[0].body).toContain(ASSIGNEE);
  expect(sent[0].body).not.toMatch(/Forged|dg@nitda/);

  // 5. A reload keeps both the sign-in and the link.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/#\/acknowledgment/);
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-dialog="sign-in"]')).toHaveCount(0);
  await expect(page.getByText('Access denied')).toHaveCount(0);
});

test('an item link opened while signed out lands on that item in Lookup after sign-in', async ({ page }) => {
  await page.goto(`${base}/index.html?DGOPID=${encodeURIComponent('NITDA/REG/2026/0101')}&skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  const dialog = await signIn(page, '000000');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/lookup/);
  await expect(page.locator('.workspace')).toContainText('NITDA/REG/2026/0101');
  await expect(page.locator('[data-linked-missing]')).toHaveCount(0);
});

// The boot watchdog in index.html used to count the time the sign-in dialog waited on the person.
// Fetching a code from e-mail takes longer than its 15 seconds, so "NITDA Folio could not start"
// showed behind the dialog on the live site (2026-10-09). It pauses for sign-in now.
test('waiting longer than the boot watchdog at sign-in shows no start-up failure', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`${base}/index.html?skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-dialog="sign-in"]')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(20_000);
  await expect(page.locator('.fatal')).toHaveCount(0);
  const dialog = await signIn(page, '000000');
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await expect(page.locator('.fatal')).toHaveCount(0);
});

// Tenant defect 2026-10-10 (TASK-2026-00002): the e-mailed link opened the Acknowledgment Queue about 20 s before
// FETCH_ALL answered, and the screen stayed on "The task this link points to has not loaded" with the task already
// in state, because nothing redrew it when the data arrived. The data reply is held back here to recreate that order.
test('a task link opened before the data arrives shows the task once it does', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/api/dgo/FETCH_ALL', async (route) => { await new Promise((r) => setTimeout(r, 5000)); await route.continue(); });
  await page.goto(`${base}/index.html?item=204&ref=TASK-204&skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  const dialog = await signIn(page, '000000');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/acknowledgment/);
  await expect.poll(() => page.evaluate(async () => !!(await import('/core/state.js')).State.get().runtime?.lastLoad), { timeout: 20_000 }).toBe(true);
  await expect(page.getByText('The task this link points to has not loaded')).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator('.workspace')).toContainText('204');
});

// One sign-in for the browser (owner, 2026-10-20). A second tab, and a task link opened in one, need no new code; a
// sign-in made in one tab closes the sign-in box another tab is showing; Sign out in one tab returns every tab to the
// sign-in. Two pages of one browser context share localStorage, as two tabs of one browser do.
test('one sign-in serves every tab, and Sign out ends it in every tab', async ({ context }) => {
  test.setTimeout(60_000);
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto(`${base}/index.html?skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await b.goto(`${base}/index.html?item=204&ref=TASK-204&skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await expect(b.locator('[data-dialog="sign-in"]')).toBeVisible({ timeout: 15_000 });

  // Signing in on tab A closes tab B's box, and B carries on to its task.
  const dialog = await signIn(a, '000000');
  await expect(dialog).toHaveCount(0);
  await expect(b.locator('[data-dialog="sign-in"]')).toHaveCount(0, { timeout: 10_000 });
  await expect(b).toHaveURL(/#\/acknowledgment/);
  await expect(b.locator('.workspace')).toContainText('204', { timeout: 15_000 });

  // A third tab opens signed in.
  const c = await context.newPage();
  await c.goto(`${base}/index.html?skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => c.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await expect(c.locator('[data-dialog="sign-in"]')).toHaveCount(0);

  // Sign out on tab C: every tab is back at the sign-in.
  await c.locator('[data-persona]').first().click();
  await c.locator('[data-sign-out]').click();
  for (const p of [a, b, c]) await expect(p.locator('[data-dialog="sign-in"]')).toBeVisible({ timeout: 15_000 });
  expect(await a.evaluate(() => localStorage.getItem('dgo.r11.identity.proof'))).toBeNull();
});
