import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function check({ files = {}, baseline = { runtime: [], duplicates: [] }, remove = [], untrack = [], args = [] } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'folio-hygiene-'));
  const put = (name, content) => {
    const dest = path.join(root, name);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  };
  try {
    put('tests/repo-hygiene-baseline.json', JSON.stringify(baseline));
    put('docs/governance/approved-large-files.json', '{"approved_large_files":[]}');
    put('OWNERS.yaml', 'repository:\n  owner: fixture-owner\n');
    put('docs/governance/evidence-register.yaml', '# Synthetic test fixture, not approval evidence.\n');
    mkdirSync(path.join(root, 'scripts/lib'), { recursive: true });
    for (const name of ['tests/repo-hygiene.test.mjs', 'scripts/lib/tracked-files.mjs']) {
      copyFileSync(new URL(`../${name}`, import.meta.url), path.join(root, name));
    }
    for (const [name, content] of Object.entries(files)) put(name, content);
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    for (const name of remove) rmSync(path.join(root, name));
    if (untrack.length) execFileSync('git', ['rm', '--cached', '--', ...untrack], { cwd: root });
    const result = spawnSync(process.execPath, [path.join(root, 'tests/repo-hygiene.test.mjs'), ...args], {
      cwd: os.tmpdir(), encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    return { ...result, baseline: readFileSync(path.join(root, 'tests/repo-hygiene-baseline.json'), 'utf8') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('hygiene checks its own tracked root regardless of the caller directory', () => {
  assert.equal(check().status, 0);
});

test('missing tracked files fail and cannot disappear through a baseline rewrite', () => {
  const fixture = { files: { 'runtime-output/lost.txt': 'lost runtime fixture' }, remove: ['runtime-output/lost.txt'] };
  assert.match(check(fixture).stdout, /❌ tracked files present on disk/);
  const rewritten = check({ ...fixture, args: ['--write-baseline'] });
  assert.notEqual(rewritten.status, 0);
  assert.match(rewritten.stderr, /Refusing to rewrite/);
  assert.deepEqual(JSON.parse(rewritten.baseline), { runtime: [], duplicates: [] });
});

test('a present but untracked governance register does not satisfy the gate', () => {
  const result = check({
    untrack: ['docs/governance/evidence-register.yaml'],
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /missing or not tracked: docs\/governance\/evidence-register.yaml/);
});

test('duplicate ratchet accepts reviewed subsets but rejects new members and stale groups', () => {
  const files = { 'one.txt': 'same fixture bytes', 'two.txt': 'same fixture bytes' };
  const baseline = { runtime: [], duplicates: ['one.txt | two.txt'] };
  assert.equal(check({ files, baseline }).status, 0);
  assert.equal(check({ files: { ...files, 'three.txt': 'same fixture bytes' }, baseline }).status, 1);
  const stale = check({ files, baseline: { runtime: [], duplicates: ['absent.txt | one.txt | two.txt'] } });
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /stale entry; review removal or recovery/);
});

test('runtime and large-file violations still fail without new allowances', () => {
  assert.equal(check({ files: { 'runtime-output/new.txt': 'new runtime fixture' } }).status, 1);
  const large = check({ files: { 'large.txt': Buffer.alloc(1024 * 1024 + 1, 'x') } });
  assert.equal(large.status, 1);
  assert.match(large.stdout, /not approved: large.txt/);
});
