/**
 * The relay block appended to every generated browser script.
 *
 * WHY IT EXISTS
 *
 * These scripts run in a browser console and their output reaches whoever is directing the work
 * by being copied out of that console and pasted somewhere else. That relay is lossy in three
 * ways, all of them observed rather than imagined:
 *
 *   1. `console.table` renders as an aligned grid on screen and copies as one unbroken string —
 *      `0'DGO_AuditLog''74153ee5…''live'` — with the header repeated and no delimiters. Counting
 *      rows out of it requires guessing where one ends.
 *   2. A console log pasted whole usually includes the pasted SCRIPT as well as its output, and
 *      the script contains every verdict string the ledger can produce. Searching such a paste
 *      for `'FAILED'` finds the source, not the result. That has produced a wrong reading twice.
 *   3. Nothing in the output says which script, which mode, or which site produced it, so two
 *      runs pasted in sequence are indistinguishable.
 *
 * A single line of JSON between two markers fixes all three: it survives copy and paste intact,
 * it parses, and it carries its own provenance. The human relaying it copies one line rather than
 * judging where a table ends.
 *
 * The block is defensive about variable names because the scripts differ: some build `ledger`,
 * one builds `summary` and `orphans`. It reads whatever is there and never throws — a relay block
 * that crashes after a successful run would make a completed operation look failed.
 */

/**
 * @param {string} scriptName  the emitted file's name, so a paste identifies itself
 * @param {string} modeExpr    a JS expression evaluating to the run mode, or a literal
 * @param {string} siteExpr    a JS expression evaluating to the site URL
 * @returns {string} JavaScript source to append inside the emitted IIFE
 */
export function relayBlock(scriptName, modeExpr, siteExpr) {
  return `
  /* ── relay block ─────────────────────────────────────────────────────────────────────────
     One line of JSON, between two markers. Copy the line, not the table: a console.table copies
     as one unbroken string with its header repeated, and a whole-console paste also contains this
     script, whose source mentions every verdict the ledger can produce. */
  try {
    const _rows = (typeof ledger !== 'undefined' && Array.isArray(ledger)) ? ledger
      : (typeof summary !== 'undefined' && Array.isArray(summary)) ? summary : [];
    const _tally = {};
    for (const _r of _rows) {
      const _k = String(_r.action ?? _r.verdict ?? 'row');
      _tally[_k] = (_tally[_k] || 0) + 1;
    }
    const _payload = {
      script: ${JSON.stringify(scriptName)},
      mode: ${modeExpr},
      site: ${siteExpr},
      utc: new Date().toISOString(),
      rows: _rows.length,
      tally: _tally,
      ledger: _rows,
    };
    console.log('%c───────── RELAY: COPY THE SINGLE LINE BELOW ─────────', 'font-weight:bold');
    console.log(JSON.stringify(_payload));
    console.log('%c───────── END RELAY ─────────', 'font-weight:bold');
  } catch (_e) {
    /* Never let the relay turn a completed run into an apparent failure. */
    console.warn('relay block failed:', _e && _e.message);
  }
`;
}
