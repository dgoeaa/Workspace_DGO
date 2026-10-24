import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE = 'Repo_root';
export const OFFLINE_CHECKS = [
  'test:imports', 'test:assetstamp', 'test:uxplan', 'test:recordview',
  'test:intakes', 'test:hygiene', 'test:refs', 'test:portaloutbox',
  'test:portalvault', 'test:encoding', 'test:entrypoints', 'test:auth',
  'test:node', 'test:secrets',
];

export function inspectFile(name, bytes) {
  const reasons = [];
  if (/(?:^|\/)(?:config\.local[^/]*\.(?:js|json)|\.env(?:\.[^/]*)?|[^/]*\.(?:pfx|p12|key))$/i.test(name)
      && !/(?:example|sample|template)/i.test(path.basename(name))) {
    reasons.push('private-config-review');
  }
  if (/\.(?:zip|docx|xlsx|pptx|gz|tgz|7z|rar|pdf)$/i.test(name)
      || bytes.subarray(0, 2).equals(Buffer.from('PK'))) {
    reasons.push('container-not-inspected');
  }
  const text = `${bytes.toString('utf8')}\n${bytes.toString('utf16le')}`;
  if (/(?:[?&]|&amp;)(?:sig|signature)(?:=|%3d)[a-z0-9_%+/-]{8,}/i.test(text)
      || /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(text)
      || /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text)
      || /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(text)) {
    reasons.push('credential-pattern');
  }
  return reasons;
}

export function auditTracked(root = ROOT) {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: root, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  }).toString('utf8').split('\0').filter(Boolean);
  if (!files.length) throw new Error('No tracked files to audit');
  const counts = {};
  let affectedFiles = 0;
  for (const name of files) {
    let reasons;
    try {
      if (/(?:^|\/)\.github\/agents\//.test(name)) {
        affectedFiles++;
        counts['restricted-path-not-inspected'] = (counts['restricted-path-not-inspected'] || 0) + 1;
        continue;
      }
      const abs = path.join(root, name);
      const stat = lstatSync(abs);
      reasons = !stat.isFile() || stat.size > 32 * 1024 * 1024
        ? ['unreadable-or-oversized']
        : inspectFile(name, readFileSync(abs));
    } catch {
      reasons = ['unreadable-or-oversized'];
    }
    if (reasons.length) affectedFiles++;
    for (const reason of reasons) counts[reason] = (counts[reason] || 0) + 1;
  }
  return { trackedFiles: files.length, affectedFiles, counts };
}

export function verifyOffline(root = ROOT, run = spawnSync) {
  const results = [];
  const env = { ...process.env, npm_config_ignore_scripts: 'true' };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  for (const check of OFFLINE_CHECKS) {
    const result = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', check], {
      cwd: path.join(root, BASELINE), env, shell: false,
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
    });
    results.push({ check, passed: result.status === 0 && !result.error });
  }
  return results;
}

export function releaseBlockers(audit, results) {
  return [
    ...(audit.affectedFiles ? ['Tracked credential/config findings or uninspected containers remain.'] : []),
    ...(results.some(result => !result.passed) ? ['Offline verification has failures.'] : []),
    'Repository visibility, full history/forks/caches, and credential revocation require owner evidence.',
    'Tenant authentication, server-side authorisation and access restrictions are not commissioned here.',
    'Owner-approved isolated commissioning, rollback and artifact review remain mandatory.',
  ];
}

export function main(mode) {
  if (!['verify', 'audit', 'release'].includes(mode)) {
    console.error('Usage: node scripts/workspace-check.mjs verify|audit|release (offline only)');
    return 2;
  }
  if (Number(process.versions.node.split('.')[0]) < 22) {
    console.error('Node 22 or later is required.');
    return 2;
  }
  try {
    const results = mode === 'audit' ? [] : verifyOffline();
    for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${BASELINE}/${result.check}`);
    if (mode === 'verify') {
      console.log('Source checks only; raw child logs suppressed to prevent credential disclosure.');
      return results.some(result => !result.passed) ? 1 : 0;
    }
    const audit = auditTracked();
    console.log(JSON.stringify(audit));
    console.log('Tracked working-tree heuristic only: containers are NOT cleared; history and revocation are NOT verified.');
    if (mode === 'audit') return audit.affectedFiles ? 1 : 0;
    for (const blocker of releaseBlockers(audit, results)) console.log(`NO-GO: ${blocker}`);
    return 1;
  } catch {
    console.error('Verification could not complete; refusing approval. Error details suppressed.');
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv[2]);
}
