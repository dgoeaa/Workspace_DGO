/* GENERATED FILE — do not edit by hand.
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
 *   It never touches a list outside the 10 below.
 *
 * HOW TO RUN
 *   1. Sign in and open any page on
 *      https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE
 *   2. F12 → Console.
 *   3. Paste this entire file, press Enter. It reports what it WOULD delete and changes nothing.
 *   4. Read the table. When it is right, set DRY_RUN to false below and paste again.
 */

const DRY_RUN = true;

const SITE = "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE";
const LISTS = [
  {
    "title": "DGO_AccessEvents",
    "guid": "a40d5f57-859c-426c-826c-bfee090137ad"
  },
  {
    "title": "DGO_AccessScopes",
    "guid": "f2ffd2fa-901e-4f28-8f28-957da0fe05e4"
  },
  {
    "title": "DGO_AuditLog",
    "guid": "be0c7af1-b21d-4efe-8c30-53fc55598d95"
  },
  {
    "title": "DGO_DepartmentDirectory",
    "guid": "eed0ba42-ece1-40e2-bf66-79827de02766"
  },
  {
    "title": "DGO_EndpointRegistry",
    "guid": "08c6e1c4-f2b1-4810-933d-69b4327fb6af"
  },
  {
    "title": "DGO_PendingWrites",
    "guid": "ad1df270-21c7-4b78-99e7-fb18efd02cd2"
  },
  {
    "title": "DGO_PilotCohorts",
    "guid": "ecc4ac65-1804-4f67-ad3e-eacb1a3a4dc2"
  },
  {
    "title": "DGO_RoleCatalogue",
    "guid": "f675598b-271d-4200-8d75-2597aad4057f"
  },
  {
    "title": "DGO_UserDirectory",
    "guid": "3d591f5b-3f2f-409c-983a-a77b5c174834"
  },
  {
    "title": "DGO_UserRoleHistory",
    "guid": "9fe1872f-3ae0-4b5f-96fc-5d3331c1d07c"
  }
];

(async () => {
  const VERBOSE = 'application/json;odata=verbose';
  const NOMETA = 'application/json;odata=nometadata';

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

  const isCustom = (f) => f && f.FromBaseType !== true && f.CanBeDeleted !== false;
  const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';

  const deleteField = async (guid, digest, internalName) => {
    const res = await send(
      `${SITE}/_api/web/lists(guid'${guid}')/fields/getbyinternalnameortitle('${encodeURIComponent(internalName)}')`,
      { method: 'POST', headers: { Accept: NOMETA, 'X-RequestDigest': digest, 'X-HTTP-Method': 'DELETE', 'IF-MATCH': '*' } },
    );
    if (!res.ok) throw new Error(await detail(res));
  };

  /* ── run ─────────────────────────────────────────────────────────────────────────────── */

  const ledger = [];
  console.log(`%c${DRY_RUN ? 'DRY RUN — ' : ''}scanning ${LISTS.length} list(s) for auto-disambiguated columns`, 'font-weight:bold');
  console.log(`%c${SITE}`, 'color:#888');

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
        `${SITE}/_api/web/lists(guid'${l.guid}')/fields?$select=InternalName,Title,FromBaseType,CanBeDeleted&$top=500`,
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
      const res = await send(`${SITE}/_api/web/lists(guid'${l.guid}')/items?$select=${cols}&$top=500`,
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
          detail: `${populated.length} of ${items.length} row(s) populated. This is no longer a stray. Do not delete it without deciding where that data belongs.`,
        });
        continue;
      }

      if (DRY_RUN) {
        ledger.push({
          list: l.title, column: c.InternalName, title: c.Title, base,
          verdict: 'WOULD DELETE',
          detail: `empty in all ${items.length} row(s); '${base}' exists on this list`,
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
    `%c${DRY_RUN ? 'DRY RUN. Nothing was changed. ' : ''}${deleted} deleted · ${kept} kept because they hold data · ${failed} failed`,
    failed || kept ? 'color:#b00;font-weight:bold' : 'font-weight:bold',
  );
  if (DRY_RUN) {
    console.log('%cSet DRY_RUN = false at the top of this file and paste again to apply.', 'font-weight:bold');
  } else if (!failed) {
    console.log('%cNow re-run scripts/provision-governance-lists.browser.js.', 'color:#080;font-weight:bold');
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
      script: "cleanup-disambiguated-columns.browser.js",
      mode: DRY_RUN ? 'dry-run' : 'apply',
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
