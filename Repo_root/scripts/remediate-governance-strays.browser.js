/* GENERATED FILE — do not edit by hand.
 * Built from docs/reference/sharepoint-provisioning-spec.json by
 * scripts/build-governance-remediation.mjs. Edit the specification and re-run.
 */
/*
 * Remediate the columns created under the WRONG internal name, from the browser console.
 * No PowerShell, no PnP, no install — the SharePoint session you are already signed into.
 *
 * WHAT WENT WRONG
 *   Step 2's provisioner calls createfieldasxml with Options 24. 8 of that is
 *   AddFieldInternalNameHint: SharePoint takes the column's internal name from the SchemaXml's
 *   "Name" attribute. A defective rename left "Name" carrying the OLD name, so a column the
 *   specification had renamed was created under the name it was being renamed away from — and
 *   SharePoint took the Title from "Name" as well, so it reads that way in the view too.
 *
 *   Every renamed field in the specification is listed below, because the repository cannot know
 *   which ones the tenant actually got wrong. Each is CHECKED against the live list first, and a
 *   column that is already correct — or whose old name is a SharePoint system field rather than a
 *   custom column — is reported and left alone. Nothing is assumed.
 *
 * WHAT THIS DOES, IN ORDER, PER COLUMN
 *   1. READ    — is the correctly-named column there? does the old one hold anything?
 *   2. CREATE  — the correctly-named column, from the corrected specification.
 *   3. COPY    — every value from old to new. Never overwrites a value already in new.
 *   4. VERIFY  — every row's new value equals its old value.
 *   5. DELETE  — the old column, and ONLY if step 4 passed for every row.
 *
 *   The order is the safety. Create, copy and verify all happen before anything is removed, so a
 *   failure at any point leaves the data where it was.
 *
 * WHAT IT REFUSES TO DO
 *   It will not delete a column whose copy did not verify.
 *   It will not delete a column holding a value with a \`sig=\` in it. A signed trigger URL is a
 *   bearer credential; deleting the column REVOKES NOTHING. Only regenerating the trigger in
 *   Power Automate does. It reports that a signature is present and never prints one.
 *   It will not touch any list or column not named below.
 *
 * HOW TO RUN
 *   1. Sign in and open any page on
 *      https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE
 *   2. F12 → Console.
 *   3. Paste this entire file, press Enter. It reports what it WOULD do and changes nothing.
 *   4. Read the plan. When it is right, set DRY_RUN to false below and paste again.
 *
 * PERMISSION REQUIRED
 *   Manage Lists on DGO_ECM_GOVERNANCE. Site Owner is enough.
 */

const DRY_RUN = true;

const SITE = "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE";
const STRAYS = [
  {
    "list": "DGO_AccessScopes",
    "listGuid": "f2ffd2fa-901e-4f28-8f28-957da0fe05e4",
    "oldName": "ScopeId",
    "newName": "AccessScopeId",
    "displayName": "Access Scope Id",
    "fieldType": "Text",
    "indexed": true,
    "schemaXml": "<Field Type='Text' DisplayName='Access Scope Id' StaticName='AccessScopeId' Name='AccessScopeId' Required='TRUE' Indexed='TRUE' />"
  },
  {
    "list": "DGO_EndpointRegistry",
    "listGuid": "08c6e1c4-f2b1-4810-933d-69b4327fb6af",
    "oldName": "FlowUrl",
    "newName": "EndpointRedacted",
    "displayName": "Endpoint (redacted)",
    "fieldType": "Note",
    "indexed": false,
    "schemaXml": "<Field Type='Note' DisplayName='Endpoint (redacted)' StaticName='EndpointRedacted' Name='EndpointRedacted' NumLines='6' RichText='FALSE' />"
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

  const liveFields = async (guid) => {
    const res = await send(
      `${SITE}/_api/web/lists(guid'${guid}')/fields?$select=InternalName,Title,Indexed,FromBaseType,CanBeDeleted&$top=500`,
      { headers: { Accept: NOMETA } });
    if (!res.ok) throw new Error(`reading fields: ${await detail(res)}`);
    return new Map(((await res.json()).value || []).map((f) => [f.InternalName, f]));
  };

  const itemsWith = async (guid, cols) => {
    const res = await send(
      `${SITE}/_api/web/lists(guid'${guid}')/items?$select=Id,${cols.join(',')}&$top=500`,
      { headers: { Accept: NOMETA } });
    if (!res.ok) throw new Error(`reading items: ${await detail(res)}`);
    return (await res.json()).value || [];
  };

  const createField = async (guid, digest, xml) => {
    const res = await send(`${SITE}/_api/web/lists(guid'${guid}')/fields/createfieldasxml`, {
      method: 'POST',
      headers: { Accept: VERBOSE, 'Content-Type': VERBOSE, 'X-RequestDigest': digest },
      body: JSON.stringify({
        parameters: {
          __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' },
          SchemaXml: xml,
          Options: 24,
        },
      }),
    });
    if (!res.ok) throw new Error(await detail(res));
  };

  const setItem = async (guid, digest, id, values) => {
    const res = await send(`${SITE}/_api/web/lists(guid'${guid}')/items(${id})`, {
      method: 'POST',
      headers: {
        Accept: NOMETA, 'Content-Type': NOMETA, 'X-RequestDigest': digest,
        'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*',
      },
      body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error(await detail(res));
  };

  const deleteField = async (guid, digest, internalName) => {
    const res = await send(
      `${SITE}/_api/web/lists(guid'${guid}')/fields/getbyinternalnameortitle('${encodeURIComponent(internalName)}')`,
      {
        method: 'POST',
        headers: { Accept: NOMETA, 'X-RequestDigest': digest, 'X-HTTP-Method': 'DELETE', 'IF-MATCH': '*' },
      },
    );
    if (!res.ok) throw new Error(await detail(res));
  };

  const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';
  const hasSig = (v) => /[?&]sig=/i.test(String(v ?? ''));

  /* ── run ─────────────────────────────────────────────────────────────────────────────── */

  const ledger = [];
  console.log(`%c${DRY_RUN ? 'DRY RUN — ' : ''}remediating ${STRAYS.length} column(s)`, 'font-weight:bold');
  console.log(`%c${SITE}`, 'color:#888');

  let digest = null;
  try {
    digest = DRY_RUN ? 'dry-run' : await digestFor();
  } catch (err) {
    console.error(err.message);
    return;
  }

  for (const s of STRAYS) {
    console.group(`${s.list}.${s.oldName} → ${s.newName}`);
    const note = (action, msg) => {
      ledger.push({ list: s.list, from: s.oldName, to: s.newName, action, detail: msg });
      console.log(`${action}: ${msg}`);
    };

    try {
      const live = await liveFields(s.listGuid);
      const oldField = live.get(s.oldName);
      const newField = live.get(s.newName);

      /* Nothing to remediate: the old name is not a custom column on this list. */
      if (!oldField || !isCustom(oldField)) {
        note(newField && isCustom(newField) ? 'ALREADY CORRECT' : 'NOTHING TO DO',
          `no custom column named '${s.oldName}' on this list`);
        console.groupEnd();
        continue;
      }

      /* 1. READ what the old column holds. */
      const cols = newField && isCustom(newField) ? [s.oldName, s.newName] : [s.oldName];
      const items = await itemsWith(s.listGuid, cols);
      const populated = items.filter((it) => filled(it[s.oldName]));
      const signed = populated.filter((it) => hasSig(it[s.oldName]));

      note('READ', `${items.length} item(s), ${populated.length} populated${signed.length ? `, ${signed.length} CARRYING A SIGNATURE` : ''}`);

      if (signed.length) {
        /* Deleting the column does not revoke the credential. Saying so is the whole point. */
        note('REFUSED',
          `${signed.length} value(s) carry a sig=. That is a live bearer credential. Deleting this `
          + `column revokes NOTHING — regenerate the trigger in Power Automate first, then re-run `
          + `this file. Nothing was changed for this column.`);
        console.groupEnd();
        continue;
      }

      /* 2. CREATE the correctly-named column. */
      if (!newField || !isCustom(newField)) {
        if (DRY_RUN) {
          note('WOULD CREATE', `${s.newName} (${s.fieldType})`);
        } else {
          await createField(s.listGuid, digest, s.schemaXml);
          note('CREATED', `${s.newName} (${s.fieldType})`);
        }
      } else {
        note('present', `${s.newName} already exists`);
      }

      /* 3. COPY. Never over an existing value — a re-run must not undo a later correction. */
      const toCopy = populated.filter((it) => !filled(it[s.newName]));
      if (DRY_RUN) {
        note('WOULD COPY', `${toCopy.length} value(s) from ${s.oldName} to ${s.newName}`);
        note('WOULD DELETE', `${s.oldName} — after the copy verifies`);
        console.groupEnd();
        continue;
      }

      let copied = 0, copyFailed = 0;
      for (const it of toCopy) {
        try { await setItem(s.listGuid, digest, it.Id, { [s.newName]: it[s.oldName] }); copied++; }
        catch (err) { copyFailed++; note('COPY FAILED', `item ${it.Id}: ${err.message}`); }
      }
      note('COPIED', `${copied} value(s)${copyFailed ? `, ${copyFailed} failed` : ''}`);

      /* 4. VERIFY by reading back, not by trusting the writes. */
      const after = await itemsWith(s.listGuid, [s.oldName, s.newName]);
      const mismatched = after.filter((it) =>
        filled(it[s.oldName]) && String(it[s.oldName]) !== String(it[s.newName]));

      if (mismatched.length) {
        note('NOT DELETED',
          `${mismatched.length} row(s) do not match after the copy (ids ${mismatched.slice(0, 5).map((m) => m.Id).join(', ')}). `
          + `'${s.oldName}' is left in place with its data. Fix the copy and re-run.`);
        console.groupEnd();
        continue;
      }
      note('VERIFIED', `every populated row matches in ${s.newName}`);

      /* 5. DELETE, having earned it. */
      try {
        await deleteField(s.listGuid, digest, s.oldName);
        note('DELETED', `${s.oldName} removed`);
      } catch (err) {
        note('DELETE FAILED', `${s.oldName}: ${err.message}. The data is safe in ${s.newName}.`);
      }
    } catch (err) {
      note('FAILED', err.message);
    }
    console.groupEnd();
  }

  console.table(ledger);

  const refused = ledger.filter((r) => r.action === 'REFUSED');
  const stuck = ledger.filter((r) => /FAILED|NOT DELETED/.test(r.action));
  if (refused.length) {
    console.log('%cRefused: a live credential is in a list column. Regenerate that trigger in Power Automate, then re-run.', 'color:#b00;font-weight:bold');
  }
  if (stuck.length) {
    console.log(`%c${stuck.length} row(s) need attention — the data was left where it was.`, 'color:#b00;font-weight:bold');
  }
  if (DRY_RUN) {
    console.log('%cSet DRY_RUN = false at the top of this file and paste again to apply.', 'font-weight:bold');
  } else if (!refused.length && !stuck.length) {
    console.log('%cDone. Now re-run scripts/provision-governance-lists.browser.js — everything should read "present".', 'color:#080;font-weight:bold');
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
      script: "remediate-governance-strays.browser.js",
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
