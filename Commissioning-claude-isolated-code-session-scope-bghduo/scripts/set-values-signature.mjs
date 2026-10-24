#!/usr/bin/env node
/**
 * Put one signature onto one key's line in a values file, without opening an editor.
 *
 * WHY. `npm run values:template` emits all 25 URLs complete but for the signature, so
 * commissioning is now 25 short pastes rather than 25 long ones. That is a large improvement on
 * a laptop and not yet enough on a phone, where the remaining step is "open nano, find the right
 * line among ninety, move to its end, paste, don't disturb anything else" — twenty-five times,
 * on a touch keyboard, in a file where every line looks alike.
 *
 * This removes the editor from the loop. On Termux the whole per-key action becomes one command
 * with the signature never touching the screen, the scrollback, or the shell history:
 *
 *     termux-clipboard-get | npm run values:sign -- ~/dgo-values.txt FETCH_ALL
 *
 * and anywhere else:
 *
 *     npm run values:sign -- ~/dgo-values.txt FETCH_ALL
 *     (paste, Enter, Ctrl-D)
 *
 * WHAT IT REFUSES, AND WHY EACH REFUSAL EARNS ITS PLACE
 *
 *   · A signature that is not 43 base64url characters. It is base64url of an HMAC-SHA256 — 32
 *     bytes, 43 characters unpadded — and there is no legitimate variation, so anything else is
 *     a bad copy. Caught here it costs a re-copy; caught later it is a 401 with no context.
 *   · A whole URL pasted where a signature was asked for. That is the natural mistake given
 *     every other instruction in this estate says "copy the URL", so rather than rejecting it,
 *     the signature is lifted out of it and the rest discarded — the line already holds the
 *     correct host and workflow id, reconciled against the register.
 *   · A key the file does not contain. A typo would otherwise append a line the platform never
 *     reads, and the key would silently stay unconfigured.
 *   · Overwriting a signature already present, unless --replace is passed. Re-running a command
 *     from history should not quietly change a key that was already right.
 *
 * It prints no signature and no URL. Nothing it writes to the terminal is a credential.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SIGNATURE_LENGTH = 43;
const args = process.argv.slice(2).filter((a) => a !== '--replace');
const REPLACE = process.argv.includes('--replace');
const [fileArg, keyArg] = args;

if (!fileArg || !keyArg) {
  console.error('usage: node scripts/set-values-signature.mjs <values file> <KEY> [--replace]');
  console.error('       the signature is read from stdin');
  process.exit(2);
}

const file = path.resolve(String(fileArg).replace(/^~(?=$|[\\/])/, os.homedir()));
if (!fs.existsSync(file)) {
  console.error(`\n  ✖  not found: ${file}\n     Generate it first:  npm run values:template ${fileArg}\n`);
  process.exit(1);
}

const key = keyArg.replace(/^(DGO|PF)_ENDPOINT_/, '').toUpperCase();

/* Read stdin whole. A pipe delivers in chunks and a signature is short enough that a partial
   read would look like a truncation — the one failure this script exists to catch. */
const raw = fs.readFileSync(0, 'utf8').trim();
if (!raw) {
  console.error('\n  ✖  nothing was supplied on stdin.\n');
  process.exit(2);
}

/* A whole URL is accepted and reduced to its signature: it is what every other instruction in
   this estate tells people to copy, and the line being edited already carries the rest. */
let sig = raw;
const fromUrl = /[?&]sig=([A-Za-z0-9_%-]+)/.exec(raw);
if (fromUrl) sig = decodeURIComponent(fromUrl[1]);
else if (/^sig=/i.test(sig)) sig = sig.slice(4);
sig = sig.trim();

if (!/^[A-Za-z0-9_-]+$/.test(sig)) {
  console.error(`\n  ✖  that is not a signature — it contains characters a signature cannot contain.`);
  console.error(`     Copy the part of the trigger URL after "sig=", to the end.\n`);
  process.exit(1);
}
if (sig.length !== SIGNATURE_LENGTH) {
  console.error(`\n  ✖  ${sig.length} characters, expected ${SIGNATURE_LENGTH}.`);
  console.error(`     ${sig.length < SIGNATURE_LENGTH ? 'The copy was cut short.' : 'Something was copied along with it.'}`);
  console.error(`     A signature is base64url of an HMAC-SHA256 — always ${SIGNATURE_LENGTH} characters.\n`);
  process.exit(1);
}

const lines = fs.readFileSync(file, 'utf8').split('\n');
const matcher = new RegExp(`^((?:DGO|PF)_ENDPOINT_)?${key}=`);
let hit = -1;
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (t.startsWith('#') || !t) continue;
  if (matcher.test(t)) { hit = i; break; }
}

if (hit === -1) {
  const present = lines
    .map((l) => /^(?:(?:DGO|PF)_ENDPOINT_)?([A-Z_]+)=/.exec(l.trim()))
    .filter(Boolean).map((m) => m[1]);
  console.error(`\n  ✖  ${key} is not a key in ${path.basename(file)}.`);
  console.error(`     It has ${present.length}: ${present.join(', ')}\n`);
  process.exit(1);
}

const line = lines[hit];
const existing = /[?&]sig=([A-Za-z0-9_%-]+)/.exec(line);
if (existing && !REPLACE) {
  console.error(`\n  ✖  ${key} already has a signature. Pass --replace to change it.\n`);
  process.exit(1);
}

if (/[?&]sig=/.test(line)) {
  lines[hit] = line.replace(/([?&]sig=)[A-Za-z0-9_%-]*/, `$1${sig}`);
} else {
  /* No sig parameter at all: the line was overwritten by hand, or came from a template that had
     no URL for this key. Appending would silently produce a URL with no query — say so instead. */
  console.error(`\n  ✖  ${key}'s line carries no "sig=" parameter, so there is nowhere to put this.`);
  console.error(`     Regenerate the file:  npm run values:template ${fileArg}\n`);
  process.exit(1);
}

fs.writeFileSync(file, lines.join('\n'));

const total = lines.filter((l) => /^(?:DGO|PF)_ENDPOINT_[A-Z_]+=/.test(l.trim())).length;
const done = lines.filter((l) => /^(?:DGO|PF)_ENDPOINT_[A-Z_]+=.*[?&]sig=[A-Za-z0-9_-]{43}(?:$|&)/.test(l.trim())).length;
console.log(`  ✅ ${key} signed — ${done}/${total} keys complete`);
if (done === total) console.log(`\n  All keys have a signature. Next:  npm run check:values -- ${fileArg}\n`);
