#!/usr/bin/env node
/**
 * Emit the browser script that compares each duplicate list against the instance that supersedes
 * it, row by row.
 *
 * WHY THIS BECAME NECESSARY
 *
 * The Step 3 survey of 2026-09-09 reported four duplicates carrying items — DGO_AuditLog 5,
 * DGO_RoleCatalogue 6, DGO_UserDirectory 1, DGO_PilotCohorts 1 — and all four share a
 * LastItemModifiedDate of 2026-08-31T01:58:48Z, within one second of each other. The list capture
 * this estate reasons from is dated 2026-08-18. So something wrote seed rows into the
 * NON-authoritative site thirteen days after the audit, in a single run.
 *
 * That is a live producer, and it changes what Step 3 means. Deleting a list nothing writes to is
 * housekeeping. Deleting a list something still writes to breaks that something, and — because
 * the deployed provisioning flows create lists BY TITLE — very likely just recreates the list on
 * the next run, restoring the duplicate estate the deletion was meant to end.
 *
 * WHAT THIS ANSWERS, AND WHAT IT DOES NOT
 *
 * It answers one question precisely: does any row exist ONLY in the duplicate? If every row is
 * also in the authoritative instance, the duplicate holds nothing unique and deleting it loses
 * no data — the producer still has to be found, but the deletion itself is safe. If a row exists
 * only in the duplicate, that row is the sole copy and deleting the list destroys it.
 *
 * It does NOT identify the producer. Nothing readable from a list says what wrote to it. That is
 * Step 4 work — the flows themselves.
 *
 *   npm run governance:comparison
 *   npm run governance:comparison -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relayBlock } from './lib/browser-relay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'docs/reference/governance-list-registry.json');
const SPEC = path.join(ROOT, 'docs/reference/sharepoint-provisioning-spec.json');
const OUT = path.join(ROOT, 'scripts/compare-duplicate-governance-lists.browser.js');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));

const AUTHORITATIVE = registry.decision.authoritativeSite;
const ORIGIN = AUTHORITATIVE.split('/sites/')[0];
const sites = [...new Set(registry.retire.map((r) => r.site))];
if (sites.length !== 1) fail(`the duplicates span ${sites.length} sites; this script assumes one`);
const DUPLICATE_SITE = `${ORIGIN}/sites/${sites[0]}`;

const authByGuid = new Map(registry.lists.map((l) => [l.listGuid, l]));

/**
 * The field that identifies a row, taken from the seed definitions rather than invented. A
 * comparison keyed on Title would call two different rows the same row on the lists that
 * legitimately repeat titles.
 */
const keyFieldOf = (listTitle) => {
  const seed = (spec.seedItems || []).find((s) => s.ListTitle === listTitle && s.KeyField);
  return seed ? seed.KeyField : null;
};

const pairs = registry.retire.map((r) => {
  const auth = authByGuid.get(r.supersededBy);
  if (!auth) fail(`${r.listTitle} ${r.listGuid} is superseded by ${r.supersededBy}, which is not an authoritative list`);
  return {
    title: r.listTitle,
    duplicateGuid: r.listGuid,
    authoritativeGuid: r.supersededBy,
    authoritativeTitle: auth.listTitle,
    keyField: keyFieldOf(auth.listTitle),
  };
}).sort((a, b) => (a.title + a.duplicateGuid < b.title + b.duplicateGuid ? -1 : 1));

const withoutKey = pairs.filter((p) => !p.keyField).map((p) => p.title);
const uniqueWithoutKey = [...new Set(withoutKey)];

const emitted = `/* GENERATED FILE — do not edit by hand.
 * Built from docs/reference/governance-list-registry.json and
 * docs/reference/sharepoint-provisioning-spec.json by scripts/build-governance-comparison.mjs.
 */
/*
 * READ-ONLY. Changes nothing, on either site.
 *
 * Compare every duplicate list against the instance that supersedes it, row by row, and report
 * anything the duplicate holds that the authoritative instance does not.
 *
 * WHY THIS EXISTS
 *   The Step 3 survey found four duplicates carrying items, all four last written at
 *   2026-08-31T01:58:48Z — within one second of each other, and thirteen days AFTER the list
 *   capture this estate reasons from. Something wrote seed rows into the NON-authoritative site
 *   in a single run, after the audit.
 *
 *   That changes what a deletion means. Deleting a list nothing writes to is housekeeping.
 *   Deleting a list something still writes to breaks that something — and because the deployed
 *   provisioning flows create lists BY TITLE, the next run very likely recreates it, restoring
 *   the duplicate estate the deletion was meant to end.
 *
 * WHAT IT ANSWERS
 *   One question, precisely: does any row exist ONLY in the duplicate?
 *
 *   every row also in the authoritative  → the duplicate holds nothing unique. Deleting it
 *                                          loses no data. The producer still has to be found.
 *   a row only in the duplicate          → that row is the only copy. Deleting the list
 *                                          destroys it. Do not delete until it is reconciled.
 *
 * WHAT IT DOES NOT ANSWER
 *   What wrote those rows. Nothing readable from a list says what wrote to it. That is Step 4 —
 *   the flow definitions — not something this can infer.
 *
 * ROWS ARE MATCHED ON THE LIST'S OWN KEY FIELD, never on Title: two of these lists legitimately
 * repeat titles, and a comparison keyed on Title would call two different rows the same row.
 *
 * HOW TO RUN
 *   1. Sign in and open any page on either site — both are on ${ORIGIN.replace('https://', '')},
 *      so one session reads both.
 *   2. F12 → Console. Paste. Nothing is written.
 */

const DUPLICATE_SITE = ${JSON.stringify(DUPLICATE_SITE)};
const AUTHORITATIVE_SITE = ${JSON.stringify(AUTHORITATIVE)};

const PAIRS = ${JSON.stringify(pairs, null, 2)};

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

  const detail = async (res) => {
    const text = await res.text();
    try {
      const body = JSON.parse(text);
      const err = body['odata.error'] || body.error || body;
      return \`\${res.status} \${err?.message?.value ?? err?.message ?? text}\`;
    } catch { return \`\${res.status} \${text.slice(0, 160)}\`; }
  };

  const allItems = async (site, guid) => {
    const out = [];
    let url = \`\${site}/_api/web/lists(guid'\${guid}')/items?$top=500\`;
    while (url) {
      const res = await send(url);
      if (!res.ok) throw new Error(await detail(res));
      const body = await res.json();
      out.push(...(body.value || []));
      url = body['odata.nextLink'] || null;
    }
    return out;
  };

  const summary = [];
  const orphans = [];

  for (const p of PAIRS) {
    let dupItems;
    try {
      dupItems = await allItems(DUPLICATE_SITE, p.duplicateGuid);
    } catch (err) {
      summary.push({ list: p.title, duplicate: p.duplicateGuid, verdict: 'DUPLICATE UNREADABLE', detail: err.message });
      continue;
    }

    /* An empty duplicate needs no comparison, and reading the authoritative instance to prove
       that would be seventeen requests for nothing. */
    if (!dupItems.length) {
      summary.push({
        list: p.title, duplicate: p.duplicateGuid, keyField: p.keyField || '(none)',
        duplicateRows: 0, onlyInDuplicate: 0, verdict: 'EMPTY — nothing to lose',
      });
      continue;
    }

    if (!p.keyField) {
      /* No declared key means no honest row identity, and guessing one is how a comparison
         reports a match that is not there. */
      summary.push({
        list: p.title, duplicate: p.duplicateGuid, keyField: '(none)',
        duplicateRows: dupItems.length, onlyInDuplicate: '?',
        verdict: 'CANNOT COMPARE — the specification declares no key field for this list',
      });
      continue;
    }

    let authItems;
    try {
      authItems = await allItems(AUTHORITATIVE_SITE, p.authoritativeGuid);
    } catch (err) {
      summary.push({
        list: p.title, duplicate: p.duplicateGuid, keyField: p.keyField,
        duplicateRows: dupItems.length, verdict: 'AUTHORITATIVE UNREADABLE', detail: err.message,
      });
      continue;
    }

    const norm = (v) => String(v ?? '').trim().toLowerCase();
    const authKeys = new Set(authItems.map((it) => norm(it[p.keyField])));
    const missing = dupItems.filter((it) => !authKeys.has(norm(it[p.keyField])));

    summary.push({
      list: p.title,
      duplicate: p.duplicateGuid,
      keyField: p.keyField,
      duplicateRows: dupItems.length,
      authoritativeRows: authItems.length,
      onlyInDuplicate: missing.length,
      verdict: missing.length
        ? 'ROWS EXIST ONLY HERE — DO NOT DELETE'
        : 'every row is also in the authoritative instance',
    });

    for (const it of missing) {
      orphans.push({
        list: p.title, duplicateGuid: p.duplicateGuid, itemId: it.Id,
        [p.keyField]: it[p.keyField], Title: it.Title,
      });
    }
  }

  console.log('%cDuplicate vs authoritative — row comparison', 'font-weight:bold;font-size:13px');
  console.table(summary);

  if (orphans.length) {
    console.log(\`%c\${orphans.length} row(s) exist ONLY in a duplicate. Deleting those lists destroys them.\`, 'color:#b00;font-weight:bold');
    console.table(orphans);
    console.log(
      '%cReconcile these into the authoritative instance before Step 3 deletes anything.',
      'color:#b00;font-weight:bold',
    );
  } else {
    const compared = summary.filter((s) => typeof s.onlyInDuplicate === 'number' && s.duplicateRows > 0);
    console.log(
      \`%cNo row exists only in a duplicate. \${compared.length} populated list(s) compared; every row \`
      + 'is also in the authoritative instance, so deleting the duplicates loses no data.',
      'color:#080;font-weight:bold',
    );
  }

  console.log(
    '%cThis does NOT identify what wrote to these lists. Four of them were written at '
    + '2026-08-31T01:58:48Z, after the audit capture — a live producer still pointed at the '
    + 'non-authoritative site. Find it in Step 4 before deleting, or the deployed flows will '
    + 'recreate the duplicates by title on their next run.',
    'font-weight:bold',
  );
${relayBlock("compare-duplicate-governance-lists.browser.js", "'read-only'", "DUPLICATE_SITE")}
})();
`;

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

console.log('\nGovernance duplicate/authoritative row comparison\n');
console.log(`  pairs      ${pairs.length}`);
console.log(`  duplicate  ${DUPLICATE_SITE}`);
console.log(`  keeper     ${AUTHORITATIVE}`);
if (uniqueWithoutKey.length) {
  console.log(`  no key     ${uniqueWithoutKey.length} list(s) declare no seed key: ${uniqueWithoutKey.join(', ')}`);
  console.log('             these are reported as CANNOT COMPARE rather than guessed at');
}
console.log('');

if (CHECK) {
  if (emitted !== previous) fail('the comparison script is stale. Run: npm run governance:comparison');
  console.log('  ✅ the comparison script matches the registry and the specification\n');
  process.exit(0);
}

fs.writeFileSync(OUT, emitted);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)} — ${Math.round(emitted.length / 1024)} KB, read-only\n`);
