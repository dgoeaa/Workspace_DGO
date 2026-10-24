/**
 * Which build a package is (owner, 2026-10-20: "properly identify each package, to avoid mix-ups between versions").
 *
 * One rebuild is one version, YYYY.MM.DD-N: the date it was built and its number that day, counted from the build
 * ledger (registers/config-build-ledger.json). Every package of that rebuild carries it:
 *
 *   - in its file name           FOLIO-WORKSPACE-v2026.10.20-2-upload-to-site-root.zip
 *   - in BUILD-ID.json inside it  version, package, commit, when it was built, and two fingerprints:
 *       codeFingerprint  the files without their config: the same code gives the same value in every build;
 *       configDigest     the config file, hashed: tells two builds of the same code apart when an address moved.
 *                        A digest only; no address can be read back from it.
 *   - on screen                  the Workspace's account menu and the Portal's footer read BUILD-ID.json.
 *
 * Comparing a zip, a deployed site and the ledger is then a matter of reading one value in each.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ID_FILE = 'BUILD-ID.json';
const CONFIG_FILES = new Set(['config/config.local.js', 'config.local.js']);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** The next version for a build made at `when`, after the one the ledger last recorded. */
export function nextVersion(ledger, when = new Date()) {
  const day = when.toISOString().slice(0, 10).replace(/-/g, '.');
  const last = String(ledger?.version || '');
  const m = /^(\d{4}\.\d{2}\.\d{2})-(\d+)$/.exec(last);
  return `${day}-${m && m[1] === day ? Number(m[2]) + 1 : 1}`;
}

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

/** What a site tree holds: its code fingerprint, its config digest and its file count. */
export function fingerprint(tree) {
  const files = walk(tree).filter((f) => f !== ID_FILE).sort();
  const code = crypto.createHash('sha256'), config = crypto.createHash('sha256');
  let configs = 0;
  for (const f of files) {
    const body = fs.readFileSync(path.join(tree, f));
    if (CONFIG_FILES.has(f)) { config.update(`${f}\0${sha(body)}\n`); configs++; }
    else code.update(`${f}\0${sha(body)}\n`);
  }
  return { codeFingerprint: code.digest('hex').slice(0, 16), configDigest: configs ? config.digest('hex').slice(0, 16) : '', files: files.length };
}

/** Write BUILD-ID.json into a site tree and return what it says. */
export function stamp(tree, { product, version, commit = '', builtUtc, extra = {} }) {
  const id = { schema: 'folio-build-id/v1', package: `FOLIO-${product}`, version, label: `FOLIO-${product} v${version}`, builtUtc, commit, ...fingerprint(tree), ...extra };
  fs.writeFileSync(path.join(tree, ID_FILE), `${JSON.stringify(id, null, 2)}\n`);
  return id;
}

/** The file name a package of this version is delivered under. */
export const zipName = (product, version, where) => `FOLIO-${product}-v${version}-${where}.zip`;

/** The newest package of a product in a build folder: versioned names first, then the unversioned names of older builds. */
export function findZip(dir, product, where) {
  const re = new RegExp(`^FOLIO-${product}-v(\\d{4}\\.\\d{2}\\.\\d{2}-\\d+)-${where}\\.zip$`);
  const hit = fs.readdirSync(dir).filter((f) => re.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).pop();
  if (hit) return { file: hit, version: re.exec(hit)[1] };
  const legacy = `FOLIO-${product}-${where}.zip`;
  return fs.existsSync(path.join(dir, legacy)) ? { file: legacy, version: '' } : null;
}
