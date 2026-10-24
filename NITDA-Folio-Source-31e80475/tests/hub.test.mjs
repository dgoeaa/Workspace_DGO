#!/usr/bin/env node
/**
 * The Platform Hub answers from the platform registry and nothing else.
 * Spec: docs/architecture/PLATFORM_ACCESS_SPEC.md §7 (T-3, T-6, T-7, T-9).
 *
 * Run: node tests/hub.test.mjs
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Platforms } from '../scripts/platforms.config.mjs';
import { createHub, probeOne } from '../scripts/hub-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failures.push(name); console.log(`  ❌ ${name}`); if (detail) console.log(`     ${detail}`); }
};

console.log('\nPlatform Hub\n');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
ok('npm run hub starts the Hub server', (pkg.scripts.hub || '').includes('hub-server.mjs'));
ok('npm run start:all includes the Hub, because it starts every declared platform',
   (pkg.scripts['start:all'] || '').includes('--all') && Platforms.some(p => p.id === 'hub'));

const hubSrc = ['index.html', 'hub.js'].map(f => fs.readFileSync(path.join(ROOT, 'tools/hub', f), 'utf8')).join('\n');
const named = Platforms.filter(p => p.id !== 'hub' && hubSrc.includes(p.name));
ok('the Hub page hard-codes no platform', named.length === 0, `named: ${named.map(p => p.name).join(', ')}`);

/* A free port, taken and released, so the test never collides with a running platform. */
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });

const port = await freePort();
const server = createHub(port);
await new Promise(r => server.listen(port, '127.0.0.1', r));
const get = (p) => fetch(`http://127.0.0.1:${port}${p}`);

try {
  const res = await get('/api/platforms');
  const body = await res.json();
  ok('/api/platforms answers 200', res.status === 200);
  ok('/api/platforms lists every declared platform',
     Platforms.every(p => body.platforms.some(x => x.id === p.id)));
  const leaked = body.platforms.filter(x => 'env' in x || 'command' in x || 'serveFrom' in x || 'ensureEnvDirs' in x);
  ok('/api/platforms leaks no command, env or filesystem path', leaked.length === 0,
     `leaked on: ${leaked.map(x => x.id).join(', ')}`);
  ok('/api/platforms carries the audiences in display order', body.audiences.map(a => a.id).join() === 'staff,admin,engineering,public');

  const page = await get('/');
  ok('/ serves the Hub page', page.status === 200 && (await page.text()).includes('<title>Platform Hub</title>'));
  ok('the Hub refuses to serve outside tools/hub', (await get('/..%2Fscripts%2Fplatforms.config.mjs')).status === 404);
  ok('the Hub refuses non-GET', (await fetch(`http://127.0.0.1:${port}/api/status`, { method: 'POST' })).status === 405);

  const dead = await freePort();
  const t0 = Date.now();
  const r = await probeOne({ port: dead, probe: '/' }, '127.0.0.1');
  ok('a port with no listener reports down within 3 s', r.state === 'down' && Date.now() - t0 < 3000, JSON.stringify(r));

  const self = await probeOne({ port, probe: '/api/platforms' }, '127.0.0.1');
  ok('a listening platform reports up', self.state === 'up', JSON.stringify(self));
} finally {
  server.close();
}

/* FR-12: the pages people reach from the Hub offer a way back to it. */
for (const f of ['tools/admin-console.html', 'tools/flow-workbench/index.html']) {
  ok(`${f} links back to the Platform Hub`, /data-hub-link[^>]*href="http:\/\/localhost:8079\/"/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
}
ok('the Workspace menu says the role filter is advisory while sign-in is off',
   fs.readFileSync(path.join(ROOT, 'shared/shell.js'), 'utf8').includes('data-platforms-advisory'));

/* T-9: the public portal never points into the internal estate. */
const internalPorts = Platforms.filter(p => p.exposure !== 'public').map(p => p.port);
const offenders = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.(html|js|css|json|webmanifest)$/.test(e.name)) {
      const src = fs.readFileSync(f, 'utf8');
      for (const port of internalPorts) {
        if (new RegExp(`(localhost|127\\.0\\.0\\.1):${port}\\b`).test(src)) offenders.push(`${path.relative(ROOT, f)} → :${port}`);
      }
      if (/platform hub/i.test(src)) offenders.push(`${path.relative(ROOT, f)} → Platform Hub`);
    }
  }
};
walk(path.join(ROOT, 'document-portal'));
ok('the Document Portal links to no internal platform', offenders.length === 0, offenders.join('; '));

if (failures.length) {
  console.log(`\n  ${passed} passed, ${failures.length} FAILED\n`);
  process.exit(1);
}
console.log(`\n  ✅ ${passed}/${passed} assertions hold\n`);
