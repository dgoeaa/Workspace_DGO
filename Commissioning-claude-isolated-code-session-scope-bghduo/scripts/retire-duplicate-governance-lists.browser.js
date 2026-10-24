/* GENERATED FILE — do not edit by hand.
 * Built from docs/reference/governance-list-registry.json by
 * scripts/build-governance-retirement.mjs. Edit the registry and re-run.
 */
/*
 * GOVERNANCE-TENANT-RUNBOOK.md Step 3, from the browser console. No PowerShell, no PnP, no install.
 *
 * Retire the 17 duplicate governance list instances on
 *   https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING
 * leaving the 10 authoritative instances on
 *   https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE
 * completely untouched.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THIS SCRIPT DELETES WHOLE LISTS. Read this section before the first paste.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * It is MODE-driven, not DRY_RUN-driven, because a single boolean is not enough protection
 * when the mistake is unrecoverable. The modes are ORDERED, and each refuses to act unless the
 * previous one has visibly happened in the tenant:
 *
 *   'survey'   READ-ONLY. What exists, how many items each holds, what state it is in.
 *   'export'   Downloads every item of every list as JSON. This is your backup.
 *   'rename'   Title becomes ZZ_RETIRED_<title>. Fully reversible. This is the soak period.
 *   'delete'   ONLY lists already renamed, and only with I_HAVE_THE_EXPORT set to true.
 *   'restore'  Strips the prefix. The rollback for 'rename'.
 *
 * 'delete' cannot touch a list that 'rename' has not already renamed. A rename you did not do
 * is a rename that did not happen, so the reversible step cannot be skipped: the irreversible
 * action is reachable only through it.
 *
 * WAIT BETWEEN RENAME AND DELETE. The rename is what surfaces a consumer nobody documented —
 * a flow, a view, a Power BI query that silently reads one of these. Give it long enough for
 * something to break loudly while the fix is still one rename away. Days, not minutes.
 *
 * WHAT IT WILL NOT DO
 *   It never touches the 10 authoritative lists. Their GUIDs are listed below and
 *   checked against every target before anything runs; if any target appears in that set the
 *   script refuses to start at all.
 *   It never addresses a list by title. The duplicates share their titles with the lists being
 *   kept — that is what makes them duplicates — so a title-addressed retirement would
 *   eventually delete the estate.
 *   It never deletes a list that is not already prefixed ZZ_RETIRED_.
 *   It never touches a list not named below.
 *
 * HOW TO RUN
 *   1. Sign in and open any page on
 *      https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING
 *      NOTE: this is the DUPLICATE site, not the authoritative one.
 *   2. F12 → Console.
 *   3. Paste this file. It runs 'survey' and changes nothing.
 *   4. Work through the modes in order, editing MODE at the top each time.
 *
 * PERMISSION REQUIRED
 *   Manage Lists on NITDADGO-EAAACTIVITYTRACKING. Site Owner is enough.
 */

const MODE = 'survey';          // 'survey' | 'export' | 'rename' | 'delete' | 'restore'
const I_HAVE_THE_EXPORT = false; // must be true for 'delete'. Set it only if you really do.

const SITE = "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING";
const AUTHORITATIVE_SITE = "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE";
const PREFIX = 'ZZ_RETIRED_';

/** The 10 lists that must never be touched by this script. */
const KEEP = [
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

/** The 17 duplicate instances to retire. */
const RETIRE = [
  {
    "title": "DGO_AccessEvents",
    "guid": "4411f921-2a76-4dea-823d-03f1daf1df6d",
    "supersededBy": "a40d5f57-859c-426c-826c-bfee090137ad"
  },
  {
    "title": "DGO_AccessEvents_2",
    "guid": "c107a54f-3f38-4f71-8a47-38c75f047186",
    "supersededBy": "a40d5f57-859c-426c-826c-bfee090137ad"
  },
  {
    "title": "DGO_AccessScopes",
    "guid": "3bd611eb-0391-47ee-9dfa-e4520a18787b",
    "supersededBy": "f2ffd2fa-901e-4f28-8f28-957da0fe05e4"
  },
  {
    "title": "DGO_AccessScopes_2",
    "guid": "cccc57f9-1091-4e9c-9826-e46918b057f0",
    "supersededBy": "f2ffd2fa-901e-4f28-8f28-957da0fe05e4"
  },
  {
    "title": "DGO_AuditLog",
    "guid": "74153ee5-e6dd-4347-b1fe-a51d7fd47521",
    "supersededBy": "be0c7af1-b21d-4efe-8c30-53fc55598d95"
  },
  {
    "title": "DGO_AuditLog_2",
    "guid": "7ac06ab8-9754-4578-be86-87c809c8deea",
    "supersededBy": "be0c7af1-b21d-4efe-8c30-53fc55598d95"
  },
  {
    "title": "DGO_DepartmentDirectory_2",
    "guid": "ed850c51-79e6-4f7e-a725-f8ca9f42ff01",
    "supersededBy": "eed0ba42-ece1-40e2-bf66-79827de02766"
  },
  {
    "title": "DGO_DepartmentDirectory",
    "guid": "db2f8e1a-69e4-4c8a-a2ee-4f2a29d85f4b",
    "supersededBy": "eed0ba42-ece1-40e2-bf66-79827de02766"
  },
  {
    "title": "DGO_EndpointRegistry_2",
    "guid": "89ac07db-f7d0-43b4-b508-2479580fae18",
    "supersededBy": "08c6e1c4-f2b1-4810-933d-69b4327fb6af"
  },
  {
    "title": "DGO_EndpointRegistry",
    "guid": "dbc0abbd-51c5-4002-8786-3ebc866a8c35",
    "supersededBy": "08c6e1c4-f2b1-4810-933d-69b4327fb6af"
  },
  {
    "title": "DGO_PendingWrites",
    "guid": "66e19c2a-877b-4537-8247-2351d6374cf9",
    "supersededBy": "ad1df270-21c7-4b78-99e7-fb18efd02cd2"
  },
  {
    "title": "DGO_PendingWrites_2",
    "guid": "673b687d-5e07-4cd2-89c0-411d10238752",
    "supersededBy": "ad1df270-21c7-4b78-99e7-fb18efd02cd2"
  },
  {
    "title": "DGO_PilotCohorts",
    "guid": "22925b7d-9ea7-497f-9c01-70a32bcb6f2f",
    "supersededBy": "ecc4ac65-1804-4f67-ad3e-eacb1a3a4dc2"
  },
  {
    "title": "DGO_PilotCohorts_2",
    "guid": "146c6162-7bea-4ecb-9b1d-254c1e979e12",
    "supersededBy": "ecc4ac65-1804-4f67-ad3e-eacb1a3a4dc2"
  },
  {
    "title": "DGO_RoleCatalogue",
    "guid": "55c0daae-8b46-4db7-8c03-be54e3fc536f",
    "supersededBy": "f675598b-271d-4200-8d75-2597aad4057f"
  },
  {
    "title": "DGO_UserDirectory",
    "guid": "b9b522c6-1219-4fb1-ad01-b54b40416bba",
    "supersededBy": "3d591f5b-3f2f-409c-983a-a77b5c174834"
  },
  {
    "title": "DGO_UserRoleHistory",
    "guid": "4fdb8379-9f48-466e-a503-a59912be5015",
    "supersededBy": "9fe1872f-3ae0-4b5f-96fc-5d3331c1d07c"
  }
];

(async () => {
  const VERBOSE = 'application/json;odata=verbose';
  const NOMETA = 'application/json;odata=nometadata';

  /* ── the guard that runs before anything else ──────────────────────────────────────────
     If a GUID ever appears in both sets, the registry is wrong and every mode below is
     dangerous. Refuse to start rather than skip the offending row: a script that quietly
     drops a target it cannot classify is how a partial retirement gets reported as a whole
     one. */
  const keepGuids = new Set(KEEP.map((k) => k.guid));
  const collide = RETIRE.filter((r) => keepGuids.has(r.guid));
  if (collide.length) {
    console.error(
      '%cREFUSING TO RUN — ' + collide.length + ' target GUID(s) are also in the keep set:\n'
      + collide.map((c) => '  ' + c.title + '  ' + c.guid).join('\n')
      + '\nThe registry is wrong. Fix docs/reference/governance-list-registry.json.',
      'color:#b00;font-weight:bold',
    );
    return;
  }

  if (!['survey', 'export', 'rename', 'delete', 'restore'].includes(MODE)) {
    console.error(`%cUnknown MODE '${MODE}'. Use survey, export, rename, delete or restore.`, 'color:#b00;font-weight:bold');
    return;
  }

  /* The backup acknowledgement, enforced BEFORE the loop.
     This check first sat after the delete loop, where it printed 'NOTHING WAS DELETED' having
     just deleted everything — a warning that lies is worse than no warning, because an operator
     who reads it stops looking. A precondition belongs before the thing it is a precondition
     for. */
  if (MODE === 'delete' && !I_HAVE_THE_EXPORT) {
    console.error(
      '%cNOTHING WAS DELETED — I_HAVE_THE_EXPORT is false.\n\n'
      + "Set it true only when you actually hold the JSON files from MODE = 'export'. Two of these\n"
      + 'lists carry items, and a delete is not undoable from here: the site recycle bin is the\n'
      + 'only other route and it expires.',
      'color:#b00;font-weight:bold',
    );
    return;
  }

  /* A paste on the wrong site would address GUIDs that do not exist there and report 17
     failures, which is survivable — but saying so up front costs nothing. */
  if (!location.href.startsWith(SITE)) {
    console.warn(
      `%cYou are on ${location.origin + location.pathname}, and this script targets\n  ${SITE}\n`
      + 'Every list below lives on that site. Open a page there and paste again.',
      'color:#b60;font-weight:bold',
    );
  }
  if (location.href.startsWith(AUTHORITATIVE_SITE)) {
    console.error(
      '%cSTOP. You are on the AUTHORITATIVE site. This script retires the DUPLICATES, which are\n'
      + 'on a different site collection. Nothing was done.',
      'color:#b00;font-weight:bold',
    );
    return;
  }

  const send = async (url, init, attempt = 0) => {
    const res = await fetch(url, { credentials: 'include', ...init });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const wait = (Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000;
      console.warn(`  throttled, waiting ${wait / 1000}s`);
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
      if (err?.code) msg = `${msg} [${err.code}]`;
    } catch { /* keep the raw body */ }
    return `${res.status} ${String(msg).trim()}`;
  };

  const digestFor = async () => {
    const res = await send(`${SITE}/_api/contextinfo`, { method: 'POST', headers: { Accept: VERBOSE } });
    if (!res.ok) throw new Error(`contextinfo ${res.status} — are you signed in, and a member of this site?`);
    return (await res.json()).d.GetContextWebInformation.FormDigestValue;
  };

  const readList = async (guid) => {
    const res = await send(
      `${SITE}/_api/web/lists(guid'${guid}')?$select=Title,ItemCount,Created,LastItemModifiedDate,Hidden`,
      { headers: { Accept: NOMETA } });
    if (!res.ok) throw new Error(await detail(res));
    return res.json();
  };

  const setTitle = async (guid, digest, title) => {
    const res = await send(`${SITE}/_api/web/lists(guid'${guid}')`, {
      method: 'POST',
      headers: {
        Accept: NOMETA, 'Content-Type': NOMETA, 'X-RequestDigest': digest,
        'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*',
      },
      body: JSON.stringify({ Title: title }),
    });
    if (!res.ok) throw new Error(await detail(res));
  };

  const deleteList = async (guid, digest) => {
    const res = await send(`${SITE}/_api/web/lists(guid'${guid}')`, {
      method: 'POST',
      headers: { Accept: NOMETA, 'X-RequestDigest': digest, 'X-HTTP-Method': 'DELETE', 'IF-MATCH': '*' },
    });
    if (!res.ok) throw new Error(await detail(res));
  };

  /* Every field of every item, so the export is a restore and not a summary. */
  const allItems = async (guid) => {
    const out = [];
    let url = `${SITE}/_api/web/lists(guid'${guid}')/items?$top=500`;
    while (url) {
      const res = await send(url, { headers: { Accept: NOMETA } });
      if (!res.ok) throw new Error(await detail(res));
      const body = await res.json();
      out.push(...(body.value || []));
      url = body['odata.nextLink'] || null;
    }
    return out;
  };

  const download = (filename, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  /* ── run ─────────────────────────────────────────────────────────────────────────────── */

  console.log(`%cSTEP 3 — mode: ${MODE}`, 'font-weight:bold;font-size:13px');
  console.log(`%c${SITE}`, 'color:#888');
  console.log(`%c${RETIRE.length} duplicate(s) targeted · ${KEEP.length} authoritative list(s) excluded by GUID`, 'color:#888');

  let digest = null;
  if (MODE !== 'survey' && MODE !== 'export') {
    try { digest = await digestFor(); }
    catch (err) { console.error(err.message); return; }
  }

  const ledger = [];
  let acted = 0, skipped = 0, failed = 0;

  for (const t of RETIRE) {
    let live;
    try {
      live = await readList(t.guid);
    } catch (err) {
      /* A 404 here is the expected steady state after a successful delete, and saying so beats
         reporting the finished job as seventeen errors. */
      const gone = /404/.test(err.message);
      ledger.push({
        list: t.title, guid: t.guid,
        action: gone ? 'ALREADY GONE' : 'UNREADABLE',
        items: '', detail: gone ? 'no list with this GUID on this site' : err.message,
      });
      if (!gone) failed++; else skipped++;
      continue;
    }

    const renamed = String(live.Title || '').startsWith(PREFIX);
    const row = { list: t.title, guid: t.guid, liveTitle: live.Title, items: live.ItemCount };

    if (MODE === 'survey') {
      ledger.push({
        ...row,
        action: renamed ? 'renamed, awaiting delete' : 'live',
        lastItemChange: live.LastItemModifiedDate,
        supersededBy: t.supersededBy,
        detail: '',
      });
      continue;
    }

    if (MODE === 'export') {
      try {
        const items = await allItems(t.guid);
        download(
          `${t.title}-${t.guid}.json`,
          JSON.stringify({
            capturedUtc: new Date().toISOString(),
            site: SITE, listTitle: live.Title, listGuid: t.guid,
            itemCount: items.length, items,
          }, null, 2),
        );
        acted++;
        ledger.push({ ...row, action: 'EXPORTED', detail: `${items.length} item(s) downloaded` });
      } catch (err) {
        failed++;
        ledger.push({ ...row, action: 'EXPORT FAILED', detail: err.message });
      }
      continue;
    }

    if (MODE === 'rename') {
      if (renamed) {
        skipped++;
        ledger.push({ ...row, action: 'already renamed', detail: '' });
        continue;
      }
      try {
        await setTitle(t.guid, digest, PREFIX + live.Title);
        acted++;
        ledger.push({ ...row, action: 'RENAMED', detail: `→ ${PREFIX}${live.Title}` });
      } catch (err) {
        failed++;
        ledger.push({ ...row, action: 'RENAME FAILED', detail: err.message });
      }
      continue;
    }

    if (MODE === 'restore') {
      if (!renamed) {
        skipped++;
        ledger.push({ ...row, action: 'not renamed', detail: 'nothing to restore' });
        continue;
      }
      try {
        await setTitle(t.guid, digest, String(live.Title).slice(PREFIX.length));
        acted++;
        ledger.push({ ...row, action: 'RESTORED', detail: `→ ${String(live.Title).slice(PREFIX.length)}` });
      } catch (err) {
        failed++;
        ledger.push({ ...row, action: 'RESTORE FAILED', detail: err.message });
      }
      continue;
    }

    if (MODE === 'delete') {
      /* The rename gate. A list that was never renamed never had its soak period, and this is
         where that is enforced rather than trusted. */
      if (!renamed) {
        skipped++;
        ledger.push({
          ...row, action: 'REFUSED — NOT RENAMED',
          detail: `'${live.Title}' does not start with ${PREFIX}. Run MODE='rename' first, wait, then delete.`,
        });
        continue;
      }
      try {
        await deleteList(t.guid, digest);
        acted++;
        ledger.push({ ...row, action: 'DELETED', detail: `${live.ItemCount} item(s) went with it` });
      } catch (err) {
        failed++;
        ledger.push({ ...row, action: 'DELETE FAILED', detail: err.message });
      }
    }
  }

  console.table(ledger);

  const verb = { survey: 'surveyed', export: 'exported', rename: 'renamed', delete: 'deleted', restore: 'restored' }[MODE];
  console.log(
    `%c${MODE === 'survey' ? `${ledger.length} list(s) surveyed. Nothing was changed.` : `${acted} ${verb} · ${skipped} skipped · ${failed} failed`}`,
    failed ? 'color:#b00;font-weight:bold' : 'font-weight:bold',
  );

  const next = {
    survey: "Next: MODE = 'export' to download a backup of every item.",
    export: "Next: MODE = 'rename'. Then WAIT — days, not minutes — and watch for anything that breaks.",
    rename: "Now WAIT. The rename is what surfaces an undocumented consumer while the fix is still one rename away. "
      + "MODE = 'restore' undoes it. When nothing has broken for long enough, MODE = 'delete' with I_HAVE_THE_EXPORT = true.",
    delete: 'Step 3 is done. Re-paste in survey mode to confirm every row reads ALREADY GONE.',
    restore: "The renames are undone. Nothing has been deleted.",
  }[MODE];
  console.log(`%c${next}`, 'font-weight:bold');

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
      script: "retire-duplicate-governance-lists.browser.js",
      mode: MODE,
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
