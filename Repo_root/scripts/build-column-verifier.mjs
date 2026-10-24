#!/usr/bin/env node
/**
 * Emit the read-only column verifier used by EXECUTION-AGENT-BRIEF.md WP-0.
 *
 * WHY THIS REPLACES A HAND-WRITTEN SCRIPT
 *
 * `verify-governance-columns.browser.js` was written by hand on 2026-09-09 with five checks
 * hardcoded into it, two of which asserted `CatalogueVersion` and `EndpointVersion`. Those two
 * renames were WITHDRAWN the following day: the tenant proved `Version` is an ordinary custom
 * column on both lists, populated and working, so the specification was reverted to want
 * `Version`.
 *
 * The script was not reverted with it. On 2026-09-10 it therefore reported two columns as
 * `WRONG INTERNAL NAME` when the tenant held exactly what the specification asked for. Both were
 * false positives from a checker that had outlived the decision it was checking.
 *
 * That is not a cosmetic problem. WP-0 of the agent brief stops the engagement on a failing row —
 * so a stale hardcoded checker would have halted every agent at the first step, forever, over
 * nothing. A gate that can never go green teaches people to ignore gates.
 *
 * The verdict words themselves live in `scripts/lib/column-verifier-verdicts.mjs`, because the
 * runbook quotes them and the same drift happened there next: it went on telling the operator to
 * expect `CORRECT`, which this script has never printed.
 *
 * So the checks are derived. Every column this verifier looks for is read from
 * `sharepoint-provisioning-spec.json` at build time, and `--check` fails if the emitted file
 * drifts from it. Withdraw a rename and the verifier stops asserting it, in the same commit.
 *
 *   npm run governance:columnverifier
 *   npm run governance:columnverifier -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relayBlock } from './lib/browser-relay.mjs';
import { VERDICTS, FATAL_VERDICTS, PASS_LINE } from './lib/column-verifier-verdicts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, 'docs/reference/sharepoint-provisioning-spec.json');
const REGISTRY = path.join(ROOT, 'docs/reference/governance-list-registry.json');
const OUT = path.join(ROOT, 'scripts/verify-governance-columns.browser.js');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const SITE = registry.decision.authoritativeSite;

const lists = registry.lists.map((l) => {
  const fields = (spec.fields || [])
    .filter((f) => f.ListTitle === l.listTitle)
    .map((f) => ({
      internalName: f.InternalName,
      displayName: f.DisplayName,
      indexed: f.Indexed === true || f.Indexed === 'Yes' || f.Indexed === 'TRUE',
    }));
  if (!fields.length) fail(`${l.listTitle} has no specified columns`);
  return { listTitle: l.listTitle, listGuid: l.listGuid, fields };
});

const total = lists.reduce((n, l) => n + l.fields.length, 0);

/* The names the specification has explicitly withdrawn. Reporting one as present is as much a
   defect as a missing column: it means a correction was applied to the tenant and then reverted
   in the repository, or never reverted in the tenant. */
const withdrawn = [];
for (const f of spec.fields || []) {
  if (f.RenamedFrom) withdrawn.push({ list: f.ListTitle, oldName: f.RenamedFrom, newName: f.InternalName });
}

const emitted = `/* GENERATED FILE — do not edit by hand.
 * Built from docs/reference/sharepoint-provisioning-spec.json by
 * scripts/build-column-verifier.mjs. Edit the specification and re-run.
 */
/*
 * READ-ONLY. Changes nothing. EXECUTION-AGENT-BRIEF.md WP-0.
 *
 * Confirm that every column the specification declares exists on the tenant under the internal
 * name the specification declares, across all ${lists.length} governance lists
 * (${total} columns in total) on
 *   ${SITE}
 *
 * WHY THIS FILE IS GENERATED
 *   Its predecessor was hand-written with five checks hardcoded, two of which asserted column
 *   names — CatalogueVersion and EndpointVersion — that were WITHDRAWN the next day when the
 *   tenant proved 'Version' is an ordinary custom column on both lists, populated and working.
 *   The script was not reverted with the specification, so it went on reporting two correct
 *   columns as WRONG INTERNAL NAME. A checker that outlives the decision it checks produces a
 *   gate that can never go green, and a gate that can never go green teaches people to ignore
 *   gates.
 *
 *   Every name below is read from the specification at build time. Withdraw a rename and this
 *   file stops asserting it, in the same commit.
 *
 * WHAT EACH VERDICT MEANS
 *   ${VERDICTS.ok}            the column exists as a custom column under the specified internal name
 *   ${VERDICTS.missing}            the specification declares it and the tenant does not have it
 *   ${VERDICTS.reserved}      a field of that name exists but is SharePoint's own, not the estate's
 *   ${VERDICTS.stale}   a withdrawn or superseded name is still on the list — see the note it prints
 *
 * HOW TO RUN
 *   1. Sign in and open any page on ${SITE}
 *   2. F12 → Console. Paste. Nothing is written.
 */

const SITE = ${JSON.stringify(SITE)};
const LISTS = ${JSON.stringify(lists, null, 2)};
const SUPERSEDED = ${JSON.stringify(withdrawn, null, 2)};

(async () => {
  const NOMETA = 'application/json;odata=nometadata';

  const send = async (url, attempt = 0) => {
    const res = await fetch(url, { credentials: 'include', headers: { Accept: NOMETA } });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const wait = (Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000;
      console.warn(\`  throttled, waiting \${wait / 1000}s\`);
      await new Promise((r) => setTimeout(r, wait));
      return send(url, attempt + 1);
    }
    return res;
  };

  /* A field inherited from the base type is SharePoint's, not the estate's. Counting one as
     present is the false positive that cost the 2026-09-09 run — recorded as GOV-08. */
  const isCustom = (f) => f && f.FromBaseType !== true && f.CanBeDeleted !== false;

  const ledger = [];
  let present = 0, missing = 0, reserved = 0, stale = 0, unreadable = 0;

  console.log(\`%cWP-0 column verification — \${LISTS.length} lists, \${LISTS.reduce((n, l) => n + l.fields.length, 0)} columns\`,
    'font-weight:bold;font-size:13px');
  console.log(\`%c\${SITE}\`, 'color:#888');

  for (const l of LISTS) {
    let live;
    try {
      const res = await send(
        \`\${SITE}/_api/web/lists(guid'\${l.listGuid}')/fields?$select=InternalName,Title,Indexed,FromBaseType,CanBeDeleted&$top=500\`);
      if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
      live = new Map(((await res.json()).value || []).map((f) => [f.InternalName, f]));
    } catch (err) {
      unreadable++;
      ledger.push({ list: l.listTitle, column: '(whole list)', action: '${VERDICTS.unreadable}', detail: err.message });
      continue;
    }

    for (const f of l.fields) {
      const got = live.get(f.internalName);
      if (!got) {
        missing++;
        ledger.push({ list: l.listTitle, column: f.internalName, action: '${VERDICTS.missing}', detail: \`display '\${f.displayName}'\` });
      } else if (!isCustom(got)) {
        reserved++;
        ledger.push({
          list: l.listTitle, column: f.internalName, action: '${VERDICTS.reserved}',
          detail: \`FromBaseType=\${got.FromBaseType}, CanBeDeleted=\${got.CanBeDeleted} — SharePoint's own field, not the estate's\`,
        });
      } else {
        present++;
      }
    }

    /* A superseded name still on the list is a correction the tenant has not received, or one
       the repository reverted without the tenant. Either way it is worth naming, and it is NOT
       a failure of the columns above. */
    for (const s of SUPERSEDED) {
      if (s.list !== l.listTitle) continue;
      const old = live.get(s.oldName);
      if (old && isCustom(old)) {
        stale++;
        ledger.push({
          list: l.listTitle, column: s.oldName, action: '${VERDICTS.stale}',
          detail: \`superseded by '\${s.newName}'. Not an error on its own — it holds data on some lists. Report it; do not delete it here.\`,
        });
      }
    }
  }

  console.table(ledger.length ? ledger : [{ list: '(all)', column: '(all)', action: '${VERDICTS.ok}', detail: 'every specified column found' }]);
  console.log(
    \`%c\${present} present · \${missing} missing · \${reserved} reserved-name · \${stale} superseded-name still present · \${unreadable} list(s) unreadable\`,
    (missing || reserved || unreadable) ? 'color:#b00;font-weight:bold' : 'color:#080;font-weight:bold',
  );

  if (!missing && !reserved && !unreadable) {
    console.log('%c${PASS_LINE}', 'color:#080;font-weight:bold');
  } else {
    console.log('%cWP-0 DOES NOT PASS. Report under §9 before proceeding.', 'color:#b00;font-weight:bold');
  }
${relayBlock('verify-governance-columns.browser.js', "'read-only'", 'SITE')}
})();
`;

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

console.log('\nWP-0 column verifier\n');
console.log(`  site      ${SITE}`);
console.log(`  verifies  ${total} column(s) across ${lists.length} list(s)`);
console.log(`  reports   ${withdrawn.length} superseded name(s) if still present\n`);

if (CHECK) {
  if (emitted !== previous) fail('the column verifier is stale. Run: npm run governance:columnverifier');
  console.log('  ✅ the column verifier matches the specification\n');
  process.exit(0);
}

fs.writeFileSync(OUT, emitted);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)} — ${Math.round(emitted.length / 1024)} KB, read-only\n`);
