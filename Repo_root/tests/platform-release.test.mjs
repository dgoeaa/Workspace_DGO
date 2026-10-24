#!/usr/bin/env node
/**
 * The Folio platform suite release (releases/folio-platform-suite-<version>.zip).
 *
 *   A  the committed release exists, unpacks, and passes its own scripts/verify-release.mjs
 *   B  it declares every platform scripts/platforms.config.mjs declares, and each entry is in it
 *   C  it carries no signed trigger URL, and every Workspace and Portal endpoint is empty
 *   D  started from the unpacked copy with its own launcher, every platform answers
 *      (the Python ones only when Python 3 is on PATH; skipped, with the reason, when the
 *      ports are taken by something else)
 *   E  the release still builds from the current tree
 *
 * Byte-for-byte freshness is `npm run platform:release -- --check`, kept out of the gate on
 * purpose: the platforms change in most commits, and a 3 MB binary regenerated with each one
 * would bloat history and conflict on every concurrent push. Rebuild it when cutting a release.
 *
 * Run: node tests/platform-release.test.mjs      Exit: 0 = all passed
 */

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

import { ZIP_PATH, unpack, releaseFiles } from '../scripts/package-platform-release.mjs';
import { Platforms } from '../scripts/platforms.config.mjs';

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${!ok && detail ? `\n       ${detail}` : ''}`);
  if (!ok) failed++;
};
const note = (label) => console.log(`  –  ${label}`);

const portFree = (port) => new Promise((resolve) => {
  const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
  s.listen(port, '127.0.0.1');
});
const hasPython = () => {
  for (const c of [process.env.DGO_PYTHON, 'python3', 'python'].filter(Boolean)) {
    try { if (/^Python 3\./.test(execFileSync(c, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim())) return true; } catch { /* next */ }
  }
  return false;
};

console.log('\n  Folio platform suite release\n');

check('A  committed release exists', fs.existsSync(ZIP_PATH), `${ZIP_PATH} — run: npm run platform:release`);
if (fs.existsSync(ZIP_PATH)) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-suite-test-'));
  let child = null;
  try {
    const top = unpack(ZIP_PATH, tmp);
    let verified = true, out = '';
    try { out = execFileSync(process.execPath, [path.join(top, 'scripts', 'verify-release.mjs')], { encoding: 'utf8' }); }
    catch (e) { verified = false; out = `${e.stdout || ''}${e.stderr || ''}`; }
    check('A  unpacked release passes scripts/verify-release.mjs', verified, out.trim());

    const manifest = JSON.parse(fs.readFileSync(path.join(top, 'RELEASE_MANIFEST.json'), 'utf8'));
    const ids = manifest.platforms.map((p) => p.id);
    check(`B  it declares all ${Platforms.length} platforms`, Platforms.every((p) => ids.includes(p.id)) && ids.length === Platforms.length, `has: ${ids.join(', ')}`);
    for (const p of manifest.platforms) check(`B  ${p.name}: ${p.entry}`, fs.existsSync(path.join(top, p.entry)));

    for (const rel of ['runtime/config/config.local.js', 'document-portal/config.local.js']) {
      const values = [...fs.readFileSync(path.join(top, rel), 'utf8').matchAll(/^\s+[A-Z_]+:\s*("[^"]*"),$/gm)].map((m) => JSON.parse(m[1]));
      check(`C  every endpoint in ${rel} is empty`, values.length > 0 && values.every((v) => v === ''), `${values.filter(Boolean).length} of ${values.length} set`);
    }
    check('C  the Mailer ships without a config.local.js', !fs.existsSync(path.join(top, 'mailer', 'web', 'config.local.js')));

    /* D: start everything with the package's own launcher, as an operator would. */
    const busy = [];
    for (const p of Platforms) if (!(await portFree(p.port))) busy.push(`${p.id}:${p.port}`);
    if (busy.length) {
      note(`D  launch skipped — ports in use: ${busy.join(', ')}`);
    } else {
      const python = hasPython();
      const expected = Platforms.filter((p) => p.kind !== 'python' || python);
      if (!python) note('D  Python 3 not on PATH — the three Python platforms are not started');
      const env = { ...process.env, FLOWCAP_DATA_DIR: path.join(tmp, 'vault'), FOLIO_ADMIN_HOME: path.join(tmp, 'centre') };
      child = spawn(process.execPath, ['scripts/run-platform.mjs', ...expected.map((p) => p.id)], { cwd: top, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = '';
      child.stdout.on('data', (d) => { log += d; });
      child.stderr.on('data', (d) => { log += d; });
      const deadline = Date.now() + 30_000;
      while (!/Ctrl-C to stop|Nothing started/.test(log) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
      for (const p of expected) {
        let status = 0;
        try { status = (await fetch(`http://127.0.0.1:${p.port}${p.probe || p.openPath}`, { signal: AbortSignal.timeout(3000) })).status; } catch { /* down */ }
        check(`D  ${p.name} answers on ${p.port}`, status > 0 && status < 500, `HTTP ${status || 'no answer'}\n       ${log.split('\n').filter((l) => /✖|Error|error/.test(l)).slice(0, 4).join('\n       ')}`);
      }
    }
  } finally {
    if (child) { child.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 1800)); if (child.exitCode === null) child.kill('SIGKILL'); }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

let built = true, why = '';
try { releaseFiles(); } catch (e) { built = false; why = e.message.split('\n').slice(0, 6).join('\n       '); }
check('E  the release builds from the current tree', built, why);

console.log(failed ? `\n  ${failed} failed\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
