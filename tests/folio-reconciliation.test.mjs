import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(path.join(root, 'MANIFEST.json'), 'utf8'));
const sums = readFileSync(path.join(root, 'SHA256SUMS.txt'), 'utf8');

function packageFile(name) {
  assert.ok(name && !name.includes('\\') && !path.posix.isAbsolute(name));
  const parts = name.split('/');
  assert.ok(parts.every(part => part && part !== '.' && part !== '..'));
  assert.ok(!parts.includes('.git') && !/\.github\/agents(?:\/|$)/.test(name));
  let resolved = root;
  for (const part of parts) {
    resolved = path.join(resolved, part);
    assert.ok(!lstatSync(resolved).isSymbolicLink(), 'Package paths must not traverse symlinks');
  }
  const stat = lstatSync(resolved);
  assert.ok(stat.isFile() && stat.size <= 32 * 1024 * 1024);
  return readFileSync(resolved);
}

test('uploaded manifest and checksum index retain the reviewed b60f9e0 bytes', () => {
  assert.equal(sha256(packageFile('MANIFEST.json')),
    '4f0224ef1fab3ef886db03f19e90d4c2cdf85c537fb0aa52510daecef21d214f');
  assert.equal(sha256(packageFile('SHA256SUMS.txt')),
    'af1a32c895cfa05877bc2a02d3af6c9b813ace773ca82fa2e76dda30ef6bac9f');
  assert.equal(manifest.retained_files, 1421);
  assert.equal(manifest.retained_bytes, 71437610);
  assert.equal(manifest.items.length, manifest.retained_files);
});

test('every retained tracked path matches its manifest size and hash without executing source', () => {
  const paths = manifest.items.map(item => `repository/${item.path}`);
  assert.equal(new Set(paths).size, paths.length);
  const tracked = execFileSync('git', ['ls-files', '-z', '--', 'repository/'], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  }).split('\0').filter(Boolean);
  assert.deepEqual([...paths].sort(), tracked.sort());
  let bytes = 0;
  for (const item of manifest.items) {
    const data = packageFile(`repository/${item.path}`);
    assert.equal(data.length, item.size_bytes, item.path);
    assert.equal(sha256(data), item.sha256, item.path);
    assert.equal(item.decision, 'RETAIN', item.path);
    bytes += data.length;
  }
  assert.equal(bytes, manifest.retained_bytes);
});

test('all package checksum members match and cover every retained payload', () => {
  const entries = sums.trimEnd().split('\n').map(line => {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
    assert.ok(match, 'Invalid checksum record');
    return { hash: match[1], name: match[2] };
  });
  assert.equal(entries.length, 1441);
  const names = new Set(entries.map(entry => entry.name));
  assert.equal(names.size, entries.length);
  for (const { hash, name } of entries) assert.equal(sha256(packageFile(name)), hash, name);
  for (const item of manifest.items) assert.ok(names.has(`repository/${item.path}`), item.path);
});

test('package readers reject traversal, absolute and restricted paths', () => {
  for (const name of [
    '../MANIFEST.json', '/MANIFEST.json', 'repository/../MANIFEST.json',
    'repository\\README.md', 'repository//README.md', './MANIFEST.json',
    '.git/config', 'repository/.github/agents/reviewer.md',
  ]) assert.throws(() => packageFile(name));
});

test('reference dispositions cover every original occurrence and use exact uploaded paths', () => {
  const inventory = packageFile('docs/offline-remediation-inventory.txt').toString('utf8');
  const original = [...inventory.matchAll(/^(R\d{2}) \| (.+):\d+ \| (.+)$/gm)];
  assert.equal(original.length, 56);
  const targets = new Map();
  for (const [, id, source, target] of original) {
    const normalized = path.posix.join(path.posix.dirname(source), target).replace(/\/$/, '');
    targets.set(normalized, [...(targets.get(normalized) || []), id]);
  }
  assert.equal(targets.size, 32);
  const rows = [...inventory.matchAll(/^((?:R\d{2},)*R\d{2}) \| (docs\/[^|]+) \| ([DGFACS])(?: |$)/gm)];
  assert.equal(rows.length, targets.size);
  const seen = new Set();
  let retainedOccurrences = 0;
  for (const [, ids, target, disposition] of rows) {
    const normalized = target.trim().replace(/\/$/, '');
    assert.ok(!seen.has(normalized), normalized);
    seen.add(normalized);
    assert.deepEqual(ids.split(','), targets.get(normalized), normalized);
    const candidate = manifest.items.find(item => item.path === normalized);
    assert.equal(Boolean(candidate), 'DGF'.includes(disposition), normalized);
    if (candidate) {
      assert.equal(candidate.relationship, 'version-1-only', normalized);
      retainedOccurrences += ids.split(',').length;
    }
  }
  assert.equal(retainedOccurrences, 47);
});

test('reconciliation preserves canonical governance boundaries rather than importing approvals', () => {
  assert.equal(sha256(packageFile('Repo_root/tests/repo-hygiene-baseline.json')),
    'f2b9eaae8ea7965dc3e533ce2327c7188b0f3bef8d99528de2f5bd6c4e1e19de');
  assert.equal(sha256(packageFile('Repo_root/docs/governance/approved-large-files.json')),
    '40a6e0764d21bd5fc68a1aea58634d738444a65fc79cb8176afbe79c620593b5');
  const record = manifest.items.find(item => item.path === 'docs/governance/evidence-register.yaml');
  assert.equal(record.size_bytes, 112652);
  assert.equal(record.sha256, '24c275e6362a39f041a2570786e53bd73cd24e5ebc7f9671bb8ae7c6d59442c3');
  assert.equal(sha256(packageFile(`repository/${record.path}`)), record.sha256);
  const recovery = JSON.parse(packageFile('folio-recovery-manifest.json'));
  assert.equal(recovery.repository, 'dgoeaa/Workspace_DGO');
  assert.equal(recovery.commit, 'b60f9e0e177d092279f87c6f79be2e2a78ef1a8b');
  assert.equal(recovery.source, 'repository');
  assert.equal(recovery.destination, 'Repo_root');
  assert.equal(recovery.files.length, 1);
  assert.equal(recovery.files[0].path, record.path);
  assert.equal(recovery.files[0].bytes, record.size_bytes);
  assert.equal(recovery.files[0].sha256, record.sha256);
  assert.equal(recovery.files[0].transformation, 'none');
  const recovered = packageFile(`${recovery.destination}/${record.path}`);
  assert.equal(recovered.length, record.size_bytes);
  assert.equal(sha256(recovered), record.sha256);
});
