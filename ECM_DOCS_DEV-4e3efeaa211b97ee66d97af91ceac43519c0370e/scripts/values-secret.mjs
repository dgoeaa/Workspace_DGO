#!/usr/bin/env node
/**
 * Print the exact string to paste into the `DGO_VALUES_B64` secret.
 *
 *   npm run values:secret ~/dgo-values.txt
 *
 * WHY THIS EXISTS
 *
 * A hosted secret is a single text box, and the values file is 25 lines containing `&`, `%`
 * and `=`. Whether newlines survive the journey from clipboard to container is not something
 * a reader should have to find out by deploying and watching endpoints come up empty. Base64
 * removes the question: one line, `A–Z a–z 0–9 + / =`, nothing for a form, a shell or a YAML
 * parser to interpret.
 *
 * It also removes the second question — "did I encode it right?" — because the platform's own
 * `base64` command differs across macOS, Linux and Git Bash, and some wrap output at 76
 * columns, which reintroduces the newlines this exists to avoid. This prints one line.
 *
 * WHAT IT PRINTS IS A CREDENTIAL. The output carries every signature in the file. It goes in
 * the secret box and nowhere else — not a ticket, not a chat, not a commit.
 *
 * Exit: 0 printed · 1 file missing or unreadable · 2 wrong usage · 3 nothing worth encoding
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUNTIME_ENDPOINTS, PORTAL_ENDPOINTS } from './lib/endpoint-surface.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEYS = [...new Set([...RUNTIME_ENDPOINTS, ...PORTAL_ENDPOINTS].map(e => e.key))];

const arg = process.argv[2];
if (!arg) {
  console.error(`
  usage: npm run values:secret <values file>

  Prints the one-line value for the DGO_VALUES_B64 secret.
  Build the file first with:  npm run values:template ~/dgo-values.txt
`);
  process.exit(2);
}

const file = path.resolve(String(arg).replace(/^~(?=$|[\\/])/, os.homedir()));
if (!fs.existsSync(file)) {
  console.error(`\n  ✖  Not found: ${file}\n`);
  process.exit(1);
}

/* Refuse to encode a file inside the repository. A values file holds bearer credentials and
   has no business in a tree that gets committed, however good the .gitignore is. */
if (path.resolve(file).startsWith(ROOT + path.sep)) {
  console.error(`
  ✖  That file is inside the repository: ${file}

     A filled values file holds 25 bearer credentials. Keep it outside the checkout —
     your home folder is the documented place:

         npm run values:template ~/dgo-values.txt
`);
  process.exit(1);
}

const text = fs.readFileSync(file, 'utf8');

/* ------------------------------------------------------------------ *
 * Report what is being encoded — by key name and count, never by value
 * ------------------------------------------------------------------ */

const bare = (name) => {
  for (const p of ['DGO_ENDPOINT_', 'PF_ENDPOINT_']) {
    if (name.startsWith(p) && KEYS.includes(name.slice(p.length))) return name.slice(p.length);
  }
  return KEYS.includes(name) ? name : null;
};

const filled = [];
const unsigned = [];
for (const line of text.split(/\r?\n/)) {
  const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
  if (!m) continue;
  const key = bare(m[1]);
  if (!key) continue;
  const value = m[2].trim();
  if (!value) continue;
  if (/[?&]sig=(?:$|&)/.test(value)) unsigned.push(key); else filled.push(key);
}

if (filled.length === 0 && unsigned.length === 0) {
  console.error(`
  ✖  No endpoint keys found in ${file}

     Expected lines like  DGO_ENDPOINT_FETCH_ALL=https://...&sig=<signature>
     Generate the file with:  npm run values:template ~/dgo-values.txt
`);
  process.exit(3);
}

/* Only the KEY=value lines are encoded. The template's header is several hundred lines of
   instructions for the person filling it in, which inside a secret is bytes that can only
   cause trouble — a size limit reached, or a `#` line mangled by something in between. What
   is dropped is commentary; every key and every value survives. */
const payload = text
  .split(/\r?\n/)
  .filter(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return false;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(t);
    return Boolean(m && bare(m[1]));
  })
  .join('\n') + '\n';

const encoded = Buffer.from(payload, 'utf8').toString('base64');

console.error(`
  ${filled.length} of ${KEYS.length} keys carry a signature.`);
if (unsigned.length) {
  console.error(`  ${unsigned.length} still end at a bare "sig=" and will not authenticate:`);
  for (const k of unsigned) console.error(`      ·  ${k}`);
  console.error(`  Encoding anyway — an unsigned key arrives empty, which is honest.`);
}
console.error(`
  ────────────────────────────────────────────────────────────────────
  Below is the value for the secret  DGO_VALUES_B64
  Copy the whole line. It is a credential: paste it in the secret box only.
  ────────────────────────────────────────────────────────────────────
`);

/* The blob alone on stdout, so `npm run --silent values:secret <file> | pbcopy` works and
   everything explanatory above went to stderr where it cannot end up in the secret. */
process.stdout.write(encoded + '\n');
process.exit(0);
