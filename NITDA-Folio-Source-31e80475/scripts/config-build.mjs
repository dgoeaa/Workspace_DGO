#!/usr/bin/env node
/**
 * The three deployed config files: is a rebuild needed, and build them when it is (or when asked).
 *
 *   npm run config:drift                 read every endpoint address live, compare with the last delivered build;
 *                                        exit 0 current, 3 rebuild suggested, 1 cannot read
 *   npm run config:rebuild [-- --out DIR] [--portal-no-service-worker]
 *                                        read live and write, privately (mode 0600, outside the repository by default):
 *                                          workspace/  the Folio Workspace site, config/config.local.js wired
 *                                          CG/         the Document Portal site, config.local.js wired
 *                                          FOLIO-WORKSPACE-v<version>-upload-to-site-root.zip, FOLIO-PORTAL-v<version>-…zip
 *                                          (--mailer PATH puts the published mailer.html in the Workspace upload)
 *                                          FOLIO-MAILER-v<version>-endpoints.config.local.js  the Mailer's seven addresses
 *                                        then record the build in registers/config-build-ledger.json (no URL)
 *
 * Every package is identified (scripts/lib/package-identity.mjs): one rebuild is one version, YYYY.MM.DD-N, carried in
 * each zip's name, in the BUILD-ID.json inside it, on screen in the Workspace and the Portal, and in the ledger.
 *
 * Two ways in, one rule: the owner asks for a rebuild, or config:drift finds an address that changed (a trigger key
 * regenerated or renamed, a flow recreated, a key moved to another flow) and suggests one. flows:update apply runs the
 * drift check after it writes. Sign-in: FOLIO_MS_SESSION (the saved Folio sign-in); behind a proxy NODE_USE_ENV_PROXY=1.
 *
 * The Workspace is built with sign-in enforced (auth.enabled true, roleSource verified: G-04). Files that carry the
 * flow catalogue or the endpoint checker are removed from the upload trees: they hold every URL and are not part of a
 * public site. The Mailer is published as one mailer.html by its own package (node tools/setup.mjs --refresh-mailer,
 * or full setup when its addresses changed); this writes the addresses it must carry.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { keyPlan, readLive, compare, ledgerOf, verdict, VARIANTS } from './lib/config-drift.mjs';
import { nextVersion, stamp as stampId, zipName } from './lib/package-identity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TENANT = 'ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const ENV = `Default-${TENANT}`;
const LEDGER = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/config-build-ledger.json');
const ADOPTION = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json');
const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('--')) || 'drift';
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const DEV_ONLY = ['DEPLOY.md', 'ENDPOINT-CHECK.html', 'ENDPOINT-CHECK-STANDALONE.html', 'ENDPOINT_PROVISIONING.md', 'FLOW_CATALOGUE.json', 'PACKAGE_MANIFEST.json', 'LICENSE', 'README.md'];
const PORTAL_NOT_AT_SUBPATH = ['sitemap.xml', 'robots.txt']; /* absolute against a host root; meaningless under /CG/ */

if (!['drift', 'rebuild'].includes(cmd)) { console.log('usage: node scripts/config-build.mjs [drift | rebuild [--out DIR]]'); process.exit(2); }

async function signedApi(sessionFile) {
  const s = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  const t = await (await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: s.clientId, refresh_token: s.refreshToken, scope: 'https://service.flow.microsoft.com//.default offline_access openid profile' }) })).json();
  if (!t.access_token) throw new Error(`sign-in: ${t.error || 'refused'}`);
  if (t.refresh_token) fs.writeFileSync(sessionFile, JSON.stringify({ ...s, refreshToken: t.refresh_token }, null, 2), { mode: 0o600 });
  return async (method, p, body) => {
    const r = await fetch(`https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${ENV}${p}${p.includes('?') ? '&' : '?'}api-version=2016-11-01`,
      { method, headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const txt = await r.text(); let json = null; try { json = txt ? JSON.parse(txt) : null; } catch { json = null; }
    return { ok: r.ok, status: r.status, body: json };
  };
}

const readLedger = () => (fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : null);

if (!process.env.FOLIO_MS_SESSION) { console.error('FOLIO_MS_SESSION must name the saved Folio sign-in.'); process.exit(1); }
const api = await signedApi(process.env.FOLIO_MS_SESSION);
const plan = keyPlan(JSON.parse(fs.readFileSync(ADOPTION, 'utf8')));
const live = await readLive(api, plan);

if (cmd === 'drift') {
  const result = compare(live, readLedger());
  console.log(verdict(result));
  process.exit(result.rebuild ? 3 : 0);
}

/* ── rebuild ── */
const blocked = live.filter((r) => !['READ', 'EMPTY_BY_DECISION'].includes(r.status));
if (blocked.length) {
  console.error('Cannot build: these keys have no servable address. Nothing was written.');
  for (const r of blocked) console.error(`  ${VARIANTS[r.variant].label.padEnd(22)} ${r.key.padEnd(24)} ${r.status}${r.flow ? ` (${r.flow})` : ''}`);
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = path.resolve(opt('--out') || path.join(os.homedir(), 'folio-config-build', stamp));
fs.mkdirSync(OUT, { recursive: true, mode: 0o700 });
const values = path.join(OUT, '.values.txt');
const lines = live.filter((r) => r.status === 'READ' && r.variant !== 'mailer').map((r) => `${r.variant === 'workspace' ? 'DGO_ENDPOINT_' : 'PF_ENDPOINT_'}${r.key}=${r.url}`);
fs.writeFileSync(values, [...lines, 'DGO_AUTH_ENABLED=true', 'DGO_AUTH_ROLE_SOURCE=verified', ''].join('\n'), { mode: 0o600 });
const dist = path.join(OUT, '.dist');
try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/package.mjs'), '--values', values, '--out', dist], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  for (const d of ['dgo-internal-platform', 'dgo-document-portal']) execFileSync(process.execPath, [path.join(ROOT, 'scripts/package.mjs'), '--verify', path.join(dist, d)], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
} finally { fs.rmSync(values, { force: true }); }
const tree = (from, to, drop) => { fs.cpSync(from, to, { recursive: true }); for (const f of drop) fs.rmSync(path.join(to, f), { force: true }); };
tree(path.join(dist, 'dgo-internal-platform'), path.join(OUT, 'workspace'), DEV_ONLY);
tree(path.join(dist, 'dgo-document-portal'), path.join(OUT, 'portal', 'CG'), [...DEV_ONLY, ...PORTAL_NOT_AT_SUBPATH]);
fs.rmSync(dist, { recursive: true, force: true });
/* --portal-no-service-worker: for a host that refuses service-worker registration (the free host's bot check answers
   the browser's worker-script request with HTML, 2026-10-17). The Portal then does not try (document-portal/js/core.js
   reads PF_CONFIG.serviceWorker); it works online, without the offline shell. */
if (args.includes('--portal-no-service-worker')) {
  fs.appendFileSync(path.join(OUT, 'portal', 'CG', 'config.local.js'),
    '\n/* Built with --portal-no-service-worker: this host refuses service-worker registration, so the offline shell is off. */\n'
    + 'if (window.PF_CONFIG.serviceWorker === undefined) window.PF_CONFIG.serviceWorker = false;\n');
}
/* The Mailer is published as one mailer.html beside the Workspace (owner, 2026-10-19). --mailer names the file its
   package wrote; it rides in the Workspace upload and its digest in the Workspace's BUILD-ID.json. */
const MAILER = opt('--mailer') || process.env.FOLIO_MAILER_HTML || '';
let mailerId = null;
if (MAILER) {
  const html = fs.readFileSync(MAILER);
  fs.writeFileSync(path.join(OUT, 'workspace', 'mailer.html'), html);
  mailerId = { file: 'mailer.html', sha256: (await import('node:crypto')).createHash('sha256').update(html).digest('hex').slice(0, 16) };
}
let commit = ''; try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch { /* not a clone */ }
const builtUtc = new Date().toISOString();
const version = nextVersion(readLedger());
const ids = {
  workspace: stampId(path.join(OUT, 'workspace'), { product: 'WORKSPACE', version, commit, builtUtc, extra: { mailer: mailerId } }),
  portal: stampId(path.join(OUT, 'portal', 'CG'), { product: 'PORTAL', version, commit, builtUtc }),
};
const Z = {
  workspace: zipName('WORKSPACE', version, 'upload-to-site-root'),
  portal: zipName('PORTAL', version, 'upload-to-site-root'),
  portalRoot: zipName('PORTAL', version, 'upload-to-portal-site-root'),
  mailer: `FOLIO-MAILER-v${version}-endpoints.config.local.js`,
};
execFileSync('zip', ['-qrX', path.join(OUT, Z.workspace), '.'], { cwd: path.join(OUT, 'workspace') });
execFileSync('zip', ['-qrX', path.join(OUT, Z.portal), 'CG'], { cwd: path.join(OUT, 'portal') });
/* The same Portal with its files at the top of the zip, for a host where the Portal is the site itself
   (folio-portal.page.gd, owner 2026-10-17). Its pages use relative paths only. */
execFileSync('zip', ['-qrX', path.join(OUT, Z.portalRoot), '.'], { cwd: path.join(OUT, 'portal', 'CG') });
const mail = live.filter((r) => r.variant === 'mailer');
fs.writeFileSync(path.join(OUT, Z.mailer), `// FOLIO-MAILER v${version}: the Mailer's seven flow addresses, read ${builtUtc}. Signed URLs: private.\n// Publish through the Mailer package (node tools/setup.mjs --refresh-mailer, or full setup when these changed).\nwindow.DGO_MAILER_CONFIG_LOCAL = { endpoints: {\n${mail.map((r) => `  ${r.key}: '${r.url}', // ${r.flow}`).join('\n')}\n} };\n`, { mode: 0o600 });
for (const f of fs.readdirSync(OUT)) if (/\.(zip|js)$/.test(f)) fs.chmodSync(path.join(OUT, f), 0o600);

const before = compare(live, readLedger());
const builds = Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, { label: v.label, file: k === 'workspace' ? Z.workspace : Z.portal, codeFingerprint: v.codeFingerprint, configDigest: v.configDigest, files: v.files, ...(v.mailer ? { mailer: v.mailer } : {}) }]));
fs.writeFileSync(LEDGER, `${JSON.stringify(ledgerOf(live, { builtUtc, commit, version, builds }), null, 2)}\n`);
console.log(`Built v${version} (commit ${commit.slice(0, 8)}) in ${OUT}`);
console.log(`  ${Z.workspace}  Workspace: ${live.filter((r) => r.variant === 'workspace' && r.status === 'READ').length} addresses, sign-in enforced, code ${ids.workspace.codeFingerprint}, config ${ids.workspace.configDigest}${mailerId ? `, mailer ${mailerId.sha256}` : ', NO mailer.html (pass --mailer)'}`);
console.log(`  ${Z.portal}  Portal under CG/: ${live.filter((r) => r.variant === 'portal' && r.status === 'READ').length} addresses, code ${ids.portal.codeFingerprint}, config ${ids.portal.configDigest}`);
console.log(`  ${Z.portalRoot}  the same Portal, files at the site root${args.includes('--portal-no-service-worker') ? ', offline shell off' : ''}`);
console.log(`  ${Z.mailer}  Mailer: ${mail.filter((r) => r.status === 'READ').length} addresses`);
console.log(before.rebuild ? `Changed since the last build: ${before.variants.map((v) => VARIANTS[v].label).join(', ')}. Redeploy those.` : 'No address changed since the last build; redeploying is optional.');
console.log(`Recorded in ${path.relative(ROOT, LEDGER)} (no URL). Commit it, then delete ${OUT} once deployed.`);
