/* Reading a Power Automate definition: the one place that knows how an export is shaped and
 * where a SharePoint reference hides inside it.
 *
 * Two callers need this - scripts/flow-list-sweep.mjs, which asks what every flow touches, and
 * scripts/verify-portal-wiring.mjs, which asks whether a named flow performs a named operation
 * on a named list. If each carried its own reader they would answer differently the first time
 * an export arrived in a shape only one of them knew, and the disagreement would look like a
 * finding rather than a bug.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report', 'dist', '.playwright']);

/* ── discovery ──────────────────────────────────────────────────────────────────────────
 * A Power Automate export is recognised by its shape, not by where it sits or what it is
 * called. The corpus in docs/reference/foundational/ holds definitions under four different
 * naming conventions across three directories; matching on shape finds all of them, and finds
 * the next one too without this file being edited. */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.json')) out.push(p);
  }
  return out;
}

/* An export wraps the workflow differently depending on how it was taken: Code view gives the
 * definition bare, the management API nests it under properties.definition, this repository's
 * own .flow.json files put it under a top-level definition key, and the tenant's own capture
 * harness (telemetry_kind "flow_run_record") buries it under design_definition.definition
 * inside a full run trace. All four appear in this tree, so all four are read — a wrapper this
 * reader does not know is a flow that silently does not count toward coverage. */
function definitionRoot(doc) {
  for (const c of [doc?.definition, doc?.properties?.definition, doc?.design_definition?.definition, doc]) {
    if (c && typeof c === 'object' && c.actions && typeof c.actions === 'object') return c;
  }
  return null;
}

/* Every flow_run_record states the flow's own workflow id and display name. That is the flow
 * identifying itself, which beats any attribution made from a filename or a labelled URL —
 * so where it is present it is what the register is checked against. */
function identity(doc) {
  const wi = doc?.workflow_identity;
  const fromCapture = typeof wi?.full_resource_id === 'string' ? wi.full_resource_id.split('/').pop() : null;
  const displayName = wi?.tags?.flowDisplayName || doc?.design_definition?.display_name || null;
  const fromName = typeof doc?.name === 'string' && /^[a-f0-9]{32}$/i.test(doc.name.replace(/-/g, '')) ? doc.name : null;
  return {
    /* The 32-hex id from a signed trigger URL. Deliberately NOT the internal name, which is a
     * dashed GUID naming the same flow through a different scheme — the register is keyed on
     * trigger ids, so conflating the two would make every cross-check compare unlike things. */
    workflowId: (fromCapture && /^[a-f0-9]{32}$/i.test(fromCapture) ? fromCapture : null) || fromName,
    internalName: typeof wi?.internal_name === 'string' ? wi.internal_name : (wi?.tags?.logicAppName || null),
    displayName,
  };
}

function isFlowDocument(doc) {
  const def = definitionRoot(doc);
  if (!def) return false;
  /* A Logic App definition always declares its schema or its triggers; a plain object that
     happens to have an "actions" key — a config file, a report — declares neither. */
  return Boolean(def.$schema || def.triggers);
}

/* ── extraction ─────────────────────────────────────────────────────────────────────────
 * Walks the action graph rather than the JSON blindly: actions nest under `actions`, `else`,
 * `cases.*` and `default`, and a Foreach or Until body is itself an `actions` map. Recursing
 * over the whole document would also pick up strings inside a trigger schema or a Compose
 * that merely quotes a URI, and report reads the flow never performs. */

const SP_API = /shared_sharepointonline/i;
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const OPERATION_KIND = {
  GetItems: 'read', GetItem: 'read', GetFileItem: 'read', GetFileContent: 'read',
  GetAttachments: 'read', GetAttachmentContent: 'read', GetFileMetadata: 'read',
  GetTable: 'read', GetAllTables: 'read', GetFolderItems: 'read',
  PostItem: 'create', PatchItem: 'update', DeleteItem: 'delete',
  CreateFile: 'write file', UpdateFile: 'write file', DeleteFile: 'delete file',
  CopyFileAsync: 'write file', MoveFileAsync: 'write file',
  HttpRequest: 'REST call', HttpRequestV2: 'REST call', SendHttpRequest: 'REST call',
};

function collectActions(actions, path, out) {
  if (!actions || typeof actions !== 'object') return out;
  for (const [name, action] of Object.entries(actions)) {
    if (!action || typeof action !== 'object') continue;
    const here = path ? `${path}/${name}` : name;
    out.push({ name, action, path: here });
    collectActions(action.actions, here, out);
    collectActions(action.else?.actions, `${here}/else`, out);
    collectActions(action.default?.actions, `${here}/default`, out);
    for (const [caseName, branch] of Object.entries(action.cases || {})) {
      collectActions(branch?.actions, `${here}/case:${caseName}`, out);
    }
  }
  return out;
}

/* The connector writes its parameters two ways depending on the export: nested under
 * `parameters` for a designer action, and flattened as `parameters/uri` style keys for a raw
 * REST action. Reading only one of the two silently loses every REST call a flow makes. */
function param(inputs, ...names) {
  const p = inputs?.parameters;
  for (const n of names) {
    if (p && p[n] !== undefined) return p[n];
    if (p && p[`parameters/${n}`] !== undefined) return p[`parameters/${n}`];
    if (inputs && inputs[n] !== undefined) return inputs[n];
  }
  return undefined;
}

/* A list named by a Workflow Definition Language expression — `@{items('Foreach_List')?…}` —
 * is chosen at run time and has no static answer. Saying so is the correct output; reporting
 * it as an unresolved GUID would put a phantom on the gate that no export can ever clear. */
const isExpression = (v) => typeof v === 'string' && /@\{|^@[a-z]/i.test(v);

/* Three tiers, tried in order, because a URI can name a list three ways and only the first
 * two are static. A plain literal; a literal inside a Workflow Definition Language string,
 * where WDL doubles the quotes; and a concat() that assembles the title at run time. Matching
 * loosely and hoping conflates the third with the first, which is how a fragment like
 * "'', replace(items('Apply_to_each_Field')?['listTitle'], ..." ends up reported as a missing
 * list nobody can find. */
function listFromUri(uri) {
  if (typeof uri !== 'string') return null;

  const guidLiteral = uri.match(/lists\s*\(\s*guid'([0-9a-f-]{32,36})'\s*\)/i)
    || uri.match(/lists\s*\(\s*guid''([0-9a-f-]{32,36})''\s*\)/i);
  if (guidLiteral) return { listGuid: guidLiteral[1], listTitle: null };

  const titleLiteral = uri.match(/getbytitle\s*\(\s*'([^'()]*)'\s*\)/i)
    || uri.match(/getbytitle\s*\(\s*''([^'()]+)''\s*\)/i);
  if (titleLiteral) return { listGuid: null, listTitle: titleLiteral[1] };

  if (/getbytitle\s*\(|lists\s*\(\s*guid/i.test(uri)) return { listGuid: null, listTitle: null, dynamic: true };
  return null;
}

function sharePointReferences(def) {
  const refs = [];
  for (const { name, action, path } of collectActions(def.actions, '', [])) {
    const inputs = action.inputs;
    if (!inputs || typeof inputs !== 'object') continue;

    const host = inputs.host || {};
    const hostText = `${host.apiId || ''} ${host.connectionName || ''} ${host.connection?.referenceName || ''}`;
    const isSpConnector = SP_API.test(hostText);
    const uri = param(inputs, 'uri');
    const isSpHttp = typeof uri === 'string' && /sharepoint\.com/i.test(uri) && /_api\//i.test(uri);
    if (!isSpConnector && !isSpHttp) continue;

    const operationId = host.operationId || (action.type === 'Http' ? `Http ${inputs.method || ''}`.trim() : action.type);
    const dataset = param(inputs, 'dataset');
    const table = param(inputs, 'table');

    let listGuid = null;
    let listTitle = null;
    let dynamic = false;
    if (typeof table === 'string') {
      if (isExpression(table)) dynamic = true;
      else if (GUID_RE.test(table)) listGuid = table.match(GUID_RE)[0];
      else listTitle = table;
    }
    if (!dynamic && !listGuid && !listTitle) {
      const fromUri = listFromUri(uri);
      if (fromUri) {
        if (fromUri.dynamic || isExpression(fromUri.listTitle) || isExpression(fromUri.listGuid)) dynamic = true;
        else ({ listGuid, listTitle } = fromUri);
      }
    }

    refs.push({
      action: name,
      path,
      operationId,
      operation: OPERATION_KIND[operationId] || (isSpHttp ? 'REST call' : 'other'),
      siteUrl: typeof dataset === 'string' ? dataset : null,
      listGuid: listGuid ? listGuid.toLowerCase() : null,
      listTitle,
      dynamic,
      connector: isSpConnector ? 'shared_sharepointonline' : 'http',
    });
  }
  return refs;
}

/* ── resolution ─────────────────────────────────────────────────────────────────────────
 * A GUID absent from the index is reported unresolved with the reason, never filled in from
 * the nearest-looking name. The gate is a statement about what is known. */

function resolveRef(ref, index) {
  if (ref.dynamic) {
    return { ...ref, site: null, adopted: null, resolved: 'dynamic — the list is chosen at run time by an expression' };
  }
  const hit = ref.listGuid ? index.lists[ref.listGuid] : null;
  if (hit) return { ...ref, site: hit.site, listTitle: hit.title, adopted: hit.adopted, resolved: 'by GUID' };

  if (!ref.listGuid && ref.listTitle) {
    const matches = Object.entries(index.lists).filter(([, l]) => l.title === ref.listTitle);
    if (matches.length === 1) {
      const [guid, l] = matches[0];
      return { ...ref, listGuid: guid, site: l.site, adopted: l.adopted, resolved: 'by title' };
    }
    if (matches.length > 1) {
      return { ...ref, site: null, adopted: null, resolved: `AMBIGUOUS — ${matches.length} lists share this title` };
    }
  }

  if (!ref.listGuid && !ref.listTitle) {
    return { ...ref, site: null, adopted: null, resolved: 'no list named — site-level or file operation' };
  }
  /* Two different failures wear the same word, and they need different actions. An unknown
     GUID means the list is real but its site was never captured — recapture it. An unknown
     TITLE means no list anywhere in the estate carries that name, so the flow is addressing
     something that does not exist; no capture can fix that, only the flow can. */
  if (ref.listGuid) return { ...ref, site: null, adopted: null, resolved: 'UNRESOLVED GUID — list not in the index; that site was never captured' };
  return { ...ref, site: null, adopted: null, resolved: 'UNRESOLVED NAME — no list in the estate carries this title' };
}

const GENERIC_NAMES = new Set(['definition', 'definition_raw', 'flow', 'workflow', 'export']);

function flowName(file) {
  const base = basename(file).replace(/\.json$/, '');
  return GENERIC_NAMES.has(base) ? basename(dirname(file)) : base;
}

export {
  SKIP_DIRS, walk, definitionRoot, identity, isFlowDocument,
  collectActions, param, listFromUri, sharePointReferences, resolveRef,
  flowName, readFlowFile,
};

/* One file in, one flow-shaped record out, or null when the file is not a definition. The BOM
 * strip is not decoration: an export written by Windows PowerShell 5.1 carries one, and
 * JSON.parse rejects a leading byte-order mark outright. */
function readFlowFile(file, index) {
  let raw;
  try { raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); } catch { return null; }
  let doc;
  try { doc = JSON.parse(raw); } catch { return null; }
  if (!isFlowDocument(doc)) return null;
  const def = definitionRoot(doc);
  return {
    raw,
    doc,
    flow: flowName(file),
    /* When one workflow is exported twice — renamed and rebuilt between captures — both files
       describe the same flow and only the later one describes it as it is now. Callers cannot
       tell them apart without this, and one that reads the earlier file answers a question
       about the live flow from a superseded copy. */
    exportedAtUtc: typeof doc?.exportedAtUtc === 'string' ? doc.exportedAtUtc : null,
    ...identity(doc),
    actions: collectActions(def.actions, '', []).length,
    references: sharePointReferences(def).map((r) => resolveRef(r, index)),
  };
}
