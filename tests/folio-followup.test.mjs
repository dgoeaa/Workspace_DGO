import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('selective documentation recovery introduces no new broken-reference occurrences', () => {
  const inventory = readFileSync(path.join(root, 'docs/offline-remediation-inventory.txt'), 'utf8');
  const permitted = new Map();
  for (const [, source, reference] of inventory.matchAll(/^R\d{2} \| (.+):\d+ \| (.+)$/gm)) {
    const key = `${source} → ${reference}`;
    permitted.set(key, (permitted.get(key) || 0) + 1);
  }
  assert.equal([...permitted.values()].reduce((a, b) => a + b, 0), 56);
  const result = spawnSync(process.execPath, ['tests/references.test.mjs'], {
    cwd: path.join(root, 'Repo_root'), encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', npm_config_ignore_scripts: 'true' },
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.ok(!result.error, 'Reference checker must complete within its bounds');
  assert.ok([0, 1].includes(result.status), 'Reference checker must complete normally');
  const broken = [...result.stdout.matchAll(/^ {7}(.+ → .+)$/gm)].map(match => match[1]);
  const reported = /(\d+) broken:/.exec(result.stdout);
  assert.equal(broken.length, reported ? Number(reported[1]) : 0);
  for (const key of broken) {
    assert.ok((permitted.get(key) || 0) > 0, 'Recovery introduced a new broken reference');
    permitted.set(key, permitted.get(key) - 1);
  }
  assert.match(result.stdout, /✅ archived material carries exactly the breakage it arrived with \(0\)/);
  assert.match(result.stdout, /✅ the checker is actually reading references/);
  assert.match(result.stdout, /✅ the harvest is excluded deliberately, and it is the only exclusion/);
  assert.ok(broken.length < 56, 'Recovery must improve the original inventory');
});
