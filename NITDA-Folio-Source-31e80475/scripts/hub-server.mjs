#!/usr/bin/env node
// The Platform Hub — one front door to every platform in this repository.
//
//   node scripts/hub-server.mjs            (or: npm run hub)
//
// Spec: docs/architecture/PLATFORM_ACCESS_SPEC.md (FR-2 to FR-6, NFR-1 to NFR-3, NFR-7).
//
// It holds no platform list of its own: every request re-reads scripts/platforms.config.mjs,
// so a platform declared there appears here with no other change. It answers three things —
// the page, the platform list, and live status — and never proxies a platform's traffic.
// Status is probed from here, not from the browser, because the Python platforms answer
// without CORS headers and a browser could never read their reply.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { contentType } from './dev/mime.mjs';
import { ROOT } from './platforms.config.mjs';

const HOST = process.env.DGO_RUN_HOST || 'localhost';
const CONFIG = path.join(ROOT, 'scripts', 'platforms.config.mjs');
const HUB_DIR = path.join(ROOT, 'tools', 'hub');
const PROBE_TIMEOUT_MS = 2000;
const CACHE_MS = 10_000;

/** Fresh import each time, so edits to the config show without restarting the Hub. */
async function loadConfig() {
  const mtime = fs.statSync(CONFIG).mtimeMs;
  return import(`${pathToFileURL(CONFIG).href}?v=${mtime}`);
}

/** Probe one platform. up = answered below 500; down = nothing listening; else unknown. */
export async function probeOne(p, host = HOST) {
  const started = Date.now();
  const target = `http://${host}:${p.port}${p.probe || p.openPath}`;
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), redirect: 'manual' });
    await res.body?.cancel();
    return { state: res.status < 500 ? 'up' : 'unknown', http: res.status, ms: Date.now() - started };
  } catch (err) {
    const code = err.cause?.code || err.name;
    const down = code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EADDRNOTAVAIL';
    return { state: down ? 'down' : 'unknown', detail: code, ms: Date.now() - started };
  }
}

let cache = { at: 0, body: null };
async function status(selfPort) {
  if (cache.body && Date.now() - cache.at < CACHE_MS) return cache.body;
  const { Platforms } = await loadConfig();
  const checkedAt = new Date().toISOString();
  const entries = await Promise.all(Platforms.map(async p =>
    [p.id, p.port === selfPort ? { state: 'up', ms: 0 } : await probeOne(p)]));
  const body = Object.fromEntries(entries.map(([id, r]) => [id, { ...r, checkedAt }]));
  cache = { at: Date.now(), body };
  return body;
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-DGO-Platform': 'hub',
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

export function createHub(selfPort) {
  return http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'GET only' });
    const urlPath = (req.url || '/').split('?')[0];
    try {
      if (urlPath === '/api/platforms') {
        const { Platforms, Audiences, publicView } = await loadConfig();
        return send(res, 200, {
          audiences: Audiences.map(a => ({ id: a.id, label: a.label, roles: [...a.roles] })),
          platforms: Platforms.map(p => publicView(p, HOST)),
        });
      }
      if (urlPath === '/api/status') return send(res, 200, await status(selfPort));

      // Static: files directly inside tools/hub/, and its synced brand/ copy.
      const name = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      if (!/^(brand\/)?[\w][\w.-]*$/.test(name)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      const file = path.join(HUB_DIR, name);
      if (!fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      return send(res, 200, fs.readFileSync(file), contentType(file));
    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { platform } = await loadConfig();
  const port = Number(process.env.DGO_HUB_PORT) || platform('hub').port;
  createHub(port).listen(port, HOST === 'localhost' ? '127.0.0.1' : HOST, () => {
    console.log(`Platform Hub on http://${HOST}:${port}/`);
  });
}
