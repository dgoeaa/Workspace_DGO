#!/usr/bin/env node
/**
 * Export this branch as one transferable package, for someone outside this organisation to execute.
 *
 *   npm run export                       # dist/handover/ and dist/dgo-handover-<short sha>.zip
 *   npm run export -- --out /some/dir
 *   npm run export -- --allow-dirty      # only with a reason; see below
 *   npm run export -- --check            # verify the branch is exportable; write nothing
 *
 * WHY THIS EXISTS
 *
 * `HOW-TO-USE-THIS-BUNDLE.md` has described a bundle since it was written — `registers/`,
 * `governance/`, `notification/`, `packages/`, `evidence/`. No command in this repository has ever
 * produced that layout and no directory named `registers/` exists anywhere in the tree. Somebody
 * assembled it once, by hand, and the manual for it outlived the assembly.
 *
 * So the estate could describe a handover it could not perform. Two commands look as though they
 * would do it and do something else: `npm run package` builds the two deployable applications, and
 * `npm run package:bundle` serialises those with the endpoint configuration UNREDACTED — a file
 * that must never leave the machine that built it, let alone go to a third party.
 *
 * This is the missing one. It exports the BRANCH: every tracked file at one commit, plus a manifest
 * that says which commit, what is deliberately absent, and a SHA-256 for every file so a lossy
 * transfer is detectable rather than silently wrong.
 *
 * WHY `git archive` AND NOT A FILE WALK
 *
 * A walk of the working directory exports what is on disk, which includes anything untracked that
 * happens to be sitting there — a half-finished scratch file, a values file, a config.local.js. The
 * one thing this must never do is ship a credential. `git archive HEAD` emits exactly the tracked
 * tree at a commit and cannot emit anything else, so the guarantee is structural rather than a list
 * of exclusions somebody has to remember to keep current.
 *
 * WHY A DIRTY TREE IS REFUSED
 *
 * The manifest names a commit. If the working tree carries uncommitted changes, `git archive` still
 * exports the commit — so the package would be correct and the operator's belief about it would be
 * wrong: they would think they had shipped what they were looking at. `--allow-dirty` exports
 * anyway and records `workingTreeClean: false` in the manifest, so the recipient can see it too.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const ALLOW_DIRTY = argv.includes('--allow-dirty');
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const OUT_DIR = path.resolve(ROOT, opt('--out', 'dist'));

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const fail = (msg, remedy) => {
  console.error(`\n  ✖  ${msg}`);
  if (remedy) console.error(`     ${remedy}`);
  console.error('');
  process.exit(1);
};

/* The two documents a recipient opens, in order. If either is missing the export is a pile of
 * files with no way in, which is the state this whole exercise exists to end. */
const ENTRY = [
  { path: 'docs/deployment/HANDOVER_BRIEF.md', is: 'read this first — what you hold, what is missing, what not to edit' },
  { path: 'docs/deployment/HOW-TO-USE-THIS-BUNDLE.md', is: 'then this — which files carry steps, in what order, what you hand back' },
];

/* Absent by design, not by omission. Each one is a credential or is derived from one. The manifest
 * states them so a recipient who goes looking stops looking. */
const ABSENT = [
  { path: 'config/config.local.js', why: 'holds signed Power Automate URLs; git-ignored', instead: 'the portal runbook §4 creates it on your host' },
  { path: 'document-portal/config.local.js', why: 'holds signed Power Automate URLs; git-ignored', instead: 'the portal runbook §4 creates it on your host' },
  { path: '~/dgo-values.txt', why: 'the harvested endpoint values; never committed, shredded after use', instead: 'the portal runbook §3.2 produces it on your host' },
  { path: 'node_modules/', why: 'dependencies are installed, not shipped', instead: 'npm ci' },
  { path: 'dist/', why: 'build output, and a built package embeds the endpoint configuration', instead: 'npm run package' },
];

/* ── Preconditions ──────────────────────────────────────────────────────────────────────────── */

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const commit = git('rev-parse', 'HEAD');
const short = commit.slice(0, 7);
const [commitUtc, subject] = git('log', '-1', '--format=%cI%x00%s').split('\0');
const dirty = git('status', '--porcelain');

const files = git('ls-files').split('\n').filter(Boolean);
if (!files.length) fail('git ls-files returned nothing — there is no tracked tree to export.');

/* Tracked AND ignored means someone force-added a file the ignore rules exist to keep out. The
 * ignore rules here are credential rules, so this is the one condition worth refusing outright. */
const trackedButIgnored = git('ls-files', '-i', '-c', '--exclude-standard').split('\n').filter(Boolean);
if (trackedButIgnored.length) {
  fail(`${trackedButIgnored.length} tracked file(s) match an ignore rule: ${trackedButIgnored.slice(0, 5).join(', ')}`,
    'Those rules exist to keep credentials out of commits. Nothing is exported until this is resolved.');
}

for (const e of ENTRY) {
  if (!files.includes(e.path)) fail(`${e.path} is not tracked, so the export would have no entry document.`, 'Run: npm run brief && npm run bundleguide');
}

/* The secret gate is the authority on what may be shipped. Running it here rather than trusting
 * that someone ran it means an export cannot be produced from a tree it would reject. */
try {
  execFileSync('node', ['tests/check-secrets.mjs'], { cwd: ROOT, stdio: 'pipe' });
} catch {
  fail('npm run test:secrets fails on this tree, so nothing is exported.',
    'A signature in the tracked tree is a live credential until the trigger is rotated.');
}

if (CHECK) {
  console.log(`\n  ✅ this branch is exportable — ${files.length} tracked files, no tracked-ignored path, both entry documents present, secret gate green.\n`);
  process.exit(0);
}

if (dirty && !ALLOW_DIRTY) {
  fail(`the working tree has uncommitted changes, and the export would be of ${short}, not of what you are looking at.`,
    'Commit them, or pass --allow-dirty to export the commit anyway and say so in the manifest.');
}

/* ── Materialise the commit ───────────────────────────────────────────────────────────────────
 *
 * THIS USED TO BE `git archive`, AND THAT EXPORT COULD NOT BE EXECUTED.
 *
 * `git archive` emits the tracked tree and no `.git`, which is exactly what you want if the
 * guarantee you care about is "nothing untracked can escape". It was the wrong primitive anyway,
 * and an external party proved it within a day of receiving one: 12 scripts in this repository ask
 * git which files are tracked, `npm run test:node` reaches one of them at its second stage, and
 * with no `.git` the chain died there. The gate this estate hands someone as the proof they have
 * broken nothing could not be run by anyone who had not cloned the repository.
 *
 * Two of its symptoms were worse than the failure. Outside a repository the chain aborts loudly,
 * which is survivable. Unzipped INSIDE another repository, `git ls-files` answers for that one
 * instead, and the reference check printed a green tick over zero files. And `npm run commission`
 * reported a THIRD blocker — a secret-ratchet failure — which reads as "a credential may be in
 * this archive" and was nothing of the sort: the ratchet asks git for the file list too.
 *
 * So the export is a clone. `git ls-files` then means what it says, and the guarantee that made
 * archive attractive is kept a different way: the clone is of a commit, so it contains what the
 * commit contains, and the post-conditions below check that against `git ls-files` rather than
 * trusting it.
 *
 * ON DEPTH. Not `--depth 1`. The register pins `compiledAgainstCommit`, and the readiness gate
 * fails with "the pinned commit is not in this history" if it cannot reach it — so the depth is
 * computed from that pin rather than guessed, and the clone is verified to contain it.
 *
 * ON WHAT DEPTH MUST NOT REACH. `ECM_DOCS_DEV.zip` is in this repository's history and held signed
 * trigger URLs for 25 workflows. Shipping history is a materially different act from shipping a
 * tracked tree, and the check below refuses the export outright rather than let that blob travel.
 */

const stage = path.join(OUT_DIR, 'handover');
fs.rmSync(stage, { recursive: true, force: true });

/** How far back the register's own pin sits, plus a margin for merge parents. */
const depth = (() => {
  const pin = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/deployment/PRODUCTION_READINESS_REGISTER.json'), 'utf8'))
    .compiledAgainstCommit;
  if (!pin) fail('the readiness register no longer pins compiledAgainstCommit, so the export cannot tell how much history the freshness check needs.');
  let behind;
  try { behind = Number(git('rev-list', '--count', `${pin}..HEAD`)); } catch {
    fail(`the register pins ${pin}, which is not in this history.`,
      'Recompile the register against this branch before exporting; an export cannot carry a pin it cannot reach.');
  }
  return behind + 6;
})();

/* A file:// URL, not a plain path: cloning from a local path hardlinks the whole object store and
 * ignores --depth, which would ship the history this export exists to leave behind. Built with
 * pathToFileURL: concatenating the scheme onto a path by hand produces something a Windows drive
 * letter turns into nonsense, and tests/package-portability.test.mjs fails the build for it. */
execFileSync('git', ['clone', '--quiet', '--depth', String(depth), '--single-branch',
  '--branch', branch, pathToFileURL(ROOT).href, stage], { cwd: ROOT, stdio: 'inherit' });

/* ── Post-conditions: the clone is executable, and carries nothing it should not ─────────────── */

const inStage = (...args) => execFileSync('git', ['-C', stage, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();

const stageFiles = inStage('ls-files').split('\n').filter(Boolean);
if (stageFiles.length !== files.length) {
  fail(`the clone reports ${stageFiles.length} tracked files and this repository reports ${files.length}.`,
    'The export must be the branch, not a subset of it.');
}

const pinned = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/deployment/PRODUCTION_READINESS_REGISTER.json'), 'utf8'))
  .compiledAgainstCommit;
try { inStage('cat-file', '-e', pinned); } catch {
  fail(`the clone cannot reach ${pinned}, the commit the register is compiled against.`,
    `npm run readiness would fail in it. Depth was ${depth}.`);
}

/* The one blob that must never travel. Deleting a file revokes no credential, so a rotated
 * signature reachable through history is still a signature someone was handed. */
const HISTORICAL_ARCHIVE = 'ECM_DOCS_DEV.zip';
const carried = inStage('rev-list', '--objects', '--all').split('\n').filter((l) => l.includes(HISTORICAL_ARCHIVE));
if (carried.length) {
  fail(`the clone's history reaches ${HISTORICAL_ARCHIVE}, which held signed trigger URLs for 25 workflows.`,
    `Depth ${depth} was needed to reach the register's pin. Recompile the register against a recent commit and export again.`);
}

/* ── Digest every file ──────────────────────────────────────────────────────────────────────── */

let totalBytes = 0;
const digests = files.map((rel) => {
  const abs = path.join(stage, rel);
  if (!fs.existsSync(abs)) fail(`the clone does not carry ${rel}, which git ls-files reports as tracked.`);
  const buf = fs.readFileSync(abs);
  totalBytes += buf.length;
  return { path: rel, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
});

/* ── The manifest ───────────────────────────────────────────────────────────────────────────── */

const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const master = J('docs/deployment/MASTER_REGISTER.json');
const external = J('docs/deployment/EXTERNAL_EXECUTION.json');

const manifest = {
  schema: 'dgo.handover-export/1',
  generatedBy: 'npm run export (scripts/export-handover.mjs)',
  purpose: 'A complete copy of one branch, for independent execution outside the organisation that '
    + 'built it. Every tracked file at one commit, and nothing that is not tracked.',
  exportedAtUtc: new Date().toISOString(),
  source: { branch, commit, shortCommit: short, commitUtc, subject, workingTreeClean: !dirty },
  contents: { files: files.length, bytes: totalBytes },
  /* It is a git clone, not an unpacked archive, and that is load-bearing: 12 scripts here ask git
   * which files are tracked, and `npm run test:node` reaches one of them at its second stage. */
  isAGitRepository: {
    why: 'npm run test:node, npm run commission and npm run test:secrets ask git which files are '
      + 'tracked. Unpack this somewhere with no .git and the chain aborts at its second stage; '
      + 'unpack it INSIDE another repository and some checks answer for that one instead.',
    historyDepth: depth,
    commitsReachable: Number(inStage('rev-list', '--count', 'HEAD')),
    carriesFullHistory: false,
    andWhyNot: 'Shipping history is a different act from shipping a tracked tree. The depth is only '
      + 'what the readiness register needs to reach its own pin (' + pinned + '), and the export '
      + 'refuses outright if that reach would include the historical archive blob.',
  },
  startHere: ENTRY,
  deliberatelyAbsent: ABSENT,
  looksLikeACredentialAndIsNot: {
    path: 'docs/reference/foundational/',
    why: 'Signature-shaped strings for a superseded flow estate. Those triggers were rotated; the '
      + 'strings are dead and are kept as the record of what was built. Not a leak, and not usable.',
    theCheckThatDrawsTheLine: 'npm run test:secrets',
  },
  workRemaining: {
    open: master.totals.open,
    closed: master.totals.closed,
    sources: master.totals.sources,
    gatingCommissioning: (master.gatingCommissioning || []).length,
    tracks: external.tracks.map((t) => ({ id: t.id, title: t.title, steps: t.steps.length, who: t.who })),
    carryBackValues: external.tracks.flatMap((t) => t.steps.filter((s) => s.carryBack)).length,
  },
  verifyOnArrival: [
    'Compare every entry in files[] against the file on disk: same bytes, same sha256.',
    'npm run test:node    — the gate. Exit 0 means nothing generated has been silently edited. '
      + 'It needs node and git and NOTHING ELSE: no npm ci, no node_modules. Measured, not assumed.',
    'npm run commission   — the commissioning verdict. Expect NOT CLEARED and exactly 2 blockers, '
      + 'CFG-1 and CFG-2, both DISCHARGED_UNTRACKABLE. A third blocker means something is wrong.',
    'npm run outstanding  — one total across the declared sources.',
    'npm ci is needed ONLY for npm run test:smoke, the browser suite, which is not the gate.',
  ],
  files: digests,
};

const manifestPath = path.join(stage, 'EXPORT_MANIFEST.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

/* ── Two transferable files, same content ─────────────────────────────────────────────────────
 *
 * The zip is the one anybody can open, and on a Windows desktop it is the one to send. It is also
 * the bigger of the two by a third, because zip compresses each file on its own and this tree has
 * a lot of near-identical JSON — and because the clone's packfiles are already compressed, so they
 * squeeze no further. The first clone-shaped export came to 33 MB and was refused by a transfer
 * channel that stops at 30, which is not an exotic limit: mail gateways sit lower than that.
 *
 * So there is an xz as well, of exactly the same directory, for when the zip will not go through.
 * Windows 11 opens it natively; Windows 10 needs 7-Zip. Both are emitted every time rather than
 * one chosen by a size rule, because a rule that changes the format only sometimes means the
 * instruction "send them the zip" is right on most days and wrong on the day it matters.
 */

const base = `dgo-handover-${branch.replace(/[^\w.-]+/g, '-')}-${short}`;
const zipPath = path.join(OUT_DIR, `${base}.zip`);
const xzPath = path.join(OUT_DIR, `${base}.tar.xz`);
for (const p of [zipPath, xzPath]) fs.rmSync(p, { force: true });

execFileSync('sh', ['-c', `cd "${stage}" && zip -rqX "${zipPath}" .`]);
execFileSync('sh', ['-c', `cd "${stage}" && tar -cJf "${xzPath}" .`]);

const zipBytes = fs.statSync(zipPath).size;
const xzBytes = fs.statSync(xzPath).size;
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

console.log('\nHandover export\n');
console.log(`  branch   ${branch}`);
console.log(`  commit   ${short}  ${subject}`);
console.log(`  tree     ${dirty ? 'DIRTY — exported the commit, not your working copy' : 'clean'}`);
console.log(`  files    ${files.length}  (${(totalBytes / 1024 / 1024).toFixed(1)} MB, each digested)`);
console.log(`  history  a clone, depth ${depth} — reaches the register's pin ${pinned}, and not the archive blob`);
console.log('');
console.log(`  wrote    ${path.relative(ROOT, stage)}/`);
console.log(`  wrote    ${path.relative(ROOT, manifestPath)}`);
console.log(`  wrote    ${path.relative(ROOT, zipPath)}  (${mb(zipBytes)})`);
console.log(`  wrote    ${path.relative(ROOT, xzPath)}  (${mb(xzBytes)}) — same content, for when the zip is too big to send`);
console.log('');
console.log('  The recipient opens docs/deployment/HANDOVER_BRIEF.md first, then');
console.log('  docs/deployment/HOW-TO-USE-THIS-BUNDLE.md. Nothing else is a starting point.');
console.log('');
console.log(`  ${manifest.workRemaining.open} items remain open, in ${external.tracks.length} tracks, and not one of them can be`);
console.log('  finished inside the repository.\n');
