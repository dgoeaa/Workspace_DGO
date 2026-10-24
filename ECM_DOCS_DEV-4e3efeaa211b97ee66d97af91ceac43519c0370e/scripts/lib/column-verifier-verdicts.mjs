/**
 * The words `verify-governance-columns.browser.js` prints, in the one place that decides them.
 *
 * WHY THIS IS A MODULE
 *
 * The hand-written verifier printed `CORRECT` and `WRONG INTERNAL NAME`. It was replaced on
 * 2026-09-10 by a generated one whose verdicts are `present`, `MISSING`, `RESERVED NAME`,
 * `OLD NAME PRESENT` and `UNREADABLE` — because the old one had hardcoded two renames that were
 * withdrawn the day before and went on failing two correct columns.
 *
 * The runbook was not rewritten with it. Step 2.6 and the Step 2 row of the completion table both
 * went on telling the operator that "every row should read `CORRECT`" — a word the replacement
 * never emits. An operator reading the runbook literally would have found zero rows reading
 * `CORRECT`, concluded the read-back had failed, and stopped.
 *
 * That is the same defect the verifier rewrite existed to close, one document further out: a
 * checker that outlives the decision it checks, and a gate that can never go green. Fixing the
 * script and leaving the instruction behind fixes nothing an operator can see.
 *
 * So the vocabulary is imported by both the generator that emits the script and the generator
 * that writes the instruction. Rename a verdict and both move in the same commit.
 */

export const VERDICTS = Object.freeze({
  /** The column exists as a custom column under the internal name the specification declares. */
  ok: 'present',
  /** The specification declares it and the tenant does not have it. */
  missing: 'MISSING',
  /** A field of that name exists, but it is SharePoint's own, not the estate's. */
  reserved: 'RESERVED NAME',
  /** A withdrawn or superseded name is still on the list. Not a failure — it can hold data. */
  stale: 'OLD NAME PRESENT',
  /** The list itself could not be read. */
  unreadable: 'UNREADABLE',
});

/** The verdicts that stop the step. `stale` is deliberately absent: it is reported, not fatal. */
export const FATAL_VERDICTS = Object.freeze([VERDICTS.missing, VERDICTS.reserved, VERDICTS.unreadable]);

/** The single line the script prints when nothing is wrong. Quoted by the runbook verbatim. */
export const PASS_LINE = 'WP-0 PASSES: every specified column exists under its specified name.';
