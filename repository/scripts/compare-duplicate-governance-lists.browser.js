/* GENERATED FILE — do not edit by hand.
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
 *   1. Sign in and open any page on either site — both are on nitdanigeria.sharepoint.com,
 *      so one session reads both.
 *   2. F12 → Console. Paste. Nothing is written.
 */

const DUPLICATE_SITE = "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING";
const AUTHORITATIVE_SITE = "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE";

const PAIRS = [
  {
    "title": "DGO_AccessEvents",
    "duplicateGuid": "4411f921-2a76-4dea-823d-03f1daf1df6d",
    "authoritativeGuid": "a40d5f57-859c-426c-826c-bfee090137ad",
    "authoritativeTitle": "DGO_AccessEvents",
    "keyField": null
  },
  {
    "title": "DGO_AccessEvents_2",
    "duplicateGuid": "c107a54f-3f38-4f71-8a47-38c75f047186",
    "authoritativeGuid": "a40d5f57-859c-426c-826c-bfee090137ad",
    "authoritativeTitle": "DGO_AccessEvents",
    "keyField": null
  },
  {
    "title": "DGO_AccessScopes",
    "duplicateGuid": "3bd611eb-0391-47ee-9dfa-e4520a18787b",
    "authoritativeGuid": "f2ffd2fa-901e-4f28-8f28-957da0fe05e4",
    "authoritativeTitle": "DGO_AccessScopes",
    "keyField": "AccessScopeId"
  },
  {
    "title": "DGO_AccessScopes_2",
    "duplicateGuid": "cccc57f9-1091-4e9c-9826-e46918b057f0",
    "authoritativeGuid": "f2ffd2fa-901e-4f28-8f28-957da0fe05e4",
    "authoritativeTitle": "DGO_AccessScopes",
    "keyField": "AccessScopeId"
  },
  {
    "title": "DGO_AuditLog",
    "duplicateGuid": "74153ee5-e6dd-4347-b1fe-a51d7fd47521",
    "authoritativeGuid": "be0c7af1-b21d-4efe-8c30-53fc55598d95",
    "authoritativeTitle": "DGO_AuditLog",
    "keyField": "AuditId"
  },
  {
    "title": "DGO_AuditLog_2",
    "duplicateGuid": "7ac06ab8-9754-4578-be86-87c809c8deea",
    "authoritativeGuid": "be0c7af1-b21d-4efe-8c30-53fc55598d95",
    "authoritativeTitle": "DGO_AuditLog",
    "keyField": "AuditId"
  },
  {
    "title": "DGO_DepartmentDirectory_2",
    "duplicateGuid": "ed850c51-79e6-4f7e-a725-f8ca9f42ff01",
    "authoritativeGuid": "eed0ba42-ece1-40e2-bf66-79827de02766",
    "authoritativeTitle": "DGO_DepartmentDirectory",
    "keyField": null
  },
  {
    "title": "DGO_DepartmentDirectory",
    "duplicateGuid": "db2f8e1a-69e4-4c8a-a2ee-4f2a29d85f4b",
    "authoritativeGuid": "eed0ba42-ece1-40e2-bf66-79827de02766",
    "authoritativeTitle": "DGO_DepartmentDirectory",
    "keyField": null
  },
  {
    "title": "DGO_EndpointRegistry_2",
    "duplicateGuid": "89ac07db-f7d0-43b4-b508-2479580fae18",
    "authoritativeGuid": "08c6e1c4-f2b1-4810-933d-69b4327fb6af",
    "authoritativeTitle": "DGO_EndpointRegistry",
    "keyField": null
  },
  {
    "title": "DGO_EndpointRegistry",
    "duplicateGuid": "dbc0abbd-51c5-4002-8786-3ebc866a8c35",
    "authoritativeGuid": "08c6e1c4-f2b1-4810-933d-69b4327fb6af",
    "authoritativeTitle": "DGO_EndpointRegistry",
    "keyField": null
  },
  {
    "title": "DGO_PendingWrites",
    "duplicateGuid": "66e19c2a-877b-4537-8247-2351d6374cf9",
    "authoritativeGuid": "ad1df270-21c7-4b78-99e7-fb18efd02cd2",
    "authoritativeTitle": "DGO_PendingWrites",
    "keyField": null
  },
  {
    "title": "DGO_PendingWrites_2",
    "duplicateGuid": "673b687d-5e07-4cd2-89c0-411d10238752",
    "authoritativeGuid": "ad1df270-21c7-4b78-99e7-fb18efd02cd2",
    "authoritativeTitle": "DGO_PendingWrites",
    "keyField": null
  },
  {
    "title": "DGO_PilotCohorts",
    "duplicateGuid": "22925b7d-9ea7-497f-9c01-70a32bcb6f2f",
    "authoritativeGuid": "ecc4ac65-1804-4f67-ad3e-eacb1a3a4dc2",
    "authoritativeTitle": "DGO_PilotCohorts",
    "keyField": "CohortId"
  },
  {
    "title": "DGO_PilotCohorts_2",
    "duplicateGuid": "146c6162-7bea-4ecb-9b1d-254c1e979e12",
    "authoritativeGuid": "ecc4ac65-1804-4f67-ad3e-eacb1a3a4dc2",
    "authoritativeTitle": "DGO_PilotCohorts",
    "keyField": "CohortId"
  },
  {
    "title": "DGO_RoleCatalogue",
    "duplicateGuid": "55c0daae-8b46-4db7-8c03-be54e3fc536f",
    "authoritativeGuid": "f675598b-271d-4200-8d75-2597aad4057f",
    "authoritativeTitle": "DGO_RoleCatalogue",
    "keyField": "RoleId"
  },
  {
    "title": "DGO_UserDirectory",
    "duplicateGuid": "b9b522c6-1219-4fb1-ad01-b54b40416bba",
    "authoritativeGuid": "3d591f5b-3f2f-409c-983a-a77b5c174834",
    "authoritativeTitle": "DGO_UserDirectory",
    "keyField": "Email"
  },
  {
    "title": "DGO_UserRoleHistory",
    "duplicateGuid": "4fdb8379-9f48-466e-a503-a59912be5015",
    "authoritativeGuid": "9fe1872f-3ae0-4b5f-96fc-5d3331c1d07c",
    "authoritativeTitle": "DGO_UserRoleHistory",
    "keyField": null
  }
];

(async () => {
  const NOMETA = 'application/json;odata=nometadata';

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
    try {
      const body = JSON.parse(text);
      const err = body['odata.error'] || body.error || body;
      return `${res.status} ${err?.message?.value ?? err?.message ?? text}`;
    } catch { return `${res.status} ${text.slice(0, 160)}`; }
  };

  const allItems = async (site, guid) => {
    const out = [];
    let url = `${site}/_api/web/lists(guid'${guid}')/items?$top=500`;
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
    console.log(`%c${orphans.length} row(s) exist ONLY in a duplicate. Deleting those lists destroys them.`, 'color:#b00;font-weight:bold');
    console.table(orphans);
    console.log(
      '%cReconcile these into the authoritative instance before Step 3 deletes anything.',
      'color:#b00;font-weight:bold',
    );
  } else {
    const compared = summary.filter((s) => typeof s.onlyInDuplicate === 'number' && s.duplicateRows > 0);
    console.log(
      `%cNo row exists only in a duplicate. ${compared.length} populated list(s) compared; every row `
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
      script: "compare-duplicate-governance-lists.browser.js",
      mode: 'read-only',
      site: DUPLICATE_SITE,
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
