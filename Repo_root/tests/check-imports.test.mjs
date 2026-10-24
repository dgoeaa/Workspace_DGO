import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function check(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'folio-imports-'));
  try {
    mkdirSync(path.join(root, 'tests'));
    copyFileSync(new URL('./check-imports.mjs', import.meta.url), path.join(root, 'tests/check-imports.mjs'));
    const entries = {
      'index.html': '<script type="module" src="./app.mjs"></script>',
      'mailer/index.html': '<script type="module" src="./app.mjs"></script>',
      'mailer/app.mjs': 'export const mailer = true;',
      ...files,
    };
    for (const [name, content] of Object.entries(entries)) {
      const dest = path.join(root, name);
      mkdirSync(path.dirname(dest), { recursive: true });
      if (content !== null) writeFileSync(dest, content);
    }
    const result = spawnSync(process.execPath, ['tests/check-imports.mjs', '--json'], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    return { status: result.status, report: JSON.parse(result.stdout) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('recursion checks sibling imports once and finds missing targets', () => {
  const { status, report } = check({
    'app.mjs': "import './child.mjs';\nimport './missing.mjs';",
    'child.mjs': "import './leaf.mjs';",
    'leaf.mjs': 'export const leaf = true;',
  });
  assert.equal(status, 1);
  assert.equal(report.edges, 3);
  assert.deepEqual(report.missingTargets, [{ target: 'missing.mjs', importedBy: ['app.mjs'] }]);
});

test('missing module entry points fail rather than passing over an empty graph', () => {
  const { status, report } = check({});
  assert.equal(status, 1);
  assert.ok(report.missingTargets.some(item => item.target === 'app.mjs'));
});

test('missing required HTML entry points fail even if another app resolves', () => {
  const { status, report } = check({ 'index.html': null });
  assert.equal(status, 1);
  assert.ok(report.missingTargets.some(item => item.target === 'index.html'));
});

test('browser cache queries and fragments do not become filesystem paths', () => {
  const { status, report } = check({
    'index.html': '<script type="module" src="./app.mjs?v=1"></script>',
    'app.mjs': "export { leaf } from './leaf.mjs?v=2#cache';",
    'leaf.mjs': 'export const leaf = true;',
  });
  assert.equal(status, 0);
  assert.equal(report.missingTargets.length, 0);
});
