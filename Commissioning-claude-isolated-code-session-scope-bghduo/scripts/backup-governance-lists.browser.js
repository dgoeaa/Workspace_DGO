/* GENERATED FILE — do not edit by hand.
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
 *   10 lists means 11 downloads. Chrome asks once whether to allow multiple downloads
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
 *      https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE
 *   2. F12 → Console.
 *   3. Paste this file and press Enter.
 *
 * PERMISSION REQUIRED
 *   Read on DGO_ECM_GOVERNANCE. Site Owner is more than enough.
 */

const SITE = "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE";
const DUPLICATE_SITE = "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING";

/** The 10 authoritative lists, addressed by GUID. Titles name the file, nothing else. */
const LISTS = [
  {
    "title": "DGO_UserDirectory",
    "guid": "3d591f5b-3f2f-409c-983a-a77b5c174834"
  },
  {
    "title": "DGO_RoleCatalogue",
    "guid": "f675598b-271d-4200-8d75-2597aad4057f"
  },
  {
    "title": "DGO_UserRoleHistory",
    "guid": "9fe1872f-3ae0-4b5f-96fc-5d3331c1d07c"
  },
  {
    "title": "DGO_AuditLog",
    "guid": "be0c7af1-b21d-4efe-8c30-53fc55598d95"
  },
  {
    "title": "DGO_PendingWrites",
    "guid": "ad1df270-21c7-4b78-99e7-fb18efd02cd2"
  },
  {
    "title": "DGO_DepartmentDirectory",
    "guid": "eed0ba42-ece1-40e2-bf66-79827de02766"
  },
  {
    "title": "DGO_AccessScopes",
    "guid": "f2ffd2fa-901e-4f28-8f28-957da0fe05e4"
  },
  {
    "title": "DGO_PilotCohorts",
    "guid": "ecc4ac65-1804-4f67-ad3e-eacb1a3a4dc2"
  },
  {
    "title": "DGO_EndpointRegistry",
    "guid": "08c6e1c4-f2b1-4810-933d-69b4327fb6af"
  },
  {
    "title": "DGO_AccessEvents",
    "guid": "a40d5f57-859c-426c-826c-bfee090137ad"
  }
];

(async () => {
  const NOMETA = 'application/json;odata=nometadata';

  /* A paste on the duplicate site would address GUIDs that do not exist there and report ten
     failures. Worse, an operator who then "fixed" it by switching to titles would capture the
     duplicates and file them as the backup of the estate. */
  if (location.href.startsWith(DUPLICATE_SITE)) {
    console.error(
      '%cSTOP. You are on the DUPLICATE site. This backs up the AUTHORITATIVE lists, which are on\n'
      + 'a different site collection. Nothing was captured.',
      'color:#b00;font-weight:bold',
    );
    return;
  }
  if (!location.href.startsWith(SITE)) {
    console.warn(
      `%cYou are on ${location.origin + location.pathname}, and this script targets\n  ${SITE}\n`
      + 'Open a page there and paste again.',
      'color:#b60;font-weight:bold',
    );
  }

  const send = async (url, attempt = 0) => {
    const res = await fetch(url, { credentials: 'include', headers: { Accept: NOMETA } });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const wait = (Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000;
      console.warn(`  throttled, waiting ${wait / 1000}s`);
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
      if (err?.code) msg = `${msg} [${err.code}]`;
    } catch { /* keep the raw body */ }
    return `${res.status} ${String(msg).trim()}`;
  };

  const readList = async (guid) => {
    const res = await send(`${SITE}/_api/web/lists(guid'${guid}')?$select=Title,ItemCount,Created,LastItemModifiedDate`);
    if (!res.ok) throw new Error(await detail(res));
    return res.json();
  };

  /* Every field of every item, paged. $top alone does not exhaust a list — SharePoint answers
     with odata.nextLink and a script that ignores it backs up the first page and says done. */
  const allItems = async (guid) => {
    const out = [];
    let url = `${SITE}/_api/web/lists(guid'${guid}')/items?$top=500`;
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
      `${SITE}/_api/web/lists(guid'${guid}')/fields?$select=InternalName,Title,TypeAsString,Required,Indexed,Hidden,ReadOnlyField,FromBaseType,CanBeDeleted&$top=500`);
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
      download(`${before.Title}-${t.guid}.json`, JSON.stringify(payload, null, 2));

      manifest.push({
        listTitle: before.Title,
        listGuid: t.guid,
        file: `${before.Title}-${t.guid}.json`,
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
          ? `wrote ${items.length} item(s), the list now reports ${after.ItemCount} — it was written to mid-capture; run again`
          : `${items.length} item(s), ${fields.length} custom field(s)`,
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
    `%c${captured} of ${LISTS.length} captured, ${failed} failed` + (mismatched ? `, ${mismatched} MISMATCH` : ''),
    `font-weight:bold;color:${failed || mismatched ? '#b00' : '#070'}`,
  );
  if (failed) {
    console.error('%cStep 1 is NOT complete. Nothing downstream may run until every list is captured.', 'color:#b00;font-weight:bold');
  } else if (mismatched) {
    console.error('%cA list was written to during the capture. Run this again before going on.', 'color:#b00;font-weight:bold');
  } else {
    console.log('%cStep 1 is complete. Keep the manifest with the files — it is what proves the set is whole.', 'font-weight:bold');
  }

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
      script: "backup-governance-lists.browser.js",
      mode: 'backup',
      site: SITE,
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

})();
