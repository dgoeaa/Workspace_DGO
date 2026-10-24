import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  BASELINE, OFFLINE_CHECKS, inspectFile, auditTracked, verifyOffline, releaseBlockers, main,
} from '../scripts/workspace-check.mjs';

test('detects credential-shaped fragments without returning their values', () => {
  const fragment = '?' + 'sig' + '=' + 'synthetic-fixture-value';
  for (const encoding of ['utf8', 'utf16le']) {
    assert.deepEqual(inspectFile('reference.txt', Buffer.from(fragment, encoding)), ['credential-pattern']);
  }
  assert.deepEqual(inspectFile('safe.js', Buffer.from('export const enabled = false;')), []);
});

test('private configuration and containers cannot be silently cleared', () => {
  for (const name of ['config.local (1).js', 'snapshot/config.local.js', '.env.production', 'tenant.pfx']) {
    assert.ok(inspectFile(name, Buffer.from('fixture')).includes('private-config-review'));
  }
  assert.deepEqual(inspectFile('config.local.example.js', Buffer.from('fixture')), []);
  assert.ok(inspectFile('snapshot/archive.zip', Buffer.from('fixture')).includes('container-not-inspected'));
  assert.ok(inspectFile('archive.bin', Buffer.from('PK fixture')).includes('container-not-inspected'));
});

test('audit covers tracked snapshots without executing private config or reading untracked files', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'workspace-gate-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    writeFileSync(path.join(root, 'config.local (1).js'), 'throw new Error("must not execute")');
    writeFileSync(path.join(root, 'reference.txt'), '?' + 'sig' + '=' + 'synthetic-fixture-value');
    execFileSync('git', ['add', '--', '.'], { cwd: root });
    writeFileSync(path.join(root, 'untracked.zip'), 'fixture');
    const audit = auditTracked(root);
    assert.equal(audit.trackedFiles, 2);
    assert.equal(audit.affectedFiles, 2);
    assert.equal(audit.counts['credential-pattern'], 1);
    assert.equal(audit.counts['private-config-review'], 1);
    rmSync(path.join(root, 'reference.txt'));
    assert.equal(auditTracked(root).counts['unreadable-or-oversized'], 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('offline allowlist continues after failures and never invokes packaging or live operations', () => {
  const calls = [];
  const results = verifyOffline(os.tmpdir(), (command, args, options) => {
    calls.push({ command, args, options });
    return { status: calls.length === 1 ? 1 : 0 };
  });
  assert.equal(calls.length, OFFLINE_CHECKS.length);
  assert.equal(results[0].passed, false);
  assert.equal(results.at(-1).passed, true);
  for (const { args, options } of calls) {
    assert.deepEqual(args.slice(0, 1), ['run']);
    assert.ok(!/package|release|live|wire|commission|register/.test(args[1]));
    assert.equal(options.cwd, path.join(os.tmpdir(), BASELINE));
    assert.equal(options.shell, false);
    assert.equal(options.env.npm_config_ignore_scripts, 'true');
    assert.equal(options.env.NODE_OPTIONS, undefined);
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
  }
});

test('timeouts fail and clean source tests cannot confer release approval', () => {
  assert.ok(verifyOffline(os.tmpdir(), () => ({ status: null, error: new Error('timeout') }))
    .every(result => !result.passed));
  assert.ok(releaseBlockers({ affectedFiles: 0 }, [{ passed: true }]).length >= 3);
  assert.ok(releaseBlockers({ affectedFiles: 1 }, [{ passed: false }]).length >= 5);
  assert.equal(main('package'), 2);
});

test('CLI modes distinguish source success, audit findings and unconditional release no-go', { timeout: 90_000 }, () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'workspace-cli-'));
  try {
    mkdirSync(path.join(root, 'scripts'));
    mkdirSync(path.join(root, BASELINE));
    const entry = path.join(root, 'scripts/workspace-check.mjs');
    copyFileSync(new URL('../scripts/workspace-check.mjs', import.meta.url), entry);
    writeFileSync(path.join(root, BASELINE, 'package.json'), JSON.stringify({
      private: true,
      scripts: Object.fromEntries(OFFLINE_CHECKS.map(name => [name, 'node -e "process.exit(0)"'])),
    }));
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['add', '--', '.'], { cwd: root });
    const cli = mode => spawnSync(process.execPath, [entry, mode], {
      cwd: root, encoding: 'utf8', timeout: 30_000,
    });
    const verified = cli('verify');
    assert.equal(verified.status, 0);
    assert.equal(verified.stdout.split('\n').filter(line => line.startsWith('PASS ')).length, OFFLINE_CHECKS.length);
    assert.ok(!verified.stdout.includes('trackedFiles'));
    assert.equal(cli('audit').status, 0);
    const released = cli('release');
    assert.equal(released.status, 1);
    assert.match(released.stdout, /NO-GO: Tenant authentication/);
    writeFileSync(path.join(root, 'config.local.js'), 'throw new Error("must not execute")');
    execFileSync('git', ['add', '--', 'config.local.js'], { cwd: root });
    const audited = cli('audit');
    assert.equal(audited.status, 1);
    assert.match(audited.stdout, /"private-config-review":1/);
    assert.ok(!audited.stdout.includes('must not execute'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
