// A stamped release tree (scripts/lib/asset-stamp.mjs, 2026-10-22) boots, loads its data, and loads each module once
// under one address; a page stamped by an earlier build is replaced once by a fresh address, and only once. The Portal
// likewise, and its service worker installs a cache named for the token holding every stamped shell address.
// The dev server serves a stamped copy of the Workspace (DGO_DEV_ROOT) with sign-in enforced, as
// tests/boot-data-deeplinks.spec.js does for the working tree.

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampTree } from '../scripts/lib/asset-stamp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = ['index.html', 'acknowledge.html', 'index_Bulk.html', 'support.html', 'assets', 'config', 'core', 'modules', 'shared', 'styles'];
let proc, base, tmp, token, ptoken;

const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });
const portalId = (assetToken) => fs.writeFileSync(path.join(tmp, 'site', 'document-portal', 'BUILD-ID.json'), JSON.stringify({ schema: 'folio-build-id/v1', version: 'test', label: 'FOLIO-PORTAL vtest', commit: 'test', assetToken }));
const buildId = (assetToken) => fs.writeFileSync(path.join(tmp, 'site', 'BUILD-ID.json'), JSON.stringify({ schema: 'folio-build-id/v1', version: 'test', label: 'FOLIO-WORKSPACE vtest', commit: 'test', assetToken }));

async function signIn(page) {
  const dialog = page.locator('[data-dialog="sign-in"]');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.fill('#dgo-signin-email', 'a.bello@nitda.gov.ng');
  await page.click('[data-send]');
  await expect(page.locator('#dgo-signin-code')).toBeVisible();
  await page.fill('#dgo-signin-code', '000000');
  await page.click('[data-verify]');
  await expect(dialog).toHaveCount(0);
}

test.beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgo-stamped-'));
  for (const f of SITE) fs.cpSync(path.join(ROOT, f), path.join(tmp, 'site', f), { recursive: true });
  /* The working tree's own config.local.js (git-ignored, holding live addresses) is not part of the copy: the dev server
     answers that path from memory, as it does for a clone without one. */
  fs.rmSync(path.join(tmp, 'site', 'config', 'config.local.js'), { force: true });
  token = stampTree(path.join(tmp, 'site')).token;
  buildId(token);
  /* The Portal, as the dev server mounts it (/portal/ from document-portal/), with the endpoint digest the packager
     writes into sw.js, then stamped as config:rebuild stamps it. */
  const pdir = path.join(tmp, 'site', 'document-portal');
  fs.cpSync(path.join(ROOT, 'document-portal'), pdir, { recursive: true });
  fs.rmSync(path.join(pdir, 'config.local.js'), { force: true });
  fs.writeFileSync(path.join(pdir, 'sw.js'), fs.readFileSync(path.join(pdir, 'sw.js'), 'utf8').replace("const BUILD = 'dev';", "const BUILD = 'endpointdigest';"));
  ptoken = stampTree(pdir).token;
  portalId(ptoken);
  const port = await freePort();
  base = `http://localhost:${port}`;
  proc = spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DGO_DEV_AUTH: '1', DGO_DEV_ROOT: path.join(tmp, 'site'), DGO_DEV_DATA: path.join(tmp, 'store.json') },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/index.html`)).ok) break; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
});

test.afterAll(() => {
  proc?.kill('SIGTERM');
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('a stamped build boots, loads its data, and loads every module once, under its token', async ({ page }) => {
  const scripts = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.origin === base && /\.m?js$/.test(u.pathname)) scripts.push(u.pathname + u.search); });
  await page.goto(`${base}/index.html?skipWelcome=1`, { waitUntil: 'domcontentloaded' });
  await signIn(page);
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => page.evaluate(async (v) => (await import(`/core/state.js?v=${v}`)).State.get().runtime?.lastLoad?.key || '', token), { timeout: 20_000 }).not.toBe('');
  await expect(page.locator('dgo-shell')).toHaveCount(1);
  expect(page.url()).not.toContain('folio-build=');
  const byPath = new Map();
  for (const s of scripts) { const [p, q = ''] = s.split('?'); if (!byPath.has(p)) byPath.set(p, new Set()); byPath.get(p).add(q); }
  const twice = [...byPath].filter(([, qs]) => qs.size > 1).map(([p, qs]) => `${p} as ${[...qs].join(' and ')}`);
  const unstamped = [...byPath].filter(([p, qs]) => p !== '/config/config.local.js' && ![...qs].every((q) => q === `v=${token}`)).map(([p]) => p);
  expect(twice).toEqual([]);
  expect(unstamped).toEqual([]);
  expect(byPath.size).toBeGreaterThan(20);
});

test('a page from an earlier build is replaced once by a fresh address, and not again', async ({ page }) => {
  buildId('newer0000000');
  try {
    let navigations = 0;
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations++; });
    await page.goto(`${base}/index.html?skipWelcome=1`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.url(), { timeout: 15_000 }).toContain('folio-build=newer0000000');
    expect(new URL(page.url()).searchParams.get('skipWelcome')).toBe('1');
    await page.waitForTimeout(2_000);
    expect(navigations).toBe(2);
  } finally { buildId(token); }
});

test('the stamped Portal loads its code under its token, and its service worker caches the stamped shell', async ({ page }) => {
  const code = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.origin === base && u.pathname.startsWith('/portal/') && /\.(m?js|css)$/.test(u.pathname) && !/sw\.js$/.test(u.pathname)) code.push(u.pathname + u.search); });
  await page.goto(`${base}/portal/index.html`, { waitUntil: 'load' });
  const unstamped = code.filter((c) => !c.endsWith(`?v=${ptoken}`) && !c.includes('config.local.js'));
  expect(unstamped).toEqual([]);
  expect(code.length).toBeGreaterThan(5);
  const caches = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 50 && !(await caches.keys()).length; i++) await new Promise((r) => setTimeout(r, 100));
    const keys = await caches.keys();
    const c = await caches.open(keys[0]);
    return { keys, entries: (await c.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search) };
  });
  expect(caches.keys).toEqual([`nitda-portal-v6-endpointdigest-${ptoken}`]);
  expect(caches.entries).toContain(`/portal/js/core.js?v=${ptoken}`);
  expect(caches.entries).toContain(`/portal/ds/ds.css?v=${ptoken}`);
  expect(page.url()).not.toContain('folio-build=');
});

test('a Portal page from an earlier build is replaced once by a fresh address, and not again', async ({ page }) => {
  portalId('newer0000000');
  try {
    let navigations = 0;
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations++; });
    await page.goto(`${base}/portal/index.html?x=1`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.url(), { timeout: 15_000 }).toContain('folio-build=newer0000000');
    expect(new URL(page.url()).searchParams.get('x')).toBe('1');
    await page.waitForTimeout(2_000);
    expect(navigations).toBe(2);
  } finally { portalId(ptoken); }
});
