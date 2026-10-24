#!/usr/bin/env node
/**
 * Read a Power Automate export package, patch the one flow definition inside it, write it back.
 *
 * WHY A PACKAGE RATHER THAN THE DESIGNER
 * See docs/deployment/sharepoint/remediation/PLAN.md. The short version: the remediation is 123
 * edits across 11 flows, the designer saves a flow whose action names do not resolve, and
 * nothing is verified until the next export. Against the definition the same edits are a diff
 * that `npm run wiring` can check before the tenant is touched.
 *
 * WHAT A PACKAGE CONTAINS
 *   manifest.json                                   package name, and every resource with its
 *                                                   suggestedCreationType - "Update" for the flow
 *   Microsoft.Flow/flows/manifest.json              the asset path, i.e. the flow's package id
 *   Microsoft.Flow/flows/<pkgId>/definition.json    { name, id, type, properties: { displayName,
 *                                                     definition, connectionReferences, ... } }
 *   Microsoft.Flow/flows/<pkgId>/apisMap.json       connector -> api resource id
 *   Microsoft.Flow/flows/<pkgId>/connectionsMap.json connector -> connection id
 *
 * Note the two ids. The directory is a PACKAGE id assigned at export; `definition.json`'s own
 * `name` is the flow's workflow id, which is what the register and the trigger URL use. They are
 * different values and confusing them selects the wrong flow, so this reads identity from
 * `definition.json` and never from the directory or the package name - the package name is
 * whatever was typed into the export dialog and has been observed naming a different flow
 * entirely.
 *
 * Only definition.json is ever rewritten. The manifest, the API map and the connection map are
 * copied byte for byte, so the import wizard still offers the same existing connections.
 *
 * Usage:
 *   node scripts/patch-flow-package.mjs --in <pkg.zip> --identify
 *   node scripts/patch-flow-package.mjs --in <pkg.zip> --out <patched.zip> --artifact 01-otp-estate-split --flow Portal_Verify_Confirm
 *   node scripts/patch-flow-package.mjs --in <pkg.zip> --emit-definition <path.json>
 *   node scripts/patch-flow-package.mjs --in <pkg.zip> --out <ready.zip> --install DGO_OTP
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validate } from './lib/flow-patch.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const inZip = arg('in');
if (!inZip) {
  console.error('\n  --in <package.zip> is required\n');
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'flowpkg-'));
const cleanup = () => rmSync(work, { recursive: true, force: true });

try {
  execFileSync('unzip', ['-q', '-o', resolve(inZip), '-d', join(work, 'x')], { stdio: 'pipe' });
} catch (err) {
  cleanup();
  console.error(`\n  not a readable zip: ${inZip}\n  ${err.message}\n`);
  process.exit(2);
}

const flowsDir = join(work, 'x', 'Microsoft.Flow', 'flows');
if (!existsSync(flowsDir)) {
  cleanup();
  console.error('\n  this zip has no Microsoft.Flow/flows - is it a flow package export?\n');
  process.exit(2);
}

const packageIds = readdirSync(flowsDir).filter((n) => existsSync(join(flowsDir, n, 'definition.json')));
if (packageIds.length !== 1) {
  cleanup();
  console.error(`\n  expected exactly one flow in the package, found ${packageIds.length}\n`);
  process.exit(2);
}
const packageId = packageIds[0];
const defPath = join(flowsDir, packageId, 'definition.json');
const doc = JSON.parse(readFileSync(defPath, 'utf8'));

/* Identity comes from the definition, never from the directory name or the package name. */
const identity = {
  workflowId: doc.name,
  displayName: doc.properties?.displayName,
  packageId,
  packageName: (() => {
    try { return JSON.parse(readFileSync(join(work, 'x', 'manifest.json'), 'utf8'))?.details?.displayName; }
    catch { return null; }
  })(),
  connectors: Object.keys(doc.properties?.connectionReferences || {}),
};

const definition = doc.properties?.definition;
if (!definition?.actions) {
  cleanup();
  console.error('\n  definition.json has no properties.definition.actions\n');
  process.exit(2);
}

const report = () => {
  console.log('');
  console.log(`  flow          ${identity.displayName}`);
  console.log(`  workflow id   ${identity.workflowId}`);
  console.log(`  package id    ${identity.packageId}`);
  if (identity.packageName && identity.packageName !== identity.displayName) {
    console.log(`  package named "${identity.packageName}" - which is the export dialog's name, not the flow's`);
  }
  console.log(`  connectors    ${identity.connectors.join(', ') || 'none'}`);
  console.log(`  actions       ${Object.keys(definition.actions).length} at the top level`);
  const problems = validate(definition);
  console.log(`  wiring        ${problems.length ? `${problems.length} problem(s)` : 'every runAfter resolves'}`);
  for (const p of problems.slice(0, 8)) console.log(`                  ! ${p}`);
  console.log('');
};

if (has('identify')) { report(); cleanup(); process.exit(0); }

const emit = arg('emit-definition');
if (emit) {
  report();
  const out = resolve(emit);
  /* Written in the shape export-power-automate-flows.ps1 produces, so the sweep and the wiring
     verifier read a candidate exactly as they read an export from the tenant. A different shape
     here would be silently skipped as "not exported" and the check would pass on absence. */
  const asExport = {
    exportedBy: 'scripts/patch-flow-package.mjs',
    exportedAtUtc: new Date().toISOString(),
    candidate: true,
    workflow_identity: {
      internal_name: identity.workflowId,
      full_resource_id: null,
      tags: { flowDisplayName: identity.displayName },
    },
    definition,
  };
  writeFileSync(out, `${JSON.stringify(asExport, null, 2)}\n`);
  console.log(`  wrote ${relative(ROOT, out).split(sep).join('/')}\n`);
  cleanup();
  process.exit(0);
}

const expected = arg('flow');
if (expected && identity.displayName !== expected) {
  report();
  console.error(`  ❌ this package holds ${identity.displayName}, not ${expected}. Nothing written.\n`);
  cleanup();
  process.exit(1);
}

const outZip = arg('out');
if (!outZip) {
  cleanup();
  console.error('\n  --out <patched.zip> is required unless --identify or --emit-definition\n');
  process.exit(2);
}

/* ------------------------------------------------------------------ *
 * --install: put a designer-paste package into the definition directly
 * ------------------------------------------------------------------ *
 * WHY THIS EXISTS
 *   The clipboard route is defective as a delivery mechanism, and the tenant proved it four
 *   times over: IP_FETCH_ALL_ENDPOINT, IP_Single_Assignment_Endpoint, IP_OTP_Endpoint and
 *   CG_Verification_Endpoint were each pasted from a package whose every Set variable carried a
 *   value, and each came out with those values gone. The packages are complete — 190 variable
 *   writes across the fourteen, none missing a value — but a package that cannot survive being
 *   installed is not a working deliverable, and telling the operator to paste more carefully is
 *   not a fix.
 *
 *   The designer strips a Set variable's value when the variable it names does not resolve at
 *   paste time, and a clipboard package is a scope, so the declarations cannot travel with it.
 *   THIS ROUTE HAS NO PASTE. It writes the variables and the scope into the flow's own
 *   definition, in one file, and the operator imports it. The designer never sees a scope whose
 *   variables are missing, because by the time it opens the flow they are already there.
 *
 *   node scripts/patch-flow-package.mjs --in <exported.zip> --out <ready.zip> --install DGO_OTP
 *
 * The exported zip supplies identity, connections and the trigger; everything below the trigger
 * is replaced. Import the result choosing Update, never "Create as new".
 */
const installName = arg('install');
if (installName) {
  const dirs = ['docs/deployment/internal/flows/designer-paste', 'docs/deployment/sharepoint/flows/designer-paste'];
  const dir = dirs.map((d) => join(ROOT, d)).find((d) => existsSync(join(d, `${installName}.designer-paste.json`)));
  if (!dir) {
    cleanup();
    console.error(`\n  no package named ${installName} in ${dirs.join(' or ')}\n`);
    process.exit(2);
  }
  const pkg = JSON.parse(readFileSync(join(dir, `${installName}.designer-paste.json`), 'utf8'));
  const varsPath = join(dir, `${installName}.variables.designer-paste.json`);
  if (!existsSync(varsPath)) {
    cleanup();
    console.error(`\n  ${installName} has no variables package beside it — refusing to install a scope`
      + `\n  whose declarations cannot travel with it, which is the whole point of this route.\n`);
    process.exit(2);
  }
  const vars = JSON.parse(readFileSync(varsPath, 'utf8'));

  /* The declarations, flattened out of their carrier scope to the top level, where Logic Apps
     requires them. Their runAfter chain is already correct among themselves. */
  const declared = vars.serializedValue?.actions || {};
  const names = Object.keys(declared);
  if (!names.length || !names.every((n) => declared[n].type === 'InitializeVariable')) {
    cleanup();
    console.error(`\n  ${installName}'s variables package is not a set of Initialize variable actions\n`);
    process.exit(2);
  }
  const last = names[names.length - 1];

  definition.actions = {
    ...JSON.parse(JSON.stringify(declared)),
    [pkg.nodeId]: { ...JSON.parse(JSON.stringify(pkg.serializedValue)), runAfter: { [last]: ['Succeeded'] } },
  };

  /* THE CLIPBOARD SHAPE IS NOT THE DEFINITION SHAPE, AND THE SERVICE REJECTS THE DIFFERENCE.
     An OpenApiConnection action names its connector under `host`, and the two formats spell that
     key differently:

       clipboard   "host": { apiId, connection: "shared_sharepointonline", operationId }
       definition  "host": { apiId, connectionName: "shared_sharepointonline", operationId }

     Pasting never exposed this — the designer translates as it pastes. Importing does, and the
     import fails the whole package with

       WorkflowRunActionInputsMissingProperty: the 'inputs' of workflow run action
       'Get_Lookups_Directory_User' of type 'OpenApiConnection' is not valid.
       Property 'host.connectionReferenceName' is missing.

     which names a third spelling — the solution-aware one — because the service reports the last
     alternative it tried. The shape to write is the one this tenant's own exports carry, read
     out of them rather than assumed: connectionName. */
  (function rewriteHosts(actions) {
    for (const a of Object.values(actions || {})) {
      const h = a?.inputs?.host;
      if (a?.type === 'OpenApiConnection' && h && h.connection && !h.connectionName) {
        h.connectionName = h.connection;
        delete h.connection;
      }
      rewriteHosts(a?.actions); if (a?.else) rewriteHosts(a.else.actions);
      for (const c of Object.values(a?.cases || {})) rewriteHosts(c.actions);
      rewriteHosts(a?.default?.actions);
    }
  })(definition.actions);

  /* Method = POST, which FLOW-BUILD-WALKTHROUGH C7.9 sets for every flow and which not one of
     the flows read from this tenant had. A trigger with no method answers every verb. */
  for (const t of Object.values(definition.triggers || {})) {
    if (t?.type === 'Request') t.inputs = { ...(t.inputs || {}), method: 'POST' };
  }

  /* Every connector the package binds must be referenced by the flow, or the import wizard has
     nothing to map the actions onto. Existing references are left exactly as they are — they
     name the connections this tenant already authorised. */
  doc.properties.connectionReferences = doc.properties.connectionReferences || {};
  for (const [, conn] of Object.entries(pkg.allConnectionData || {})) {
    const key = conn.referenceKey;
    if (!key || doc.properties.connectionReferences[key]) continue;
    doc.properties.connectionReferences[key] = {
      connectionName: conn.connectionReference?.connectionName,
      source: 'Embedded',
      id: conn.connectionReference?.api?.id,
      tier: 'NotSpecified',
      apiName: key.replace(/^shared_/, ''),
      isProcessSimpleApiReferenceConversionAlreadyDone: false,
    };
  }

  const installProblems = validate(definition);
  if (installProblems.length) {
    console.error(`\n  ❌ the installed definition does not wire up:\n${installProblems.map((x) => `      ${x}`).join('\n')}\n`);
    cleanup();
    process.exit(1);
  }

  /* Every connector action must now carry the definition spelling, or the import fails as a
     whole and the operator is back where they started. Refusing here is cheaper than a rejected
     import, and it is checkable, so it is checked. */
  (function assertHosts(actions, path = '') {
    for (const [n, a] of Object.entries(actions || {})) {
      if (a?.type === 'OpenApiConnection') {
        const h = a.inputs?.host || {};
        const missing = ['apiId', 'connectionName', 'operationId'].filter((k) => !h[k]);
        if (missing.length || h.connection) {
          console.error(`\n  ❌ ${path}${n}: host is not the definition shape`
            + `${missing.length ? ` — missing ${missing.join(', ')}` : ''}`
            + `${h.connection ? ' — still carries the clipboard key "connection"' : ''}\n`);
          cleanup();
          process.exit(1);
        }
      }
      assertHosts(a?.actions, `${path}${n}/`); if (a?.else) assertHosts(a.else.actions, `${path}${n}/else/`);
      for (const c of Object.values(a?.cases || {})) assertHosts(c.actions, `${path}${n}/`);
      assertHosts(a?.default?.actions, `${path}${n}/`);
    }
  })(definition.actions);

  /* The check the paste route could never make before the tenant made it: every variable write
     still carries the value the package shipped. */
  let connectorActions = 0;
  (function countConnectors(actions) {
    for (const a of Object.values(actions || {})) {
      if (a?.type === 'OpenApiConnection') connectorActions++;
      countConnectors(a?.actions); if (a?.else) countConnectors(a.else.actions);
      for (const c of Object.values(a?.cases || {})) countConnectors(c.actions);
      countConnectors(a?.default?.actions);
    }
  })(definition.actions);
  const WRITES = new Set(['SetVariable', 'AppendToArrayVariable', 'AppendToStringVariable', 'IncrementVariable', 'DecrementVariable']);
  let writes = 0;
  (function scan(actions) {
    for (const a of Object.values(actions || {})) {
      if (WRITES.has(a?.type)) {
        writes++;
        if (a.inputs?.value === undefined) {
          console.error(`\n  ❌ ${installName} would install a variable write with no value — refusing\n`);
          cleanup();
          process.exit(1);
        }
      }
      scan(a?.actions); if (a?.else) scan(a.else.actions);
      for (const c of Object.values(a?.cases || {})) scan(c.actions);
      scan(a?.default?.actions);
    }
  })(definition.actions);

  writeFileSync(defPath, `${JSON.stringify(doc, null, 2)}\n`);
  const outInstall = resolve(outZip);
  rmSync(outInstall, { force: true });
  execFileSync('zip', ['-q', '-r', outInstall, '.'], { cwd: join(work, 'x'), stdio: 'pipe' });
  console.log(`  installed ${installName} into ${identity.displayName}`);
  console.log(`      ${names.length} variable declaration(s) at the top level, then ${pkg.nodeId}`);
  console.log(`      ${writes} variable write(s), every one carrying its value`);
  console.log(`      ${connectorActions} connector action(s), every host in the definition shape`);
  console.log(`      trigger Method = POST`);
  console.log(`\n  wrote ${outInstall}`);
  console.log('  import it choosing Update on the existing flow - never "Create as new", which mints a new trigger URL.\n');
  cleanup();
  process.exit(0);
}

const artifactName = arg('artifact');
if (!artifactName) {
  cleanup();
  console.error('\n  --artifact <id> is required\n');
  process.exit(2);
}
const artifactPath = join(ROOT, 'docs/deployment/sharepoint/remediation', `${artifactName}.json`);
if (!existsSync(artifactPath)) {
  cleanup();
  console.error(`\n  no artifact at ${artifactPath}\n`);
  process.exit(2);
}

report();

const applierPath = join(ROOT, 'scripts/lib/flow-remediation.mjs');
if (!existsSync(applierPath)) {
  console.error('\n  the artifact applier (scripts/lib/flow-remediation.mjs) is not built yet.'
    + '\n  --identify and --emit-definition work now; patching does not.\n');
  cleanup();
  process.exit(2);
}
const { applyArtifact } = await import('./lib/flow-remediation.mjs');
const applied = applyArtifact(definition, JSON.parse(readFileSync(artifactPath, 'utf8')), identity.displayName);

const problems = validate(definition);
if (problems.length) {
  console.error(`  ❌ the patched definition does not wire up:\n${problems.map((p) => `      ${p}`).join('\n')}\n`);
  cleanup();
  process.exit(1);
}

console.log(`  applied ${applied.length} change(s):`);
for (const a of applied) console.log(`      ${a}`);

writeFileSync(defPath, `${JSON.stringify(doc, null, 2)}\n`);
const out = resolve(outZip);
rmSync(out, { force: true });
execFileSync('zip', ['-q', '-r', out, '.'], { cwd: join(work, 'x'), stdio: 'pipe' });
console.log(`\n  wrote ${out}\n  import it choosing Update on the existing flow - never "Create as new", which mints a new trigger URL.\n`);
cleanup();
