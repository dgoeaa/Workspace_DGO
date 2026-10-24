#!/usr/bin/env node
/**
 * Emit the browser provisioner for GOVERNANCE-TENANT-RUNBOOK.md Step 5 — the HTTP flow registry lists.
 *
 * HOW THIS DIFFERS FROM THE STEP 2 PROVISIONER, AND WHY IT MATTERS
 *
 * Step 2's ten governance lists already existed; that provisioner only ever adds columns and seed
 * rows, and every address in it is a GUID captured from the tenant. The registry lists do NOT
 * exist. Something has to create them, and a list that does not exist has no GUID to address —
 * so creation is unavoidably by title.
 *
 * That is precisely the operation that produced GOV-02: a title-based create run twice leaves
 * `DGO_AuditLog` and `DGO_AuditLog_2`, and a flow writing one while another reads the other both
 * succeed and neither sees the other. So the title is used exactly once, to ask whether the list
 * is already there:
 *
 *   1. GET the list by title. If it exists, take its GUID and create nothing.
 *   2. Only if it 404s, POST to create it — then read back the GUID it was given.
 *   3. Everything after that — every column, every index — addresses the GUID.
 *
 * A re-run therefore finds the list and adds nothing, which is the property GOV-02 was missing.
 * The GUIDs it reports are what must go into docs/reference/governance-list-registry.json
 * afterwards, so the repository stops describing these lists as unprovisioned.
 *
 * SCOPE. Derived from the corrected flow definitions by
 * scripts/lib/registry-provisioning-scope.mjs — every list those flows read or write, plus the
 * configuration list they read their parameters from. Anything outside that set is deferred and
 * is not emitted here: a provisioner that creates more than the flows need is how a deferral
 * quietly becomes a deployment, and a provisioner that creates fewer is how a runbook ends up
 * telling an operator to exercise a flow against a list that does not exist.
 *
 *   npm run governance:registryprovisioner
 *   npm run governance:registryprovisioner -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relayBlock } from './lib/browser-relay.mjs';
import { provisioningScope } from './lib/registry-provisioning-scope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, 'docs/reference/http-flow-registry-spec.json');
const REGISTRY = path.join(ROOT, 'docs/reference/governance-list-registry.json');
const OUT = path.join(ROOT, 'scripts/provision-flow-registry-lists.browser.js');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));

const SITE = spec.registry?.targetSite;
if (!SITE) fail('the registry spec declares no targetSite');
if (SITE !== registry.decision.authoritativeSite) {
  fail(`the registry spec targets ${SITE}, but GOV-01 made ${registry.decision.authoritativeSite} authoritative`);
}

/* The runbook's Step 5 scope, derived — not declared. A copy of this list also lived in the
   runbook generator and in the walkthrough generator, and all three drifted from the flows that
   actually need the lists. scripts/lib/registry-provisioning-scope.mjs is now the one place it
   is worked out; see the note at the top of that file for what the drift cost. */
const correctedDir = path.join(ROOT, 'docs/deployment/governance/flows');
const corrections = fs.existsSync(correctedDir)
  ? fs.readdirSync(correctedDir).filter((f) => f.endsWith('.corrected.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(correctedDir, f), 'utf8')))
  : [];
if (!corrections.length) fail('no corrected flow definitions found; the Step 5 scope cannot be derived');
let PROVISION_NOW;
try {
  ({ provisionNow: PROVISION_NOW } = provisioningScope({ spec, corrections }));
} catch (err) {
  fail(err.message);
}

const yes = (v) => String(v).trim().toLowerCase() === 'yes' || v === true;

const lists = PROVISION_NOW.map((title) => {
  const l = (spec.lists || []).find((x) => x.listTitle === title);
  if (!l) fail(`${title} is not in the registry specification`);
  const fields = (spec.fields || [])
    .filter((f) => f.listTitle === title)
    .map((f) => ({
      internalName: f.internalName,
      displayName: f.displayName,
      fieldType: f.expectedTypeAsString,
      required: yes(f.required),
      indexed: yes(f.indexed),
      unique: yes(f.unique),
      schemaXml: f.schemaXml,
    }));
  if (!fields.length) fail(`${title} declares no fields`);
  const missingXml = fields.filter((f) => !f.schemaXml).map((f) => f.internalName);
  if (missingXml.length) fail(`${title}: ${missingXml.length} field(s) carry no schemaXml: ${missingXml.join(', ')}`);
  if (fields.length !== l.customFieldCount) {
    fail(`${title}: the spec declares customFieldCount ${l.customFieldCount} but carries ${fields.length} field rows`);
  }
  /* A unique column must also be indexed — SharePoint refuses EnforceUniqueValues otherwise, and
     a provisioner that sets them in the wrong order reports a failure it caused itself. */
  const uniqueNotIndexed = fields.filter((f) => f.unique && !f.indexed).map((f) => f.internalName);
  if (uniqueNotIndexed.length) {
    fail(`${title}: ${uniqueNotIndexed.join(', ')} declared unique but not indexed — SharePoint requires both`);
  }
  return {
    listTitle: title,
    description: l.description,
    baseTemplate: l.baseTemplate,
    uniqueKey: l.uniqueKey,
    versioning: yes(l.versioningEnabled),
    fields,
  };
});

const totals = {
  lists: lists.length,
  fields: lists.reduce((n, l) => n + l.fields.length, 0),
  indexed: lists.reduce((n, l) => n + l.fields.filter((f) => f.indexed).length, 0),
  unique: lists.reduce((n, l) => n + l.fields.filter((f) => f.unique).length, 0),
};

const deferred = (spec.lists || [])
  .map((l) => l.listTitle)
  .filter((t) => !PROVISION_NOW.includes(t));

const emitted = `/* GENERATED FILE — do not edit by hand.
 * Built from docs/reference/http-flow-registry-spec.json by
 * scripts/build-flow-registry-provisioner.mjs. Edit the specification and re-run.
 */
/*
 * GOVERNANCE-TENANT-RUNBOOK.md Step 5 — provision the HTTP flow registry lists that the decision
 * authorised. Browser console; no PowerShell.
 *
 *   ${totals.lists} lists · ${totals.fields} columns · ${totals.indexed} indexed · ${totals.unique} unique
 *   on ${SITE}
 *
${deferred.length
  ? ` * DEFERRED, AND NOT CREATED BY THIS FILE — ${deferred.length} list(s):\n`
    + deferred.map((t) => ` *   ${t}`).join('\n')
    + '\n *   No corrected flow reads or writes these. If one starts to, the scope moves on the next\n'
    + ' *   build — the set is derived, not listed here.'
  : ' * NOTHING IS DEFERRED. Every list in the specification is either read or written by a\n'
    + ' *   corrected flow, or is the configuration list those flows read their parameters from.'}
 *   A provisioner that creates more than the flows need is how a deferral quietly becomes a
 *   deployment; one that creates fewer is how a runbook ends up telling an operator to exercise
 *   a flow against a list that does not exist. Either way, do not edit this file — the scope
 *   comes from scripts/lib/registry-provisioning-scope.mjs.
 *
 * WHY THIS ONE CREATES LISTS, AND WHY THAT IS THE RISKY PART
 *   Step 2's ten lists already existed, so that provisioner addresses every one by a GUID
 *   captured from the tenant. These three do not exist, and a list that does not exist has no
 *   GUID — so creation is unavoidably by title.
 *
 *   That is exactly the operation that produced GOV-02: a title-based create run twice leaves
 *   DGO_AuditLog and DGO_AuditLog_2, and a flow writing one while another reads the other both
 *   succeed while neither sees the other. So the title is used ONCE, to ask whether the list is
 *   already there:
 *
 *     1. GET the list by title. If it exists, take its GUID and create nothing.
 *     2. Only on 404, POST to create it — then read back the GUID SharePoint assigned.
 *     3. Every column and every index after that addresses the GUID.
 *
 *   Run it twice and the second run creates nothing. That is the property GOV-02 was missing.
 *
 * WHAT TO DO WITH THE OUTPUT
 *   It prints the GUID of each list. Those GUIDs must be recorded in
 *   docs/reference/governance-list-registry.json, or the repository goes on describing these
 *   lists as unprovisioned while the tenant has them.
 *
 * HOW TO RUN
 *   1. Sign in and open any page on
 *      ${SITE}
 *   2. F12 → Console.
 *   3. Paste. It reports what it WOULD do and changes nothing.
 *   4. Read the table. Then set DRY_RUN to false and paste again.
 *
 * PERMISSION REQUIRED
 *   Manage Lists on ${SITE.split('/sites/')[1]}. Site Owner is enough.
 */

const DRY_RUN = true;

const SITE = ${JSON.stringify(SITE)};
const SPEC = ${JSON.stringify({ totals, lists }, null, 2)};

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

  /** The one title lookup. Returns the GUID, or null when the list is genuinely absent. */
  const findByTitle = async (title) => {
    const res = await send(
      \`\${SITE}/_api/web/lists/getbytitle('\${encodeURIComponent(title)}')?$select=Id,Title,ItemCount\`,
      { headers: { Accept: NOMETA } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await detail(res));
    const body = await res.json();
    return { guid: body.Id, itemCount: body.ItemCount };
  };

  const createList = async (digest, l) => {
    const res = await send(\`\${SITE}/_api/web/lists\`, {
      method: 'POST',
      headers: { Accept: NOMETA, 'Content-Type': NOMETA, 'X-RequestDigest': digest },
      body: JSON.stringify({
        BaseTemplate: l.baseTemplate,
        Title: l.listTitle,
        Description: l.description || '',
        AllowContentTypes: true,
        ContentTypesEnabled: false,
        EnableVersioning: l.versioning === true,
      }),
    });
    if (!res.ok) throw new Error(await detail(res));
    return (await res.json()).Id;
  };

  const liveFields = async (guid) => {
    const res = await send(
      \`\${SITE}/_api/web/lists(guid'\${guid}')/fields?$select=InternalName,Title,Indexed,FromBaseType,CanBeDeleted&$top=500\`,
      { headers: { Accept: NOMETA } });
    if (!res.ok) throw new Error(\`reading fields: \${await detail(res)}\`);
    return new Map(((await res.json()).value || []).map((f) => [f.InternalName, f]));
  };

  /* A field inherited from the base type is SharePoint's, not the specification's. Counting one
     as present is the false positive that cost the 2026-09-09 run — see GOV-08. */
  const isCustom = (f) => f && f.FromBaseType !== true && f.CanBeDeleted !== false;

  const createField = async (guid, digest, xml) => {
    const res = await send(\`\${SITE}/_api/web/lists(guid'\${guid}')/fields/createfieldasxml\`, {
      method: 'POST',
      headers: { Accept: VERBOSE, 'Content-Type': VERBOSE, 'X-RequestDigest': digest },
      body: JSON.stringify({
        parameters: {
          __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' },
          SchemaXml: xml,
          /* 8 = AddFieldInternalNameHint (take the internal name from the Name attribute),
             16 = AddFieldToDefaultView */
          Options: 24,
        },
      }),
    });
    if (!res.ok) throw new Error(await detail(res));
  };

  /* Indexed and unique are one MERGE, in that order within the same body: SharePoint refuses
     EnforceUniqueValues on a column that is not indexed. */
  const setIndexing = async (guid, digest, name, { indexed, unique }) => {
    const body = { __metadata: { type: 'SP.Field' } };
    if (indexed) body.Indexed = true;
    if (unique) body.EnforceUniqueValues = true;
    const res = await send(
      \`\${SITE}/_api/web/lists(guid'\${guid}')/fields/getbyinternalnameortitle('\${encodeURIComponent(name)}')\`,
      {
        method: 'POST',
        headers: {
          Accept: VERBOSE, 'Content-Type': VERBOSE, 'X-RequestDigest': digest,
          'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) throw new Error(await detail(res));
  };

  /* ── run ─────────────────────────────────────────────────────────────────────────────── */

  const ledger = [];
  const guids = [];
  let createdLists = 0, createdFields = 0, presentFields = 0, indexedNow = 0, failed = 0;

  console.log(
    \`%c\${DRY_RUN ? 'DRY RUN — ' : ''}\${SPEC.totals.lists} list(s), \${SPEC.totals.fields} column(s), \${SPEC.totals.indexed} indexed, \${SPEC.totals.unique} unique\`,
    'font-weight:bold;font-size:13px',
  );
  console.log(\`%c\${SITE}\`, 'color:#888');

  let digest = null;
  try { digest = DRY_RUN ? 'dry-run' : await digestFor(); }
  catch (err) { console.error(err.message); return; }

  for (const l of SPEC.lists) {
    console.group(l.listTitle);
    let guid = null;

    try {
      const existing = await findByTitle(l.listTitle);
      if (existing) {
        guid = existing.guid;
        ledger.push({ list: l.listTitle, item: '(list)', action: 'present', detail: \`\${guid} · \${existing.itemCount} item(s)\` });
      } else if (DRY_RUN) {
        ledger.push({ list: l.listTitle, item: '(list)', action: 'WOULD CREATE', detail: \`BaseTemplate \${l.baseTemplate}\` });
        for (const f of l.fields) {
          ledger.push({ list: l.listTitle, item: f.internalName, action: 'WOULD CREATE', detail: f.fieldType });
        }
        console.groupEnd();
        continue;
      } else {
        guid = await createList(digest, l);
        createdLists++;
        ledger.push({ list: l.listTitle, item: '(list)', action: 'CREATED', detail: guid });
      }
    } catch (err) {
      failed++;
      ledger.push({ list: l.listTitle, item: '(list)', action: 'FAILED', detail: err.message });
      console.groupEnd();
      continue;
    }

    guids.push({ listTitle: l.listTitle, listGuid: guid, uniqueKey: l.uniqueKey });

    let live;
    try { live = await liveFields(guid); }
    catch (err) {
      failed++;
      ledger.push({ list: l.listTitle, item: '(fields)', action: 'UNREADABLE', detail: err.message });
      console.groupEnd();
      continue;
    }

    for (const f of l.fields) {
      const existing = live.get(f.internalName);

      if (existing && !isCustom(existing)) {
        failed++;
        ledger.push({
          list: l.listTitle, item: f.internalName, action: 'RESERVED NAME',
          detail: \`'\${f.internalName}' is a SharePoint system field here (FromBaseType=\${existing.FromBaseType}). \`
            + 'The specification cannot own this name — rename it there.',
        });
        continue;
      }

      if (existing) {
        presentFields++;
        if ((f.indexed && existing.Indexed !== true) || f.unique) {
          if (DRY_RUN) {
            ledger.push({ list: l.listTitle, item: f.internalName, action: 'WOULD INDEX', detail: f.unique ? 'indexed + unique' : 'indexed' });
          } else {
            try { await setIndexing(guid, digest, f.internalName, f); indexedNow++; }
            catch (err) { failed++; ledger.push({ list: l.listTitle, item: f.internalName, action: 'INDEX FAILED', detail: err.message }); }
          }
        } else {
          ledger.push({ list: l.listTitle, item: f.internalName, action: 'present', detail: '' });
        }
        continue;
      }

      if (DRY_RUN) {
        ledger.push({ list: l.listTitle, item: f.internalName, action: 'WOULD CREATE', detail: f.fieldType });
        continue;
      }

      try {
        await createField(guid, digest, f.schemaXml);
        createdFields++;
        ledger.push({ list: l.listTitle, item: f.internalName, action: 'CREATED', detail: f.fieldType });
        if (f.indexed || f.unique) {
          try { await setIndexing(guid, digest, f.internalName, f); indexedNow++; }
          catch (err) { failed++; ledger.push({ list: l.listTitle, item: f.internalName, action: 'INDEX FAILED', detail: err.message }); }
        }
      } catch (err) {
        failed++;
        ledger.push({ list: l.listTitle, item: f.internalName, action: 'FAILED', detail: err.message });
      }
    }
    console.groupEnd();
  }

  console.table(ledger);
  console.log(
    \`%c\${DRY_RUN ? 'DRY RUN. Nothing was changed. ' : ''}\`
    + \`lists: \${createdLists} created · columns: \${createdFields} created, \${presentFields} present, \${indexedNow} indexed · \${failed} failed\`,
    failed ? 'color:#b00;font-weight:bold' : 'font-weight:bold',
  );

  if (guids.length) {
    console.log('%cRECORD THESE GUIDs — the repository still calls these lists unprovisioned without them:', 'font-weight:bold');
    console.table(guids);
    console.log(JSON.stringify(guids, null, 2));
  }

  if (DRY_RUN) {
    console.log('%cSet DRY_RUN = false at the top of this file and paste again to apply.', 'font-weight:bold');
  } else if (!failed) {
    console.log('%cRe-run this file to verify: every row should read "present" and 0 created.', 'color:#080;font-weight:bold');
  }
${relayBlock("provision-flow-registry-lists.browser.js", "DRY_RUN ? 'dry-run' : 'apply'", "SITE")}
})();
`;

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

console.log('\nHTTP flow registry provisioner (Step 5, browser)\n');
console.log(`  site       ${SITE}`);
console.log(`  provision  ${totals.lists} list(s), ${totals.fields} column(s), ${totals.indexed} indexed, ${totals.unique} unique`);
for (const l of lists) console.log(`               ${l.listTitle.padEnd(36)} ${String(l.fields.length).padStart(2)} fields · key ${l.uniqueKey}`);
console.log(`  deferred   ${deferred.length}: ${deferred.join(', ')}\n`);

if (CHECK) {
  if (emitted !== previous) fail('the registry provisioner is stale. Run: npm run governance:registryprovisioner');
  console.log('  ✅ the registry provisioner matches the specification\n');
  process.exit(0);
}

fs.writeFileSync(OUT, emitted);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)} — ${Math.round(emitted.length / 1024)} KB, dry-run by default\n`);
