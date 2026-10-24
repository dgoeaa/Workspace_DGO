/*
 * Creates every SharePoint column the document portal and internal governance estates
 * require but do not yet have — from a browser devtools console, using the SharePoint
 * session you are already signed into.
 *
 * WHY THIS EXISTS
 *   The PowerShell runner (scripts/provision-sharepoint-fields.ps1) is the repeatable path,
 *   but it needs PnP.PowerShell installed and, since PnP 2.x, an Entra app registration to
 *   sign in interactively. This file needs neither. It is the same specification, executed
 *   against the same REST endpoints, by the browser that is already authenticated.
 *
 * HOW TO RUN
 *   1. Sign in to https://nitdanigeria.sharepoint.com and open any page on any of the
 *      __SITE_COUNT__ sites listed below. They share one origin, so one paste reaches all of
 *      them — but only for sites you can already write to, so check the permission note.
 *   2. Open devtools (F12) → Console.
 *   3. Paste this entire file and press Enter. It reports what it would do first.
 *   4. Read the DRY RUN table. When it looks right, set DRY_RUN to false at the top of this
 *      file and paste again.
 *
 *   SITES REACHED — you need Manage Lists on EVERY one of them. Site Owner is enough; tenant
 *   admin is not needed. Missing the permission on one site fails only that site's lists, and
 *   the run reports it rather than stopping.
__SITE_LIST__
 *
 * WHAT IT WILL NOT DO
 *   It never creates a list. All __LIST_COUNT__ already exist and are addressed by the GUID
 *   captured from the tenant, so a renamed list still resolves and a typo cannot produce a
 *   duplicate. It never modifies, renames or re-types a column that is already live: every
 *   list is read first and only genuinely absent columns are created. Running it twice is
 *   safe — the second run reports everything present and creates nothing.
 */

const DRY_RUN = true;

const SPEC = /* __SPEC__ */;

(async () => {
  const ORIGIN = new URL(SPEC.lists[0].siteUrl).origin;
  if (location.origin !== ORIGIN) {
    console.error(`Run this from a page on ${ORIGIN}. You are on ${location.origin}.`);
    return;
  }

  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/'/g, '&apos;').replace(/"/g, '&quot;');

  /* One formula turns the spec's stated type/required/indexed into the exact XML SharePoint
   * accepts. Name and StaticName are both set, and Options carries AddFieldInternalNameHint:
   * without them SharePoint derives the internal name from the display name, and
   * "Sender Name" lands as Sender_x0020_Name, which no flow reads. */
  const fieldXml = (f) => {
    const display = esc(f.displayName);
    const internal = esc(f.internalName);
    const required = f.required ? "Required='TRUE'" : "Required='FALSE'";
    const indexed = f.indexed ? " Indexed='TRUE'" : '';
    const unique = f.enforceUnique ? " EnforceUniqueValues='TRUE'" : '';
    const common = `DisplayName='${display}' Name='${internal}' StaticName='${internal}' ${required}${indexed}${unique}`;

    switch (f.fieldType) {
      case 'Text':
        return `<Field Type='Text' ${common} MaxLength='255' />`;
      case 'Number':
        return `<Field Type='Number' ${common} />`;
      case 'Boolean':
        return `<Field Type='Boolean' DisplayName='${display}' Name='${internal}' StaticName='${internal}' ${required} />`;
      case 'DateTime':
        return `<Field Type='DateTime' ${common} Format='DateTime' />`;
      case 'Note': {
        const lines = f.numLines || 6;
        const rich = f.richText ? 'TRUE' : 'FALSE';
        return `<Field Type='Note' DisplayName='${display}' Name='${internal}' StaticName='${internal}' ${required} NumLines='${lines}' RichText='${rich}' />`;
      }
      case 'Choice': {
        if (!f.choices) throw new Error(`Choice field '${f.internalName}' has no choices in the spec`);
        const opts = f.choices.map((c) => `<CHOICE>${esc(c)}</CHOICE>`).join('');
        const def = f.defaultValue ? `<Default>${esc(f.defaultValue)}</Default>` : '';
        return `<Field Type='Choice' ${common} Format='${f.choiceFormat || 'Dropdown'}'>${def}<CHOICES>${opts}</CHOICES></Field>`;
      }
      default:
        throw new Error(`Unknown fieldType '${f.fieldType}' for ${f.internalName} — extend fieldXml, don't guess a mapping`);
    }
  };

  const VERBOSE = 'application/json;odata=verbose';

  /* SharePoint answers 429 and 503 with Retry-After under load. Honouring it is the whole
   * of the throttling story at this volume — ninety-seven sequential writes is nothing, and
   * anything that retries blind turns a slow run into a banned one. */
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

  const digestFor = async (siteUrl) => {
    const res = await send(`${siteUrl}/_api/contextinfo`, {
      method: 'POST',
      headers: { Accept: VERBOSE },
    });
    if (!res.ok) throw new Error(`contextinfo ${res.status} for ${siteUrl} — are you signed in and a member of that site?`);
    return (await res.json()).d.GetContextWebInformation.FormDigestValue;
  };

  const liveFields = async (siteUrl, guid) => {
    const res = await send(
      `${siteUrl}/_api/web/lists(guid'${guid}')/fields?$select=InternalName&$top=500`,
      { headers: { Accept: VERBOSE } },
    );
    if (!res.ok) throw new Error(`reading fields: ${res.status} ${await res.text()}`);
    return new Set((await res.json()).d.results.map((f) => f.InternalName));
  };

  /* INDEXING AN EXISTING COLUMN.
     The pass above only ever indexes columns it creates. The columns that actually threaten the
     estate are the ones already on the adopted lists — `RefIDD` on a 15,804-item queue and a
     21,249-item ops list, `Title` on three portal lists that grow a row per request — because an
     unindexed equality filter FAILS past 5,000 items rather than slowing. Those were three
     tracked items asking an operator to click through five column settings pages. They are this
     instead. Reading Indexed first keeps the pass idempotent and keeps a re-run honest. */
  const fieldState = async (siteUrl, guid, name) => {
    const res = await send(
      `${siteUrl}/_api/web/lists(guid'${guid}')/fields/getbyinternalnameortitle('${encodeURIComponent(name)}')?$select=Indexed,InternalName`,
      { headers: { Accept: VERBOSE } },
    );
    if (!res.ok) throw new Error(`reading ${name}: ${res.status}`);
    return (await res.json()).d;
  };

  const setIndexed = async (siteUrl, guid, name, digest) => {
    const res = await send(
      `${siteUrl}/_api/web/lists(guid'${guid}')/fields/getbyinternalnameortitle('${encodeURIComponent(name)}')`,
      {
        method: 'POST',
        headers: {
          Accept: VERBOSE, 'Content-Type': VERBOSE, 'X-RequestDigest': digest,
          'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*',
        },
        body: JSON.stringify({ __metadata: { type: 'SP.Field' }, Indexed: true }),
      },
    );
    if (!res.ok) {
      let detail = await res.text();
      try { detail = JSON.parse(detail).error.message.value; } catch { /* keep the raw body */ }
      throw new Error(`${res.status} ${detail}`);
    }
  };

  const createField = async (siteUrl, guid, digest, xml) => {
    const res = await send(`${siteUrl}/_api/web/lists(guid'${guid}')/fields/createfieldasxml`, {
      method: 'POST',
      headers: { Accept: VERBOSE, 'Content-Type': VERBOSE, 'X-RequestDigest': digest },
      body: JSON.stringify({
        parameters: {
          __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' },
          SchemaXml: xml,
          /* 8 = AddFieldInternalNameHint (honour Name as the internal name),
             16 = AddFieldToDefaultView */
          Options: 24,
        },
      }),
    });
    if (!res.ok) {
      let detail = await res.text();
      try { detail = JSON.parse(detail).error.message.value; } catch { /* keep the raw body */ }
      throw new Error(`${res.status} ${detail}`);
    }
  };

  const ledger = [];
  let created = 0, present = 0, failed = 0, planned = 0;

  const bySite = new Map();
  for (const list of SPEC.lists) {
    if (!bySite.has(list.siteUrl)) bySite.set(list.siteUrl, []);
    bySite.get(list.siteUrl).push(list);
  }

  const total = SPEC.lists.reduce((n, l) => n + l.fields.length, 0);
  console.log(
    `%c${DRY_RUN ? 'DRY RUN — ' : ''}${total} columns across ${SPEC.lists.length} lists (spec ${SPEC.specVersion})`,
    'font-weight:bold',
  );

  for (const [siteUrl, lists] of bySite) {
    console.group(siteUrl);
    let digest = null;
    try {
      digest = DRY_RUN ? 'dry-run' : await digestFor(siteUrl);
    } catch (err) {
      console.error(err.message);
      for (const l of lists) {
        for (const f of l.fields) {
          failed++;
          ledger.push({ site: l.site, list: l.listTitle, field: f.internalName, type: f.fieldType, result: `SITE UNREACHABLE: ${err.message}` });
        }
      }
      console.groupEnd();
      continue;
    }

    for (const list of lists.sort((a, b) => a.listOrder - b.listOrder)) {
      console.group(list.listTitle);
      let live;
      try {
        live = await liveFields(siteUrl, list.listGuid);
      } catch (err) {
        console.error(`list ${list.listGuid} — ${err.message}`);
        for (const f of list.fields) {
          failed++;
          ledger.push({ site: list.site, list: list.listTitle, field: f.internalName, type: f.fieldType, result: `LIST NOT READABLE: ${err.message}` });
        }
        console.groupEnd();
        continue;
      }

      for (const f of list.fields) {
        const row = { site: list.site, list: list.listTitle, field: f.internalName, type: f.fieldType, result: '' };

        if (live.has(f.internalName)) {
          present++;
          row.result = 'present';
          console.log(`= ${f.internalName}`);
        } else if (DRY_RUN) {
          planned++;
          row.result = 'would create';
          console.log(`%c? ${f.internalName} (${f.fieldType}) — would create`, 'color:#b58900');
        } else {
          try {
            await createField(siteUrl, list.listGuid, digest, fieldXml(f));
            created++;
            row.result = 'created';
            console.log(`%c+ ${f.internalName} (${f.fieldType})`, 'color:#268bd2');
          } catch (err) {
            failed++;
            row.result = `FAILED: ${err.message}`;
            console.error(`! ${f.internalName} — ${err.message}`);
          }
        }
        ledger.push(row);
      }
      console.groupEnd();
    }
    console.groupEnd();
  }

  /* ---- second pass: index the columns the flows filter on ---- */
  const INDEX_TARGETS = SPEC.indexTargets || [];
  let indexed = 0, alreadyIndexed = 0, indexFailed = 0;
  if (INDEX_TARGETS.length) {
    console.group(`Indexing ${INDEX_TARGETS.length} filtered column(s)`);
    const digests = new Map();
    for (const t of INDEX_TARGETS) {
      const row = { site: t.site, list: t.listTitle, field: t.internalName, type: 'index', result: '' };
      try {
        const state = await fieldState(t.siteUrl, t.listGuid, t.internalName);
        if (state.Indexed) {
          alreadyIndexed++; row.result = 'present';
          console.log(`= ${t.listTitle}.${t.internalName} already indexed`);
        } else if (DRY_RUN) {
          row.result = 'would index';
          console.log(`%c? ${t.listTitle}.${t.internalName} — would index (${t.itemsAtCapture} items at capture)`, 'color:#b58900');
        } else {
          if (!digests.has(t.siteUrl)) digests.set(t.siteUrl, await digestFor(t.siteUrl));
          await setIndexed(t.siteUrl, t.listGuid, t.internalName, digests.get(t.siteUrl));
          indexed++; row.result = 'created';
          console.log(`%c+ ${t.listTitle}.${t.internalName} indexed`, 'color:#268bd2');
        }
      } catch (err) {
        indexFailed++; row.result = `FAILED: ${err.message}`;
        console.error(`! ${t.listTitle}.${t.internalName} — ${err.message}`);
      }
      ledger.push(row);
    }
    console.groupEnd();
  }

  console.log('%c────────────────────────────────────', 'color:#888');
  if (INDEX_TARGETS.length) {
    console.log(DRY_RUN
      ? `Indexes: ${INDEX_TARGETS.length - alreadyIndexed - indexFailed} to set, ${alreadyIndexed} already indexed, ${indexFailed} unreadable.`
      : `Indexes set: ${indexed}   Already indexed: ${alreadyIndexed}   Failed: ${indexFailed}`);
  }
  if (DRY_RUN) {
    console.log(`%cDRY RUN: ${planned} to create, ${present} already present, ${failed} unreachable.`, 'font-weight:bold');
    console.log('Set DRY_RUN = false at the top of this file and paste again to apply.');
  } else {
    console.log(`%cCreated: ${created}   Already present: ${present}   Failed: ${failed}`, 'font-weight:bold');
    if (failed === 0) console.log(`%cEstate complete: ${created + present}/${total} columns present.`, 'color:#859900;font-weight:bold');
    else console.log('%cRe-run to retry — this script is idempotent and will skip what already exists.', 'color:#dc322f');
  }

  console.table(ledger.filter((r) => r.result !== 'present'));
  /* Kept on window so the run can be exported as evidence for the provisioning gate:
   *   copy(JSON.stringify(spLedger, null, 2)) */
  window.spLedger = ledger;
})();
