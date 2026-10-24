import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inspectFile } from '../scripts/workspace-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'recovery-manifest.json'), 'utf8'));
const baseline = path.join(root, manifest.destination);

test('recovery is pinned, selective and excludes private config and deployment inputs', () => {
  assert.equal(manifest.commit, '525fc666760726a1ca6fc23fd830782981f79419');
  assert.equal(manifest.repository, 'dgoeaa/ECM_DOCS_DEV');
  assert.equal(manifest.destination, 'Repo_root');
  assert.equal(manifest.files.length, 42);
  assert.equal(new Set(manifest.files.map(file => file.path)).size, manifest.files.length);
  for (const file of manifest.files) {
    assert.ok(!path.isAbsolute(file.path) && !file.path.split('/').includes('..'));
    assert.ok(!/config\.local|\.env|\.zip$|\.htaccess|^releases\/|^\.github\//i.test(file.path));
    assert.ok(file.path.startsWith('document-portal/') || [
      'docs/architecture/ESSENTIALS_PLAN.json',
      'docs/architecture/ESSENTIALS_PLAN.md',
      'docs/governance/approved-large-files.json',
      'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase3/SCAN_INTAKE__IP_SCAN_INTAKE__5504d7f9.paste.json',
      'docs/folio-Master-Flows-and-Endpoints/reference/flow-requirements.json',
    ].includes(file.path));
  }
});

test('all restored bytes match their recorded exact or sanitised recovery hashes', () => {
  const mismatches = [];
  for (const file of manifest.files) {
    const bytes = readFileSync(path.join(baseline, file.path));
    if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
      mismatches.push(file.path);
    }
  }
  assert.deepEqual(mismatches, []);
});

test('recovered content passes the credential-pattern and private-config gate', () => {
  const findings = [];
  for (const file of manifest.files) {
    const reasons = inspectFile(file.path, readFileSync(path.join(baseline, file.path)));
    if (reasons.length) findings.push({ path: file.path, reasons });
  }
  assert.deepEqual(findings, []);
});

test('derived flow test inputs exclude tenant configuration while retaining the action graph', () => {
  const derived = manifest.files.filter(file => file.sanitization);
  assert.equal(derived.length, 2);
  for (const file of derived) {
    assert.match(file.upstreamSha256, /^[0-9a-f]{64}$/);
    assert.notEqual(file.upstreamSha256, file.sha256);
    const text = readFileSync(path.join(baseline, file.path), 'utf8');
    assert.ok(!/https?:\/\/[^/"'\s]*\.sharepoint\.com/i.test(text), file.path);
    const identifiers = text.match(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi) || [];
    assert.ok(identifiers.length > 0);
    assert.ok(identifiers.every(id => /^00000000-0000-4000-8000-\d{12}$/.test(id)), file.path);
    if (file.sanitization.removedConnectionData) {
      const fixture = JSON.parse(text);
      assert.equal(fixture.allConnectionData, undefined);
      assert.ok(Object.keys(fixture.serializedValue.actions).length > 0);
      assert.ok(text.includes('Compose_Scan_Caller'));
    }
  }
});

test('sanitised inputs preserve the upstream graph except the declared configuration transformations', () => {
  const normalise = value => {
    if (Array.isArray(value)) return value.map(normalise);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().filter(key => key !== 'allConnectionData')
        .map(key => [normalise(key), normalise(value[key])]));
    }
    if (typeof value !== 'string') return value;
    return value.replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi, '__GUID__')
      .replace(/https?:\/\/[^\s'"<>/]+\.sharepoint\.com(?:\/[^\s'"<>]*)?|https:\/\/example\.invalid\/sites\/recovery/gi, '__TENANT_SITE__');
  };
  for (const file of manifest.files.filter(file => file.sanitization)) {
    const input = JSON.parse(readFileSync(path.join(baseline, file.path), 'utf8'));
    const hash = createHash('sha256').update(JSON.stringify(normalise(input))).digest('hex');
    assert.equal(hash, file.normalisedSourceSha256, file.path);
  }
});

test('portal HTML and CSS local asset references resolve without private config', () => {
  const missing = [];
  for (const file of manifest.files.filter(file => /\.(?:html|css)$/.test(file.path))) {
    const text = readFileSync(path.join(baseline, file.path), 'utf8');
    const refs = [
      ...Array.from(text.matchAll(/\b(?:src|href)=["']([^"']+)["']/g), match => match[1]),
      ...Array.from(text.matchAll(/url\(\s*["']?([^)"'\s]+)["']?\s*\)/g), match => match[1]),
      ...Array.from(text.matchAll(/@import\s+["']([^"']+)["']/g), match => match[1]),
    ];
    for (const ref of refs) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) continue;
      const clean = ref.split(/[?#]/)[0];
      if (!clean || /(?:^|\/)config\.local\.js$/.test(clean)) continue;
      const resolved = path.resolve(baseline, path.dirname(file.path), clean);
      if (!resolved.startsWith(baseline + path.sep) || !existsSync(resolved)) missing.push(file.path);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});
