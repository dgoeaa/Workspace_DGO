#!/usr/bin/env node
// Serve the DGO Correspondence Mailer from this package. Node 18+, no dependencies.
//
//   node tools/serve.mjs                 http://localhost:8083/  (uses web/config.local.js if present)
//   node tools/serve.mjs --mock          also start the mock flows on :8084 and point the app at them
//   node tools/serve.mjs --open          also open it in the default browser once it is listening
//                                        (on Android, in Termux, through termux-open-url)
//   node tools/serve.mjs --port 9000 --host 0.0.0.0
//   node tools/serve.mjs --restore-dir DIR   where to look for hand-overs (default: the folder
//                                        "restore" beside this package, e.g. C:\DGO\restore or
//                                        ~/dgo/restore). Two files are handed to the page once each:
//                                          settings.json  written by tools/setup.mjs
//                                          export.zip     a PC export moved there by the installer
//   node tools/serve.mjs --offer-restore FILE   hand a full export (.zip) to the app once: a browser
//                                        with no mailer data restores it on opening, then the file
//                                        is deleted. The Termux installer uses this to move a PC's
//                                        setup onto the phone. Loopback only.
//
// This is for running the mailer on one machine. For a shared deployment, upload the web/
// folder to any HTTPS static host (SharePoint, Azure Static Web Apps, IIS, nginx).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..', 'web');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const PORT = Number(arg('--port', process.env.PORT || 8083));
const HOST = arg('--host', '127.0.0.1');
const MOCK = process.argv.includes('--mock');
const OPEN = process.argv.includes('--open');
const MOCK_PORT = Number(arg('--mock-port', 8084));
const LOOPBACK = HOST === '127.0.0.1' || HOST === 'localhost';
const RESTORE_DIR = path.resolve(arg('--restore-dir', path.resolve(HERE, '..', '..', 'restore')));
const OFFER = path.resolve(arg('--offer-restore', path.join(RESTORE_DIR, 'export.zip')));
const SETTINGS = path.join(RESTORE_DIR, 'settings.json');
if (arg('--offer-restore', '') && !LOOPBACK) { console.error('--offer-restore only works with the default --host 127.0.0.1: the export can hold the operator key.'); process.exit(1); }

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.zip': 'application/zip',
};

let mockConfig = null;
if (MOCK) {
  const { createMockFlows, KEYS } = await import(pathToFileURL(path.join(HERE, 'mock-flows.mjs')).href);
  const key = arg('--key', 'mock-operator-key-0001');
  const operator = arg('--operator', 'operator@nitda.gov.ng');
  const { server } = createMockFlows({ operatorKey: key, operators: [{ email: operator, name: 'Demo Operator', role: 'admin' }], log: (m) => console.log(`Mock mailbox — ${m}`) });
  await new Promise((r) => server.listen(MOCK_PORT, '127.0.0.1', r));
  const base = `http://127.0.0.1:${MOCK_PORT}`;
  mockConfig = `window.DGO_MAILER_CONFIG_LOCAL = { endpoints: { ${KEYS.map((k) => `${k}: '${base}/${k}'`).join(', ')} } };\n`;
  console.log(`Mock flows on ${base} — nothing is emailed. Sign in as ${operator}: the code appears here.`);
}

const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (mockConfig && rel === '/config.local.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
    res.end(mockConfig);
    return;
  }
  if (rel.startsWith('/__restore/')) { restoreRoute(req, res, rel); return; }
  const file = path.resolve(WEB, `.${rel === '/' ? '/index.html' : rel}`);
  if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  fs.createReadStream(file).pipe(res);
});

/* The one-time hand-over of an export. Only this page may take it: the Host must be this
   loopback address (no DNS rebinding) and a browser's Sec-Fetch-Site, when sent, must say the
   request came from the page itself. */
function restoreRoute(req, res, rel) {
  const json = (code, body) => { res.writeHead(code, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const hostOk = [`127.0.0.1:${PORT}`, `localhost:${PORT}`].includes(req.headers.host || '');
  const site = req.headers['sec-fetch-site'];
  if (!LOOPBACK || !hostOk || (site && site !== 'same-origin')) { json(403, { pending: false }); return; }
  const pending = fs.existsSync(OFFER);
  const settings = fs.existsSync(SETTINGS);
  if (rel === '/__restore/info.json' && req.method === 'GET') {
    json(200, { pending, settings, ...(pending ? { name: path.basename(OFFER), size: fs.statSync(OFFER).size } : {}) });
  } else if (rel === '/__restore/export.zip' && req.method === 'GET' && pending) {
    res.writeHead(200, { 'Content-Type': TYPES['.zip'], 'Cache-Control': 'no-store' });
    fs.createReadStream(OFFER).pipe(res);
  } else if (rel === '/__restore/done' && req.method === 'POST') {
    if (pending) { fs.rmSync(OFFER, { force: true }); console.log('The export was handed to the app and deleted from this device.'); }
    json(200, { pending: false });
  } else if (rel === '/__restore/settings.json' && req.method === 'GET' && settings) {
    res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
    fs.createReadStream(SETTINGS).pipe(res);
  } else if (rel === '/__restore/settings-done' && req.method === 'POST') {
    if (settings) { fs.rmSync(SETTINGS, { force: true }); console.log('The settings from setup were handed to the app and deleted from this device.'); }
    json(200, { settings: false });
  } else json(404, { pending: false });
}

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE'
    ? `Port ${PORT} is already in use — most likely the mailer is already running. Use the copy that is open, or stop it first (Windows: close its black window; Termux or Linux: pkill -f tools/serve.mjs). Another port works too (--port 9083), but the browser keeps separate data for each port.`
    : e.message);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`DGO Correspondence Mailer: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') console.log('Warning: listening beyond this machine.');
  if (!MOCK && !fs.existsSync(path.join(WEB, 'config.local.js'))) console.log('No web/config.local.js: the app opens in Simulation mode until endpoints are set in Settings.');
  if (LOOPBACK && fs.existsSync(SETTINGS)) console.log('Settings from setup waiting for the app: it takes them when it opens.');
  if (LOOPBACK && fs.existsSync(OFFER)) console.log(`Export waiting for the app: ${path.basename(OFFER)} (restored on opening if this browser has no mailer data yet).`);
  console.log('Ctrl-C to stop.');
  /* Opened here, once the port is listening, so the browser never races the server. The
     address is the one printed above, so the app always opens on the same origin — and so
     sees the same settings and drafts, which the browser keeps per origin. */
  if (OPEN) {
    const url = `http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}/`;
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
      : process.platform === 'darwin' ? ['open', [url]]
      : process.platform === 'android' ? ['termux-open-url', [url]] // Node inside Termux
      : ['xdg-open', [url]];
    try { spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }).on('error', () => {}).unref(); } catch { /* open it by hand */ }
  }
});
