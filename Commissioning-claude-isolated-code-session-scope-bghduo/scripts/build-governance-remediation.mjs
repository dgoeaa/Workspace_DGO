#!/usr/bin/env node
/**
 * Emit the browser remediation for columns created under the wrong internal name.
 *
 * WHY THIS EXISTS
 *
 * The live run of 2026-09-09 created three columns from a SchemaXml whose `Name` attribute still
 * carried the old name. `createfieldasxml` runs with Options 24, and 8 of that is
 * AddFieldInternalNameHint, so SharePoint took the internal name — and, as the tenant then
 * showed, the Title too — from `Name`. The tenant received `Version`, `FlowUrl` and `Version`
 * where the specification wanted `CatalogueVersion`, `EndpointRedacted` and `EndpointVersion`.
 *
 * The runbook's remediation was written in PnP.PowerShell. PowerShell is not always available,
 * and a remediation an operator cannot run is not a remediation. Everything it does is
 * SharePoint REST, so it belongs in the same browser console that created the problem.
 *
 * WHY GENERATED AND NOT HAND-WRITTEN
 *
 * The whole defect was a SchemaXml that disagreed with the field it described. Hand-copying that
 * XML into a second file would reproduce the failure mode exactly. Every stray here is derived
 * from the fields carrying `RenamedFrom` in the specification, and every SchemaXml is the
 * specification's own — so if the spec is right, this is right, and `--check` keeps them married.
 *
 * It also generalises: a rename added later appears here automatically, with no edit.
 *
 *   npm run governance:remediation
 *   npm run governance:remediation -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relayBlock } from './lib/browser-relay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, 'docs/reference/sharepoint-provisioning-spec.json');
const REGISTRY = path.join(ROOT, 'docs/reference/governance-list-registry.json');
const OUT = path.join(ROOT, 'scripts/remediate-governance-strays.browser.js');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const SITE = registry.decision.authoritativeSite;
const guidOf = new Map(registry.lists.map((l) => [l.listTitle, l.listGuid]));

/* A renamed field is exactly a field whose old name may be sitting in the tenant. Deriving the
   list this way means it cannot drift from the renames actually applied. */
const strays = (spec.fields || [])
  .filter((f) => f.RenamedFrom)
  .map((f) => {
    const listGuid = guidOf.get(f.ListTitle);
    if (!listGuid) fail(`${f.ListTitle} is not in the authoritative registry — cannot address it by GUID`);
    return {
      list: f.ListTitle,
      listGuid,
      oldName: f.RenamedFrom,
      newName: f.InternalName,
      displayName: f.DisplayName,
      fieldType: f.FieldType,
      indexed: f.Indexed === true || f.Indexed === 'Yes' || f.Indexed === 'TRUE',
      schemaXml: f.SchemaXml,
    };
  })
  .sort((a, b) => (a.list + a.newName < b.list + b.newName ? -1 : 1));

if (!strays.length) fail('no renamed fields in the specification — nothing to remediate');

/* The defect this whole file exists to clean up was a SchemaXml disagreeing with its field.
   Emitting one without checking it would be the same mistake in a new place. */
for (const s of strays) {
  const read = (attr) => new RegExp(`(?<![A-Za-z])${attr}='([^']*)'`).exec(s.schemaXml)?.[1];
  if (read('Name') !== s.newName || read('StaticName') !== s.newName) {
    fail(`${s.list}.${s.newName} has a SchemaXml that does not name it. Run: npm run governance:correctfields`);
  }
}

const emitted = `/* GENERATED FILE — do not edit by hand.
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
 *   It will not delete a column holding a value with a \\\`sig=\\\` in it. A signed trigger URL is a
 *   bearer credential; deleting the column REVOKES NOTHING. Only regenerating the trigger in
 *   Power Automate does. It reports that a signature is present and never prints one.
 *   It will not touch any list or column not named below.
 *
 * HOW TO RUN
 *   1. Sign in and open any page on
 *      ${SITE}
 *   2. F12 → Console.
 *   3. Paste this entire file, press Enter. It reports what it WOULD do and changes nothing.
 *   4. Read the plan. When it is right, set DRY_RUN to false below and paste again.
 *
 * PERMISSION REQUIRED
 *   Manage Lists on ${SITE.split('/sites/')[1]}. Site Owner is enough.
 */

const DRY_RUN = true;

const SITE = ${JSON.stringify(SITE)};
const STRAYS = ${JSON.stringify(strays, null, 2)};

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

  const liveFields = async (guid) => {
    const res = await send(
      \`\${SITE}/_api/web/lists(guid'\${guid}')/fields?$select=InternalName,Title,Indexed,FromBaseType,CanBeDeleted&$top=500\`,
      { headers: { Accept: NOMETA } });
    if (!res.ok) throw new Error(\`reading fields: \${await detail(res)}\`);
    return new Map(((await res.json()).value || []).map((f) => [f.InternalName, f]));
  };

  const itemsWith = async (guid, cols) => {
    const res = await send(
      \`\${SITE}/_api/web/lists(guid'\${guid}')/items?$select=Id,\${cols.join(',')}&$top=500\`,
      { headers: { Accept: NOMETA } });
    if (!res.ok) throw new Error(\`reading items: \${await detail(res)}\`);
    return (await res.json()).value || [];
  };

  const createField = async (guid, digest, xml) => {
    const res = await send(\`\${SITE}/_api/web/lists(guid'\${guid}')/fields/createfieldasxml\`, {
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
    const res = await send(\`\${SITE}/_api/web/lists(guid'\${guid}')/items(\${id})\`, {
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
      \`\${SITE}/_api/web/lists(guid'\${guid}')/fields/getbyinternalnameortitle('\${encodeURIComponent(internalName)}')\`,
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
  console.log(\`%c\${DRY_RUN ? 'DRY RUN — ' : ''}remediating \${STRAYS.length} column(s)\`, 'font-weight:bold');
  console.log(\`%c\${SITE}\`, 'color:#888');

  let digest = null;
  try {
    digest = DRY_RUN ? 'dry-run' : await digestFor();
  } catch (err) {
    console.error(err.message);
    return;
  }

  for (const s of STRAYS) {
    console.group(\`\${s.list}.\${s.oldName} → \${s.newName}\`);
    const note = (action, msg) => {
      ledger.push({ list: s.list, from: s.oldName, to: s.newName, action, detail: msg });
      console.log(\`\${action}: \${msg}\`);
    };

    try {
      const live = await liveFields(s.listGuid);
      const oldField = live.get(s.oldName);
      const newField = live.get(s.newName);

      /* Nothing to remediate: the old name is not a custom column on this list. */
      if (!oldField || !isCustom(oldField)) {
        note(newField && isCustom(newField) ? 'ALREADY CORRECT' : 'NOTHING TO DO',
          \`no custom column named '\${s.oldName}' on this list\`);
        console.groupEnd();
        continue;
      }

      /* 1. READ what the old column holds. */
      const cols = newField && isCustom(newField) ? [s.oldName, s.newName] : [s.oldName];
      const items = await itemsWith(s.listGuid, cols);
      const populated = items.filter((it) => filled(it[s.oldName]));
      const signed = populated.filter((it) => hasSig(it[s.oldName]));

      note('READ', \`\${items.length} item(s), \${populated.length} populated\${signed.length ? \`, \${signed.length} CARRYING A SIGNATURE\` : ''}\`);

      if (signed.length) {
        /* Deleting the column does not revoke the credential. Saying so is the whole point. */
        note('REFUSED',
          \`\${signed.length} value(s) carry a sig=. That is a live bearer credential. Deleting this \`
          + \`column revokes NOTHING — regenerate the trigger in Power Automate first, then re-run \`
          + \`this file. Nothing was changed for this column.\`);
        console.groupEnd();
        continue;
      }

      /* 2. CREATE the correctly-named column. */
      if (!newField || !isCustom(newField)) {
        if (DRY_RUN) {
          note('WOULD CREATE', \`\${s.newName} (\${s.fieldType})\`);
        } else {
          await createField(s.listGuid, digest, s.schemaXml);
          note('CREATED', \`\${s.newName} (\${s.fieldType})\`);
        }
      } else {
        note('present', \`\${s.newName} already exists\`);
      }

      /* 3. COPY. Never over an existing value — a re-run must not undo a later correction. */
      const toCopy = populated.filter((it) => !filled(it[s.newName]));
      if (DRY_RUN) {
        note('WOULD COPY', \`\${toCopy.length} value(s) from \${s.oldName} to \${s.newName}\`);
        note('WOULD DELETE', \`\${s.oldName} — after the copy verifies\`);
        console.groupEnd();
        continue;
      }

      let copied = 0, copyFailed = 0;
      for (const it of toCopy) {
        try { await setItem(s.listGuid, digest, it.Id, { [s.newName]: it[s.oldName] }); copied++; }
        catch (err) { copyFailed++; note('COPY FAILED', \`item \${it.Id}: \${err.message}\`); }
      }
      note('COPIED', \`\${copied} value(s)\${copyFailed ? \`, \${copyFailed} failed\` : ''}\`);

      /* 4. VERIFY by reading back, not by trusting the writes. */
      const after = await itemsWith(s.listGuid, [s.oldName, s.newName]);
      const mismatched = after.filter((it) =>
        filled(it[s.oldName]) && String(it[s.oldName]) !== String(it[s.newName]));

      if (mismatched.length) {
        note('NOT DELETED',
          \`\${mismatched.length} row(s) do not match after the copy (ids \${mismatched.slice(0, 5).map((m) => m.Id).join(', ')}). \`
          + \`'\${s.oldName}' is left in place with its data. Fix the copy and re-run.\`);
        console.groupEnd();
        continue;
      }
      note('VERIFIED', \`every populated row matches in \${s.newName}\`);

      /* 5. DELETE, having earned it. */
      try {
        await deleteField(s.listGuid, digest, s.oldName);
        note('DELETED', \`\${s.oldName} removed\`);
      } catch (err) {
        note('DELETE FAILED', \`\${s.oldName}: \${err.message}. The data is safe in \${s.newName}.\`);
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
    console.log(\`%c\${stuck.length} row(s) need attention — the data was left where it was.\`, 'color:#b00;font-weight:bold');
  }
  if (DRY_RUN) {
    console.log('%cSet DRY_RUN = false at the top of this file and paste again to apply.', 'font-weight:bold');
  } else if (!refused.length && !stuck.length) {
    console.log('%cDone. Now re-run scripts/provision-governance-lists.browser.js — everything should read "present".', 'color:#080;font-weight:bold');
  }
${relayBlock("remediate-governance-strays.browser.js", "DRY_RUN ? 'dry-run' : 'apply'", "SITE")}
})();
`;

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

console.log('\nGovernance stray-column remediation\n');
console.log(`  site      ${SITE}`);
console.log(`  columns   ${strays.length}`);
for (const s of strays) console.log(`    ${s.list}.${s.oldName} → ${s.newName}`);
console.log('');

if (CHECK) {
  if (emitted !== previous) fail('the remediation script is stale. Run: npm run governance:remediation');
  console.log('  ✅ the remediation script matches the specification\n');
  process.exit(0);
}

fs.writeFileSync(OUT, emitted);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)} — ${Math.round(emitted.length / 1024)} KB, dry-run by default\n`);
