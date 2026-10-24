#!/usr/bin/env node
/**
 * The DGO Correspondence Mailer, driven end to end in a real browser against the mock flows.
 *
 * tests/mailer.test.mjs proves the parts in isolation — the merge engine, the directory, the
 * flow definitions. This proves they are wired together: that an operator can open the SPA,
 * check and provision the flows, build a mailing to real directory entries, attach letters
 * that are matched to addressees by file name, and send — and that what reaches the flow is
 * one correctly addressed, correctly personalised message per addressee with its own letter.
 *
 * With --package it runs against the RELEASE instead: releases/dgo-correspondence-mailer-*.zip is
 * unpacked into a temporary directory, the app is served from its web/ folder and the mock is
 * the package's own tools/mock-flows.mjs. Nothing from the repository is loaded, which is what
 * proves the package is self-contained. It also starts the package's tools/serve.mjs --mock,
 * the command its start-demo scripts run, and checks it answers.
 *
 * Run:  node tests/mailer.e2e.mjs [--package]   (DGO_CHROME_PATH=/path/to/chrome if needed)
 * Exit: 0 = the journey works, 1 = otherwise
 */

import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

import { contentType } from '../scripts/dev/mime.mjs';
import { openZip } from '../scripts/lib/zip-reader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'e2e-operator-key-000000';
const PACKAGE = process.argv.includes('--package');
/* --bundle: the journey runs against the published single file (setup's mailer.html), served
   alone — any other path answers 404, which proves it needs nothing beside it. */
const BUNDLE = process.argv.includes('--bundle');

let MAILER_DIR = path.join(ROOT, 'mailer');
let mockModule = path.join(ROOT, 'scripts', 'mailer-mock-flows.mjs');
let pkgRoot = null;
if (PACKAGE) {
  const { ZIP_PATH, unpack } = await import('../scripts/package-mailer.mjs');
  if (!fs.existsSync(ZIP_PATH)) { console.log(`  ❌ ${path.relative(ROOT, ZIP_PATH)} does not exist — run: npm run mailer:package`); process.exit(1); }
  pkgRoot = unpack(ZIP_PATH, fs.mkdtempSync(path.join(os.tmpdir(), 'dgo-mailer-pkg-')));
  MAILER_DIR = path.join(pkgRoot, 'web');
  mockModule = path.join(pkgRoot, 'tools', 'mock-flows.mjs');
}
const { createMockFlows, KEYS } = await import(pathToFileURL(mockModule).href);
const OPERATOR = 'operator@nitda.gov.ng';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ✅ ${name}`);
  else { failed++; console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`); }
};

/** Wait for an operation's report to open, check it, and close it. Returns its text. */
async function report(page, titlePart, timeout = 30000) {
  const dlg = page.locator(`dialog.modal:has(h2:has-text("${titlePart}"))`);
  await dlg.waitFor({ timeout });
  const text = await dlg.innerText();
  await dlg.locator('button:has-text("Close")').last().click();
  await dlg.waitFor({ state: 'detached' });
  return text;
}

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

const mock = createMockFlows({ operatorKey: KEY, failFor: [], operators: [{ email: OPERATOR, name: 'Test Operator', role: 'admin' }] });
const flowPort = await listen(mock.server);
const base = `http://127.0.0.1:${flowPort}`;
const localConfig = `window.DGO_MAILER_CONFIG_LOCAL = { endpoints: { ${KEYS.map((k) => `${k}: '${base}/${k}'`).join(', ')} } };`;

/** Sign in as a person would: the address, then the code the flow mailed to it. */
async function signIn(pg, { expectSync = true } = {}) {
  await pg.waitForSelector('h1:has-text("Sign in")');
  await pg.fill('[name="email"]', OPERATOR);
  const before = mock.mailbox.length;
  await pg.click('button:has-text("Send me a code")');
  await pg.waitForSelector('[name="code"]');
  if (mock.mailbox.length !== before + 1) throw new Error('no sign-in code was mailed');
  await pg.fill('[name="code"]', mock.lastCode(OPERATOR));
  await pg.click('button:has-text("Sign in")');
  if (!expectSync) return null;
  /* Catching up with SharePoint is quiet: a chip in the top bar, and a report kept in Activity. */
  await pg.waitForSelector('[data-sync="ok"]', { timeout: 30000 });
  return pg.evaluate(() => JSON.stringify(window.DGO_MAILER.state.lastSync?.items || []));
}

let bundled = null;
if (BUNDLE) {
  const tools = PACKAGE ? path.join(pkgRoot, 'tools') : path.join(ROOT, 'scripts', 'mailer-package');
  const { bundleMailer } = await import(pathToFileURL(path.join(tools, 'bundle.mjs')).href);
  bundled = bundleMailer(MAILER_DIR, { endpoints: Object.fromEntries(KEYS.map((k) => [k, `${base}/${k}`])), version: 'e2e' });
}

const site = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (BUNDLE) {
    if (url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(bundled); return; }
    if (url === '/__restore/info.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"pending":false}'); return; }
    res.writeHead(404); res.end(); return;
  }
  if (url === '/config.local.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(localConfig); return; }
  if (url === '/__restore/info.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"pending":false}'); return; } // as tools/serve.mjs answers
  const file = path.join(MAILER_DIR, url === '/' ? 'index.html' : url);
  if (!file.startsWith(MAILER_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': contentType(file) });
  fs.createReadStream(file).pipe(res);
});
const sitePort = await listen(site);
const app = `http://127.0.0.1:${sitePort}`;

const launch = { headless: true };
if (process.env.DGO_CHROME_PATH) launch.executablePath = process.env.DGO_CHROME_PATH;
if (process.env.DGO_CHROME_NO_SANDBOX) launch.args = ['--no-sandbox'];
const browser = await chromium.launch(launch);
const page = await browser.newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' && !/config\.local\.js|favicon/.test(m.text())) problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(String(e)));

const fixtures = path.join(ROOT, 'tests', '.mailer-fixtures');
fs.mkdirSync(fixtures, { recursive: true });
const pdf = (name, bytes) => { const p = path.join(fixtures, name); fs.writeFileSync(p, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(bytes, 65)])); return p; };
const files = [pdf('NUC_Letter.pdf', 2048), pdf('Letter-NPF-NCCC.pdf', 3000), pdf('CBN.pdf', 1500), pdf('Unrelated_minutes.pdf', 100)];
const common = pdf('Enclosure-Framework.pdf', 4000);

try {
  console.log(`\nDGO Correspondence Mailer — end to end${PACKAGE ? ` (release package, unpacked at ${pkgRoot})` : ''}${BUNDLE ? ' — the published single file' : ''}\n`);

  if (PACKAGE) {
    ok('the package verifies against its own manifest',
      await new Promise((r) => spawn(process.execPath, ['tools/verify-package.mjs'], { cwd: pkgRoot, stdio: 'ignore' }).on('exit', (c) => r(c === 0))));
    const port = 18000 + Math.floor(Math.random() * 1000);
    const child = spawn(process.execPath, ['tools/serve.mjs', '--mock', '--port', String(port), '--mock-port', String(port + 1)], { cwd: pkgRoot, stdio: 'ignore' });
    try {
      let up = false;
      for (let i = 0; i < 50 && !up; i++) { await new Promise((r) => setTimeout(r, 100)); up = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.ok, () => false); }
      const cfg = up ? await fetch(`http://127.0.0.1:${port}/config.local.js`).then((r) => r.text()) : '';
      const health = up ? await fetch(`http://127.0.0.1:${port + 1}/MAIL_SEND`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'healthCheck', validationOnly: true }) }).then((r) => r.json(), () => null) : null;
      ok('the package\'s start-demo command serves the app and wires it to the mock', up && cfg.includes(`127.0.0.1:${port + 1}/MAIL_SEND`) && health?.endpoint?.key === 'MAIL_SEND');
    } finally { child.kill(); }
  }

  await page.goto(app);
  await page.waitForSelector('.topbar');
  ok('the SPA boots', await page.isVisible('.topbar'));
  ok('it asks for sign-in before anything else, with no menu', await page.isVisible('h1:has-text("Sign in")') && !(await page.isVisible('#sidenav')));
  const stranger = mock.mailbox.length;
  await page.fill('[name="email"]', 'stranger@nitda.gov.ng');
  await page.click('button:has-text("Send me a code")');
  await page.waitForSelector('[name="code"]');
  ok('an address that is not an operator is answered the same, and mailed nothing', mock.mailbox.length === stranger);
  await page.click('button:has-text("Use a different address")');
  const firstSync = await signIn(page);
  ok('signing in with the mailed code opens the mailer and brings it up to date with SharePoint', /Mailings/.test(firstSync) && await page.isVisible('#sidenav'));
  ok('who is operating comes from the sign-in', await page.isVisible(`.pill:has-text("${OPERATOR}")`) && (await page.evaluate(() => window.DGO_MAILER.state.settings.operator.email)) === OPERATOR);
  ok('the browser holds no key of any kind', await page.evaluate(() => !JSON.stringify(window.DGO_MAILER.state.settings).includes('operatorKey') && !localStorage.getItem('dgo-mailer.operatorKey')));
  ok('it reports Live when MAIL_SEND is configured', await page.isVisible('.pill-ok:has-text("Live")'));

  /* Settings: signatory (shared) */
  await page.goto(`${app}/#/settings`);
  ok('an admin sees who may sign in', await page.waitForSelector(`td:has-text("${OPERATOR}")`, { timeout: 10000 }).then(() => true, () => false));
  ok('the flow addresses come from the deployment and cannot be edited', await page.isVisible('text=provided by this deployment'));
  await page.fill('[name="sender.name"]', 'Kashifu Inuwa');
  await page.fill('[name="sender.title"]', 'Director-General/CEO');
  await page.click('button:has-text("Save settings")');
  await page.waitForSelector('.toast:has-text("Settings saved")');
  ok('settings save, and the signatory is shared through SharePoint', JSON.parse(mock.lists.campaigns.get('_shared-settings')?.data || '{}').sender?.name === 'Kashifu Inuwa');

  /* Flows: health, verify, provision */
  await page.goto(`${app}/#/flows`);
  await page.click('[data-check-all]');
  const checks = await report(page, 'Check all flows');
  ok('checking all flows opens a report with a line per check', new RegExp(`${KEYS.length * 2} done`).test(checks) && /DGO_MAIL_SEND: health check/.test(checks), checks.slice(0, 300));
  ok(`all ${KEYS.length} flows answer healthCheck and verify`, (await page.locator('#view .badge-ok').count()) === KEYS.length * 2);
  await page.click('[data-plan]');
  const plan = await report(page, 'Plan (writes nothing)');
  ok('plan writes nothing, and its report says what it would create', mock.provisioned.size === 0 && /Would be created/.test(plan) && /Plan only: nothing was written/.test(plan));
  await page.click('[data-provision]');
  const prov = await report(page, 'Provision SharePoint: Provision');
  ok('provision creates every list and the library, and reports each', mock.provisioned.size === 8 && /DGOMailLog/.test(prov) && /DGOMailSessions/.test(prov) && /DGOMailFiles/.test(prov) && /Created/.test(prov));

  /* Directory */
  await page.goto(`${app}/#/directory`);
  ok('the directory holds the 25 institutions from the guide', (await page.locator('.table-dir tbody tr').count()) === 25);
  ok('NPC is shown without an address', await page.isVisible('tr:has-text("NPC") >> text=No verified address'));
  await page.click('[data-act="push"]');
  await page.click('dialog button:has-text("Push")');
  const pushed = await report(page, 'Directory → SharePoint');
  ok('the push report has one line per institution', /25 done/.test(pushed) && /NUC — National Universities Commission/.test(pushed), pushed.slice(0, 200));
  ok('pushing the directory upserts every entry', mock.lists.directory.size === 25);

  /* Compose */
  await page.goto(`${app}/#/compose`);
  await page.fill('[name="name"]', 'E2E mailing');
  await page.click('button:has-text("Start mailing")');
  await page.waitForSelector('[data-letter]');
  await page.fill('[name="field:LetterTitle"]', 'Request for nomination of focal persons');
  await page.fill('[name="field:Message"]', 'Kindly nominate two officers & advise by 30th September.');
  await page.fill('[name="bcc"]', 'registry@nitda.gov.ng');
  await page.waitForTimeout(600);

  await page.click('a:has-text("Next: recipients")');
  await page.waitForSelector('[data-pick]');
  ok('NPC cannot be selected without a verified address', await page.isDisabled('[data-pick="NPC"]'));
  for (const k of ['NUC', 'NPF-NCCC', 'CBN']) { await page.check(`[data-pick="${k}"]`); await page.waitForSelector(`[data-pick="${k}"]:checked`); }
  ok('three recipients selected', await page.waitForSelector('strong:has-text("3 selected")', { timeout: 5000 }).then(() => true, () => false));

  await page.click('a:has-text("Next: attachments")');
  await page.setInputFiles('[data-common]', common);
  await page.waitForSelector('.file-chip:has-text("Enclosure-Framework.pdf")');
  await page.setInputFiles('[data-bulk]', files);
  await page.waitForSelector('text=Not matched to anyone');
  const rowText = async (k) => page.locator(`tr:has(strong:text-is("${k}"))`).innerText();
  ok('NUC_Letter.pdf is matched to NUC', (await rowText('NUC')).includes('NUC_Letter.pdf'));
  ok('Letter-NPF-NCCC.pdf is matched to NPF-NCCC', (await rowText('NPF-NCCC')).includes('Letter-NPF-NCCC.pdf'));
  ok('CBN.pdf is matched to CBN', (await rowText('CBN')).includes('CBN.pdf'));
  ok('an unrelated file is left for manual assignment', await page.isVisible('.callout-warn:has-text("Unrelated_minutes.pdf")'));

  await page.click('a:has-text("Next: review")');
  await page.waitForSelector('text=Every message is complete');
  ok('review finds every message complete', true);
  await page.click('[data-dryrun]');
  const dry = await report(page, 'Dry run');
  ok('a dry run checks all three through the flow and sends nothing', /3 done/.test(dry) && /Accepted by the flow; would be sent/.test(dry) && mock.sent.length === 0, dry.slice(0, 300));
  ok('a dry run leaves every message unsent', await page.locator('#view .badge:has-text("Sent")').count() === 0);

  await page.click('a:has-text("4 · Review")');
  await page.waitForSelector('[data-test-key]');
  await page.selectOption('[data-test-key]', 'CBN');
  await page.fill('[data-test-to]', 'operator@nitda.gov.ng');
  await page.click('[data-test]');
  const test = await report(page, 'Test send');
  ok('a test of any chosen letter goes only to the test address', mock.sent.length === 1 && mock.sent[0].to[0] === 'operator@nitda.gov.ng' && mock.sent[0].subject.startsWith('[TEST') && /Central Bank/.test(mock.sent[0].subject));
  ok('the test carries that addressee\'s own letter', mock.sent[0].attachments.map((a) => a.name).includes('CBN.pdf'));
  ok('the test report says where it went and what it carried', /Sent\. Check the inbox of operator@nitda\.gov\.ng/.test(test) && /CBN\.pdf/.test(test));

  await page.click('a:has-text("Next: send")');
  await page.click('[data-start]');
  await page.click('dialog button:has-text("Send 3")');
  const sendReport = await report(page, 'Send mailing');
  ok('sending opens a report with one line per addressee', /3 done/.test(sendReport) && /Log entry #/.test(sendReport) && /Reference NITDA\/DGO\//.test(sendReport), sendReport.slice(0, 300));
  const real = mock.sent.slice(1);
  ok('three messages reach the send flow', real.length === 3, `got ${real.length}`);
  const nuc = real.find((m) => m.to[0] === 'info@nuc.edu.ng');
  ok('each message goes to its own addressee', Boolean(nuc) && real.some((m) => m.to[0] === '247poc.npfnccc@npf.gov.ng') && real.some((m) => m.to[0] === 'contactcbn@cbn.gov.ng'));
  ok('the NUC message is personalised', nuc?.htmlBody.includes('The Executive Secretary, NUC') && nuc?.htmlBody.includes('National Universities Commission (NUC)'));
  ok('the reference carries the recipient key', /NITDA\/DGO\/NUC\/\d{4}\/\d{3}/.test(nuc?.subject || ''), nuc?.subject);
  ok('free text is escaped, not injected', nuc?.htmlBody.includes('two officers &amp; advise'));
  ok('the signature block is rendered', nuc?.htmlBody.includes('Kashifu Inuwa') && nuc?.htmlBody.includes('Director-General/CEO'));
  ok('NUC gets its own letter plus the common enclosure, and nothing else',
    JSON.stringify(nuc?.attachments.map((a) => a.name).sort()) === JSON.stringify(['Enclosure-Framework.pdf', 'NUC_Letter.pdf']), JSON.stringify(nuc?.attachments));
  ok('attachment content arrives intact', nuc?.attachments.find((a) => a.name === 'NUC_Letter.pdf')?.bytes === 2048 + 9);
  ok('the bcc is applied', nuc?.bcc.includes('registry@nitda.gov.ng'));
  ok('the log records three Sent messages', mock.lists.log.filter((r) => r.status === 'Sent' && r.campaignId).length === 4);
  ok('the log names the signed-in operator for every message', mock.lists.log.every((r) => r.operatorEmail === OPERATOR));
  const savedSent = () => { const x = [...mock.lists.campaigns.values()].find((c) => c.name === 'E2E mailing'); return x ? Object.values(JSON.parse(x.data).results || {}).filter((r) => r.status === 'sent').length : 0; };
  for (let i = 0; i < 50 && savedSent() !== 3; i++) await new Promise((r) => setTimeout(r, 100)); // saved 0.8 s after the last change
  ok('the mailing, with its results, is saved in SharePoint', savedSent() === 3, String(savedSent()));
  ok('the attached files are shared in SharePoint', ['NUC_Letter.pdf', 'Letter-NPF-NCCC.pdf', 'CBN.pdf', 'Enclosure-Framework.pdf'].every((n) => [...mock.lists.files.keys()].some((k) => k.endsWith(`__${n}`))));
  ok('each report is kept in SharePoint too', [...mock.lists.reports.values()].some((r) => r.kind === 'send'));

  /* Another device: a new browser with nothing in it signs in and sees the same mailing, and
     can send using a letter attached elsewhere — fetched from SharePoint on demand. */
  {
    const ctx2 = await browser.newContext();
    const other = await ctx2.newPage();
    await other.goto(app);
    const sync2 = await signIn(other);
    ok('another device signs in and sees the same mailings and files', /E2E mailing|Mailings/.test(sync2) && (await other.evaluate(() => window.DGO_MAILER.state.campaigns.some((c) => c.name === 'E2E mailing'))));
    const bytes = await other.evaluate(async () => {
      const spec = document.querySelector('script[type=importmap]') ? 'dgo/js/sync.js' : new URL('js/sync.js', document.baseURI).href; // the page's own module
      const { Sync } = await import(spec);
      const app = window.DGO_MAILER;
      const id = Object.entries(app.state.fileIndex).find(([, m]) => m.name === 'NUC_Letter.pdf')[0];
      const rec = await Sync.fileContent(app, id);
      return atob(rec.data).length;
    });
    ok('a letter attached on the first device is fetched from SharePoint, byte for byte', bytes === 2048 + 9, String(bytes));
    await other.goto(`${app}/#/outbox`);
    ok('its outbox shows the mailing with the same results', await other.waitForSelector('text=E2E mailing', { timeout: 5000 }).then(() => true, () => false));
    await ctx2.close();
  }

  /* Idempotency: the flow refuses to send a messageId twice */
  const before = mock.sent.length;
  const [status, again] = mock.handle('MAIL_SEND', { operation: 'send', operatorKey: KEY, payload: { messageId: mock.lists.log.find((r) => r.recipientKey === 'NUC' && !/TEST/.test(r.messageId)).messageId, to: ['info@nuc.edu.ng'], subject: 'x', htmlBody: 'x' } });
  ok('re-sending a messageId returns the earlier send instead of mailing twice', status === 200 && again.data.duplicate === true && mock.sent.length === before);

  /* Refusals are caught before transmission */
  const campaignId = await page.evaluate(() => window.DGO_MAILER.state.campaigns[0].id);
  await page.goto(`${app}/#/compose/${campaignId}/recipients`);
  await page.click('[data-custom="CBN"]');
  await page.fill('dialog [name="_to"]', 'someone@gmail.com');
  await page.click('dialog button:has-text("Save")');
  await page.click('a:has-text("4 · Review")');
  ok('an address outside the allowlist is flagged before sending',
    await page.waitForSelector('text=outside the allowed domains', { timeout: 5000 }).then(() => true, () => false));

  /* The internal platform's templates, on the Agency letterhead */
  await page.goto(`${app}/#/templates`);
  await page.click('button[data-select="agency-official-correspondence"]');
  await page.waitForSelector('text=This template belongs to the internal platform');
  ok('the Templates page offers the platform\'s six letterhead templates, read-only',
    (await page.locator('button[data-select^="agency-"]').count()) === 6 && !(await page.isVisible('[data-form]')));

  await page.goto(`${app}/#/compose`);
  await page.selectOption('select[name="template"]', 'agency-official-correspondence');
  await page.fill('[name="name"]', 'Letterhead mailing');
  await page.click('button:has-text("Start mailing")');
  await page.waitForSelector('[data-letter]');
  ok('the Letter step asks for the letterhead\'s fields, not an HTML body', await page.isVisible('text=its layout and wording are fixed') || await page.isVisible('text=Its layout and wording are fixed'));
  await page.fill('[name="field:LetterTitle"]', 'Adoption of the National Data Exchange Framework');
  await page.fill('[name="field:Message"]', 'The Agency requests the nomination of two focal persons.');
  await page.fill('[name="field:DueDate"]', '9 October 2026');
  await page.waitForTimeout(600);
  await page.click('a:has-text("Next: recipients")');
  await page.check('[data-pick="NUC"]');
  await page.waitForSelector('[data-pick="NUC"]:checked');
  await page.click('a:has-text("Next: attachments")');
  await page.setInputFiles('[data-bulk]', files[0]);
  await page.waitForSelector('tr:has(strong:text-is("NUC")) >> text=NUC_Letter.pdf');
  await page.click('a:has-text("Next: review")');
  await page.waitForSelector('text=Every message is complete');
  await page.click('a:has-text("Next: send")');
  const before2 = mock.sent.length;
  await page.click('[data-start]');
  await page.click('dialog button:has-text("Send 1")');
  await report(page, 'Send mailing');
  const lh = mock.sent[before2];
  ok('a letterhead letter reaches the send flow', Boolean(lh) && lh.to[0] === 'info@nuc.edu.ng', JSON.stringify(lh?.to));
  ok('it carries the Agency letterhead, not the platform name',
    lh?.htmlBody.includes('<h1 style="margin:6px 0 0;font-size:22px">National Information Technology Development Agency</h1>') && !lh?.htmlBody.includes('Folio'));
  ok('it is the platform\'s Official Correspondence wording, with the due-date paragraph switched on',
    lh?.htmlBody.includes('Please find below the official correspondence of the Agency') && lh?.htmlBody.includes('on or before <b>9 October 2026</b>') && !lh?.htmlBody.includes('Action required'));
  ok('its subject follows the platform pattern', /^NITDA\/DGO\/NUC\/\d{4}\/001 — Adoption of the National Data Exchange Framework$/.test(lh?.subject || ''), lh?.subject);
  ok('and the signed letter is attached as a real file', lh?.attachments.map((a) => a.name).join() === 'NUC_Letter.pdf');

  /* The everyday way: Letters → one-page composer → Sent. No wizard, no pop-up reports. */
  {
    await page.goto(`${app}/#/`);
    await page.waitForSelector('h1:has-text("Letters")');
    ok('the first page is Letters, with New letter as the one main action', await page.isVisible('button[data-new]:has-text("New letter")'));
    ok('the menu has four items in plain words', JSON.stringify(await page.locator('#sidenav .nav-label').allInnerTexts()) === JSON.stringify(['Letters', 'Sent', 'Addressees', 'Settings']));
    await page.click('button[data-new]');
    await page.waitForSelector('[data-composer]');
    ok('New letter opens the composer on one page, saved as a draft straight away', /^#\/letter\/c/.test(await page.evaluate(() => location.hash)) && await page.isVisible('[data-region="save"]:has-text("Saved")'));
    ok('the bottom bar says what is left to do', await page.isVisible('.action-bar:has-text("things to finish")'));
    await page.fill('[data-q]', 'central bank');
    ok('searching narrows the addressees as you type', (await page.locator('[data-pick]').count()) === 1);
    await page.check('[data-pick="CBN"]');
    await page.fill('[data-q]', '');
    await page.check('[data-pick="NUC"]');
    await page.waitForSelector('.person-chip:has-text("NUC")');
    ok('chosen addressees show as chips, with a count', await page.isVisible('.count-pill:has-text("2 chosen")') && (await page.locator('.person-chip').count()) === 2);
    await page.fill('[data-f="field:LetterTitle"]', 'Composer journey');
    await page.fill('[data-f="field:Message"]', 'Please acknowledge receipt.');
    await page.setInputFiles('[data-bulk]', [files[0], files[2]]);
    await page.waitForSelector('.action-bar:has-text("Ready: 2 letters")', { timeout: 10000 });
    ok('files are matched to addressees by name, and the letter becomes ready', await page.isVisible('.file-row:has-text("NUC") >> text=NUC_Letter.pdf') && await page.isVisible('.file-row:has-text("CBN") >> text=CBN.pdf'));
    ok('the name of the letter follows its title until renamed', (await page.inputValue('[data-name]')) === 'Composer journey');
    ok('the preview shows the chosen addressee\'s own email', await page.isVisible('#preview dd:has-text("contactcbn@cbn.gov.ng")') || await page.isVisible('#preview dd:has-text("info@nuc.edu.ng")'));
    const sentBefore = mock.sent.length;
    await page.click('[data-check]');
    await page.waitForSelector('.callout:has-text("All 2 would be sent")', { timeout: 20000 });
    ok('checking with the send flow answers on the page, and sends nothing', mock.sent.length === sentBefore && !(await page.isVisible('dialog.modal')));
    await page.click('[data-send]');
    await page.waitForSelector('dialog button:has-text("Send 2")');
    const confirmText = await page.locator('dialog.modal').last().innerText();
    ok('the send confirmation names the send flow\'s mailbox, not the signed-in operator',
      /From\s*the mailbox of the send flow’s Outlook connection/.test(confirmText) && !confirmText.includes(OPERATOR), confirmText.slice(0, 300));
    await page.click('dialog button:has-text("Send 2")');
    await page.waitForSelector('.callout:has-text("Every letter in this run went")', { timeout: 30000 });
    const went = mock.sent.slice(sentBefore);
    ok('sending from the composer sends each addressee their own letter', went.length === 2
      && went.some((m) => m.to[0] === 'info@nuc.edu.ng' && m.attachments.map((a) => a.name).join() === 'NUC_Letter.pdf')
      && went.some((m) => m.to[0] === 'contactcbn@cbn.gov.ng' && m.attachments.map((a) => a.name).join() === 'CBN.pdf'), JSON.stringify(went.map((m) => m.to)));
    ok('when everything has gone, the page says so instead of offering to send again', await page.isVisible('.send-final.done:has-text("All 2 letters have gone")') && !(await page.isVisible('[data-send]')));
    ok('no report pops up over the page', !(await page.isVisible('dialog.modal')));
    await page.goto(`${app}/#/sent`);
    await page.click('.sent-card:has-text("Composer journey") a.letter-card-main');
    await page.waitForSelector('h1:has-text("Composer journey")');
    ok('Sent shows each addressee with status and reference', (await page.locator('tr[data-row] .badge:has-text("Sent")').count()) === 2 && await page.isVisible('tr[data-row="NUC"] code:has-text("NITDA/DGO/NUC/")'));
    await page.click('[data-log]');
    await page.waitForSelector('.callout:has-text("Checked against the send log")');
    ok('checking against the send log shows the log\'s answer on each row', (await page.locator('tr[data-row] .state:has-text("Log: Sent")').count()) === 2);
    await page.click('[data-dup]');
    await page.waitForSelector('[data-composer]');
    ok('Send again as a new letter opens a copy with the same addressees and nothing sent', (await page.locator('.person-chip').count()) === 2 && await page.isVisible('.action-bar:has-text("Ready: 2 letters")'));
    await page.goto(`${app}/#/`);
    ok('the copy waits under Drafts, ready to send', await page.isVisible('.letter-card:has-text("Composer journey (copy)") .state-ok'));
    /* A page that finishes after the operator has moved on is not drawn over the newer page. */
    const slowOps = async (route) => { if ((route.request().postData() || '').includes('listOperators')) await new Promise((r) => setTimeout(r, 1500)); await route.continue(); };
    await page.route(`${base}/MAIL_AUTH`, slowOps);
    await page.evaluate(() => { location.hash = '#/settings'; setTimeout(() => { location.hash = '#/'; }, 250); });
    await page.waitForTimeout(2600);
    await page.unroute(`${base}/MAIL_AUTH`, slowOps);
    ok('a slow page finishing after the operator moved on does not replace the newer page',
      (await page.evaluate(() => location.hash)) === '#/' && await page.isVisible('#sidenav a.active:has-text("Letters")') && !(await page.isVisible('.tabs a:has-text("Connection")')));
    await page.goto(`${app}/#/settings/connection`);
    ok('Settings keeps the administration in tabs', await page.isVisible('.tabs a.active:has-text("Connection")') && await page.isVisible('#sidenav a.active:has-text("Settings")'));
  }

  /* Activity keeps every report */
  await page.goto(`${app}/#/activity`);
  await page.waitForSelector('h1:has-text("Activity")');
  const kinds = await page.locator('#view tbody tr').allInnerTexts();
  ok('the Activity page keeps a report of every operation', ['Send mailing', 'Test send', 'Dry run', 'Flow checks', 'Provision SharePoint', 'Directory → SharePoint'].every((k) => kinds.some((r) => r.includes(k))), kinds.length + ' rows');
  await page.locator('#view tbody tr:has-text("Dry run") button:has-text("Open")').first().click();
  ok('a past report opens again in full', /Accepted by the flow/.test(await report(page, 'Dry run')));

  /* Outbox & log */
  await page.goto(`${app}/#/outbox`);
  await page.click('[data-log]');
  await page.waitForSelector('text=SharePoint log');
  ok('the outbox reads the log back', (await page.locator('section:has-text("SharePoint log") tbody tr').count()) >= 4);

  /* Export everything, erase, restore */
  const snapshot = () => page.evaluate(async () => {
    const s = window.DGO_MAILER.state;
    const db = await new Promise((r) => { const q = indexedDB.open('dgo-mailer'); q.onsuccess = () => r(q.result); });
    const all = (store, fn) => new Promise((r) => { const q = db.transaction(store).objectStore(store)[fn](); q.onsuccess = () => r(q.result); });
    const files = await all('files', 'getAll');
    const kv = await all('kv', 'getAllKeys');
    const reports = await new Promise((r) => { const q = db.transaction('kv').objectStore('kv').get('reports'); q.onsuccess = () => r(q.result || []); });
    db.close();
    return {
      directory: s.directory.length, templates: s.templates.length, campaigns: JSON.stringify(s.campaigns),
      files: files.map((f) => `${f.id}:${f.name}:${f.data.length}`).sort().join('|'), fileCount: files.length,
      reports: reports.length, kv: kv.sort().join(','), operator: s.settings.operator.email,
    };
  });
  /* Anything still waiting to be shared (saves are batched for a moment) goes first, so the
     comparison after erase-and-sign-in is against what SharePoint holds. */
  await page.evaluate(async () => {
    const { Sync } = await import(document.querySelector('script[type=importmap]') ? 'dgo/js/sync.js' : new URL('js/sync.js', document.baseURI).href);
    await Sync.flush(window.DGO_MAILER);
  });
  const beforeExport = await snapshot();
  await page.goto(`${app}/#/settings`);
  await page.check('[data-export-creds]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-export]')]);
  const exportPath = path.join(fixtures, dl.suggestedFilename());
  await dl.saveAs(exportPath);
  const exportReport = await report(page, 'Export everything');
  ok('Export everything downloads a .zip and reports what is in it', /^dgo-mailer-export-.*\.zip$/.test(dl.suggestedFilename()) && /Attachments/.test(exportReport) && /flow address/.test(exportReport), exportReport.slice(0, 300));
  const exported = openZip(exportPath);
  const member = (n) => exported.members.find((m) => m.name === n);
  const manifest = JSON.parse(member('manifest.json').read().toString('utf8'));
  ok('the export holds settings, directory, templates, mailings, reports, attachments and the raw store',
    ['README.txt', 'settings.json', 'directory.json', 'directory.csv', 'templates.json', 'mailings.json', 'reports.json', 'activity.csv', 'attachments.json', 'store/kv.json'].every((n) => member(n))
    && exported.members.some((m) => /^mailings\/.+\.csv$/.test(m.name)) && exported.members.some((m) => /^reports\/.+\.csv$/.test(m.name)) && exported.members.some((m) => /^templates\/.+\.html$/.test(m.name)));
  ok('its counts match the browser', manifest.counts.directory === beforeExport.directory && manifest.counts.attachments === beforeExport.fileCount && manifest.counts.reports === beforeExport.reports && manifest.includesCredentials === true, JSON.stringify(manifest.counts));
  const nucFile = exported.members.find((m) => /^attachments\/[^/]+\/NUC_Letter\.pdf$/.test(m.name));
  ok('attached letters are in it byte for byte', Boolean(nucFile) && nucFile.read().equals(fs.readFileSync(files[0])));
  ok('with the box ticked, the flow addresses are in it, and never a key', JSON.parse(member('settings.json').read().toString('utf8')).endpoints.MAIL_SEND === `${base}/MAIL_SEND` && !exported.members.some((m) => m.read().toString('latin1').includes(KEY)));

  const [dl2] = await Promise.all([page.waitForEvent('download'), (async () => { await page.uncheck('[data-export-creds]'); await page.click('[data-export]'); })()]);
  await report(page, 'Export everything');
  const plainPath = path.join(fixtures, `plain-${dl2.suggestedFilename()}`);
  await dl2.saveAs(plainPath);
  const plain = openZip(plainPath);
  const plainText = plain.members.filter((m) => /\.(json|csv|txt)$/.test(m.name)).map((m) => m.read().toString('utf8')).join('\n');
  ok('without the box, no flow address is anywhere in it', !plainText.includes(`${base}/MAIL_SEND`));

  await page.click('[data-wipe]');
  await Promise.all([page.waitForEvent('load'), page.click('dialog button:has-text("Erase")')]);
  await page.waitForSelector('.topbar');
  const erased = await snapshot();
  ok('Erase everything empties the browser, and signs out', erased.fileCount === 0 && erased.campaigns === '[]' && await page.isVisible('h1:has-text("Sign in")'));
  await signIn(page);
  const resynced = await snapshot();
  ok('signing in again brings every mailing back from SharePoint, nothing restored by hand', resynced.campaigns === beforeExport.campaigns, resynced.campaigns.slice(0, 200));

  await page.goto(`${app}/#/settings`);
  await page.setInputFiles('[data-restore]', exportPath);
  await page.click('dialog button:has-text("Restore")');
  const restoreReport = await report(page, 'Restore');
  ok('restoring the export reports each part', /Attachments/.test(restoreReport) && new RegExp(`${beforeExport.fileCount} of ${beforeExport.fileCount} file`).test(restoreReport), restoreReport.slice(0, 400));
  const restored = await snapshot();
  ok('mailings, results, directory and templates come back exactly', restored.campaigns === beforeExport.campaigns && restored.directory === beforeExport.directory && restored.templates === beforeExport.templates);
  ok('every attachment comes back with the same content', restored.files === beforeExport.files, `${restored.files}\n     ${beforeExport.files}`);
  ok('the Activity history comes back', restored.reports >= beforeExport.reports, `${restored.reports} vs ${beforeExport.reports}`);
  ok('settings come back', restored.operator === beforeExport.operator);

  /* The Termux installer's hand-over: a fresh browser opened on tools/serve.mjs --offer-restore
     restores the export by itself, and the file is then deleted. */
  if (PACKAGE && !BUNDLE) {
    const offered = path.join(fixtures, 'offered-export.zip');
    fs.copyFileSync(exportPath, offered);
    const port = 19000 + Math.floor(Math.random() * 500);
    const child = spawn(process.execPath, ['tools/serve.mjs', '--port', String(port), '--offer-restore', offered], { cwd: pkgRoot, stdio: 'ignore' });
    const ctx = await browser.newContext();
    const phone = await ctx.newPage();
    const phoneProblems = [];
    phone.on('pageerror', (e) => phoneProblems.push(String(e)));
    try {
      let up = false;
      for (let i = 0; i < 50 && !up; i++) { await new Promise((r) => setTimeout(r, 100)); up = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.ok, () => false); }
      await phone.goto(`http://127.0.0.1:${port}/`);
      const text = await report(phone, 'Restore');
      ok('a fresh browser restores the export the installer left, with no taps', /\(from setup\)/.test(text) && new RegExp(`${beforeExport.fileCount} of ${beforeExport.fileCount} file`).test(text), text.slice(0, 300));
      const got = await phone.evaluate(() => ({ campaigns: JSON.stringify(window.DGO_MAILER.state.campaigns), files: Object.keys(window.DGO_MAILER.state.fileIndex).length }));
      ok('it brings the mailings and attachments across', got.campaigns === beforeExport.campaigns && got.files === beforeExport.fileCount);
      ok('the export file is deleted once the browser has it', !fs.existsSync(offered));
      await phone.reload();
      await phone.waitForSelector('.topbar');
      await phone.waitForTimeout(800);
      ok('it is not offered again', (await phone.locator('dialog.modal').count()) === 0);
      child.kill();
      fs.copyFileSync(exportPath, offered);
      const again = spawn(process.execPath, ['tools/serve.mjs', '--port', String(port + 1), '--offer-restore', offered], { cwd: pkgRoot, stdio: 'ignore' });
      try {
        for (let i = 0; i < 50 && !(await fetch(`http://127.0.0.1:${port + 1}/`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 100));
        await phone.goto(`http://127.0.0.1:${port + 1}/`); // a new origin, so an empty browser again
        await report(phone, 'Restore');
        fs.copyFileSync(exportPath, offered);
        await phone.reload();
        const ask = phone.locator('dialog.modal:has(h2:has-text("Restore the export from setup?"))');
        ok('a browser that already has data asks before replacing it', await ask.waitFor({ timeout: 10000 }).then(() => true, () => false));
        await ask.locator('button:has-text("Cancel")').click();
        await phone.waitForTimeout(500);
        ok('declining keeps the data and still deletes the file', !fs.existsSync(offered) && (await phone.evaluate(() => window.DGO_MAILER.state.campaigns.length)) > 0);
      } finally { again.kill(); }
      ok('no script errors on the phone page', phoneProblems.length === 0, phoneProblems.join('\n     '));
    } finally { child.kill(); await ctx.close(); }
  }

  /* Automatic setup's hand-over: tools/setup.mjs leaves settings.json in the restore folder; a
     browser opening the mailer takes the five URLs and the key, checks every flow from the
     browser, and the file is deleted. */
  if (PACKAGE && !BUNDLE) {
    const restoreDir = path.join(fixtures, 'setup-restore');
    fs.mkdirSync(restoreDir, { recursive: true });
    const handover = path.join(restoreDir, 'settings.json');
    fs.writeFileSync(handover, JSON.stringify({ kind: 'dgo-mailer-setup', version: 1, createdAt: new Date().toISOString(), environment: 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1',
      endpoints: Object.fromEntries(KEYS.map((k) => [k, `${base}/${k}`])), operator: { name: 'Setup Operator', email: 'setup@nitda.gov.ng' } }));
    const port = 19600 + Math.floor(Math.random() * 300);
    const child = spawn(process.execPath, ['tools/serve.mjs', '--port', String(port), '--restore-dir', restoreDir], { cwd: pkgRoot, stdio: 'ignore' });
    const ctx = await browser.newContext();
    const fresh = await ctx.newPage();
    const errs = [];
    fresh.on('pageerror', (e) => errs.push(String(e)));
    try {
      for (let i = 0; i < 50 && !(await fetch(`http://127.0.0.1:${port}/`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 100));
      await fresh.goto(`http://127.0.0.1:${port}/`);
      const text = await report(fresh, 'Automatic setup');
      ok('a browser opening a local mailer after setup takes the URLs with no taps, and no key', new RegExp(`${KEYS.length} of ${KEYS.length} set from setup`).test(text) && /sign in with the code mailed to you/.test(text), text.slice(0, 400));
      ok('it then checks every flow from the browser', (text.match(/Healthy and verified/g) || []).length === KEYS.length, text.slice(0, 600));
      const st = await fresh.evaluate(() => ({ send: window.DGO_MAILER.state.settings.endpoints.MAIL_SEND, op: window.DGO_MAILER.state.settings.operator.email }));
      ok('the URLs are saved, and it asks for sign-in next', st.send === `${base}/MAIL_SEND` && await fresh.isVisible('h1:has-text("Sign in")'));
      ok('the settings file is deleted once taken', !fs.existsSync(handover));
      ok('the status pill reads Live', await fresh.isVisible('.pill-ok:has-text("Live")'));
      ok('no script errors after setup', errs.length === 0, errs.join('\n     '));
    } finally { child.kill(); await ctx.close(); }
  }

  /* Shared letter HTML is cleaned before the editor puts it into the page (sanitize.js). */
  const cleaned = await page.evaluate(async () => {
    /* The module is the app's own, resolved against the page (not this test file). */
    const spec = document.querySelector('script[type=importmap]') ? 'dgo/js/sanitize.js' : new URL(['js', 'sanitize.js'].join('/'), document.baseURI).href;
    const { sanitizeHtml } = await import(spec);
    return sanitizeHtml('<meta http-equiv="refresh" content="0;url=https://evil.example"><style>body{display:none}</style>'
      + '<p style="position:fixed;inset:0;color:red" onclick="alert(1)" class="callout">Dear {{Addressee}}<script>alert(2)</script>'
      + '<a href="javascript:alert(3)">x</a> <a href="https://nitda.gov.ng">site</a><img src="x" onerror="alert(4)"></p><iframe src="https://evil.example"></iframe>');
  });
  ok('letter HTML from SharePoint loses meta, style, script, iframe, handlers, classes, javascript: links and page-escaping styles',
    !/<meta|<style|<script|<iframe|onclick|onerror|class=|javascript:|position|inset/i.test(cleaned)
    && /<p style="color: ?red;?">Dear \{\{Addressee\}\}/.test(cleaned) && /href="https:\/\/nitda\.gov\.ng"/.test(cleaned), cleaned);

  ok('no script or CSP errors in the console', problems.length === 0, problems.join('\n     '));
} catch (e) {
  failed++;
  console.log(`  ❌ the journey stopped: ${e.message}`);
  await page.screenshot({ path: path.join(fixtures, 'failure.png'), fullPage: true }).catch(() => {});
  console.log(`     screenshot: tests/.mailer-fixtures/failure.png`);
} finally {
  await browser.close();
  mock.server.close();
  site.close();
  if (!failed) fs.rmSync(fixtures, { recursive: true, force: true });
  if (pkgRoot && !failed) fs.rmSync(path.dirname(pkgRoot), { recursive: true, force: true });
}

console.log(failed ? `\n${failed} failed\n` : '\nall passed\n');
process.exit(failed ? 1 : 0);
