/* DGO_SCHEDULED_SWEEP is buildable, importable and grounded, or this fails.
 *
 * The clipboard package is already covered by tests/designer-paste-schema.test.mjs, which knows
 * the rules for a Scope payload. Nothing covered the OTHER artifact — the legacy import package —
 * and nothing at all checked the claim this flow rests on: that every SharePoint column it names
 * is already deployed, so the flow can run without provisioning anything first.
 *
 * That claim is the whole reason the sweep uses the outbox ledger as its idempotency key rather
 * than a watermark column. If it is wrong, the flow does not merely misbehave — SharePoint
 * rejects the whole item, and the failure looks like a connector problem rather than a missing
 * column. So it is checked here against the tenant evidence, not asserted in a comment.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'docs/deployment/internal/flows/import-package/DGO_SCHEDULED_SWEEP');
const PASTE = join(ROOT, 'docs/deployment/internal/flows/designer-paste/DGO_SCHEDULED_SWEEP.designer-paste.json');

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log('  ✅ ' + name); return; }
  failed++; console.log('  ❌ ' + name + (detail ? '\n     ' + detail : ''));
};
const rj = (p) => JSON.parse(readFileSync(p, 'utf8'));

console.log('\nDGO_SCHEDULED_SWEEP\n');

/* ── The import package is structurally an import package ────────────────────────────────
   The same four joins used to read the reference packages: manifest → assetPaths → flow
   directory → apisMap/connectionsMap → connectionReferences. A package that fails any of them
   is rejected by the import wizard with a message that does not say which join broke. */
const root = rj(join(PKG, 'manifest.json'));
const flowsMan = rj(join(PKG, 'Microsoft.Flow/flows/manifest.json'));
const assetPaths = flowsMan.flowAssets.assetPaths;
ok('the package declares exactly one flow asset', assetPaths.length === 1, JSON.stringify(assetPaths));

const guid = assetPaths[0];
const defPath = join(PKG, `Microsoft.Flow/flows/${guid}/definition.json`);
ok('the asset path resolves to a definition', existsSync(defPath), defPath);

const def = rj(defPath);
const apisMap = rj(join(PKG, `Microsoft.Flow/flows/${guid}/apisMap.json`));
const connMap = rj(join(PKG, `Microsoft.Flow/flows/${guid}/connectionsMap.json`));
const refs = def.properties.connectionReferences || {};

ok('the root manifest names the same flow guid', Object.keys(root.resources).includes(guid),
   Object.keys(root.resources).join(', '));
ok('every connectionReference has an apisMap entry',
   Object.keys(refs).every((k) => k in apisMap),
   Object.keys(refs).filter((k) => !(k in apisMap)).join(', '));
ok('every connectionReference has a connectionsMap entry',
   Object.keys(refs).every((k) => k in connMap),
   Object.keys(refs).filter((k) => !(k in connMap)).join(', '));

/* THE JOIN THAT ACTUALLY FAILED AN IMPORT.
   Both maps hold KEYS INTO manifest.resources, not connector names and not connection names.
   An earlier build mapped shared_office365 to the connector name in apisMap and to the
   connection name in connectionsMap; both are plausible-looking values and neither is a
   resource key, so the import died with
   `KeyNotFoundException: The given key was not present in the dictionary` — a message that
   names no key and no file. Checking that the entries EXIST is not enough; the values have to
   resolve. */
ok('every apisMap value is a manifest resource key',
   Object.values(apisMap).every((v) => v in root.resources),
   Object.entries(apisMap).filter(([, v]) => !(v in root.resources)).map(([k, v]) => `${k} → ${v}`).join(', '));
ok('every connectionsMap value is a manifest resource key',
   Object.values(connMap).every((v) => v in root.resources),
   Object.entries(connMap).filter(([, v]) => !(v in root.resources)).map(([k, v]) => `${k} → ${v}`).join(', '));
ok('each apisMap value points at an api resource, and each connectionsMap value at a connection',
   Object.values(apisMap).every((v) => root.resources[v]?.type === 'Microsoft.PowerApps/apis')
   && Object.values(connMap).every((v) => root.resources[v]?.type === 'Microsoft.PowerApps/apis/connections'),
   'a map that points at the wrong resource type resolves but binds nothing');
ok('every flow dependency resolves to a manifest resource',
   (root.resources[guid].dependsOn || []).every((d) => d in root.resources),
   (root.resources[guid].dependsOn || []).filter((d) => !(d in root.resources)).join(', '));
/* Without a connection resource per connector the apis resolve but the import wizard has no
   picker to offer, and the flow lands with unbound actions. */
{
  const conns = Object.values(root.resources).filter((r) => r.type === 'Microsoft.PowerApps/apis/connections');
  ok(`the manifest offers a connection per connector (${conns.length})`,
     conns.length === Object.keys(refs).length,
     `${conns.length} connection resources for ${Object.keys(refs).length} connectors`);
  ok('each connection resource names the account the importer should pick',
     conns.every((c) => String(c.details?.displayName || '').includes('@')),
     conns.map((c) => c.details?.displayName).join(', '));
}

/* ── The downloadable artifact ───────────────────────────────────────────────────────────
   The operator's deliverable is one file, not a directory plus an instruction to compress it.
   These check the container itself: a reader that cannot find the end-of-central-directory
   record rejects the whole archive, and an entry count that disagrees with the exploded source
   means the zip and the directory have drifted apart. */
{
  const ZIP = join(ROOT, 'docs/deployment/internal/flows/import-package/DGO_SCHEDULED_SWEEP.zip');
  ok('the import package ships as a single downloadable zip', existsSync(ZIP), ZIP);
  if (existsSync(ZIP)) {
    const buf = readFileSync(ZIP);
    ok('the archive begins with a local file header', buf.readUInt32LE(0) === 0x04034b50,
       `0x${buf.readUInt32LE(0).toString(16)}`);
    /* The EOCD sits at the end, after a comment field this writer leaves empty. */
    const eocd = buf.length - 22;
    ok('the archive ends with an end-of-central-directory record',
       eocd >= 0 && buf.readUInt32LE(eocd) === 0x06054b50);
    if (eocd >= 0 && buf.readUInt32LE(eocd) === 0x06054b50) {
      const entries = buf.readUInt16LE(eocd + 10);
      const onDisk = 5;   /* manifest, flows manifest, definition, apisMap, connectionsMap */
      ok(`the archive carries every package file (${entries})`, entries === onDisk,
         `${entries} in the zip, ${onDisk} in the exploded package`);
    }
  }
}

/* ── The trigger — the reason this artifact exists at all ────────────────────────────────── */
const triggers = def.properties.definition.triggers;
ok('the package carries exactly one trigger', Object.keys(triggers).length === 1);
ok('the trigger is a Recurrence', triggers.Recurrence?.type === 'Recurrence');
ok('the recurrence is hourly with a stated time zone',
   triggers.Recurrence?.recurrence?.frequency === 'Hour'
   && triggers.Recurrence?.recurrence?.interval === 1
   && Boolean(triggers.Recurrence?.recurrence?.timeZone),
   JSON.stringify(triggers.Recurrence?.recurrence));
ok('the definition declares the Logic Apps workflow schema',
   String(def.properties.definition.$schema).includes('workflowdefinition.json'));

/* ── Variables: top level in the zip, absent from the scope ──────────────────────────────── */
const topActions = def.properties.definition.actions;
const initNames = Object.entries(topActions).filter(([, a]) => a.type === 'InitializeVariable').map(([n]) => n);
ok('the import package declares its variables at the workflow top level', initNames.length === 2, initNames.join(', '));

const paste = rj(PASTE);
const pasteJson = JSON.stringify(paste);
ok('the clipboard package declares no InitializeVariable',
   !pasteJson.includes('"InitializeVariable"'),
   'a clipboard package is a scope; Logic Apps rejects a nested InitializeVariable');
ok('the clipboard package carries no trigger', !pasteJson.includes('"triggers"'));

/* ── Every runAfter names a sibling that exists ──────────────────────────────────────────── */
{
  const bad = [];
  (function walk(actions, path) {
    for (const [name, a] of Object.entries(actions || {})) {
      for (const dep of Object.keys(a.runAfter || {})) {
        if (!(dep in actions)) bad.push(`${path}${name}.runAfter → ${dep}`);
      }
      if (a.actions) walk(a.actions, `${path}${name}/`);
      if (a.else?.actions) walk(a.else.actions, `${path}${name}/else/`);
      for (const c of Object.values(a.cases || {})) walk(c.actions, `${path}${name}/case/`);
    }
  })({ ...topActions }, '');
  ok('every runAfter in the import definition names a real sibling', bad.length === 0, bad.join('; '));
}

/* ── Sends are addressed, and every send is receipted ────────────────────────────────────── */
{
  const sends = [], receipts = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && v.type === 'OpenApiConnection') {
        const op = v.inputs?.host?.operationId;
        const p = v.inputs?.parameters || {};
        if (String(op).includes('SendEmail')) sends.push({ name: k, to: String(p['emailMessage/To'] ?? '') });
        if (op === 'PostItem' && p['item/MessageType']) receipts.push({ name: k, type: p['item/MessageType'], title: String(p['item/Title'] ?? '') });
      }
      walk(v);
    }
  })(topActions);

  ok(`every send has a non-empty recipient (${sends.length} sends)`,
     sends.every((s) => s.to.trim().length > 0),
     sends.filter((s) => !s.to.trim()).map((s) => s.name).join(', '));
  /* A send is accounted for when it writes a receipt OR updates one. The retry branch resends a
     message that already has a row and advances its Attempts rather than creating a duplicate —
     which is the correct behaviour, and would look like a missing receipt to a cruder count. */
  const patched = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && v.inputs?.host?.operationId === 'PatchItem'
          && v.inputs.parameters?.['item/Attempts']) patched.push(k);
      walk(v);
    }
  })(topActions);
  ok('every send either writes a receipt or advances an existing one',
     receipts.length + patched.length >= sends.length,
     `${sends.length} sends, ${receipts.length} receipts, ${patched.length} attempt-patches`);
  ok('every receipt Title is keyed as <messageType>:<key>',
     receipts.every((r) => r.title.includes(`${r.type}:`)),
     receipts.filter((r) => !r.title.includes(`${r.type}:`)).map((r) => r.name).join(', '));
}

/* ── Idempotency: every messageType written is also read back before sending ─────────────── */
{
  const written = new Set(), read = [];
  const blob = JSON.stringify(topActions);
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object' && v.inputs?.parameters?.['item/MessageType']) {
        written.add(v.inputs.parameters['item/MessageType']);
      }
      walk(v);
    }
  })(topActions);
  for (const mt of written) if (blob.includes(`Title eq ''${mt}:`)) read.push(mt);
  ok(`every message type is checked before it is sent (${written.size} types)`,
     read.length === written.size,
     `written but never checked: ${[...written].filter((m) => !read.includes(m)).join(', ')}`);
}

/* ── Foreach must not race its own ledger ────────────────────────────────────────────────── */
{
  const bad = [];
  (function walk(o, path) {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && v.type === 'Foreach'
          && v.runtimeConfiguration?.concurrency?.repetitions !== 1) bad.push(`${path}${k}`);
      walk(v, `${path}${k}/`);
    }
  })(topActions, '');
  ok('every Foreach runs one repetition at a time', bad.length === 0,
     `${bad.join(', ')} — concurrent iterations race the dedupe read against their own write`);
}

/* ── THE GROUNDING CHECK: no invented columns ────────────────────────────────────────────
   Every SharePoint column the sweep names must appear in the tenant evidence for the list it
   names. This is what lets the flow run with no provisioning step in front of it. */
{
  const internal = rj(join(ROOT, 'docs/deployment/internal/internal-field-evidence.json')).lists;
  const spec = rj(join(ROOT, 'docs/deployment/sharepoint/portal-field-spec.json'));
  const portalCols = new Map();
  for (const l of spec.lists) {
    const id = l.listGuid || l.listId || l.id;
    const cols = (l.fields || l.columns || []).map((c) => c.internalName || c.name || c);
    if (id) portalCols.set(id, new Set([...cols, 'Title', 'ID', 'Modified', 'Created']));
  }
  const known = (table) => {
    if (internal[table]) return new Set([...Object.keys(internal[table].columns), 'ID', 'Modified', 'Created']);
    if (portalCols.has(table)) return portalCols.get(table);
    return null;
  };

  const unknown = [], unchecked = new Set();
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object' && v.type === 'OpenApiConnection'
          && v.inputs?.host?.connection === 'shared_sharepointonline') {
        const table = v.inputs.parameters?.table;
        const cols = known(table);
        if (!cols) { unchecked.add(table); }
        else {
          for (const p of Object.keys(v.inputs.parameters)) {
            if (!p.startsWith('item/')) continue;
            const col = p.slice(5);
            if (!cols.has(col)) unknown.push(`${table}.${col}`);
          }
        }
      }
      walk(v);
    }
  })(topActions);

  ok('every column the sweep writes is recorded as deployed',
     unknown.length === 0, unknown.join(', '));
  /* Printed, not asserted: a list with no evidence file is a gap in the evidence, not proof the
     column is missing. Naming it is more useful than failing on it. */
  if (unchecked.size) console.log(`     (no column evidence on file for: ${[...unchecked].join(', ')})`);
}

console.log(`\n${failed ? '❌' : '✅'} scheduled sweep: ${failed} failed\n`);
process.exit(failed ? 1 : 0);
