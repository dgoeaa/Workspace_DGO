#!/usr/bin/env node
/**
 * Emit the browser equivalent of GOVERNANCE-TENANT-RUNBOOK.md Step 1 — back up the ten authoritative
 * governance lists without PowerShell.
 *
 * WHY THIS EXISTS
 *
 * Step 1 is the runbook's first gate: nothing else may run until the ten lists are captured. Its
 * only procedure was PowerShell, and since PnP 2.x `Connect-PnPOnline -Interactive` needs an
 * Entra app registration that this estate has ruled out — the same constraint that produced every
 * other browser script here. A mandatory gate with no executable procedure is not a gate; it is a
 * step everyone skips.
 *
 * WHAT IT CAPTURES, AND WHAT IT DOES NOT
 *
 * Every field of every item, plus the list's custom field definitions, plus a manifest. That is
 * enough to reconstruct the rows and the columns. It does NOT capture views, content types,
 * permissions, attachments, version history or list settings — so it is a backup of the data,
 * not of the list, and the runbook says so rather than calling it "a backup".
 *
 * THE TWO FAILURE MODES IT REFUSES TO REPRODUCE
 *
 *   An empty list must still produce a file. The PowerShell it replaces piped items straight into
 *   ConvertTo-Json, which emits nothing at all for an empty collection and a bare object for a
 *   single item — so an empty list left a zero-byte file indistinguishable from a failed capture,
 *   under an expectation that read "each valid JSON".
 *
 *   A count must be checked, not assumed. The list's ItemCount is re-read after the capture and
 *   compared with the number of items written. A list written to mid-capture reports MISMATCH
 *   rather than silently short.
 *
 * It is read-only. There is no mode and no acknowledgement because there is nothing to undo.
 *
 *   npm run governance:backup              # regenerate
 *   npm run governance:backup -- --check   # fail if it has drifted from the registry
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { relayBlock } from './lib/browser-relay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'scripts/backup-governance-lists.browser.js');
const CHECK = process.argv.includes('--check');

const fail = (msg) => {
  console.error(`\n  ✖  ${msg}\n`);
  process.exit(2);
};

const registry = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'docs/reference/governance-list-registry.json'), 'utf8'),
);

const AUTHORITATIVE = registry.decision.authoritativeSite;
const DUPLICATE_SITES = [...new Set(registry.retire.map((r) => r.site))];
if (DUPLICATE_SITES.length !== 1) fail(`the duplicates span ${DUPLICATE_SITES.length} sites; the wrong-site guard assumes one`);
const DUPLICATE_SITE = `${AUTHORITATIVE.split('/sites/')[0]}/sites/${DUPLICATE_SITES[0]}`;

/* Titles are for the filename only. Every read addresses the list by GUID — the duplicates share
   these titles, which is what makes them duplicates, so a title-addressed backup pointed at the
   wrong site would capture the wrong estate and report success. */
const LISTS = registry.lists.map((l) => ({ title: l.listTitle, guid: l.listGuid }));
if (!LISTS.length) fail('the registry names no lists to back up');

const emitted = `/* GENERATED FILE — do not edit by hand.
 * Built from docs/reference/governance-list-registry.json by
 * scripts/build-governance-backup.mjs. Edit the registry and re-run.
 */
/*
 * GOVERNANCE-TENANT-RUNBOOK.md Step 1, from the browser console. No PowerShell, no PnP, no install,
 * no app registration.
 *
 * READ-ONLY. It issues GET requests and nothing else. There is no mode and no acknowledgement
 * because there is nothing here to undo.
 *
 * WHAT IT DOWNLOADS
 *   One JSON file per list — every field of every item, plus that list's custom field
 *   definitions — and one governance-backup-manifest.json naming every list, its GUID, its item
 *   count, its field count and the capture time.
 *
 *   ${LISTS.length} lists means ${LISTS.length + 1} downloads. Chrome asks once whether to allow multiple downloads
 *   from this site; say yes, or you will get the first file and nothing else.
 *
 * WHAT IT IS NOT
 *   Items and custom field definitions are not a list backup. Views, content types, permissions,
 *   attachments, version history and list settings are NOT captured. Restoring is not the inverse
 *   of exporting either: the captured fields include read-only and system values, person and
 *   lookup values as objects rather than ids, and — after Step 2 — at least one field whose name
 *   has changed. Treat these files as the evidence and the source values for a controlled
 *   restore.
 *
 * HOW TO RUN
 *   1. Sign in and open any page on
 *      ${AUTHORITATIVE}
 *   2. F12 → Console.
 *   3. Paste this file and press Enter.
 *
 * PERMISSION REQUIRED
 *   Read on ${AUTHORITATIVE.split('/sites/')[1]}. Site Owner is more than enough.
 */

const SITE = ${JSON.stringify(AUTHORITATIVE)};
const DUPLICATE_SITE = ${JSON.stringify(DUPLICATE_SITE)};

/** The ${LISTS.length} authoritative lists, addressed by GUID. Titles name the file, nothing else. */
const LISTS = ${JSON.stringify(LISTS, null, 2)};

(async () => {
  const NOMETA = 'application/json;odata=nometadata';

  /* A paste on the duplicate site would address GUIDs that do not exist there and report ten
     failures. Worse, an operator who then "fixed" it by switching to titles would capture the
     duplicates and file them as the backup of the estate. */
  if (location.href.startsWith(DUPLICATE_SITE)) {
    console.error(
      '%cSTOP. You are on the DUPLICATE site. This backs up the AUTHORITATIVE lists, which are on\\n'
      + 'a different site collection. Nothing was captured.',
      'color:#b00;font-weight:bold',
    );
    return;
  }
  if (!location.href.startsWith(SITE)) {
    console.warn(
      \`%cYou are on \${location.origin + location.pathname}, and this script targets\\n  \${SITE}\\n\`
      + 'Open a page there and paste again.',
      'color:#b60;font-weight:bold',
    );
  }

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
    let msg = text;
    try {
      const body = JSON.parse(text);
      const err = body['odata.error'] || body.error || body;
      msg = err?.message?.value ?? err?.message ?? err?.Message ?? text;
      if (err?.code) msg = \`\${msg} [\${err.code}]\`;
    } catch { /* keep the raw body */ }
    return \`\${res.status} \${String(msg).trim()}\`;
  };

  const readList = async (guid) => {
    const res = await send(\`\${SITE}/_api/web/lists(guid'\${guid}')?$select=Title,ItemCount,Created,LastItemModifiedDate\`);
    if (!res.ok) throw new Error(await detail(res));
    return res.json();
  };

  /* Every field of every item, paged. $top alone does not exhaust a list — SharePoint answers
     with odata.nextLink and a script that ignores it backs up the first page and says done. */
  const allItems = async (guid) => {
    const out = [];
    let url = \`\${SITE}/_api/web/lists(guid'\${guid}')/items?$top=500\`;
    while (url) {
      const res = await send(url);
      if (!res.ok) throw new Error(await detail(res));
      const body = await res.json();
      out.push(...(body.value || []));
      url = body['odata.nextLink'] || null;
    }
    return out;
  };

  /* The custom columns, so the export can be read back against a schema rather than guessed at.
     FromBaseType false is what separates a column someone added from the ~40 SharePoint puts on
     every list. */
  const customFields = async (guid) => {
    const res = await send(
      \`\${SITE}/_api/web/lists(guid'\${guid}')/fields?$select=InternalName,Title,TypeAsString,Required,Indexed,Hidden,ReadOnlyField,FromBaseType,CanBeDeleted&$top=500\`);
    if (!res.ok) throw new Error(await detail(res));
    const body = await res.json();
    return (body.value || []).filter((f) => f.FromBaseType === false);
  };

  const download = (filename, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const capturedUtc = new Date().toISOString();
  const ledger = [];
  const manifest = [];
  let captured = 0;
  let failed = 0;
  let mismatched = 0;

  for (const t of LISTS) {
    const row = { list: t.title, guid: t.guid };
    try {
      const before = await readList(t.guid);
      const items = await allItems(t.guid);
      const fields = await customFields(t.guid);
      /* Re-read the count AFTER the capture. If the list was written to while we paged through
         it, the file is short and nothing else would say so. */
      const after = await readList(t.guid);
      const drifted = after.ItemCount !== items.length;
      if (drifted) mismatched++;

      const payload = {
        capturedUtc,
        site: SITE,
        listTitle: before.Title,
        listGuid: t.guid,
        itemCountBefore: before.ItemCount,
        itemCountAfter: after.ItemCount,
        itemsCaptured: items.length,
        customFieldCount: fields.length,
        /* Always an array, even when empty: an empty backup and a missing backup must not look
           alike to whoever reads these files later. */
        customFields: fields,
        items,
        notCaptured: ['views', 'content types', 'permissions', 'attachments', 'version history', 'list settings'],
      };
      download(\`\${before.Title}-\${t.guid}.json\`, JSON.stringify(payload, null, 2));

      manifest.push({
        listTitle: before.Title,
        listGuid: t.guid,
        file: \`\${before.Title}-\${t.guid}.json\`,
        itemsCaptured: items.length,
        itemCountAfter: after.ItemCount,
        customFieldCount: fields.length,
        lastItemModified: after.LastItemModifiedDate,
      });
      captured++;
      ledger.push({
        ...row,
        action: drifted ? 'MISMATCH' : 'CAPTURED',
        detail: drifted
          ? \`wrote \${items.length} item(s), the list now reports \${after.ItemCount} — it was written to mid-capture; run again\`
          : \`\${items.length} item(s), \${fields.length} custom field(s)\`,
      });
    } catch (err) {
      failed++;
      ledger.push({ ...row, action: 'FAILED', detail: err.message });
    }
  }

  download('governance-backup-manifest.json', JSON.stringify({
    capturedUtc, site: SITE, lists: manifest.length, entries: manifest,
  }, null, 2));

  console.table(ledger);
  console.log(
    \`%c\${captured} of \${LISTS.length} captured, \${failed} failed\` + (mismatched ? \`, \${mismatched} MISMATCH\` : ''),
    \`font-weight:bold;color:\${failed || mismatched ? '#b00' : '#070'}\`,
  );
  if (failed) {
    console.error('%cStep 1 is NOT complete. Nothing downstream may run until every list is captured.', 'color:#b00;font-weight:bold');
  } else if (mismatched) {
    console.error('%cA list was written to during the capture. Run this again before going on.', 'color:#b00;font-weight:bold');
  } else {
    console.log('%cStep 1 is complete. Keep the manifest with the files — it is what proves the set is whole.', 'font-weight:bold');
  }
${relayBlock('backup-governance-lists.browser.js', "'backup'", 'SITE')}
})();
`;

/* The two defects this script exists to not reproduce. Assert they survived the template. */
if (!/itemCountAfter/.test(emitted) || !/MISMATCH/.test(emitted)) {
  fail('the emitted script lost its post-capture count check — refusing to write it');
}
if (!/DUPLICATE_SITE/.test(emitted)) fail('the emitted script lost its wrong-site guard — refusing to write it');

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

console.log('\nGovernance list backup (Step 1, browser)\n');
console.log(`  lists        ${LISTS.length} on ${AUTHORITATIVE}`);
console.log(`  downloads    ${LISTS.length + 1} — one per list, plus the manifest`);
console.log('  mode         read-only; there is nothing to undo\n');

if (CHECK) {
  if (emitted !== previous) fail('the backup script is stale. Run: npm run governance:backup');
  console.log('  ✅ the backup script matches the registry\n');
  process.exit(0);
}

fs.writeFileSync(OUT, emitted);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)} — ${Math.round(emitted.length / 1024)} KB, read-only\n`);
