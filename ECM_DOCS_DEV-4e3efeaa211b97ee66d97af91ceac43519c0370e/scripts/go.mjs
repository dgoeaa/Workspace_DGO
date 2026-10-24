#!/usr/bin/env node
// One command from a fresh clone to every platform running.
//
//   npm run go               every platform
//   npm run go -- staff      one group: public, staff or control
//
// It checks Node and Python, starts the platforms through scripts/run-platform.mjs, and
// prints where the Admin Centre and Vault tokens are written. It prints the paths, never the
// tokens. Node built-ins only.

import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

import { Groups, ROOT, platform } from './platforms.config.mjs';

const group = process.argv[2];
if (group && !Groups.some(g => g.id === group)) {
  console.error(`\n  Unknown group: ${group}. Use one of: ${Groups.map(g => g.id).join(', ')}\n`);
  process.exit(2);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) {
  console.error(`\n  Node ${process.versions.node} found. Install Node 22 or newer, then run this again.\n`);
  process.exit(1);
}

let python = null;
for (const bin of ['python3', 'python', 'py']) {
  try {
    const v = execFileSync(bin, ['-c', 'import sys;print("%d.%d"%sys.version_info[:2])'], { encoding: 'utf8' }).trim();
    const [maj, min] = v.split('.').map(Number);
    if (maj === 3 && min >= 11) { python = `${bin} ${v}`; break; }
  } catch { /* try the next name */ }
}
if (!python && group !== 'public' && group !== 'staff') {
  console.error('\n  Python 3.11 or newer is required for the Workbench, the Vault and the Admin Centre.\n' +
    '  Install it from https://www.python.org/downloads/ and run this again.\n');
  process.exit(1);
}

console.log(`\n  Node ${process.versions.node}${python ? ` · Python ${python.split(' ')[1]}` : ''} · starting ${group ? `the ${group} group` : 'every platform'}\n`);

if (!group || group === 'control') {
  const centreHome = platform('centre').env().FOLIO_ADMIN_HOME;
  const vaultDir = platform('capsule').env({ host: 'localhost' }).FLOWCAP_DATA_DIR;
  console.log('  Tokens (written on first start; open these files to read them):');
  if (centreHome) console.log(`    Admin Centre  ${path.join(centreHome, 'config', 'admin.token')}`);
  if (vaultDir) console.log(`    Vault         ${path.join(vaultDir, 'bootstrap-credentials.json')}`);
  console.log('');
}

const args = [path.join(ROOT, 'scripts', 'run-platform.mjs'), ...(group ? ['--group', group] : ['--all'])];
const child = spawn(process.execPath, args, { stdio: 'inherit', cwd: ROOT });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', code => process.exit(code ?? 0));
