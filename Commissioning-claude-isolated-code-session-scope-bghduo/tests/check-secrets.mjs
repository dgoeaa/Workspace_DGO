#!/usr/bin/env node
/**
 * Secret ratchet for Power Automate SAS signatures.
 *
 * A SAS-signed Power Automate URL is a bearer credential: possession alone authorizes
 * invocation of the flow. This check has two jobs, and they are deliberately different:
 *
 *   1. FAIL on any tracked file that carries a signature and is not in the baseline.
 *      That is a new leak and must never merge.
 *   2. REPORT the baselined files, which are the ones the capability assessment recorded
 *      as already affected (gap G-03). They cannot simply be scrubbed — deleting a file
 *      revokes nothing. Each signature must be ROTATED in Power Automate first; only then
 *      is removing it from the tree meaningful.
 *
 * The baseline may only shrink. If a baselined file no longer contains a signature, this
 * says so and fails, so the list cannot silently drift out of date.
 *
 * Usage:  node tests/check-secrets.mjs
 * Exit:   0 = no new leaks and the baseline is accurate, 1 = otherwise
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openZip } from '../scripts/lib/zip-reader.mjs';
import { trackedFiles as askGit } from '../scripts/lib/tracked-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'tests', 'secrets-baseline.txt');

/** Signature-shaped: `sig=` plus >=20 URL-safe base64 chars. Skips `sig=ROTATE_ME`. */
const SIG = /sig=[A-Za-z0-9_-]{20,}/;

/* docs/reference/foundational/ is the curated record of the DEPLOYED flow estate — its
   whole purpose is to document the live flows verbatim, trigger URLs included, and it was
   committed intact by explicit decision (D5, 2026-08-04). Scanning it would turn this
   ratchet permanently red, and a permanently red ratchet is one nobody reads. The ratchet
   therefore guards the APPLICATION tree: a signature appearing in shipped code or config
   still fails the build. Rotation of the documented estate is scheduled platform work,
   not a per-commit gate. */
const REFERENCE_CORPUS = 'docs/reference/foundational/';

/* THE SECOND BLIND SPOT, AND THE ONE NOBODY DECIDED ON.
 *
 * Everything below reads `git ls-files`. The packager's output does not appear in it: dist/ and
 * dist-bundle/ are git-ignored, by line 30 and line 48 of .gitignore. So a built package —
 * which scripts/package.mjs fills with real, signed trigger URLs on purpose, because a package
 * that cannot invoke a flow is not a package — has never been read by this control at all, and
 * the run still printed "No SAS signatures in the application tree".
 *
 * The exclusion above was a decision, argued and recorded. This one is an artefact of the
 * mechanism: nobody chose to leave build output unscanned, `git ls-files` simply does not list
 * it. That is the difference between a narrowed control and a control that does not know its
 * own scope, and it is why a green result here has not meant what it appeared to mean.
 *
 * It is REPORTED, not failed. Signatures in dist/ are the packager doing its job, and every
 * package stamps that its credentials are disclosed ones. Failing would make the ratchet
 * permanently red for anyone who has run `npm run package`, and a permanently red ratchet is
 * one nobody reads — the same reasoning that governs the corpus above. What changes is that
 * the number is now on the screen instead of being absent from it. */
const BUILD_DIRS = ['dist', 'dist-bundle'];

const allTracked = askGit({ root: ROOT, what: 'the tracked tree to scan for signatures' }).join('\0')
  .split('\0')
  .filter(Boolean);

const trackedFiles = allTracked.filter(f => !f.startsWith(REFERENCE_CORPUS));

/**
 * How much this ratchet is NOT looking at.
 *
 * The exclusion above is deliberate and correct, but the success message was not: this
 * printed "No SAS signatures in tracked files" while 55 of them sat in 28 tracked files
 * one directory away. Only `npm run commission` reported the real figure, so the number a
 * reader saw depended on which command they happened to run — and the one wired into CI as
 * "Secret scan" was the one that said zero. A control may narrow its scope. It may not
 * describe the narrowed result as the whole result.
 */
function measureExposure(relPaths) {
  const files = [];
  const distinct = new Set();
  const unscannable = [];
  for (const f of relPaths) {
    const abs = path.join(ROOT, f);
    let buf;
    try {
      const st = fs.statSync(abs);
      if (!st.isFile() || st.size > 512 * 1024 * 1024) continue;
      buf = fs.readFileSync(abs);
    } catch { continue; }
    /* An archive is text in a container, not an opaque blob — the same reasoning that put
       signaturesInArchive() on the tracked path applies here. A package is frequently shipped
       AS a zip, so skipping archives in build output would leave the most likely carrier of a
       signature out of the very measurement added to stop that. */
    if (/\.zip$/i.test(f)) {
      const { unscannable: bad, found } = signaturesInArchive(abs);
      if (bad) { unscannable.push(f); continue; }
      if (!found.length) continue;
      files.push(f);
      found.forEach(v => distinct.add(normalise(v)));
      continue;
    }
    if (buf.includes(0)) continue;
    const found = buf.toString('utf8').match(ALL);
    if (!found) continue;
    files.push(f);
    found.forEach(v => distinct.add(normalise(v)));
  }
  return { files: files.length, distinct: distinct.size, unscannable };
}

const excludedExposure = () => measureExposure(allTracked.filter(f => f.startsWith(REFERENCE_CORPUS)));

/* Every file actually on disk under the build directories, whether or not git can see it —
   which is the entire point, since git cannot see any of it. */
function walkDisk(rel, out = []) {
  let entries;
  try { entries = fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) walkDisk(child, out);
    else if (e.isFile()) out.push(child);
  }
  return out;
}

const buildExposure = () => {
  const present = BUILD_DIRS.filter(d => fs.existsSync(path.join(ROOT, d)));
  return { present, ...measureExposure(present.flatMap(d => walkDisk(d))) };
};

const ALL = /sig=[A-Za-z0-9_-]{20,}/g;

/* COUNTING THE SAME CREDENTIAL TWICE.
 *
 * A trigger signature is HMAC-SHA256 base64url: exactly 43 characters. This corpus carries URLs
 * with prose glued straight onto the end — `…sig=XXXgetEmailsPOST` — so the greedy match above
 * returns a different STRING for the same signature depending on what followed it in the file,
 * and a Set of those strings counts one credential as several. scripts/lib/endpoint-recovery.mjs
 * hit this and solved it by taking exactly 43 characters; the ratchet never did, so the
 * "distinct signature(s)" figure it prints — the number the rotation register is worked from —
 * has been an overcount.
 *
 * Detection stays at {20,}: the corpus also holds one mangled 40-character copy, and narrowing
 * the match to exactly 43 would stop finding it. Only the identity used for counting is
 * normalised. */
const SIG_LEN = 43;
const normalise = (s) => s.slice(0, 'sig='.length + SIG_LEN);

/**
 * Signatures inside a zip archive.
 *
 * The NUL-byte skip below is correct for images and fonts, but an archive is not opaque —
 * it is text in a container. Skipping it meant ECM_DOCS_DEV.zip was never scanned by
 * anything, and it holds 31 distinct signatures across 18 of its 837 members. Nine of those
 * appear in no commit and no tracked text file, so no audit could have found them.
 *
 * An archive that cannot be parsed at all is reported as UNSCANNABLE rather than silently
 * passing — a control that cannot run must say so, not return green.
 *
 * IT USED TO SHELL OUT TO `unzip`, AND THAT MADE IT UNRUNNABLE ON WINDOWS. `unzip` is not on a
 * Windows PATH by default, so all 13 tracked archives reported unscannable, this file exited 1,
 * and `npm run commission` raised it as a blocker worded identically to a real credential leak.
 * A security control that is permanently red on the most common developer platform is not a
 * control — it is noise that teaches people to ignore it, which is the opposite of what a
 * ratchet is for.
 *
 * `scripts/lib/zip-reader.mjs` reads the archive directly, using only Node's own zlib. Verified
 * against `unzip` on every tracked archive: identical member listings, and 234 of 234 members
 * byte-identical on the largest. No dependency was added, and the unscannable path is kept for
 * an archive that is genuinely unreadable — encrypted, truncated, or using a compression method
 * this reader refuses to guess at.
 */
function signaturesInArchive(abs) {
  let zip;
  try {
    zip = openZip(abs);
  } catch {
    return { unscannable: true, found: [] };
  }
  const found = [];
  for (const member of zip.members) {
    if (member.isDirectory) continue;
    if (/\.(png|jpe?g|gif|ico|svg|woff2?|ttf|eot|pdf|docx|xlsx|pptx|zip)$/i.test(member.name)) continue;
    try {
      const raw = member.read();
      if (raw.includes(0)) continue;
      found.push(...(raw.toString('utf8').match(ALL) || []));
    } catch { /* unreadable member — skip, the listing above is the record */ }
  }
  return { unscannable: false, found };
}

const affected = [];
const unscannable = [];
const globalDistinct = new Set(); // deduplicated across files — the figure that matters for rotation
for (const file of trackedFiles) {
  const abs = path.join(ROOT, file);
  let buf;
  try {
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > 512 * 1024 * 1024) continue;
    buf = fs.readFileSync(abs);
  } catch {
    continue;
  }

  if (/\.zip$/i.test(file)) {
    const { unscannable: bad, found } = signaturesInArchive(abs);
    if (bad) { unscannable.push(file); continue; }
    if (!found.length) continue;
    found.forEach(v => globalDistinct.add(normalise(v)));
    affected.push({ file, distinct: new Set(found.map(normalise)).size, archive: true });
    continue;
  }

  if (buf.includes(0)) continue; // binary and not an archive
  const text = buf.toString('utf8');
  if (!SIG.test(text)) continue;
  const found = text.match(ALL) || [];
  found.forEach(v => globalDistinct.add(normalise(v)));
  affected.push({ file, distinct: new Set(found.map(normalise)).size });
}

const baseline = fs.existsSync(BASELINE)
  ? new Set(fs.readFileSync(BASELINE, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')))
  : new Set();

const affectedPaths = new Set(affected.map(a => a.file));
const added = affected.filter(a => !baseline.has(a.file));
const cleared = [...baseline].filter(f => !affectedPaths.has(f)).sort();

// Per-file counts sum higher than the global figure because the same signature appears in
// several files. Rotation is per signature, so the global count is the one that matters.
const totalDistinct = globalDistinct.size;

if (added.length) {
  console.error('\n❌ NEW files carrying a Power Automate SAS signature:\n');
  for (const a of added) console.error(`   ${a.file}  (${a.distinct} distinct)`);
  console.error('\nA SAS URL is a credential. Rotate it in Power Automate and keep it out of');
  console.error('the tree — use config/config.local.js, which is git-ignored.\n');
}

if (cleared.length) {
  console.error('\n❌ Baseline is stale — these files no longer carry a signature:\n');
  for (const f of cleared) console.error(`   ${f}`);
  console.error('\nRemove them from tests/secrets-baseline.txt so the ratchet stays tight.\n');
}

if (affected.length && !added.length && !cleared.length) {
  console.log(
    `⚠️  ${affected.length} baselined file(s) carry ${totalDistinct} globally distinct SAS signature(s).`
  );
  console.log('   These are gap G-03 in docs/audits/CAPABILITY_ASSESSMENT_R11.6.md and remain OUTSTANDING.');
  console.log('   Rotation in Power Automate must happen before removal — deleting a file');
  console.log('   revokes nothing. Not failing the build on already-known exposure.\n');
  for (const a of affected) console.log(`   ${a.file}  (${a.distinct} distinct)`);
}

if (unscannable.length) {
  console.error('\n❌ Archive(s) could not be scanned — `unzip` is not available:\n');
  for (const f of unscannable) console.error(`   ${f}`);
  console.error('\nA control that cannot run must not report green. Install unzip, or remove');
  console.error('the archive from the tree.\n');
}

const build = buildExposure();

if (!affected.length && !cleared.length && !unscannable.length) {
  /* The claim is now the size of what was read. It said "the application tree", which a reader
     takes to mean everything shippable, while build output was never opened. */
  console.log('✅ No SAS signatures in the tracked application tree.');
}

/* Printed on every run, pass or fail. The exposure this ratchet excludes is real, is gap
   G-03, and is the thing that must be rotated before any production endpoint is minted —
   so it is stated here rather than left to a different command nobody ran. */
const excluded = excludedExposure();
if (excluded.files) {
  console.log(
    `\nℹ️  NOT IN SCOPE: ${excluded.distinct} distinct signature(s) across ${excluded.files} file(s) ` +
    `under ${REFERENCE_CORPUS}`);
  console.log('   That corpus documents a superseded flow estate verbatim by explicit decision (D5),');
  console.log('   so scanning it would hold this ratchet permanently red.');
  console.log('   These signatures have been ROTATED and are dead: the estate was re-issued, and');
  console.log('   reconciliation against docs/reference/endpoint-register.json showed all 25 keys');
  console.log('   now pointing at different workflows than this corpus records. They are kept as a');
  console.log('   record of what was built, not as usable credentials, and `npm run recover` — the');
  console.log('   one command that ever read them — is retired and exits 2.');
  console.log('   The rule they illustrate still stands: a live signature must never be committed,');
  console.log('   and deleting a file would not have revoked one. Only re-issuing the trigger does.');
}

/* Build output, stated on every run for the same reason. Absence is stated too: "no build
   output present" and "build output present and clean" are different facts, and a reader who
   sees neither line cannot tell which of them held. */
if (!build.present.length) {
  console.log(`\nℹ️  NOT READ: no build output on disk (${BUILD_DIRS.map(d => `${d}/`).join(', ')}).`);
  console.log('   git ls-files cannot see these directories — they are git-ignored — so a package');
  console.log('   built after this run is not covered by the result above. Re-run after packaging.');
} else if (build.distinct) {
  console.log(
    `\nℹ️  NOT IN SCOPE: ${build.distinct} distinct signature(s) across ${build.files} file(s) ` +
    `under ${build.present.map(d => `${d}/`).join(', ')}`);
  console.log('   These are the packager wiring disclosed credentials on purpose, not a leak, and');
  console.log('   the ratchet does not fail on them. They are real credentials all the same: anyone');
  console.log('   given this build directory can invoke those flows. Do not publish or copy a built');
  console.log('   package outside the boundary the disclosed-credential stamp assumes.');
} else {
  console.log(`\n✅ Build output read and clean: ${build.present.map(d => `${d}/`).join(', ')}.`);
}

if (build.unscannable.length) {
  console.error('\n❌ Archive(s) in build output could not be scanned — `unzip` is not available:\n');
  for (const f of build.unscannable) console.error(`   ${f}`);
  console.error('\nA control that cannot run must not report green.\n');
}

process.exit(added.length || cleared.length || unscannable.length || build.unscannable.length ? 1 : 0);
