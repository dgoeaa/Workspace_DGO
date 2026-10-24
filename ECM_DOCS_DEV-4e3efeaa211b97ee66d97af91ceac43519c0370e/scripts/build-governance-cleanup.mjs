#!/usr/bin/env node
/**
 * Emit the browser cleanup for columns SharePoint auto-disambiguated.
 *
 * WHAT IT CLEANS UP
 *
 * `createfieldasxml` with AddFieldInternalNameHint does not fail when the internal name it is
 * given is taken. It appends a digit and creates the column beside the existing one. The run of
 * 2026-09-09 hit that three times, and the result is three empty columns whose names differ from
 * the originals by a trailing `0`:
 *
 *   DGO_RoleCatalogue.Version0       Title 'CatalogueVersion'
 *   DGO_EndpointRegistry.Version0    Title 'EndpointVersion'
 *   DGO_EndpointRegistry.FlowUrl0    Title 'EndpointRedacted'
 *
 * WHY IT DETECTS RATHER THAN DELETES A LIST OF THREE
 *
 * Hardcoding those three names would make this correct once. The condition is general — a create
 * that lost a name race leaves exactly this shape — and the same provisioner will produce it
 * again on any future collision. So the emitted script finds them by their shape, on the live
 * list, and re-reads emptiness at the moment it deletes rather than trusting a list written here.
 *
 * A column is a candidate only when ALL of these hold:
 *   · it is custom — FromBaseType false, CanBeDeleted true;
 *   · its internal name is <base><digits> and a CUSTOM column named <base> also exists here;
 *   · every item is empty in it.
 *
 * The second condition is what keeps a legitimately-named column safe. `Version0` qualifies only
 * because `Version` is right there beside it. A column called, say, `Phase2` on a list with no
 * `Phase` is not a disambiguation and is never touched.
 *
 *   npm run governance:cleanup
 *   npm run governance:cleanup -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relayBlock } from './lib/browser-relay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'docs/reference/governance-list-registry.json');
const OUT = path.join(ROOT, 'scripts/cleanup-disambiguated-columns.browser.js');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const SITE = registry.decision.authoritativeSite;
const lists = registry.lists
  .map((l) => ({ title: l.listTitle, guid: l.listGuid }))
  .sort((a, b) => (a.title < b.title ? -1 : 1));

if (!lists.length) fail('the authoritative registry names no lists');

const emitted = `/* GENERATED FILE — do not edit by hand.
 * Built from docs/reference/governance-list-registry.json by
 * scripts/build-governance-cleanup.mjs. Edit the registry and re-run.
 */
/*
 * Remove the columns SharePoint auto-disambiguated. Browser console; no PowerShell.
 *
 * WHY THEY EXIST
 *   createfieldasxml with AddFieldInternalNameHint does not fail when the internal name it is
 *   given is already taken. It appends a digit and creates the column BESIDE the existing one.
 *   The run of 2026-09-09 did that three times, leaving three empty columns: Version0 on
 *   DGO_RoleCatalogue, and Version0 and FlowUrl0 on DGO_EndpointRegistry.
 *
 *   The originals were never touched, and nothing was lost. These are the leftovers.
 *
 * HOW A CANDIDATE IS IDENTIFIED — all four must hold
 *   1. custom: FromBaseType false and CanBeDeleted true;
 *   2. its internal name is <base><digits>;
 *   3. a CUSTOM column named <base> also exists on the same list;
 *   4. every item on the list is empty in it.
 *
 *   Condition 3 is what keeps a legitimately-named column safe. Version0 qualifies only because
 *   Version is right beside it. A column called Phase2 on a list with no Phase is not a
 *   disambiguation and is never a candidate.
 *
 *   Condition 4 is re-read at the moment of deletion, not taken on trust from an earlier run.
 *
 * WHAT IT WILL NOT DO
 *   It never deletes a column holding any value, in any row.
 *   It never deletes a column with no same-list base — that is an ordinary column with a digit.
 *   It never touches a SharePoint system field.
 *   It never touches a list outside the ${lists.length} below.
 *
 * HOW TO RUN
 *   1. Sign in and open any page on
 *      ${SITE}
 *   2. F12 → Console.
 *   3. Paste this entire file, press Enter. It reports what it WOULD delete and changes nothing.
 *   4. Read the table. When it is right, set DRY_RUN to false below and paste again.
 */

const DRY_RUN = true;

const SITE = ${JSON.stringify(SITE)};
const LISTS = ${JSON.stringify(lists, null, 2)};

(async () => {
  const VERBOSE = 'application/json;odata=verbose';
  const NOMETA = 'application/json;odata=nometadata';

  const send = async (url, init, attempt = 0) => {
    const res = await fetch(url, { credentials: 'include', ...init });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const wait = (Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000;
      console.warn(\`  throttled, waiting \${wait / 1000}s\`);
      await new Promise((r) => setTimeout(r, wait));
      return send(url, init, attempt + 1);
    }
    return res;
  };

  const detail = async (res) => {
    const text = await res.text();
    let msg = text;
    try {
      const body = JSON.parse(text);
      const err = body['odata.error'] || body.error || body;
      msg = err?.message?.value ?? err?.message ?? err?.Message ?? text;
      if (err?.code) msg = \`\${msg} [\${err.code}]\`;
    } catch { /* keep the raw body */ }
    return \`\${res.status} \${String(msg).trim()}\`;
  };

  const digestFor = async () => {
    const res = await send(\`\${SITE}/_api/contextinfo\`, { method: 'POST', headers: { Accept: VERBOSE } });
    if (!res.ok) throw new Error(\`contextinfo \${res.status} — are you signed in, and a member of this site?\`);
    return (await res.json()).d.GetContextWebInformation.FormDigestValue;
  };

  const isCustom = (f) => f && f.FromBaseType !== true && f.CanBeDeleted !== false;
  const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';

  const deleteField = async (guid, digest, internalName) => {
    const res = await send(
      \`\${SITE}/_api/web/lists(guid'\${guid}')/fields/getbyinternalnameortitle('\${encodeURIComponent(internalName)}')\`,
      { method: 'POST', headers: { Accept: NOMETA, 'X-RequestDigest': digest, 'X-HTTP-Method': 'DELETE', 'IF-MATCH': '*' } },
    );
    if (!res.ok) throw new Error(await detail(res));
  };

  /* ── run ─────────────────────────────────────────────────────────────────────────────── */

  const ledger = [];
  console.log(\`%c\${DRY_RUN ? 'DRY RUN — ' : ''}scanning \${LISTS.length} list(s) for auto-disambiguated columns\`, 'font-weight:bold');
  console.log(\`%c\${SITE}\`, 'color:#888');

  let digest = null;
  try {
    digest = DRY_RUN ? 'dry-run' : await digestFor();
  } catch (err) {
    console.error(err.message);
    return;
  }

  let deleted = 0, kept = 0, failed = 0;

  for (const l of LISTS) {
    let fields;
    try {
      const res = await send(
        \`\${SITE}/_api/web/lists(guid'\${l.guid}')/fields?$select=InternalName,Title,FromBaseType,CanBeDeleted&$top=500\`,
        { headers: { Accept: NOMETA } });
      if (!res.ok) throw new Error(await detail(res));
      fields = (await res.json()).value || [];
    } catch (err) {
      failed++;
      ledger.push({ list: l.title, column: '(whole list)', verdict: 'UNREACHABLE', detail: err.message });
      continue;
    }

    const custom = fields.filter(isCustom);
    const customNames = new Set(custom.map((f) => f.InternalName));

    /* <base><digits>, where the base is itself a custom column on this list. */
    const candidates = custom.filter((f) => {
      const m = /^(.*[^0-9])([0-9]+)$/.exec(f.InternalName);
      return m && customNames.has(m[1]);
    });

    if (!candidates.length) continue;

    /* One item read per list, carrying every candidate, rather than one read per column. */
    let items;
    try {
      const cols = ['Id', ...candidates.map((c) => c.InternalName)].join(',');
      const res = await send(\`\${SITE}/_api/web/lists(guid'\${l.guid}')/items?$select=\${cols}&$top=500\`,
        { headers: { Accept: NOMETA } });
      if (!res.ok) throw new Error(await detail(res));
      items = (await res.json()).value || [];
    } catch (err) {
      failed++;
      ledger.push({ list: l.title, column: candidates.map((c) => c.InternalName).join(', '), verdict: 'ITEMS UNREADABLE', detail: err.message });
      continue;
    }

    for (const c of candidates) {
      const base = /^(.*[^0-9])([0-9]+)$/.exec(c.InternalName)[1];
      const populated = items.filter((it) => filled(it[c.InternalName]));

      if (populated.length) {
        /* Not a leftover any more. Something wrote to it, and that has to be a decision. */
        kept++;
        ledger.push({
          list: l.title, column: c.InternalName, title: c.Title, base,
          verdict: 'KEPT — HOLDS DATA',
          detail: \`\${populated.length} of \${items.length} row(s) populated. This is no longer a stray. Do not delete it without deciding where that data belongs.\`,
        });
        continue;
      }

      if (DRY_RUN) {
        ledger.push({
          list: l.title, column: c.InternalName, title: c.Title, base,
          verdict: 'WOULD DELETE',
          detail: \`empty in all \${items.length} row(s); '\${base}' exists on this list\`,
        });
        continue;
      }

      try {
        await deleteField(l.guid, digest, c.InternalName);
        deleted++;
        ledger.push({ list: l.title, column: c.InternalName, title: c.Title, base, verdict: 'DELETED', detail: '' });
      } catch (err) {
        failed++;
        ledger.push({ list: l.title, column: c.InternalName, title: c.Title, base, verdict: 'DELETE FAILED', detail: err.message });
      }
    }
  }

  if (!ledger.length) {
    console.log('%cNo auto-disambiguated columns found. Nothing to clean up.', 'color:#080;font-weight:bold');
    return;
  }

  console.table(ledger);
  console.log(
    \`%c\${DRY_RUN ? 'DRY RUN. Nothing was changed. ' : ''}\${deleted} deleted · \${kept} kept because they hold data · \${failed} failed\`,
    failed || kept ? 'color:#b00;font-weight:bold' : 'font-weight:bold',
  );
  if (DRY_RUN) {
    console.log('%cSet DRY_RUN = false at the top of this file and paste again to apply.', 'font-weight:bold');
  } else if (!failed) {
    console.log('%cNow re-run scripts/provision-governance-lists.browser.js.', 'color:#080;font-weight:bold');
  }
${relayBlock("cleanup-disambiguated-columns.browser.js", "DRY_RUN ? 'dry-run' : 'apply'", "SITE")}
})();
`;

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

console.log('\nGovernance auto-disambiguated column cleanup\n');
console.log(`  site    ${SITE}`);
console.log(`  lists   ${lists.length} scanned for <base><digits> columns\n`);

if (CHECK) {
  if (emitted !== previous) fail('the cleanup script is stale. Run: npm run governance:cleanup');
  console.log('  ✅ the cleanup script matches the registry\n');
  process.exit(0);
}

fs.writeFileSync(OUT, emitted);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)} — ${Math.round(emitted.length / 1024)} KB, dry-run by default\n`);
