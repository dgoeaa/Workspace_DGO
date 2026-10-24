/**
 * Ask git which files are tracked, and refuse an answer that is not one.
 *
 * WHY THIS EXISTS
 *
 * Fifteen scripts and suites in this repository decide what to check by asking `git ls-files`.
 * That is the right question — "tracked" is the estate's definition of what is real, and it is
 * identical in every clone, which a directory walk is not.
 *
 * It has two failure modes and they are not equally survivable.
 *
 * The loud one: no `.git` at all. git exits non-zero, the call throws, the chain stops. Whoever ran
 * it knows within a second. `npm run test:node` did exactly this for an external party on
 * 2026-09-15, at its second stage, because they were handed an unpacked archive.
 *
 * The silent one is the reason this file exists. Unpack that same tree INSIDE another repository
 * and git answers — for the wrong repository. `git ls-files` returns an empty list, every loop over
 * it does nothing, and `tests/references.test.mjs` printed
 *
 *     ✅ every relative reference outside the archive resolves on disk (0 across 0 tracked files)
 *
 * A green tick over an empty set. The suite was saved by a second assertion that happened to check
 * the checker was reading anything at all — which is to say, by somebody having worried about this
 * once, in one file, rather than by a property of how the question is asked.
 *
 * So the question is asked here instead, and an empty answer is an error rather than a result. A
 * caller for which empty is a legitimate answer says so with `allowEmpty`, which makes that a
 * stated exception rather than an accident.
 *
 * ON NOT CATCHING THE LOUD ONE TOO QUIETLY. When git fails, this does not fall back to a directory
 * walk. A fallback would let the gate run and report on a different set of files than the one it
 * claims to check, which is the silent failure again wearing a helpful face. It re-throws with the
 * cause named, because the fix is to work from a clone.
 */

import { execFileSync } from 'node:child_process';

/**
 * @param {object} o
 * @param {string} o.root            repository root to ask about
 * @param {string[]} [o.pathspec]    limit to these paths, as `git ls-files` takes them
 * @param {string[]} [o.extraArgs]   further git flags, e.g. ['-i', '-c', '--exclude-standard']
 * @param {boolean} [o.allowEmpty]   an empty answer is a legitimate result for this caller
 * @param {string} [o.what]          what is being asked for, for the error message
 * @returns {string[]} repository-relative paths
 */
export function trackedFiles({ root, pathspec = [], extraArgs = [], allowEmpty = false, what = 'tracked files' }) {
  let raw;
  try {
    raw = execFileSync('git', ['ls-files', '-z', ...extraArgs, ...(pathspec.length ? ['--', ...pathspec] : [])],
      { cwd: root, maxBuffer: 1 << 28 }).toString('utf8');
  } catch (e) {
    const why = /not a git repository/i.test(String(e.stderr || e.message))
      ? `${root} is not a git working tree.`
      : `git could not be run in ${root}: ${String(e.message).split('\n')[0]}`;
    throw new Error(
      `${why}\n`
      + `      This check reads ${what} from git, because "tracked" is what this repository means by\n`
      + '      "real" and it is the same answer in every clone. Work from a clone — an unpacked\n'
      + '      archive has no .git, and `npm run export` produces a clone for exactly this reason.');
  }

  const files = raw.split('\0').filter(Boolean);
  if (!files.length && !allowEmpty) {
    throw new Error(
      `git reported no ${what}${pathspec.length ? ` under ${pathspec.join(', ')}` : ''}, and this repository has thousands.\n`
      + '      The usual cause is running inside a DIFFERENT git working tree — unpack an export\n'
      + '      inside another repository and git answers for that one, every loop runs zero times,\n'
      + '      and a check reports green over nothing. Refusing rather than passing.');
  }
  return files;
}

/**
 * Tracked files, PLUS the derived documents that are present but git-ignored.
 *
 * WHY THIS EXISTS
 *
 * `trackedFiles` above says "tracked" is what this repository means by "real". That stopped being
 * the whole truth when the derived documentation was untracked: `docs/deployment/EXECUTION_RUNBOOK.md`
 * is as real to a reader as it ever was, and it is still held to its register by a `--check` — it is
 * simply printed by `npm run generate` rather than carried in the tree. A gate that enumerates
 * documents with `ls-files` alone now silently skips every one of them, which is the same green-tick-
 * over-an-empty-set failure this module exists to refuse, just narrower.
 *
 * The fix is NOT a directory walk. The reason `ls-files` was chosen holds: a walk picks up scratch
 * files, half-finished edits and anything else that happens to be lying in the tree, and it differs
 * between clones. So this asks git a second question instead — "which ignored files are present?" —
 * and unions the answers. Both halves are git's own, both are reproducible from a clone plus
 * `npm run generate`, and a file appears only if `.gitignore` deliberately names it.
 *
 * An EMPTY ignored half is legitimate and not an error: it means `npm run generate` has not run
 * yet. Callers that need the derived documents to exist should say so themselves, with a message
 * naming that command, rather than having this throw something less specific.
 */
export function documentFiles({ root, pathspec = [], what = 'documents' }) {
  const tracked = trackedFiles({ root, pathspec, what });
  const derived = trackedFiles({
    root,
    pathspec,
    extraArgs: ['--others', '--ignored', '--exclude-standard'],
    allowEmpty: true,
    what: `${what} that are generated and git-ignored`,
  });
  return [...new Set([...tracked, ...derived])].sort();
}
