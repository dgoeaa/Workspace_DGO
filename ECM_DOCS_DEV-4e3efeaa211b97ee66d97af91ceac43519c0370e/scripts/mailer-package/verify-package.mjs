#!/usr/bin/env node
// Check every file in this package against PACKAGE_MANIFEST.json (SHA-256). Node 18+.
//
//   node tools/verify-package.mjs
//
// Exit 0 when every listed file is present and unchanged. A web/config.local.js you have
// added is expected, and is reported but not counted as a failure.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'PACKAGE_MANIFEST.json'), 'utf8'));
let bad = 0;
for (const f of manifest.files) {
  const abs = path.join(ROOT, f.path);
  if (!fs.existsSync(abs)) { console.log(`  missing   ${f.path}`); bad++; continue; }
  const sha = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  if (sha !== f.sha256) { console.log(`  CHANGED   ${f.path}`); bad++; }
}
if (fs.existsSync(path.join(ROOT, 'web', 'config.local.js'))) console.log('  (web/config.local.js present — your local configuration, not part of the package)');
console.log(bad ? `\n${bad} file(s) missing or changed.` : `\nAll ${manifest.files.length} files verified — ${manifest.name} ${manifest.version}.`);
process.exit(bad ? 1 : 0);
