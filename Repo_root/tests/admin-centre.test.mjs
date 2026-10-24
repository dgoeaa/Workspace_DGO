#!/usr/bin/env node
/**
 * The Folio Central Administration Centre agrees with the rest of the repository.
 *
 * tools/admin-centre/tests/ proves the server behaves. This suite proves the Centre has not
 * drifted from the things it describes, and that its client keeps the promises its security
 * design makes. Negative controls throughout: each check is written so that the regression it
 * names would fail it.
 *
 *   1. Its six platforms are the launcher's six: same ports, same entry points, same ids.
 *   2. Its settings are the documented ones, loopback-bound, on the registry's port.
 *   3. The page carries nothing inline, so the server's CSP (script-src 'self') can hold.
 *   4. The client and the server refuse the same credential-shaped text.
 *   5. Its runtime state is git-ignored, and none of it is tracked.
 *   6. It is wired: package.json, the non-browser gate, the brand package list, the docs.
 *
 * Run: node tests/admin-centre.test.mjs
 */

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { Platforms } from '../scripts/platforms.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const DIR = 'tools/admin-centre';

let passed = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failures.push(name); console.log(`  ❌ ${name}`); if (detail) console.log(`     ${detail}`); }
};

console.log('\nFolio Central Administration Centre\n');

/* ── 1. The platforms it governs are the launcher's platforms ─────────────────────── */
const src = read(`${DIR}/server.py`);
const tuples = [...src.matchAll(/\('(\w+)', '([^']+)', '[^']+', '([^']+)', (\d+), '([^']+)', '(\w+)'\)/g)]
  .map((m) => ({ id: m[1], name: m[2], entry: m[3], port: Number(m[4]), probe: m[5], launcher: m[6] }));
/* Every launcher platform except the Centre itself is governed by it (2026-10-22: four, after the Estate Console and the
   Flow Workbench became parts of the Centre). */
ok('server.py governs every launcher platform but the Centre itself', JSON.stringify(tuples.map((t) => t.launcher).sort()) === JSON.stringify(Platforms.filter((p) => p.id !== 'centre').map((p) => p.id).sort()), tuples.map((t) => t.launcher).join(', '));
for (const t of tuples) {
  const p = Platforms.find((x) => x.id === t.launcher);
  ok(`${t.id}: maps to launcher platform ${t.launcher}`, Boolean(p));
  if (!p) continue;
  ok(`${t.id}: same port as the launcher (${p.port})`, t.port === p.port, `server.py says ${t.port}`);
  ok(`${t.id}: same entry point as the launcher`, t.entry === p.entry, `${t.entry} vs ${p.entry}`);
  ok(`${t.id}: same name as the launcher`, t.name === p.name, `${t.name} vs ${p.name}`);
  ok(`${t.id}: entry point exists`, fs.existsSync(path.join(ROOT, t.entry)));
}
/* Where a platform is published, the Centre says the same as the launcher's prodUrl. */
const published = Object.fromEntries([...(src.match(/PUBLISHED = \{([^}]+)\}/) || ['', ''])[1].matchAll(/'(\w+)': '([^']+)'/g)].map((m) => [m[1], m[2]]));
for (const t of tuples) {
  const p = Platforms.find((x) => x.id === t.launcher);
  ok(`${t.id}: published address agrees with the launcher's prodUrl`, (published[t.id] || null) === (p?.prodUrl || null), `${published[t.id]} vs ${p?.prodUrl}`);
}
/* A section the Centre hosts is a page in the repository. */
for (const m of src.matchAll(/'([a-z-]+)': \('([^']+)', (True|False), /g)) {
  ok(`section ${m[1]}: ${m[2]} exists`, m[3] === 'True' ? fs.statSync(path.join(ROOT, m[2])).isDirectory() : fs.statSync(path.join(ROOT, m[2])).isFile());
}
/* The configuration check imports the Estate Console's analysis from the repository through /modules/: the list the
   server serves is exactly that module and what it imports, and the page imports nothing else. */
{
  const modules = [...(src.match(/MODULES = \(([^)]+)\)/) || ['', ''])[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const seen = new Set(), queue = ['core/endpoint-atlas.js'];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of read(f).matchAll(/(?:import|export)[^;]*?from\s+['"](\.[^'"]+)['"]/g)) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
  }
  ok('the served modules are the analysis and exactly what it imports', [...seen].sort().join() === [...modules].sort().join(), `served ${modules.join(', ')}; imported ${[...seen].join(', ')}`);
  const page = read(`${DIR}/static/estate-check.js`);
  const imports = [...page.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  ok('the configuration check imports only served modules', imports.length > 0 && imports.every((i) => i.startsWith('/modules/') && modules.includes(i.slice(9))), imports.join(', '));
}
/* Test a flow offers exactly the Workspace's read-only contracts, each with its own action. */
{
  const { EndpointContracts } = await import(pathToFileURL(path.join(ROOT, 'config/endpoints.config.js')).href);
  const testable = Object.fromEntries([...(src.match(/TESTABLE = \{([^}]+)\}/) || ['', ''])[1].matchAll(/'(\w+)': '([^']+)'/g)].map((m) => [m[1], m[2]]));
  const readOnly = Object.entries(EndpointContracts).filter(([, c]) => c.readOnly === true);
  ok('Test a flow offers exactly the read-only contracts', Object.keys(testable).sort().join() === readOnly.map(([k]) => k).sort().join(), Object.keys(testable).join(', '));
  ok('each testable flow is called with its contract action', readOnly.every(([k, c]) => testable[k] === c.action));
}
const governed = new Set(tuples.map((t) => t.launcher));
/* The Platform Hub is exempt: it holds no data and no state, only links and a status read,
   so there is nothing in it for the Centre to govern (docs/architecture/PLATFORM_ACCESS_SPEC.md). */
const others = Platforms.filter((p) => !governed.has(p.id) && p.id !== 'hub').map((p) => p.id);
ok('every launcher platform except the Centre itself is governed', others.length === 1 && others[0] === 'centre', `ungoverned: ${others.join(', ')}`);

/* ── 2. Settings ──────────────────────────────────────────────────────────────────────── */
const settings = JSON.parse(read(`${DIR}/config/settings.json`));
const documented = ['systemName', 'version', 'bindHost', 'port', 'database', 'adminTokenFile', 'environmentId',
  'sharePointConnectionId', 'healthIntervalSeconds', 'staleAfterSeconds', 'retentionDays', 'timezone', 'auditHashAlgorithm'];
ok('settings carry the 13 documented keys', documented.every((k) => k in settings), documented.filter((k) => !(k in settings)).join(', '));
ok('settings bind loopback', settings.bindHost === '127.0.0.1');
const centre = Platforms.find((p) => p.id === 'centre');
ok('settings port is the launcher port', centre && settings.port === centre.port);
ok('retention is at least seven years', settings.retentionDays >= 2555);
ok('the environment id is the one the repository records', read('config/notification-matrix.config.js').includes(settings.environmentId.replace(/^Default-/, '')) || read('scripts/build-mailer-flows.mjs').includes(settings.environmentId));

/* ── 3. Nothing inline ───────────────────────────────────────────────────────────────── */
const html = read(`${DIR}/static/index.html`);
ok('index.html has no inline <script>', ![...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].some((m) => !/\bsrc=/.test(m[1]) || m[2].trim()));
ok('index.html has no inline <style>', !/<style\b/i.test(html));
ok('index.html has no inline event handlers', !/\son[a-z]+\s*=/i.test(html));
ok('index.html has no style="" attributes', !/\sstyle\s*=/i.test(html));
ok('index.html loads the brand package first', /<link rel="stylesheet" href="brand\/brand\.css">[\s\S]*<link rel="stylesheet" href="app\.css">/.test(html));
const js = read(`${DIR}/static/app.js`);
ok('app.js never evaluates strings', !/\beval\s*\(|new Function\s*\(|setTimeout\(\s*['"]/.test(js));
ok('app.js writes no style="" into markup', !/style="/.test(js));
ok('app.js escapes through one encoder', /function esc\(v\)/.test(js) && /&amp;/.test(js) && /&lt;/.test(js) && /&quot;/.test(js) && /&#39;/.test(js));
ok('app.js keeps the token in sessionStorage only', !/localStorage/.test(js) && /sessionStorage/.test(js));
ok('the server sends a script-src self CSP', /script-src 'self'/.test(src) && /frame-ancestors 'none'/.test(src));

/* ── 4. Client and server refuse the same credentials ───────────────────────────────── */
const jsRe = new Function(`return ${js.match(/var CREDENTIAL = (\/.*\/i);/)[1]}`)();
const samples = [
  ['https://h.api.powerplatform.com/x/workflows/a/triggers/manual/paths/invoke?api-version=1&sp=%2F&sv=1.0&sig=Abc123Def456Ghi', true],
  ['sig=abcdefgh12345678 appended', false], // no leading ? or & — not a query parameter
  ['?sig=abcdefgh12345678', true],
  ['password: hunter22', true],
  ['Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123', true],
  ['client_secret=xyz', true],
  ['fac_' + 'A'.repeat(40), true],
  ['fc_' + 'b'.repeat(40), true],
  ['Portal submissions delayed by 12 minutes', false],
  ['Register the approved transition into local operational use', false],
  ['Rotate the trigger signature for portal:SUBMISSION', false],
];
const py = JSON.parse(execFileSync('python3', ['-c',
  'import json,sys; sys.path.insert(0, sys.argv[1]); import server; print(json.dumps([bool(server.CREDENTIAL.search(s)) for s in json.loads(sys.argv[2])]))',
  path.join(ROOT, DIR), JSON.stringify(samples.map((s) => s[0]))], { encoding: 'utf8', env: { ...process.env, FOLIO_ADMIN_MONITOR: '0' } }));
samples.forEach(([s, want], i) => {
  ok(`credential guard: ${want ? 'refuses' : 'allows'} "${s.slice(0, 44)}${s.length > 44 ? '…' : ''}"`, jsRe.test(s) === want && py[i] === want,
    `client ${jsRe.test(s)}, server ${py[i]}, expected ${want}`);
});

/* ── 4b. The flow owner route stays the flow owner's ────────────────────────────────── */
ok('the Centre never calls an admin-scoped flow path', !/scopes\/admin/.test(src.replace(/never \/scopes\/admin\/|never the \/scopes\/admin\/ ones|any \/scopes\/admin\/ path/g, '')));
const signIn = read('scripts/lib/device-sign-in.mjs');
const clientIds = [...src.matchAll(/\('([0-9a-f-]{36})', '([^']+)'\)/g)].map((m) => m[1]);
ok('the Centre signs in through the same public apps as the mailer setup', clientIds.length === 2 && clientIds.every((id) => signIn.includes(id)), clientIds.join(', '));
ok('the Centre asks for the same flow service scope', src.includes("https://service.flow.microsoft.com//.default") && signIn.includes('https://service.flow.microsoft.com//.default'));
/* Flow tokens never reach the database, and the access token is written nowhere. The one thing
   that may be kept is the refresh token, and only in the session file FOLIO_MS_SESSION names
   (the platform suite's kept sign-in) — unset, the sign-in lives in memory only. */
const sqlStatements = [...src.matchAll(/(['"])((?:INSERT|UPDATE|REPLACE)\b[^'"]*)\1/gi)].map((m) => m[2]);
ok('flow tokens never reach the database', sqlStatements.length > 0 && sqlStatements.every((q) => !/(access|refresh)_?token/i.test(q)) && /_access = None/.test(src));
const saveSession = (/def _save_session\(self\):([\s\S]*?)\n    def /.exec(src) || [])[1] || '';
ok('only the refresh token is ever written, and only to the FOLIO_MS_SESSION file',
  /self\.session_path = Path\(os\.environ\['FOLIO_MS_SESSION'\]\) if os\.environ\.get\('FOLIO_MS_SESSION'\) else None/.test(src)
  && /'refreshToken': self\._refresh/.test(saveSession) && !/_access/.test(saveSession) && /0o600/.test(saveSession));
ok('signed content links from run actions are dropped', /inputsLink \/ outputsLink are signed content URLs/.test(src));

/* ── 5. State stays out of git ───────────────────────────────────────────────────────── */
const ignore = read('.gitignore');
for (const p of ['tools/admin-centre/data/', 'tools/admin-centre/config/admin.token', 'tools/admin-centre/backups/', 'tools/admin-centre/evidence/']) {
  ok(`.gitignore covers ${p}`, ignore.includes(p));
}
const tracked = execFileSync('git', ['ls-files', DIR], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
ok('no database, token, backup or evidence file is tracked', !tracked.some((f) => /\/(data|backups|evidence)\/|admin\.token|\.db$/.test(f)), tracked.filter((f) => /\.db$|admin\.token/.test(f)).join(', '));

/* ── 6. Wiring ──────────────────────────────────────────────────────────────────────── */
const pkg = JSON.parse(read('package.json'));
ok('npm run start:centre exists', /run-platform\.mjs centre/.test(pkg.scripts['start:centre'] || ''));
ok('npm run test:admincentre runs the server suite and this one', /tools\/admin-centre\/tests/.test(pkg.scripts['test:admincentre'] || '') && /admin-centre\.test\.mjs/.test(pkg.scripts['test:admincentre'] || ''));
ok('the non-browser gate runs test:admincentre', (pkg.scripts['test:node'] || '').includes('npm run test:admincentre'));
ok('the brand package list includes the Centre', read('scripts/brand-sync.mjs').includes(`'${DIR}/static'`));
for (const f of ['README.md', '01-design.md', '02-developer-guide.md', '03-provisioning-and-configuration.md', '04-user-guides.md', '05-assessment.md']) {
  ok(`docs/admin-centre/${f} exists`, fs.existsSync(path.join(ROOT, 'docs/admin-centre', f)));
}
ok('the design document names every API route the server answers', (() => {
  const doc = read('docs/admin-centre/01-design.md');
  const routes = [...src.matchAll(/add\('(GET|POST|PUT)', r?'(\/api\/[^']+)'/g)].map((m) => m[2].replace(/\(\\d\+\)/g, '{id}').replace(/\(\[a-z\]\+\)/g, '{id}').replace(/\(\[A-Za-z\]\+\)/g, '{key}').replace(/\(rotate\|disable\|enable\)/, '{action}')
    .replace(/\(\[0-9a-fA-F-\]\{36\}\)/g, '{flowId}').replace(/\(\[0-9A-Za-z\]\+\)/g, '{runId}')
    .replace(/\(turn-on\|turn-off\)|\(resubmit\|cancel\)/, '{action}'));
  const missing = routes.filter((r) => !doc.includes(r));
  if (missing.length) console.log(`     undocumented: ${missing.join(', ')}`);
  return missing.length === 0;
})());

console.log('');
if (failures.length) {
  console.log(`  ${passed} passed, ${failures.length} FAILED\n`);
  process.exit(1);
}
console.log(`  ✅ ${passed}/${passed} assertions hold\n`);
