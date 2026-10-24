/*
 * CONTENT APPROVAL — COUNT WHAT IS HIDDEN, THEN TURN OFF.
 *
 * WHY THIS EXISTS
 *   With content approval on, a row a flow creates lands Pending: the write returns success and
 *   the item is invisible to readers until someone approves it. An assignment nobody can see is
 *   the same outcome as an assignment that failed, reached by a path where every check passes.
 *   The 2026-09-01 preflight found it ON for DGO DIGITAL OPS and Global Tracking Queue. The
 *   agency has directed that it is not to be on for DGO DIGITAL OPS.
 *
 * IT COUNTS BEFORE IT CHANGES ANYTHING
 *   Turning approval off makes every currently-unapproved row VISIBLE at once. On lists of this
 *   size that is not a detail — there may be rows somebody deliberately left unapproved. So the
 *   first run only reads, and prints how many rows are in each state.
 *
 * HOW IT COUNTS, AND WHY NOT THE OBVIOUS WAY
 *   $filter=OData__ModerationStatus eq N returns HTTP 500 on these lists. _ModerationStatus is
 *   not indexed, and a filter on an unindexed column over the 5,000-item list-view threshold is
 *   refused. Both targets are far above it (21,532 and 15,936 items), so that query can never
 *   succeed here.
 *
 *   Instead this pages the whole list ordered by Id — the auto-indexed column, which the
 *   threshold permits — selecting Id and the moderation status, and tallies the states in the
 *   browser. It is more requests, but it returns a real number.
 *
 *   IF THE TALLY CANNOT BE COMPLETED the counts are reported as UNKNOWN and APPLY is refused.
 *   An unknown count is not zero: a partial pass would understate how many rows are about to
 *   become visible, which is the one number this run exists to establish.
 *
 * HOW TO RUN
 *   1. Sign in to https://nitdanigeria.sharepoint.com and open any page on the site.
 *   2. devtools (F12) -> Console. Paste this file. Read the report.
 *   3. To apply: change APPLY to true at the top, paste again.
 *
 *   Reversible: set EnableModeration back to true on the list's versioning settings page. Doing
 *   so does not restore which rows were approved, so the report is worth keeping.
 */
(async () => {
  const APPLY = false;   /* <-- set to true to actually turn approval off */

  /* Only the list the agency has directed. Global Tracking Queue is reported and NOT changed —
     it carries its own decision and this script will not make it by implication. */
  const TARGETS = [
    { title: 'DGO DIGITAL OPS', guid: '1f1cb303-3fd2-43c8-8f24-c409b6c2fde3',
      site: 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING', change: true },
    { title: 'Global Tracking Queue', guid: 'ee82725a-c408-45e2-a8e8-facf7a092047',
      site: 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING', change: false },
  ];
  const V = 'application/json;odata=verbose';
  const STATE = { 0: 'Approved', 1: 'Rejected', 2: 'Pending', 3: 'Draft', 4: 'Scheduled' };
  const HIDES = ['Pending', 'Rejected', 'Draft'];   /* states a reader cannot see */
  const PAGE = 2000;
  const MAX_PAGES = 60;   /* 120,000 rows; both targets are well under this */
  const out = [];

  const digest = async (site) => {
    const r = await fetch(`${site}/_api/contextinfo`, { method: 'POST', credentials: 'include', headers: { Accept: V } });
    if (!r.ok) throw new Error(`contextinfo ${r.status}`);
    return (await r.json()).d.GetContextWebInformation.FormDigestValue;
  };

  /* Page the whole list by Id and tally moderation states client-side.
     Returns { counts, seen } on a COMPLETE pass, or { unknown: '<why>' }. Never a partial tally:
     a half-counted list must not be reported as if it were the whole one. */
  const tally = async (t) => {
    const counts = Object.fromEntries(Object.values(STATE).map((s) => [s, 0]));
    counts.Other = 0;
    let url = `${t.site}/_api/web/lists(guid'${t.guid}')/items`
            + `?$select=Id,OData__ModerationStatus&$orderby=Id&$top=${PAGE}`;
    let seen = 0, pages = 0;
    while (url) {
      if (++pages > MAX_PAGES) return { unknown: `list is longer than ${MAX_PAGES * PAGE} rows` };
      let j;
      try {
        const r = await fetch(url, { credentials: 'include', headers: { Accept: V } });
        if (!r.ok) return { unknown: `page ${pages} returned HTTP ${r.status}` };
        j = await r.json();
      } catch (e) { return { unknown: `page ${pages} failed: ${e.message}` }; }
      /* A 200 is not an answer. SharePoint returns 200 for an OData error envelope, for a
         throttling response, and for an odata=nometadata shape this parser cannot read. Each of
         those used to fall through to an empty row list and be counted as "no unapproved rows
         on this page" — a page that was never read, scored as a page that was read and found
         empty. Anything this cannot recognise is unknown. */
      if (!j || !j.d || !Array.isArray(j.d.results)) {
        return { unknown: `page ${pages} returned 200 with a body this cannot read` };
      }
      const rows = j.d.results;
      for (const row of rows) {
        const label = STATE[row.OData__ModerationStatus];
        if (label) counts[label]++; else counts.Other++;
      }
      seen += rows.length;
      url = (j.d && j.d.__next) || '';
      if (pages % 5 === 0 && url) console.log(`    …counted ${seen} rows so far`);
    }
    /* A moderation value outside STATE cannot be classed as visible or hidden, so a tally
       carrying one is not a tally. */
    if (counts.Other) return { unknown: `${counts.Other} row(s) carry a moderation value this does not recognise` };
    return { counts, seen };
  };

  for (const t of TARGETS) {
    console.group(`${t.title}`);
    try {
      const lr = await fetch(`${t.site}/_api/web/lists(guid'${t.guid}')?$select=Title,EnableModeration,ItemCount`,
        { credentials: 'include', headers: { Accept: V } });
      if (!lr.ok) throw new Error(`list read ${lr.status}`);
      const l = (await lr.json()).d;
      console.log(`  content approval: ${l.EnableModeration ? 'ON' : 'off'} · ${l.ItemCount} item(s)`);

      /* How many rows are not approved. These become visible the moment approval is turned off. */
      let counts = null, hidden = null, why = '';
      if (l.EnableModeration) {
        console.log(`  counting ${l.ItemCount} rows by approval state — this takes a moment…`);
        const res = await tally(t);
        if (res.unknown) {
          why = res.unknown;
          console.log(`  %cby approval state: UNKNOWN — ${why}`, 'color:#dc322f;font-weight:bold');
          console.log('  %cThis is NOT zero. Read the count in the list UI instead:', 'color:#dc322f');
          console.log(`     ${t.site}/Lists/${encodeURIComponent(t.title)}  ->  view "Approve/reject Items"`);
        } else {
          counts = res.counts;
          console.log('  by approval state:', JSON.stringify(counts));
          /* Short of the list's own item count means pages were missed, however cleanly the
             loop ended. A note the operator can read past is not a gate. */
          if (res.seen !== l.ItemCount) {
            why = `counted ${res.seen} of ${l.ItemCount} rows — the tally is short`;
            console.log(`  %cby approval state: UNKNOWN — ${why}`, 'color:#dc322f;font-weight:bold');
            console.log('  %cThis is NOT zero. Read the count in the list UI instead:', 'color:#dc322f');
            console.log(`     ${t.site}/Lists/${encodeURIComponent(t.title)}  ->  view "Approve/reject Items"`);
            counts = null;
            console.groupEnd(); out.push({ ...t, before: true, changed: false, countsUnknown: why }); continue;
          }
          hidden = HIDES.reduce((n, k) => n + counts[k], 0);
          console.log(`  %c${hidden} row(s) are currently NOT approved and would become visible.`,
            hidden ? 'color:#b58900;font-weight:bold' : 'color:#859900');
        }
      }

      if (!t.change) { console.log('  %cnot changed by this script — it carries its own decision', 'color:#888'); console.groupEnd(); out.push({ ...t, before: l.EnableModeration, changed: false, counts, hidden, countsUnknown: why || null }); continue; }
      if (!l.EnableModeration) { console.log('  %calready off — nothing to do', 'color:#859900'); console.groupEnd(); out.push({ ...t, before: false, changed: false }); continue; }
      if (!APPLY) { console.log('  %cREAD ONLY. Set APPLY = true and run again to turn it off.', 'color:#dc322f;font-weight:bold'); console.groupEnd(); out.push({ ...t, before: true, changed: false, counts, hidden, countsUnknown: why || null }); continue; }
      /* APPLY is on, but the number of rows about to become visible was never established.
         Turning approval off here would publish an unknown quantity. Refuse. */
      if (hidden === null) {
        console.log('  %cREFUSED — APPLY is true but the hidden-row count is UNKNOWN.', 'color:#dc322f;font-weight:bold');
        console.log(`  %cTurning approval off would make an unmeasured number of rows public (${why}).`, 'color:#dc322f');
        console.log('  %cEstablish the count in the list UI first, then run again.', 'color:#dc322f');
        console.groupEnd(); out.push({ ...t, before: true, changed: false, refused: 'hidden count unknown', countsUnknown: why }); continue;
      }

      const d = await digest(t.site);
      const r = await fetch(`${t.site}/_api/web/lists(guid'${t.guid}')`, {
        method: 'POST', credentials: 'include',
        headers: { Accept: V, 'Content-Type': V, 'X-RequestDigest': d, 'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*' },
        body: JSON.stringify({ __metadata: { type: 'SP.List' }, EnableModeration: false }),
      });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
      const after = await (await fetch(`${t.site}/_api/web/lists(guid'${t.guid}')?$select=EnableModeration`,
        { credentials: 'include', headers: { Accept: V } })).json();
      const now = after.d.EnableModeration;
      console.log(`  %ccontent approval is now ${now ? 'STILL ON — the change did not take' : 'OFF'}`,
        now ? 'color:#dc322f;font-weight:bold' : 'color:#859900;font-weight:bold');
      out.push({ ...t, before: true, after: now, changed: !now, counts, hidden });
    } catch (e) {
      console.log(`  %c✗ ${e.message}`, 'color:#dc322f');
      out.push({ ...t, error: e.message });
    }
    console.groupEnd();
  }

  console.log('%c────────────────────────────────────────', 'color:#888');
  console.log(APPLY ? 'Applied where the count was known. File this run: copy(JSON.stringify(contentApproval, null, 2))'
    : 'Nothing was written. Set APPLY = true once the counts above are known and acceptable.');
  window.contentApproval = { checkedUtc: new Date().toISOString(), applied: APPLY, results: out };
})();
