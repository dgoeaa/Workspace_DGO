#!/usr/bin/env node
/**
 * Every platform this repository can run is declared once, and everything that has to agree
 * with that declaration does.
 *
 * WHY THIS EXISTS
 *
 * Five things in this tree can be started. Three of them — the Admin Console, the Flow
 * Workbench and the Flow Capsule registry — had run instructions only inside their own
 * README, no entry in package.json, and no port anyone had written down. The two that did
 * have npm scripts both claimed port 8080, so `npm start` and `npm run serve:portal` could
 * not run at the same time and nothing said so.
 *
 * scripts/platforms.config.mjs is now the one declaration. This suite is what stops it
 * becoming a fourth place that describes the platforms inaccurately:
 *
 *   1. The registry is internally coherent — unique ids, unique ports, no missing fields.
 *   2. Every entry point and served directory it names is really on disk.
 *   3. package.json exposes exactly one `start:<id>` per platform, and `start:all`.
 *   4. .devcontainer/devcontainer.json forwards and labels every port.
 *   5. README.md documents every platform's command and port.
 *   6. THE PORTS THE PYTHON PLATFORMS CLAIM MATCH THE PORTS THEIR OWN SOURCE BINDS.
 *
 * (6) is the one that earns the file. The Workbench relay hardcodes its port and refuses
 * browser requests from any other origin, and the Capsule defaults its own. If either moves
 * and this registry does not, `npm run start:workbench` prints a URL that serves a page
 * which loads and cannot send — a failure that reports itself as a CORS error in the
 * browser console and names nothing in this repository.
 *
 * Run: node tests/platforms.test.mjs
 * Exit: 0 = the declaration matches the tree, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Audiences, Exposures, Groups, Platforms, inGroup, README_MARKERS, ids, markdownTable, scriptName, visibleTo } from '../scripts/platforms.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failures.push(name); console.log(`  ❌ ${name}`); if (detail) console.log(`     ${detail}`); }
};

const pkg = JSON.parse(read('package.json'));
/* devcontainer.json is JSONC — the file carries //-comments by convention and VS Code
   accepts them. Strip whole-line comments rather than pulling in a parser for it. */
const devcontainer = JSON.parse(read('.devcontainer/devcontainer.json').replace(/^\s*\/\/.*$/gm, ''));
const readme = read('README.md');

console.log('\nRunnable platforms\n');

/* ------------------------------------------------------------------ *
 * 1. The registry is coherent
 * ------------------------------------------------------------------ */

ok('there are platforms to check', Platforms.length > 0);

ok('every id is unique', new Set(ids()).size === Platforms.length,
   `ids: ${ids().join(', ')}`);

const ports = Platforms.map(p => p.port);
const duplicatePorts = ports.filter((v, i) => ports.indexOf(v) !== i);
ok('no two platforms claim the same port', duplicatePorts.length === 0,
   `two platforms on one port cannot both run — ${duplicatePorts.join(', ')}`);

const REQUIRED = ['id', 'name', 'summary', 'port', 'kind', 'serveFrom', 'entry', 'openPath', 'needs'];
for (const p of Platforms) {
  const missing = REQUIRED.filter(k => p[k] === undefined || p[k] === '');
  ok(`${p.id}: declares every required field`, missing.length === 0, `missing: ${missing.join(', ')}`);
  ok(`${p.id}: port is a usable TCP port`,
     Number.isInteger(p.port) && p.port > 1023 && p.port < 65536,
     `a port below 1024 needs privilege the developer running this does not have`);
  ok(`${p.id}: openPath is rooted`, typeof p.openPath === 'string' && p.openPath.startsWith('/'));
  ok(`${p.id}: kind is one this launcher can start`, ['static', 'python', 'node'].includes(p.kind),
     `got ${p.kind}; scripts/run-platform.mjs handles 'static', 'python' and 'node'`);
  /* A python platform without a command cannot be started; a static one with a command
     would have it silently ignored, which is worse than refusing it. */
  if (p.kind === 'python' || p.kind === 'node') {
    ok(`${p.id}: names the command that starts it`,
       Array.isArray(p.command) && typeof p.command[0] === 'string' && Array.isArray(p.command[1]));
  } else {
    ok(`${p.id}: static platforms carry no command`, p.command === undefined,
       'a static platform is served in-process; a command here would be ignored');
  }
}

/* ------------------------------------------------------------------ *
 * 1b. Every platform is classified — docs/architecture/PLATFORM_ACCESS_SPEC.md FR-1
 * ------------------------------------------------------------------ */

const audienceIds = Audiences.map(a => a.id);
for (const p of Platforms) {
  const missing = ['audience', 'category', 'purpose', 'owner', 'exposure', 'probe'].filter(k => !p[k]);
  ok(`${p.id}: declares its access fields`, missing.length === 0, `missing: ${missing.join(', ')}`);
  ok(`${p.id}: audience is known`, audienceIds.includes(p.audience), `got ${p.audience}`);
  ok(`${p.id}: exposure is known`, Exposures.includes(p.exposure), `got ${p.exposure}`);
  ok(`${p.id}: purpose is plain and short`, typeof p.purpose === 'string' && p.purpose.length <= 140,
     `${p.purpose?.length} chars; the Hub shows it on a card`);
  ok(`${p.id}: probe is rooted`, typeof p.probe === 'string' && p.probe.startsWith('/'));
  if (p.fallbackFor) ok(`${p.id}: is a fallback for a platform that exists`, ids().includes(p.fallbackFor));
  if (p.audience === 'engineering') ok(`${p.id}: engineering platforms stay on localhost`, p.exposure === 'local');
}
ok('a viewer sees no admin or engineering platform',
   visibleTo('viewer').every(p => p.audience === 'staff' || p.audience === 'public'));
ok('a systemAdmin sees every platform', visibleTo('systemAdmin').length === Platforms.length);
/* 2026-10-22: the Estate Console, the Flow Workbench and the Platform Hub are parts of the Centre (its Estate Console
   section, Test a flow and Portfolio); none is a platform of its own any more. */
ok('the five applications are declared, and only those', JSON.stringify(ids()) === JSON.stringify(['runtime', 'portal', 'mailer', 'capsule', 'centre']), ids().join(', '));

/* ------------------------------------------------------------------ *
 * 1c. Every platform is in exactly one group, and no group depends on Control
 * ------------------------------------------------------------------ */

const groupIds = Groups.map(g => g.id);
for (const p of Platforms) ok(`${p.id}: group is known`, groupIds.includes(p.group), `got ${p.group}`);
for (const g of groupIds) {
  ok(`group ${g} has a platform`, inGroup(g).length > 0);
  ok(`npm run start:${g} starts that group`, pkg.scripts?.[`start:${g}`] === `node scripts/run-platform.mjs --group ${g}`);
}
ok('the public group holds only public platforms', inGroup('public').every(p => p.audience === 'public' && p.exposure === 'public'));
ok('no public platform sits outside the public group', Platforms.filter(p => p.audience === 'public').every(p => p.group === 'public'));
ok('every control platform is localhost only', inGroup('control').every(p => p.exposure === 'local'));
ok('every engineering platform is in control', Platforms.filter(p => p.audience === 'engineering').every(p => p.group === 'control'));

/* Code a public or staff platform ships must not name a Control platform's port or source.
   config/platforms.data.js is exempt: it is the generated link list. */
const CONTROL_REF = new RegExp(`(:|port\\W{0,4})(${inGroup('control').map(p => p.port).join('|')})\\b|` +
  inGroup('control').map(p => p.serveFrom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
const SHIPPED = { runtime: ['index.html', 'core', 'modules', 'config', 'shared'], portal: ['document-portal'],
  mailer: ['mailer'] };
const walk = (rel) => {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [rel];
  return fs.readdirSync(full).filter(n => n !== 'node_modules').flatMap(n => walk(path.join(rel, n)));
};
for (const p of [...inGroup('public'), ...inGroup('staff')]) {
  ok(`${p.id}: shipped paths are declared for the group check`, Array.isArray(SHIPPED[p.id]));
  const hits = (SHIPPED[p.id] || []).flatMap(walk)
    .filter(f => /\.(m?js|html|css|json|webmanifest)$/.test(f) && f !== path.join('config', 'platforms.data.js'))
    .filter(f => CONTROL_REF.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  ok(`${p.id}: depends on no Control platform`, hits.length === 0, hits.join(', '));
}

/* ------------------------------------------------------------------ *
 * 2. It describes files that exist
 * ------------------------------------------------------------------ */

for (const p of Platforms) {
  const entry = path.join(ROOT, p.entry);
  ok(`${p.id}: entry point ${p.entry} is in the tree`, fs.existsSync(entry));

  const dir = path.join(ROOT, p.serveFrom);
  ok(`${p.id}: serves a directory that exists (${p.serveFrom})`,
     fs.existsSync(dir) && fs.statSync(dir).isDirectory());

  /* The entry point must be inside the directory that gets served, or the URL the launcher
     prints resolves to nothing. This is the check that fails when a platform's files move. */
  ok(`${p.id}: the entry point is inside the served directory`,
     path.resolve(entry).startsWith(path.resolve(dir)),
     `${p.entry} is not under ${p.serveFrom}`);
}

/* ------------------------------------------------------------------ *
 * 3. package.json exposes each one
 * ------------------------------------------------------------------ */

for (const p of Platforms) {
  const name = scriptName(p.id);
  const script = pkg.scripts[name];
  ok(`${p.id}: npm run ${name} exists`, typeof script === 'string',
     `every platform needs one command that starts it`);
  if (script) {
    ok(`${p.id}: npm run ${name} starts this platform`,
       script.includes('run-platform.mjs') && new RegExp(`\\b${p.id}\\b`).test(script),
       `got: ${script}`);
  }
}

ok('npm run start:all exists and starts every platform',
   typeof pkg.scripts['start:all'] === 'string' && pkg.scripts['start:all'].includes('--all'),
   `got: ${pkg.scripts['start:all']}`);

ok('npm run platforms lists them',
   typeof pkg.scripts.platforms === 'string' && pkg.scripts.platforms.includes('--list'),
   `got: ${pkg.scripts.platforms}`);

ok('this suite is in the non-browser gate',
   (pkg.scripts['test:node'] || '').includes('npm run test:platforms'),
   'a gate that CI never runs reports the state of whoever last ran it by hand');

/* ------------------------------------------------------------------ *
 * 4. The devcontainer forwards each port
 * ------------------------------------------------------------------ */

const forwarded = devcontainer.forwardPorts || [];
for (const p of Platforms) {
  ok(`${p.id}: port ${p.port} is forwarded in the devcontainer`, forwarded.includes(p.port),
     `a codespace serving a port it does not forward is unreachable from the browser`);
  ok(`${p.id}: port ${p.port} is labelled in the Ports panel`,
     Boolean(devcontainer.portsAttributes?.[String(p.port)]?.label),
     `an unlabelled port reads as a bare number in the Ports panel`);
}

/* ------------------------------------------------------------------ *
 * 5. README documents each one
 * ------------------------------------------------------------------ */

for (const p of Platforms) {
  ok(`${p.id}: README names \`npm run ${scriptName(p.id)}\``,
     readme.includes(`npm run ${scriptName(p.id)}`),
     'a command nobody can find is a command nobody runs');
  ok(`${p.id}: README states port ${p.port}`, readme.includes(String(p.port)));
}

{
  const [begin, end] = README_MARKERS;
  const i = readme.indexOf(begin), j = readme.indexOf(end);
  ok('README carries the generated platform table markers', i >= 0 && j > i);
  ok('README platform table is what the registry generates (npm run platforms:readme)',
     i >= 0 && j > i && readme.slice(i + begin.length, j).trim() === markdownTable(),
     'the table was edited by hand or the registry changed; run npm run platforms:readme');
}

/* ------------------------------------------------------------------ *
 * 6. The Python platforms' ports match their own source
 * ------------------------------------------------------------------ */

const capsule = Platforms.find(p => p.id === 'capsule');
if (capsule) {
  const src = read('tools/flow-capsule/app/flowcapsule.py');
  const bound = src.match(/FLOWCAP_PORT'\s*,\s*'(\d+)'/);
  ok('the Capsule registry still defaults to the port the registry claims',
     bound !== null && Number(bound[1]) === capsule.port,
     `flowcapsule.py defaults to ${bound ? bound[1] : 'an unreadable value'}, registry says ${capsule.port}`);
}

const centre = Platforms.find(p => p.id === 'centre');
if (centre) {
  const settings = JSON.parse(read('tools/admin-centre/config/settings.json'));
  ok('the Administration Centre still binds the port the registry claims',
     settings.port === centre.port && settings.bindHost === '127.0.0.1',
     `settings.json binds ${settings.bindHost}:${settings.port}, registry says ${centre.port}`);
}

/* The runtime's port is named in three other places that were written before this registry
   existed. They are allowed to keep naming it; they are not allowed to disagree with it. */
const runtime = Platforms.find(p => p.id === 'runtime');
if (runtime) {
  ok('`npm start` serves the runtime on the port the registry claims',
     (pkg.scripts.start || '').includes(`-p ${runtime.port}`),
     `npm start: ${pkg.scripts.start}`);
  ok('the dev server defaults to the same port',
     new RegExp(`PORT\\s*\\|\\|\\s*${runtime.port}`).test(read('scripts/dev-server.mjs')),
     'scripts/dev-server.mjs and the runtime should answer on the same port, one at a time');
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

console.log(`\n  ${Platforms.length} platforms: ${ids().join(', ')}`);
if (failures.length) {
  console.log(`\n  ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.log(`    ✖ ${f}`);
  console.log('');
  process.exit(1);
}
console.log(`\n  ✅ ${passed}/${passed} assertions hold\n`);
process.exit(0);
