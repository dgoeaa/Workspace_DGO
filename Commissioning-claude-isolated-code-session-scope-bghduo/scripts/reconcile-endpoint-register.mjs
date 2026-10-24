#!/usr/bin/env node
/**
 * Reconcile every endpoint key against the tenant's own endpoint register.
 *
 * WHY THIS EXISTS, AND WHY IT SUPERSEDES WHAT CAME BEFORE
 *
 * Until now this repository derived "which workflow does key K point at?" from the artefacts it
 * happened to hold: flow exports of varying age, run records, a deployed config read once, and
 * a hand-maintained register. Those disagreed with each other, and `endpoint-workflow-ids.json`
 * recorded the disagreements honestly — `portalDiscrepancies: 3`, one key marked "read from the
 * deployed config, not independently corroborated", another with no id at all.
 *
 * `docs/reference/endpoint-register.json` ends that. It is exported from the tenant, it covers
 * all 25 contract keys and 51 workflow records, and it is post-rotation. When it was first
 * compared against this repository's records, **25 of 25 keys mismatched**. Not one agreed. The
 * repository was not slightly stale; it was describing a previous estate.
 *
 * So the direction of authority is settled and stated once, here: the register wins, always.
 * This script does not merge, vote, or preserve. It regenerates
 * `docs/reference/endpoint-workflow-ids.json` from the register and prints what changed.
 *
 * WHAT THE REGISTER MADE POSSIBLE BESIDES CORRECTNESS
 *
 * Each record carries the complete trigger URL with only `sig` removed — host, routing segment,
 * workflow id, path, and every non-credential query parameter. That is the entire endpoint
 * except the 43 characters that are the secret.
 *
 * This is worth more than a correction. Commissioning previously meant copying twenty-five
 * 300-character URLs by hand, where the characteristic failure is a URL truncated at the first
 * `&` — still valid-looking, no signature, fails as a 401 much later. Now
 * `make-values-template.mjs` can emit every URL in full with `sig=` left blank, and the operator
 * pastes only the signature. Twenty-five short tokens instead of twenty-five long URLs, and a
 * truncated paste becomes impossible because there is nothing left to truncate.
 *
 * WHAT IT DOES NOT DO. It records no signature and never will — `sig` is the credential, the
 * register omits it by construction, and this script fails if one ever appears.
 *
 *   npm run reconcile              # regenerate and report
 *   npm run reconcile -- --check   # fail if the derived file has drifted (CI)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUNTIME_ENDPOINTS, PORTAL_ENDPOINTS } from './lib/endpoint-surface.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER = path.join(ROOT, 'docs/reference/endpoint-register.json');
const DERIVED = path.join(ROOT, 'docs/reference/endpoint-workflow-ids.json');
const CHECK = process.argv.includes('--check');

const PORTAL_KEYS = new Set(['SUBMISSION', 'UPLOAD', 'SUPPORT', 'VERIFY', 'VERIFY_CONFIRM', 'STATUS', 'WRITEBACK']);

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

if (!fs.existsSync(REGISTER)) fail(`${path.relative(ROOT, REGISTER)} is missing — it is the authority for every id below.`);
const reg = JSON.parse(fs.readFileSync(REGISTER, 'utf8'));

/* The register must be credential-free. It is committed, so a signature reaching it would be a
   published bearer token — the exact failure this estate spent a programme correcting. Checked
   here rather than assumed, because the file arrives from outside the repository. */
const SIG = /sig=[A-Za-z0-9_-]{20,}/g;
const leaked = JSON.stringify(reg).match(SIG) || [];
if (leaked.length) fail(`${path.relative(ROOT, REGISTER)} carries ${leaked.length} signature(s). It must not be committed.`);

const bare = (k) => k.replace(/^(DGO|PF)_ENDPOINT_/, '');

/**
 * Leave the URL ending at `sig=`, whatever the register used to mark the removal.
 *
 * The marker is read from the register rather than hardcoded, because it is the register's
 * choice and it declares it (`credential_removal.replacement_marker`). A second, unconditional
 * pass then clears anything still sitting after `sig=` — a different export, a hand-edit, or a
 * marker the register forgot to declare must not become a value that looks like a signature.
 */
const MARKER = reg.credential_removal?.replacement_marker ?? '<CREDENTIAL_REMOVED>';
function stripSignaturePlaceholder(url) {
  if (!url) return null;
  return String(url)
    .split(MARKER).join('')
    .replace(/([?&]sig=)[^&]*/i, '$1');
}

/* Endpoint shape, per workflow, from the 51-record registry. `current_configuration` says which
   workflow a key uses; the registry says what that workflow's trigger looks like. Both are
   needed, and keeping them separate is what lets a workflow serve several keys without the
   method or routing segment being restated — and drifting — per key. */
/* The register is authoritative for WHICH workflow a key points at. It is not authoritative for
   HOW the browser calls it, and on this baseline the two disagree for exactly the keys where it
   matters: the register annotates `SCAN_INTAKE` and portal `UPLOAD` as POST, while both deployed
   triggers declare PUT and both clients (`core/scan-intake-service.js`, `document-portal/js/core.js`)
   send PUT. The register's annotation is a description of a flow; `transport` here is the caller's
   own contract, and the caller is the thing being commissioned.

   Left unreconciled this is not cosmetic. The derived method reaches the endpoint consoles, which
   display it and — in the standalone console's write probe — send it. A probe that POSTs a
   PUT-only trigger is refused by Power Automate before the flow runs, so two correctly wired keys
   report themselves broken at exactly the moment an operator is deciding whether to go live.

   So: `method` is the method the caller uses, derived from `transport`; `registerMethod` preserves
   what the register said; `methodDisagreements` in the totals makes any divergence countable and
   testable rather than silently resolved. */
const CALLER_METHOD = new Map(
  [...RUNTIME_ENDPOINTS, ...PORTAL_ENDPOINTS].map((e) => [e.key, e.transport === 'bytes' ? 'PUT' : 'POST']),
);

const byWorkflow = new Map();
for (const rec of reg.complete_flow_registry || []) {
  byWorkflow.set(rec.workflow_id, {
    names: rec.flow_names_and_keys || [],
    category: rec.category || null,
    endpoint: (rec.endpoints || [])[0] || null,
    status: rec.endpoint_status || null,
  });
}

const rows = [];
for (const entry of reg.current_configuration || []) {
  const key = bare(entry.key);
  const rec = byWorkflow.get(entry.workflow_id);
  rows.push({
    key,
    surface: PORTAL_KEYS.has(key) ? 'portal' : 'internal',
    workflowId: entry.workflow_id,
    flow: entry.flow_name,
    category: rec?.category ?? null,
    method: CALLER_METHOD.get(key) ?? rec?.endpoint?.method ?? null,
    registerMethod: rec?.endpoint?.method ?? null,
    routingSegment: rec?.endpoint?.routing_segment ?? null,
    /* The complete URL minus its signature. This is what turns commissioning from "paste 25
       long URLs" into "paste 25 short signatures". It is not a credential: the register removed
       the only part that was one.

       The register marks the removal with a placeholder — `sig=<CREDENTIAL_REMOVED>`. That is
       right for a document a person reads and wrong for a line a person completes: left in, the
       operator must delete it before pasting, and a placeholder that survives into a config is
       a non-empty, HTTPS, correctly-shaped URL that fails as a 401 at the worst moment. Stripped
       to a bare `sig=`, the line ends exactly where the paste begins, and any key left untouched
       is caught immediately by `npm run check:values` as having no signature. */
    urlTemplate: stripSignaturePlaceholder(entry.sanitized_endpoint_url),
    source: 'endpoint-register',
  });
}

if (!rows.length) fail('the register lists no current configuration — nothing to reconcile.');

/* Which keys share a workflow. Previously stated by hand in four documents, each differently;
   two of the pairs recorded there do not exist in the estate. Derived once, here. */
const shared = new Map();
for (const r of rows) {
  if (!shared.has(r.workflowId)) shared.set(r.workflowId, []);
  shared.get(r.workflowId).push(r.key);
}
for (const r of rows) {
  const peers = shared.get(r.workflowId).filter((k) => k !== r.key);
  if (peers.length) r.sharesFlowWith = peers;
}

const internal = {};
const portal = {};
for (const r of rows) {
  const { key, surface, ...rest } = r;
  (surface === 'portal' ? portal : internal)[key] = rest;
}

const derived = {
  schema: 'dgo-endpoint-workflow-ids/v2',
  purpose:
    'Which Power Automate workflow each endpoint key points at, and the complete trigger URL '
    + 'for it with the signature removed. Derived wholly from docs/reference/endpoint-register.json '
    + 'by scripts/reconcile-endpoint-register.mjs — do not hand-edit. No signature is recorded '
    + 'here or anywhere in this repository; `sig` is the credential and is pasted at '
    + 'commissioning time.',
  generatedBy: 'scripts/reconcile-endpoint-register.mjs',
  authority: {
    file: 'docs/reference/endpoint-register.json',
    schemaVersion: reg.schema_version ?? null,
    redistributionStatus: reg.redistribution_status ?? null,
    note:
      'The register is exported from the tenant and is post-rotation. On identity — which '
      + 'workflow a key points at, and its trigger URL — it is correct wherever it and any other '
      + 'artefact in this repository disagree; on first reconciliation all 25 keys disagreed with '
      + 'the previous records. Its `method` annotation is the one exception, and is not authority: '
      + '`method` below is the verb the browser actually sends, taken from the caller\'s own '
      + 'transport declaration in scripts/lib/endpoint-surface.mjs, and `registerMethod` preserves '
      + 'what the register said. They differ for the two raw-bytes deposits, whose deployed '
      + 'triggers declare PUT while the register annotates POST.',
  },
  authenticationPosture: reg.authentication_posture ?? null,
  internal,
  portal,
  totals: {
    keys: rows.length,
    internalKeys: Object.keys(internal).length,
    portalKeys: Object.keys(portal).length,
    distinctWorkflows: shared.size,
    keysWithUrlTemplate: rows.filter((r) => r.urlTemplate).length,
    keysWithoutWorkflowId: rows.filter((r) => !r.workflowId).length,
    methodDisagreements: rows.filter((r) => r.registerMethod && r.registerMethod !== r.method).length,
  },
};

const rendered = JSON.stringify(derived, null, 2) + '\n';
const previousRaw = fs.existsSync(DERIVED) ? fs.readFileSync(DERIVED, 'utf8') : null;

/* ------------------------------------------------------------------ *
 * The browser-importable atlas.
 *
 * The JSON above is for the command line. The administrative console runs in a browser, in a
 * platform with no build step and no bundler, loaded as ES modules — sometimes from `file://`,
 * where `fetch` of a sibling JSON is blocked outright. So the same facts are emitted a second
 * time as a module the console can simply `import`.
 *
 * Generated rather than hand-written, and generated HERE rather than by a second script,
 * because two producers of one truth is how the id map went stale in the first place. The
 * atlas is a projection of the register; `--check` covers it, so it cannot drift.
 *
 * It carries the full 51-workflow estate, not just the 25 configured keys. The console's
 * whole reason for existing is the difference between those two numbers: 14 workflows in this
 * tenant carry a contract-key name while serving nothing, 8 of them still answering on a live
 * endpoint. A console that only showed what is configured could not show that.
 * ------------------------------------------------------------------ */

const ATLAS = path.join(ROOT, 'config/endpoint-atlas.data.js');

const boundIds = new Set(rows.map((r) => r.workflowId));
const workflows = (reg.complete_flow_registry || []).map((rec) => {
  const ep = (rec.endpoints || [])[0] || null;
  const servingRows = rows.filter((r) => r.workflowId === rec.workflow_id);
  const serves = servingRows.map((r) => r.key);
  /* A workflow that serves keys is called by those keys, so it carries their verb — otherwise
     the console shows `SCAN_INTAKE · PUT` in one tab and `IP_SCAN_INTAKE · POST` in the next
     for the same trigger, and the reader has to guess which is the one to use. A workflow the
     estate does not call keeps the register's annotation: there is no caller to derive from. */
  const servedMethods = [...new Set(servingRows.map((r) => r.method).filter(Boolean))];
  return {
    workflowId: rec.workflow_id,
    names: rec.flow_names_and_keys || [],
    category: rec.category || null,
    method: servedMethods.length === 1 ? servedMethods[0] : (ep?.method ?? null),
    registerMethod: ep?.method ?? null,
    routingSegment: ep?.routing_segment ?? null,
    hasEndpoint: Boolean(ep),
    endpointStatus: rec.endpoint_status || null,
    serves,
    bound: boundIds.has(rec.workflow_id),
  };
});

const atlas = {
  schema: 'dgo-endpoint-atlas/v1',
  generatedBy: 'scripts/reconcile-endpoint-register.mjs',
  authority: derived.authority,
  authenticationPosture: derived.authenticationPosture,
  keys: rows.map(({ key, surface, workflowId, flow, category, method, registerMethod, routingSegment, urlTemplate, sharesFlowWith }) => ({
    key, surface, workflowId, flow, category, method, registerMethod, routingSegment, urlTemplate,
    sharesFlowWith: sharesFlowWith || [],
  })),
  workflows,
  totals: {
    ...derived.totals,
    workflowRecords: workflows.length,
    workflowsWithEndpoint: workflows.filter((w) => w.hasEndpoint).length,
    workflowsBound: workflows.filter((w) => w.bound).length,
  },
};

const atlasSource = `/**
 * GENERATED — do not edit. Produced by \`npm run reconcile\` from
 * docs/reference/endpoint-register.json, the tenant's own export.
 *
 * The endpoint estate as a module the browser can import: all ${atlas.keys.length} contract keys and all
 * ${workflows.length} workflow records. Imported by modules/endpoint-console.js, which has no other way to
 * read the register — the platform has no build step and is sometimes opened from file://,
 * where fetching a sibling JSON is blocked.
 *
 * NO SIGNATURE IS PRESENT OR MAY EVER BE. Each urlTemplate ends at a bare \`sig=\`; the 43
 * characters that follow it are the credential and live only in config.local.js, which is
 * git-ignored. tests/endpoint-console.test.mjs fails if that stops being true.
 */
export const EndpointAtlas = Object.freeze(${JSON.stringify(atlas, null, 2)});
export default EndpointAtlas;
`;

const previousAtlas = fs.existsSync(ATLAS) ? fs.readFileSync(ATLAS, 'utf8') : null;

/* ── report ───────────────────────────────────────────────────────────────────────────── */

console.log('\nEndpoint register reconciliation\n');
console.log(`  authority   docs/reference/endpoint-register.json  (${reg.redistribution_status})`);
console.log(`  keys        ${derived.totals.keys}  —  ${derived.totals.internalKeys} internal, ${derived.totals.portalKeys} portal`);
console.log(`  workflows   ${derived.totals.distinctWorkflows} distinct behind those keys`);
console.log(`  URLs        ${derived.totals.keysWithUrlTemplate}/${derived.totals.keys} carry a complete URL template (signature removed)\n`);

let changed = 0;
if (previousRaw) {
  let prev;
  try { prev = JSON.parse(previousRaw); } catch { prev = null; }
  if (prev) {
    const prevId = (k) => {
      const e = (prev.internal || {})[k] ?? (prev.portal || {})[k];
      return e && typeof e === 'object' ? (e.workflowId ?? null) : (e ?? null);
    };
    const moved = rows.filter((r) => prevId(r.key) !== r.workflowId);
    changed = moved.length;
    if (moved.length) {
      console.log(`  ${moved.length} key(s) now point at a different workflow than this repository recorded:\n`);
      for (const r of moved) {
        console.log(`    ${r.key.padEnd(24)} ${String(prevId(r.key) ?? '(none recorded)').padEnd(34)} →  ${r.workflowId}`);
        console.log(`    ${''.padEnd(24)} ${''.padEnd(34)}    ${r.flow}`);
      }
      console.log('');
    } else {
      console.log('  Every key already pointed at the workflow the register names.\n');
    }
  }
}

console.log('  Keys sharing one workflow — rotating it rotates all of them:\n');
for (const [id, keys] of shared) {
  if (keys.length > 1) console.log(`    ${id}  ${keys.join(' + ')}`);
}
console.log('');

const methods = [...new Set(rows.map((r) => r.method).filter(Boolean))];
console.log(`  Trigger methods in use: ${methods.join(', ') || 'none recorded'}\n`);

const disagreed = rows.filter((r) => r.registerMethod && r.registerMethod !== r.method);
if (disagreed.length) {
  console.log('  Method reconciled against the caller — the register annotates one verb, the browser sends another:\n');
  for (const r of disagreed) {
    console.log(`    ${r.key.padEnd(24)} register says ${r.registerMethod.padEnd(6)} · caller sends ${r.method}   (${r.flow})`);
  }
  console.log('\n    The caller wins: it is the thing being commissioned, and the deployed trigger agrees with it.\n');
}

/* ── write, or check ──────────────────────────────────────────────────────────────────── */

if (CHECK) {
  const stale = [
    previousRaw === rendered ? null : path.relative(ROOT, DERIVED),
    previousAtlas === atlasSource ? null : path.relative(ROOT, ATLAS),
  ].filter(Boolean);
  if (!stale.length) {
    console.log(`  ✅ ${path.relative(ROOT, DERIVED)} and ${path.relative(ROOT, ATLAS)} match the register.\n`);
    process.exit(0);
  }
  console.error(`  ✖  ${stale.join(' and ')} ${stale.length > 1 ? 'have' : 'has'} drifted from the register.`);
  console.error('     Run: npm run reconcile\n');
  process.exit(1);
}

fs.writeFileSync(DERIVED, rendered);
fs.writeFileSync(ATLAS, atlasSource);
console.log(`  ✅ wrote ${path.relative(ROOT, DERIVED)}${changed ? ` — ${changed} key(s) corrected` : ''}`);
console.log(`  ✅ wrote ${path.relative(ROOT, ATLAS)} — ${atlas.keys.length} keys, ${workflows.length} workflows, for the console\n`);
console.log('  Next:  npm run values:template ~/dgo-values.txt   # 25 URLs, paste only the signatures');
console.log('         open the platform → Endpoint Console        # administer the estate\n');
