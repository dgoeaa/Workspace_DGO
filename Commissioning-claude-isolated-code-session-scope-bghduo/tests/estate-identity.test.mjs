/* The estate names itself, or this fails.
 *
 * WHY THIS EXISTS
 *
 * This tree was carried here from earlier repositories. What came with it was not just
 * content: §2 of `CLEAR-THE-LAST-BLOCKER.md` — the document the commissioning surface calls
 * "the one commissioning path" — told an operator to
 *
 *     git clone https://github.com/dgoeaa/ECM_DOCS_DEV.git ecm_docs_dev
 *     git checkout claude/system-remediation-gaps-ahpmsy
 *
 * A different repository, and a development branch. Anyone who followed the commissioning
 * path exactly commissioned something that was not this estate. Thirty such commands were
 * spread across fourteen runbooks, and one of them was printed by a BUILDER, so regenerating
 * put it back.
 *
 * WHAT IS CHECKED, AND WHAT DELIBERATELY IS NOT
 *
 * Only lines a reader could EXECUTE: clone URLs, checkout/pull/fetch/push, the directory an
 * operator is told to stand in, and the headers that declare which repository and branch this
 * baseline IS.
 *
 * Statements about the past are NOT checked and must not be "fixed". "Carried from
 * `claude/system-notifications-provisioning-h5h1gy`, where it was ITEM-38" is provenance;
 * "measured on branch X on 11 September" is a measurement; the clipboard block in
 * tests/fetch-values-file.test.mjs is the verbatim text of a real incident. Repointing any of
 * those would make a true sentence false, which is a worse defect than the one this guards.
 * That is also why the record trees are out of scope here: this repository's rule is that a
 * record is never edited to agree with the present.
 *
 * The ALLOWED list below is not a list of things to get round to. Each entry acts on a
 * DIFFERENT repository — the former lineage, or `dgoeaa/internal_platform` — and naming that
 * repository is what makes it correct.
 */
import { readFileSync } from 'node:fs';
import { documentFiles } from '../scripts/lib/tracked-files.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REPO = 'dgoeaa/Commissioning';
const BRANCH = 'digital-servant-commissioning';

/* Records: true about their own date, never edited to agree with the present. */
const RECORD = [
  'docs/archive/', 'docs/forensic/', 'docs/handoff/', 'docs/audits/', 'docs/process/',
  'docs/reference/foundational/', 'docs/reference/flow-contracts/',
];
/* Verbatim incident text and measurement provenance — see the header. */
const EXEMPT_FILES = [
  'package-lock.json', 'node_modules/',
  'tests/fetch-values-file.test.mjs', 'tests/baseline.json',
  'tests/pending-plan.test.mjs', 'tests/package-portability.test.mjs',
  /* An audit OF another tree. Its "**Repository:**" header is the subject of the audit,
   * sitting beside "**Audit date:**" and "**Audited tree:**", and its own banner says its
   * measurements are not measurements of the tree it now sits in. A record, at the root
   * rather than under docs/audits/ only because that is where it was written. */
  'OPERATIONAL_PARAMETERS_AUDIT.md',
  /* This suite itself. Its header quotes the two commands verbatim, because a rule whose
   * reason has been paraphrased away is one somebody later deletes as unexplained. Quoting
   * them is the point, so it cannot also be an offence. */
  'tests/estate-identity.test.mjs',
];

/* Session scope-lock tooling. It names branches as test fixtures, which is what it is for,
 * and this suite must not read it as commissioning instruction. Matched rather than listed
 * so this file does not itself carry the guard's paths. */
const isScopeLockTooling = (f) => f.startsWith('.') || /(^|\/)(lock-|test_.*lock)/.test(f);

/* Executable lines that legitimately name another repository. */
const ALLOWED = [
  'git ls-tree -r --name-only origin/main',            // §1 old-lineage reconciliation
  'git push origin origin/main:refs/heads/main-archived-2026-09-04',
  'git show "origin/main:$f"',
  'git merge-base',                                    // prose about the old lineage
  'origin/claude/internal-platform-package-1x0107',    // a different repository
  'git checkout claude/internal-platform-package-1x0107',
  'ECM_DOCS_DEV.zip',                                  // an artefact's real filename
  'ECM_DOCS_DEV-main',                                 // the forensically audited tree
];

const FOREIGN_REPO = /dgoeaa\/(ECM_DOCS_DEV|ecm_docs_dev|DGO_Targets|DGO_OPS|ecm_repo_clean|Sytem_Production_Governance)/;
const FOREIGN_URL = /github\.com\/dgoeaa\/(?!Commissioning)[A-Za-z0-9_.-]+/;
const DEV_BRANCH = new RegExp('(?<!\\.)\\b' + 'claude' + '\\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{6}\\b');
const OLD_DIR = /\b(ecm_docs_dev|ECM_DOCS_DEV)\b/;

/* A line the reader runs, or a header declaring what this baseline is. */
const EXECUTABLE = [
  /\bgit\s+(clone|checkout|pull|fetch|push|switch|ls-tree|rev-parse|log)\b/,
  /^\s*cd\s+[~/A-Za-z$%.]/,
  /^\*\*(Repository|Branch|Baseline)[:*]/,
  /^Expected:/,
  /must print/,
];

let failed = 0;
let ran = 0;
const ok = (name, cond, detail = '') => {
  ran++;
  if (cond) { console.log('  ✅ ' + name); return; }
  failed++; console.log('  ❌ ' + name + (detail ? '\n     ' + detail : ''));
};

console.log('\nThe estate names itself');

const files = documentFiles({ root: ROOT, what: 'estate files' })
  .filter(f => !RECORD.some(r => f.startsWith(r)))
  .filter(f => !EXEMPT_FILES.some(e => f === e || f.startsWith(e)))
  .filter(f => !isScopeLockTooling(f))
  .filter(f => !/\.(zip|xlsx|docx|pdf|png|jpg|jpeg|svg|ico|woff2?|ttf)$/i.test(f));

ok('there are live files to check', files.length > 50, `only ${files.length} found`);

const offences = [];
for (const rel of files) {
  let src;
  try { src = readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
  src.split('\n').forEach((line, i) => {
    if (!EXECUTABLE.some(re => re.test(line))) return;
    if (ALLOWED.some(a => line.includes(a))) return;
    const why = FOREIGN_URL.test(line) ? 'a foreign clone URL'
      : FOREIGN_REPO.test(line) ? 'a foreign repository'
      : DEV_BRANCH.test(line) ? 'a development branch'
      : OLD_DIR.test(line) ? 'the former clone directory'
      : null;
    if (why) offences.push(`${rel}:${i + 1} names ${why}\n        ${line.trim().slice(0, 110)}`);
  });
}

ok(`no executable line names another repository, branch or clone directory (${files.length} files)`,
   offences.length === 0,
   offences.slice(0, 12).join('\n     ')
   + (offences.length > 12 ? `\n     …and ${offences.length - 12} more` : ''));

/* The identity must also be stated somewhere a reader lands, not merely absent-of-wrong. */
const entry = readFileSync(path.join(ROOT, 'docs/deployment/CLEAR-THE-LAST-BLOCKER.md'), 'utf8');
ok('the commissioning path clones this repository', entry.includes(`github.com/${REPO}.git`),
   'CLEAR-THE-LAST-BLOCKER.md §2 does not clone ' + REPO);
ok('the commissioning path checks out this branch', entry.includes(`git checkout ${BRANCH}`),
   'CLEAR-THE-LAST-BLOCKER.md §2 does not check out ' + BRANCH);

const register = JSON.parse(readFileSync(path.join(ROOT, 'docs/deployment/PRODUCTION_READINESS_REGISTER.json'), 'utf8'));
ok('the readiness register declares this repository', register.repository === REPO,
   `register says "${register.repository}"`);
ok('the readiness register declares this branch', register.branch === BRANCH,
   `register says "${register.branch}"`);

console.log(`\n${failed ? '❌' : '✅'} ${ran - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
