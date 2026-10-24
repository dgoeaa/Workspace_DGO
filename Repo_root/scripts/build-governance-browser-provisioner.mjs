#!/usr/bin/env node
/**
 * Bake the governance provisioning specification into a browser-executable provisioner.
 *
 * WHY A BROWSER SCRIPT AND NOT THE PROVISIONING FLOW
 *
 * The provisioning flow addresses lists by title against `_api/web/lists`, which is what
 * produced the duplicate estate recorded as GOV-02: run `getByTitle('DGO_AuditLog')` against a
 * site where that title already exists and SharePoint mints `DGO_AuditLog_2` rather than
 * failing. Repointing the flow means editing it in the tenant designer, by hand, which is the
 * same manual step that went wrong the first time.
 *
 * This is the path the portal estate already took — `scripts/provision-sharepoint-fields.browser.js`
 * — and it took it for the same reason. Every address here is a list GUID read from the tenant
 * capture. A wrong GUID is a 404: a failure you can see, not a duplicate you discover months
 * later. It creates no list, because all ten exist.
 *
 * WHAT IT DOES, IN ORDER
 *   1. Reads the live columns of each list and creates only the genuinely absent ones, using
 *      the SchemaXml the workbook itself specifies — not a type mapping guessed here.
 *   2. Indexes the columns the specification marks indexed, whether it created them or not.
 *   3. Seeds the ten configuration rows, checking each list's own key field first so a re-run
 *      creates nothing.
 *   4. Verifies: re-reads every list and reports field and seed coverage.
 *
 * It is dry-run by default and idempotent: the second run reports everything present.
 *
 *   npm run governance:provisioner              # regenerate
 *   npm run governance:provisioner -- --check   # fail if the emitted file has drifted
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relayBlock } from './lib/browser-relay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, 'docs/reference/sharepoint-provisioning-spec.json');
const REGISTRY = path.join(ROOT, 'docs/reference/governance-list-registry.json');
const OUT = path.join(ROOT, 'scripts/provision-governance-lists.browser.js');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const SITE = registry.decision.authoritativeSite;

if ((spec.lists || []).some((l) => l.TargetSite !== SITE)) {
  fail('the provisioning spec is not repointed onto the authoritative site. Run: npm run governance:repoint');
}

/* Only what the runner needs. The spec's prose stays out — a second copy of the narrative in a
   generated file is a second copy nobody updates. */
const byList = new Map(registry.lists.map((l) => [l.listTitle, l]));
const lists = (spec.lists || []).map((l) => {
  const auth = byList.get(l.ListTitle);
  const fields = (spec.fields || [])
    .filter((f) => f.ListTitle === l.ListTitle)
    .sort((a, b) => a.FieldOrderInList - b.FieldOrderInList)
    .map((f) => ({
      internalName: f.InternalName,
      displayName: f.DisplayName,
      fieldType: f.FieldType,
      required: f.Required === true || f.Required === 'Yes' || f.Required === 'TRUE',
      indexed: f.Indexed === true || f.Indexed === 'Yes' || f.Indexed === 'TRUE',
      schemaXml: f.SchemaXml,
    }));
  const seeds = (spec.seedItems || [])
    .filter((s) => s.ListTitle === l.ListTitle)
    .map((s) => ({
      seedId: s.SeedId,
      keyField: s.KeyField,
      keyValue: s.KeyValue,
      fields: JSON.parse(s.FieldsJson),
    }));
  return {
    listOrder: l.ListOrder,
    listTitle: l.ListTitle,
    listGuid: auth.listGuid,
    purpose: l.Purpose,
    fields,
    seeds,
  };
});

const missingXml = lists.flatMap((l) => l.fields.filter((f) => !f.schemaXml).map((f) => `${l.listTitle}.${f.internalName}`));
if (missingXml.length) fail(`${missingXml.length} field(s) carry no SchemaXml: ${missingXml.slice(0, 5).join(', ')}`);

const payload = {
  generatedFrom: 'docs/reference/sharepoint-provisioning-spec.json',
  decision: registry.decision.id,
  siteUrl: SITE,
  totals: {
    lists: lists.length,
    fields: lists.reduce((n, l) => n + l.fields.length, 0),
    seeds: lists.reduce((n, l) => n + l.seeds.length, 0),
    indexed: lists.reduce((n, l) => n + l.fields.filter((f) => f.indexed).length, 0),
  },
  lists,
};

const retireTable = registry.retire
  .map((r) => ` *     ${r.listGuid}  ${r.listTitle.padEnd(26)} ${r.site}`)
  .join('\n');

const emitted = `/* GENERATED FILE — do not edit by hand.
 * Built from docs/reference/sharepoint-provisioning-spec.json by
 * scripts/build-governance-browser-provisioner.mjs. Edit the specification and re-run.
 */
/*
 * Provision the ten DGO governance lists — every column and seed row they require but do not
 * yet have — from a browser devtools console, using the SharePoint session you are already
 * signed into.
 *
 * DECISION GOV-01. ${SITE}
 * is the single authoritative site for all ten. Every address below is a list GUID captured
 * from the tenant, so a renamed list still resolves and a typo cannot produce a duplicate.
 *
 * HOW TO RUN
 *   1. Sign in to https://nitdanigeria.sharepoint.com and open any page on
 *      ${SITE}
 *   2. Open devtools (F12) → Console.
 *   3. Paste this entire file and press Enter. It reports what it WOULD do and changes nothing.
 *   4. Read the DRY RUN table. When it is right, set DRY_RUN to false below and paste again.
 *
 * PERMISSION REQUIRED
 *   Manage Lists on ${SITE.split('/sites/')[1]}.
 *   Site Owner is enough. Tenant administrator is not needed.
 *
 * WHAT IT WILL NOT DO
 *   It never creates a list — all ten exist. It never modifies, renames or re-types a column
 *   that is already live: each list is read first and only genuinely absent columns are
 *   created. It never duplicates a seed row: each list's own key field is checked first.
 *   Running it twice is safe; the second run creates nothing.
 *
 *   Where a column is absent under the specification's internal name but the list already
 *   carries a custom column under the same DISPLAY name, that column is ADOPTED — used as-is,
 *   with the seeds rewritten onto its real internal name — rather than a second column being
 *   created beside it. DGO_AccessScopes carries 'Access Scope Id' exactly this way.
 *
 * WHAT IT DOES NOT TOUCH — the ${registry.retire.length} duplicate instances to retire.
 *   This script writes ONLY to the GUIDs listed in its specification. The duplicates below are
 *   left exactly as they are; retiring them is a separate, deliberate act.
${retireTable}
 */

const DRY_RUN = true;

const SPEC = ${JSON.stringify(payload, null, 2)};

(async () => {
  const VERBOSE = 'application/json;odata=verbose';
  const NOMETA = 'application/json;odata=nometadata';
  const site = SPEC.siteUrl;

  /* SharePoint answers 429 and 503 with Retry-After under load. Honouring it is the whole of
     the throttling story at this volume; anything that retries blind turns a slow run into a
     banned one. */
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

  /* SharePoint reports an error under \`odata.error\` when the Accept header asks for
     nometadata and under \`error\` otherwise, and the message is sometimes an object with a
     \`value\` and sometimes a bare string. Handling only one shape is why a real diagnostic —
     "List does not exist. It may have been deleted by another user." — reached an operator as
     a truncated JSON blob with the sentence they needed cut off by the table renderer. */
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
    const res = await send(\`\${site}/_api/contextinfo\`, { method: 'POST', headers: { Accept: VERBOSE } });
    if (!res.ok) throw new Error(\`contextinfo \${res.status} — are you signed in, and a member of this site?\`);
    return (await res.json()).d.GetContextWebInformation.FormDigestValue;
  };

  /* FromBaseType and CanBeDeleted are read, not just InternalName, and the reason is a false
     positive that cost a live run.
     
     \`ScopeId\` is a SharePoint SYSTEM field: every list carries a hidden one holding the item's
     security scope. Asking only "is there a field called ScopeId?" answered yes — SharePoint's
     own — so the provisioner reported the column present, never created the real one, and then
     failed on both operations that touched it. Indexing a system field returns 500 'Cannot
     complete this action.'; filtering a Guid-typed system field against the string 'all'
     returns 500 'List does not exist.' The tenant's actual custom column is called
     'Access Scope Id', which is what an operator sees in the list view, and it is a different
     field entirely.
     
     A field inherited from the base type is not the field the specification asked for. Treating
     it as one is the same defect this estate keeps producing: a check whose shape is right while
     its meaning is wrong. */
  const liveFields = async (guid) => {
    const res = await send(
      \`\${site}/_api/web/lists(guid'\${guid}')/fields?$select=InternalName,Title,Indexed,FromBaseType,Hidden,CanBeDeleted&$top=500\`,
      { headers: { Accept: VERBOSE } });
    if (!res.ok) throw new Error(\`reading fields: \${await detail(res)}\`);
    const rows = (await res.json()).d.results;
    const byName = new Map(rows.map((f) => [f.InternalName, f]));
    /* Title is what an operator sees and types; InternalName is what SharePoint minted when the
       column was created. They diverge whenever a column was made by hand, and the first custom
       match wins because a list may carry several system fields under one display name. */
    const byTitle = new Map();
    for (const f of rows) {
      if (!isCustom(f)) continue;
      if (!byTitle.has(f.Title)) byTitle.set(f.Title, f);
    }
    return { byName, byTitle };
  };

  /** A field the specification can own: created on this list, not inherited from the base type. */
  const isCustom = (f) => f && f.FromBaseType !== true && f.CanBeDeleted !== false;

  const createField = async (guid, digest, xml) => {
    const res = await send(\`\${site}/_api/web/lists(guid'\${guid}')/fields/createfieldasxml\`, {
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
    if (!res.ok) throw new Error(await detail(res));
  };

  const setIndexed = async (guid, name, digest) => {
    const res = await send(
      \`\${site}/_api/web/lists(guid'\${guid}')/fields/getbyinternalnameortitle('\${encodeURIComponent(name)}')\`,
      {
        method: 'POST',
        headers: {
          Accept: VERBOSE, 'Content-Type': VERBOSE, 'X-RequestDigest': digest,
          'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*',
        },
        body: JSON.stringify({ __metadata: { type: 'SP.Field' }, Indexed: true }),
      },
    );
    if (!res.ok) throw new Error(await detail(res));
  };

  /* A seed is identified by the list's own key field, never by Title, because two of these
     lists legitimately carry repeating titles. Checking the key first is what makes a re-run
     create nothing rather than a second copy. */
  const seedExists = async (guid, keyField, keyValue) => {
    const filter = encodeURIComponent(\`\${keyField} eq '\${String(keyValue).replace(/'/g, "''")}'\`);
    const res = await send(\`\${site}/_api/web/lists(guid'\${guid}')/items?$select=Id&$filter=\${filter}&$top=1\`,
      { headers: { Accept: NOMETA } });
    if (!res.ok) throw new Error(\`checking seed: \${await detail(res)}\`);
    return ((await res.json()).value || []).length > 0;
  };

  const createSeed = async (guid, digest, fields) => {
    const res = await send(\`\${site}/_api/web/lists(guid'\${guid}')/items\`, {
      method: 'POST',
      headers: { Accept: NOMETA, 'Content-Type': NOMETA, 'X-RequestDigest': digest },
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error(await detail(res));
  };

  /* ── run ─────────────────────────────────────────────────────────────────────────────── */

  const ledger = [];
  let createdFields = 0, presentFields = 0, indexedNow = 0, createdSeeds = 0, presentSeeds = 0, failed = 0;

  console.log(
    \`%c\${DRY_RUN ? 'DRY RUN — ' : ''}\${SPEC.totals.fields} columns and \${SPEC.totals.seeds} seed rows across \${SPEC.totals.lists} lists\`,
    'font-weight:bold',
  );
  console.log(\`%c\${site}\`, 'color:#888');

  let digest = null;
  try {
    digest = DRY_RUN ? 'dry-run' : await digestFor();
  } catch (err) {
    console.error(err.message);
    return;
  }

  for (const list of SPEC.lists.sort((a, b) => a.listOrder - b.listOrder)) {
    console.group(\`\${list.listTitle}  (\${list.listGuid})\`);
    let live;
    try {
      live = await liveFields(list.listGuid);
    } catch (err) {
      console.error(err.message);
      failed += list.fields.length + list.seeds.length;
      ledger.push({ list: list.listTitle, item: '(whole list)', action: 'UNREACHABLE', detail: err.message });
      console.groupEnd();
      continue;
    }

    /* specification internal name → the internal name the tenant actually carries. Empty unless
       a column was adopted by display name below; everything downstream reads through it. */
    const adopted = new Map();
    const specNames = new Set(list.fields.map((f) => f.internalName));

    for (const f of list.fields) {
      let existing = live.byName.get(f.internalName);

      /* ADOPTION. The specification's internal name is absent, but a custom column on this list
         already carries its display name — someone created it by hand, and SharePoint minted a
         different internal name.

         DGO_AccessScopes is the case that forced this: its view shows 'Access Scope Id' because
         an operator hit the ScopeId reserved-name collision and worked around it. Creating the
         specification's column beside that one would give the list two columns for one fact, and
         the seeds would populate the empty one. Adopting is the only outcome that leaves the list
         with a single column holding the data.

         A live column is only adoptable if no other specification field claims its internal name,
         or adoption would silently steal a column this run is about to check on its own terms. */
      if (!existing) {
        const byTitle = live.byTitle.get(f.displayName);
        if (byTitle && !specNames.has(byTitle.InternalName)) {
          existing = byTitle;
          adopted.set(f.internalName, byTitle.InternalName);
          ledger.push({
            list: list.listTitle,
            item: f.internalName,
            action: 'ADOPTED',
            detail:
              \`the tenant already carries this column as '\${byTitle.InternalName}' under the display name \`
              + \`'\${f.displayName}'. Using it; no second column is created. Seeds are rewritten onto it.\`,
          });
        }
      }

      /* Name collision with a SharePoint system field. The specification cannot own this name,
         and creating it would fail, so this is reported rather than attempted — and NOT counted
         as present, which is what hid it before. */
      if (existing && !isCustom(existing)) {
        failed++;
        ledger.push({
          list: list.listTitle,
          item: f.internalName,
          action: 'RESERVED NAME',
          detail:
            \`'\${f.internalName}' is a SharePoint system field on this list (FromBaseType=\${existing.FromBaseType}, \`
            + \`CanBeDeleted=\${existing.CanBeDeleted}). The specification's column was never created; any custom \`
            + \`column holding this data has a different internal name. Rename it in the specification.\`,
        });
        continue;
      }

      if (existing) {
        presentFields++;
        /* Index the column SharePoint actually has. An adopted column's internal name is not the
           specification's, and getbyinternalnameortitle would 404 on the specification's. */
        const liveName = existing.InternalName;
        if (f.indexed && existing.Indexed !== true) {
          if (DRY_RUN) {
            ledger.push({ list: list.listTitle, item: liveName, action: 'WOULD INDEX', detail: 'present but not indexed' });
          } else {
            try { await setIndexed(list.listGuid, liveName, digest); indexedNow++;
              ledger.push({ list: list.listTitle, item: liveName, action: 'INDEXED', detail: '' }); }
            catch (err) { failed++; ledger.push({ list: list.listTitle, item: liveName, action: 'INDEX FAILED', detail: err.message }); }
          }
        } else if (!adopted.has(f.internalName)) {
          ledger.push({ list: list.listTitle, item: f.internalName, action: 'present', detail: '' });
        }
        continue;
      }
      if (DRY_RUN) {
        ledger.push({ list: list.listTitle, item: f.internalName, action: 'WOULD CREATE', detail: f.fieldType });
        continue;
      }
      try {
        await createField(list.listGuid, digest, f.schemaXml);
        createdFields++;
        ledger.push({ list: list.listTitle, item: f.internalName, action: 'CREATED', detail: f.fieldType });
        if (f.indexed) {
          try { await setIndexed(list.listGuid, f.internalName, digest); indexedNow++; }
          catch (err) { failed++; ledger.push({ list: list.listTitle, item: f.internalName, action: 'INDEX FAILED', detail: err.message }); }
        }
      } catch (err) {
        failed++;
        ledger.push({ list: list.listTitle, item: f.internalName, action: 'FAILED', detail: err.message });
      }
    }

    for (const s of list.seeds) {
      /* Read and write through the adoption map. A seed that filters or writes on the
         specification's internal name after a column was adopted under a different one either
         500s on the filter or writes into a column that does not exist. */
      const keyField = adopted.get(s.keyField) ?? s.keyField;
      const fields = {};
      for (const [k, v] of Object.entries(s.fields)) fields[adopted.get(k) ?? k] = v;

      let exists;
      try {
        exists = await seedExists(list.listGuid, keyField, s.keyValue);
      } catch (err) {
        failed++;
        ledger.push({ list: list.listTitle, item: \`seed \${s.seedId}\`, action: 'CHECK FAILED', detail: err.message });
        continue;
      }
      if (exists) {
        presentSeeds++;
        ledger.push({ list: list.listTitle, item: \`seed \${keyField}=\${s.keyValue}\`, action: 'present', detail: '' });
        continue;
      }
      if (DRY_RUN) {
        ledger.push({ list: list.listTitle, item: \`seed \${keyField}=\${s.keyValue}\`, action: 'WOULD SEED', detail: '' });
        continue;
      }
      try {
        await createSeed(list.listGuid, digest, fields);
        createdSeeds++;
        ledger.push({ list: list.listTitle, item: \`seed \${keyField}=\${s.keyValue}\`, action: 'SEEDED', detail: '' });
      } catch (err) {
        failed++;
        ledger.push({ list: list.listTitle, item: \`seed \${keyField}=\${s.keyValue}\`, action: 'SEED FAILED', detail: err.message });
      }
    }
    console.groupEnd();
  }

  console.table(ledger);
  console.log(
    \`%c\${DRY_RUN ? 'DRY RUN. Nothing was changed. ' : ''}\` +
    \`fields: \${createdFields} created, \${presentFields} already present, \${indexedNow} indexed  ·  \` +
    \`seeds: \${createdSeeds} created, \${presentSeeds} already present  ·  \${failed} failed\`,
    failed ? 'color:#b00;font-weight:bold' : 'font-weight:bold',
  );

  /* WHICH list failed, not just how many rows. A count at the end of a 107-row table sends the
     operator hunting; naming the list and quoting the server's own words does not. Every
     failure observed so far has been one list failing every operation that touches its item
     store, which is a tenant condition — so the summary says that plainly rather than leaving
     it to look like a script fault. */
  const failing = ledger.filter((r) => /FAILED|UNREACHABLE/.test(r.action));
  if (failing.length) {
    const byList = new Map();
    for (const r of failing) {
      if (!byList.has(r.list)) byList.set(r.list, []);
      byList.get(r.list).push(r);
    }
    console.group('%cLists with failures — read this before re-running', 'color:#b00;font-weight:bold');
    for (const [list, rows] of byList) {
      const spec = SPEC.lists.find((l) => l.listTitle === list);
      console.group(\`\${list}  (\${spec ? spec.listGuid : 'unknown guid'})\`);
      for (const r of rows) console.log(\`\${r.action}: \${r.item} — \${r.detail}\`);
      const itemStore = rows.every((r) => /INDEX FAILED|CHECK FAILED|SEED FAILED|UNREACHABLE/.test(r.action));
      if (itemStore) {
        console.log(
          '%cEvery failure here touches the list\\'s ITEM STORE, and its columns read back fine. '
          + 'That is a broken list in the tenant, not a fault in this script — re-running will not '
          + 'change it. Open the list in the browser and check whether it loads at all.',
          'color:#b00',
        );
      }
      console.groupEnd();
    }
    console.groupEnd();
    console.log(
      \`%c\${byList.size} of \${SPEC.totals.lists} list(s) failed. The other \${SPEC.totals.lists - byList.size} are complete.\`,
      'font-weight:bold',
    );
  }
  if (DRY_RUN) console.log('%cSet DRY_RUN = false at the top of this file and paste again to apply.', 'font-weight:bold');
  else if (!failed) console.log('%cRe-run this file to verify: everything should report "present".', 'color:#080');
${relayBlock("provision-governance-lists.browser.js", "DRY_RUN ? 'dry-run' : 'apply'", "site")}
})();
`;

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;

console.log('\nGovernance browser provisioner\n');
console.log(`  site     ${SITE}`);
console.log(`  lists    ${payload.totals.lists}, addressed by GUID`);
console.log(`  columns  ${payload.totals.fields}  (${payload.totals.indexed} indexed)`);
console.log(`  seeds    ${payload.totals.seeds}`);
console.log(`  leaves   ${registry.retire.length} duplicate instance(s) untouched\n`);

if (CHECK) {
  if (previous !== emitted) fail(`${path.relative(ROOT, OUT)} has drifted. Run: npm run governance:provisioner`);
  console.log(`  ✅ ${path.relative(ROOT, OUT)} is current\n`);
  process.exit(0);
}

fs.writeFileSync(OUT, emitted);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)} — ${(emitted.length / 1024).toFixed(0)} KB, dry-run by default\n`);
