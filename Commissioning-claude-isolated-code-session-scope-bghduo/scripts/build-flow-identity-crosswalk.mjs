#!/usr/bin/env node
/**
 * Extract the contract-key → tenant-flow identity crosswalk from `docs/reference/dgo-endpoint-catalog.xlsx`.
 *
 * WHY A CROSSWALK IS NEEDED AT ALL
 * Two different identifiers in this estate look interchangeable and are not.
 *
 *   APPLICATION WORKFLOW ID   32 hex characters, no dashes. It is what a signed invoke URL
 *                             carries — `…/workflows/c4c26f93ba1e4d7db5247536c30cdc11/triggers/
 *                             manual/paths/invoke` — and therefore what `endpoint-register.json`
 *                             and every values file key on. It addresses a flow for EXECUTION.
 *
 *   TENANT FLOW ID            a dashed GUID. It is what the Power Automate management API
 *                             addresses — `/powerautomate/flows/<guid>` — and what an exported
 *                             package names. It addresses a flow for MANAGEMENT.
 *
 * They are not the same value and neither is derivable from the other. The dashes are not the
 * difference: inserting them into an application workflow id produces a GUID the management API
 * answers 404 for, which is how this was found. Three independent sources say the same thing —
 * the 404 itself; finding F-004 of `docs/reference/ecm-comprehensive-forensic-audit.xlsx`
 * ("Application Workflow IDs and Power Automate Flow IDs are different identifier domains",
 * reached from a separate seven-workbook evidence set that never touched the tenant); and this
 * catalogue, whose two columns disagree on every single row.
 *
 * That audit ships beside this one for the same reason the catalogue does. Its finding F-002 —
 * "43 of 43 rows have a blank Flow ID, while Workflow ID is populated" — is the gap this file
 * closes, and its 0-15 day roadmap item asks for exactly this artifact: "Build the service-ID
 * crosswalk across application Workflow ID, Power Automate Flow ID, Environment ID, endpoint key,
 * and aliases." Nothing reads it programmatically; it is the evidence for the claim above, and a
 * claim whose evidence is not in the tree is a claim that gets re-litigated.
 *
 * The practical cost of conflating them was a trigger harvester that addressed the management API
 * with execution ids and could not resolve a single flow.
 *
 * WHAT THE SOURCE WORKBOOK IS
 * A live tenant extraction, not a document: `Complete Power Automate Flow Definition Exporter v7`
 * ran against environment Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1 and reported 26 contract
 * keys in, 21 resolved, 5 not. It records `credentials_removed: True`, and unpacking it confirms
 * that — no signature, no bearer token, no invoke URL anywhere in the archive. It is therefore
 * safe in the tree, which matters, because `tests/check-secrets.mjs` skips .xlsx members when it
 * unpacks an archive and would not have caught one.
 *
 * THE SECOND SOURCE, AND WHY IT IS WEAKER
 * `docs/reference/flow-exports/*.zip` are exported flow packages. They answer what the catalogue
 * could not: an export comes from the tenant even where the catalogue's extractor failed, and the
 * five here close four of the six contract keys it left open — plus one that independently
 * reproduces a flow id the catalogue already had.
 *
 * They are weaker evidence, and the file says so on every row. A package carries no application
 * workflow id, so the only link from a package to a contract key is the flow's display name
 * against the register's `flow_name`. Name identity is exactly what the audit finds unreliable
 * here — F-010, 26 of 43 workflow records aliased or shared. So the match is exact rather than
 * fuzzy, each candidate records `source` and `matchBasis`, package candidates carry
 * `applicationWorkflowId: null` rather than inheriting the key's, and each key's `resolution`
 * distinguishes EXTRACTED from PACKAGE_ONLY. A name match is not a proof and must not be able to
 * read like one.
 *
 * AND A FOURTH IDENTIFIER, WHICH IS A TRAP
 * A package writes its flow under `Microsoft.Flow/flows/<A>/definition.json` and that file's own
 * `name` is <B>. <A> is a PACKAGE RESOURCE ID, minted per export; <B> is the tenant flow id. They
 * differ on every package here — IP_Bulk_Assign_Endpoint exports under 0fa9560c-… while its name
 * is 0d1e8df5-…, the id the catalogue holds and the portal opens. Reading the folder yields a
 * well-formed GUID that addresses nothing, so it is recorded as `packageResourceId` and the test
 * asserts no candidate ever carries one.
 *
 * WHY IT IS GENERATED RATHER THAN TRANSCRIBED
 * The same reason as `build-http-flow-registry-spec.mjs`: a hand-copied crosswalk is a
 * transcription that nobody re-runs, and this tree has already paid for three of those. The
 * workbook ships beside its extraction and `--check` fails when the two disagree.
 *
 * WHAT THIS DOES NOT DO
 * It does not decide which of two candidate tenant flows is live. Six contract keys resolve to
 * two flows each — a duplicate, a rename, or a genuine consolidation, the catalogue does not say
 * which — and choosing between them from a display name or a modified date would be a guess
 * recorded as a fact. The harvester settles it against evidence instead: it asks each candidate
 * for its callback URL and keeps the one whose invoke URL carries the application workflow id the
 * register already holds. `candidates` is therefore a list, deliberately, and stays one.
 *
 * Usage:
 *   node scripts/build-flow-identity-crosswalk.mjs
 *   node scripts/build-flow-identity-crosswalk.mjs --check
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbook } from './lib/xlsx-reader.mjs';
import { openZip } from './lib/zip-reader.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const check = process.argv.includes('--check');

const SOURCE = 'docs/reference/dgo-endpoint-catalog.xlsx';
const REGISTER = 'docs/reference/endpoint-register.json';
const EXPORTS = 'docs/reference/flow-exports';
const TARGET = 'docs/reference/flow-identity-crosswalk.json';
const SCHEMA_VERSION = '1.0.0';

const fail = (message) => { console.error(`\n  ❌ ${message}\n`); process.exit(1); };

/* Declared header rows, as drift guards. If a later export renames, reorders or inserts a
   column, this build fails and names the sheet rather than quietly emitting a differently
   shaped record under the same key. */
const HEADERS = {
  'Endpoint Register': ['No.', 'Contract key(s)', 'Retrieval', 'Canonical flow', 'Tenant display name',
    'Tenant flow ID', 'Application workflow ID', 'Method', 'State', 'Mapping', 'Registry status',
    'Created UTC', 'Modified UTC', 'Action count', 'Resource count', 'Failure code', 'Failure message'],
  'Manual Key Coverage': ['Contract key', 'Records', 'Found', 'Tenant flow names', 'Tenant flow IDs',
    'Application workflow IDs', 'Registry statuses'],
  'Governance & Metadata': ['Field', 'Value'],
};

const workbook = readWorkbook(join(ROOT, SOURCE));
const sheetOf = (name) => {
  const sheet = workbook.sheets[name];
  if (!sheet) fail(`${SOURCE} has no sheet "${name}"`);
  const header = (sheet.rows[0] || []).map((c) => (c === null ? '' : String(c).trim()));
  const want = HEADERS[name];
  if (header.length < want.length || want.some((h, i) => header[i] !== h)) {
    fail(`${SOURCE} sheet "${name}" has an unexpected header row.\n`
       + `       expected: ${want.join(' | ')}\n`
       + `       found   : ${header.join(' | ')}`);
  }
  return sheet.rows.slice(1)
    .filter((row) => row.some((c) => c !== null && String(c).trim() !== ''))
    .map((row) => Object.fromEntries(want.map((h, i) => [h, row[i] ?? null])));
};

const text = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
const list = (v) => (text(v) || '').split(',').map((s) => s.trim()).filter(Boolean);

const metadataRows = sheetOf('Governance & Metadata');
const metadata = Object.fromEntries(metadataRows.map((r) => [text(r.Field), text(r.Value)]));

/* This workbook is committed to the tree. The claim that makes that safe is its own
   `credentials_removed`, so it is asserted, not coerced: the cell is a BOOLEAN, and a
   `=== 'True'` comparison on it reads false against a workbook that says true — understating it
   in the record while the file is committed either way. An absent or false value stops the build.

   This is belt to the braces, not the braces. `tests/check-secrets.mjs` skips .xlsx members when
   it unpacks an archive, so the archive was also unpacked and scanned by hand before committing:
   no sig=, no SharedAccessSignature, no bearer token, no invoke URL. */
const credentialsRemoved = metadataRows.find((r) => text(r.Field) === 'credentials_removed')?.Value;
if (credentialsRemoved !== true && String(credentialsRemoved).toLowerCase() !== 'true') {
  fail(`${SOURCE} does not declare credentials_removed — it reads ${JSON.stringify(credentialsRemoved)}. `
     + 'A workbook that does not claim its credentials were stripped does not belong in the tree.');
}
const register = sheetOf('Endpoint Register');
const coverage = sheetOf('Manual Key Coverage');

/* The register is per FLOW; coverage is per CONTRACT KEY. The crosswalk is consumed per key —
   a values file has one line per key — so coverage drives, and the register supplies the detail
   for each flow it names. */
const flowById = new Map();
for (const row of register) {
  const id = text(row['Tenant flow ID']);
  if (!id) continue;
  flowById.set(id, {
    tenantFlowId: id,
    tenantDisplayName: text(row['Tenant display name']),
    source: 'tenant-extraction',
    /* The catalogue resolved the key to this flow itself, by application workflow id. */
    matchBasis: 'catalogue-key-row',
    /* Set by nothing here. It becomes 'listCallbackUrl' only when a harvest has seen this flow's
       invoke URL carry the register's application workflow id. Until then every row in this file
       is a claim about identity, not a proof of it — which is also what the catalogue says about
       itself: every one of its rows reads TENANT_CONFIRMATION_REQUIRED. */
    verifiedBy: null,
    canonicalFlow: text(row['Canonical flow']),
    applicationWorkflowId: text(row['Application workflow ID']),
    retrieval: text(row.Retrieval),
    method: text(row.Method),
    state: text(row.State),
    mapping: text(row.Mapping),
    registryStatus: text(row['Registry status']),
    createdUtc: text(row['Created UTC']),
    modifiedUtc: text(row['Modified UTC']),
    actionCount: typeof row['Action count'] === 'number' ? row['Action count'] : null,
    resourceCount: typeof row['Resource count'] === 'number' ? row['Resource count'] : null,
  });
}

/* A key with no tenant flow still needs a row. "Not in the crosswalk" and "in the crosswalk,
   unevidenced, and here is the failure the exporter reported" are different states, and only the
   second tells an operator whether to go looking or to go asking. */
const failureByWorkflowId = new Map();
for (const row of register) {
  const wf = text(row['Application workflow ID']);
  const code = text(row['Failure code']);
  if (wf && code && !failureByWorkflowId.has(wf)) {
    failureByWorkflowId.set(wf, { code, message: text(row['Failure message']) });
  }
}

/* ---- the second evidence source: exported flow packages ------------------------------------
   An export package answers a question the catalogue cannot: it comes from the tenant even when
   the catalogue's extractor could not resolve the flow, which is the state six contract keys are
   in. Three of them are closed by the packages in `docs/reference/flow-exports`.

   A PACKAGE CARRIES TWO GUIDS AND ONLY ONE OF THEM IS THE FLOW.

     `Microsoft.Flow/flows/<A>/definition.json`   — <A> is a PACKAGE RESOURCE ID. It is minted per
                                                    export and means nothing outside the archive.
     that file's own `name` / `id`               — THIS is the tenant flow id.

   They differ, and the difference is not cosmetic: IP_Bulk_Assign_Endpoint exports under package
   resource 0fa9560c-… while its `name` is 0d1e8df5-…, which is the id the catalogue records and
   the id the portal opens. Reading the folder would have produced a plausible GUID that addresses
   nothing — a fourth identifier in a file written to stop exactly that confusion. So the folder
   id is recorded under its own name and never used as a flow id.

   THE MATCH IS BY DISPLAY NAME, AND THAT IS WEAKER THAN THE CATALOGUE'S.
   A package does not carry an application workflow id, so the only link to a contract key is the
   flow's display name against the register's `flow_name`. The audit is blunt about how weak name
   identity is here — F-010 finds 26 of 43 workflow records aliased or shared. The match is
   therefore EXACT, never fuzzy, and every candidate records how it was matched so that nothing
   downstream mistakes a name match for a proven one. The proof is a callback URL whose invoke
   path carries the register's application workflow id, and the harvester does that, not this. */
function readExports() {
  let names;
  try { names = readdirSync(join(ROOT, EXPORTS)).filter((n) => n.endsWith('.zip')).sort(); }
  catch { return []; }
  return names.map((file) => {
    const abs = join(ROOT, EXPORTS, file);
    const zip = openZip(abs);
    const member = zip.members.find((m) => /^Microsoft\.Flow\/flows\/[^/]+\/definition\.json$/.test(m.name));
    if (!member) fail(`${EXPORTS}/${file} carries no Microsoft.Flow/flows/<id>/definition.json`);
    let definition;
    try { definition = JSON.parse(member.read().toString('utf8')); }
    catch (e) { fail(`${EXPORTS}/${file}: definition.json is not JSON — ${e.message}`); }

    const tenantFlowId = text(definition.name);
    const displayName = text(definition.properties?.displayName);
    if (!tenantFlowId || !TENANT_ID.test(tenantFlowId)) {
      fail(`${EXPORTS}/${file}: definition.json name is ${JSON.stringify(definition.name)}, not a flow id`);
    }

    const triggers = definition.properties?.definition?.triggers || {};
    /* By KIND. "manual" is a convention and a renamed trigger misses on a name match — the same
       rule the harvesters follow, for the same reason. */
    const triggerName = Object.keys(triggers).find((n) => triggers[n]?.type === 'Request') || null;

    return {
      package: `${EXPORTS}/${file}`,
      sha256: createHash('sha256').update(readFileSync(abs)).digest('hex'),
      exportedUtc: text(JSON.parse(zip.members.find((m) => m.name === 'manifest.json').read().toString('utf8')).details?.createdTime),
      tenantFlowId,
      displayName,
      /* Deliberately named for what it is. It is not a flow id and must never be used as one. */
      packageResourceId: member.name.split('/')[2],
      requestTrigger: triggerName,
      requestTriggerMethod: triggerName ? (text(triggers[triggerName]?.inputs?.method) || null) : null,
      /* `All` means anonymous — the signature alone authenticates. `Tenant` means the caller
         presents an Entra token instead, and the trigger's callback URL then carries NO
         SIGNATURE. A harvester that requires one refuses such a flow correctly and for a
         reason nobody can guess: IP_SCAN_INTAKE matched its workflow id exactly and was still
         refused on the first live run. Recorded here because the package's own definition is
         the authority on it, not a derived extraction. */
      requestTriggerAuthentication: triggerName
        ? (text(triggers[triggerName]?.inputs?.triggerAuthenticationType) || null)
        : null,
    };
  });
}

const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/* The catalogue names a key bare (`VERIFY`); the register names it with its system prefix
   (`PF_ENDPOINT_VERIFY`). Joining on the bare name is what makes this crosswalk usable from the
   register, so the join is done HERE, once, and asserted — rather than left as a rule each
   consumer reimplements slightly differently.

   Suffix matching would be wrong and would look right: `PF_ENDPOINT_VERIFY` and
   `DGO_ENDPOINT_OTP_VERIFY` both end in `_VERIFY`. Only a whole-key match against a declared
   prefix is unambiguous, and the build fails if a key matches none or more than one. */
const PREFIXES = ['DGO_ENDPOINT_', 'PF_ENDPOINT_'];
const registerByKey = new Map(
  JSON.parse(readFileSync(join(ROOT, REGISTER), 'utf8')).current_configuration.map((e) => [e.key, e]));

const contractKeyFor = (bare) => {
  const hits = PREFIXES.map((p) => p + bare).filter((k) => registerByKey.has(k));
  if (!hits.length) fail(`${SOURCE} names contract key ${bare}, which ${REGISTER} does not carry under any of: ${PREFIXES.join(', ')}`);
  if (hits.length > 1) fail(`contract key ${bare} matches ${hits.join(' and ')} in ${REGISTER}; the join must be unambiguous`);
  return hits[0];
};

const exportPackages = readExports();

/* Register flow_name -> the contract keys that name it. Exact, and many-to-one: three AI keys
   share one flow name, and closing one of them closes all three or none. */
const keysByFlowName = new Map();
for (const entry of registerByKey.values()) {
  if (!keysByFlowName.has(entry.flow_name)) keysByFlowName.set(entry.flow_name, []);
  keysByFlowName.get(entry.flow_name).push(entry.key);
}
const packagesByContractKey = new Map();
for (const pkg of exportPackages) {
  for (const contractKey of keysByFlowName.get(pkg.displayName) || []) {
    if (!packagesByContractKey.has(contractKey)) packagesByContractKey.set(contractKey, []);
    packagesByContractKey.get(contractKey).push(pkg);
  }
}

const keys = coverage.map((row) => {
  const key = text(row['Contract key']);
  const workflowIds = list(row['Application workflow IDs']);
  if (workflowIds.length > 1) fail(`contract key ${key} names ${workflowIds.length} application workflow ids; the crosswalk assumes one`);

  const catalogueApplicationWorkflowId = workflowIds[0] || null;
  const contractKey = contractKeyFor(key);
  const applicationWorkflowId = registerByKey.get(contractKey).workflow_id;

  const candidates = list(row['Tenant flow IDs']).map((id) => {
    const flow = flowById.get(id);
    if (!flow) fail(`contract key ${key} names tenant flow ${id}, which the Endpoint Register sheet does not carry`);

    if (
      flow.applicationWorkflowId &&
      flow.applicationWorkflowId !== applicationWorkflowId
    ) {
      return {
        ...flow,
        catalogueApplicationWorkflowId: flow.applicationWorkflowId,
        catalogueIdentityStatus: 'SUPERSEDED_BY_ENDPOINT_REGISTER',
        applicationWorkflowId,
      };
    }

    return flow;
  });

  /* A package already named by the catalogue adds nothing but noise — and would make one flow
     appear twice under one key, which is exactly the ambiguity this file exists to avoid. */
  const known = new Set(candidates.map((c) => c.tenantFlowId));
  const fromPackages = (packagesByContractKey.get(contractKey) || [])
    .filter((p) => !known.has(p.tenantFlowId))
    .map((p) => ({
      tenantFlowId: p.tenantFlowId,
      tenantDisplayName: p.displayName,
      source: 'export-package',
      /* Weaker than the catalogue's, and labelled so. The register's flow_name matched the
         package's display name exactly; nothing here proves the flow serves this key. */
      matchBasis: 'register-flow-name',
      verifiedBy: null,
      package: p.package,
      exportedUtc: p.exportedUtc,
      requestTrigger: p.requestTrigger,
      requestTriggerMethod: p.requestTriggerMethod,
      requestTriggerAuthentication: p.requestTriggerAuthentication,
      /* A package carries no application workflow id. Copying the key's in here would turn an
         unproven name match into a recorded fact. */
      applicationWorkflowId: null,
    }));

  const confirmedByPackage = (packagesByContractKey.get(contractKey) || []).some((p) => known.has(p.tenantFlowId));
  candidates.push(...fromPackages);
  const resolved = candidates.length > 0;
  return {
    key,
    contractKey,
    applicationWorkflowId,
    ...(catalogueApplicationWorkflowId !== applicationWorkflowId
      ? {
          catalogueApplicationWorkflowId,
          catalogueIdentityStatus: 'SUPERSEDED_BY_ENDPOINT_REGISTER',
        }
      : {}),
    canonicalFlow: text(row['Tenant flow names']) ? candidates[0]?.canonicalFlow ?? null : null,
    registryStatus: text(row['Registry statuses']),
    records: typeof row.Records === 'number' ? row.Records : null,
    found: typeof row.Found === 'number' ? row.Found : null,
    /* Three states, because "the tenant extraction found it" and "the extraction failed but an
       export package names the same flow" are different grades of evidence and an operator
       chasing the six open keys needs to know which one they are looking at. */
    resolution: candidates.some((c) => c.source === 'tenant-extraction') ? 'EXTRACTED'
      : (candidates.length ? 'PACKAGE_ONLY' : 'UNRESOLVED'),
    /* An export package independently reproduced a flow id the extraction already had. */
    corroboratedByPackage: confirmedByPackage,
    resolved,
    /* Deliberately a list. See the header: nothing here picks the live one. */
    candidates,
    failure: resolved ? null : (failureByWorkflowId.get(applicationWorkflowId) || null),
  };
});

/* Both populations are 25 and every row joins, so a change on either side that breaks the
   one-to-one is a build failure rather than a silently shorter crosswalk. */
if (keys.length !== registerByKey.size) {
  fail(`${SOURCE} carries ${keys.length} contract keys and ${REGISTER} carries ${registerByKey.size}; every register key must have exactly one crosswalk row`);
}

const unevidenced = keys.filter((k) => !k.resolved);
const ambiguous = keys.filter((k) => k.candidates.length > 1);

/* Every package, matched or not. An export the register cannot place by name is the finding, not
   the leftover: IP_FETCH_ALL__EXTENDED_ENDPOINT and IP_Create_Email_Assignment are each one
   character-run away from a flow_name the register holds, and a near miss dropped on the floor
   is how an endpoint ends up served by a flow nobody records. */
const claimedByKey = new Map();
for (const row of keys) for (const c of row.candidates) if (c.source === 'export-package') claimedByKey.set(c.tenantFlowId, row.contractKey);
const matchedIds = new Set([...claimedByKey.keys()]);
const catalogued = new Set(flowById.keys());
const exports = exportPackages.map((p) => ({
  ...p,
  matchedContractKeys: keys.filter((k) => k.candidates.some((c) => c.tenantFlowId === p.tenantFlowId)).map((k) => k.contractKey),
  disposition: matchedIds.has(p.tenantFlowId) ? 'NEW_EVIDENCE_FOR_A_CONTRACT_KEY'
    : catalogued.has(p.tenantFlowId) ? 'CORROBORATES_THE_EXTRACTION'
    : 'NO_REGISTER_FLOW_NAME_MATCHES_ITS_DISPLAY_NAME',
}));
const unplaced = exports.filter((e) => e.disposition === 'NO_REGISTER_FLOW_NAME_MATCHES_ITS_DISPLAY_NAME');

const out = {
  schemaVersion: SCHEMA_VERSION,
  generatedBy: 'scripts/build-flow-identity-crosswalk.mjs',
  purpose: 'Map each contract key to the tenant flow ids that serve it, alongside the application '
    + 'workflow id the endpoint register keys on. The two identifiers address the same flow in '
    + 'different services — execution and management — and neither is derivable from the other.',
  source: {
    workbook: SOURCE,
    sha256: createHash('sha256').update(readFileSync(join(ROOT, SOURCE))).digest('hex'),
    extractionSource: metadata.generated_from || null,
    exporter: metadata['governance.exporter_display_name'] || null,
    environmentName: metadata.environment_name || null,
    generatedAtUtc: metadata.generated_at_utc || null,
    credentialsRemoved: true,
    declaredInputCount: Number(metadata.input_count) || null,
    declaredFoundCount: Number(metadata.found_count) || null,
    declaredNotFoundCount: Number(metadata.not_found_count) || null,
  },
  identifierDomains: {
    applicationWorkflowId: {
      shape: '32 hexadecimal characters, no dashes',
      addresses: 'execution — the workflow segment of a signed invoke URL',
      heldBy: 'docs/reference/endpoint-register.json, and every values file',
    },
    tenantFlowId: {
      shape: 'dashed GUID',
      addresses: 'management — /powerautomate/flows/<id> and exported package names',
      heldBy: 'this crosswalk, and docs/reference/flow-contracts/deployed/ filenames',
    },
    relationship: 'Not derivable in either direction. Inserting dashes into an application '
      + 'workflow id yields a GUID the management API answers 404 for.',
  },
  counts: {
    contractKeys: keys.length,
    registerKeys: registerByKey.size,
    resolved: keys.length - unevidenced.length,
    unevidenced: unevidenced.length,
    extracted: keys.filter((k) => k.resolution === 'EXTRACTED').length,
    packageOnly: keys.filter((k) => k.resolution === 'PACKAGE_ONLY').length,
    keysWithMoreThanOneCandidate: ambiguous.length,
    distinctTenantFlows: flowById.size,
    exportPackages: exports.length,
    exportPackagesUnplaced: unplaced.length,
    verified: keys.filter((k) => k.candidates.some((c) => c.verifiedBy)).length,
  },
  keys,
  exports,
};

const rendered = `${JSON.stringify(out, null, 2)}\n`;
const path = join(ROOT, TARGET);

if (check) {
  let current = null;
  try { current = readFileSync(path, 'utf8'); } catch { /* absent is drift */ }
  if (current !== rendered) fail(`${TARGET} is out of date — run \`npm run crosswalk\``);
  console.log(`  ✅ ${TARGET} matches ${SOURCE} and ${out.counts.exportPackages} export packages — `
    + `${out.counts.extracted} extracted, ${out.counts.packageOnly} package-only, ${out.counts.unevidenced} unevidenced`);
} else {
  writeFileSync(path, rendered);
  console.log(`  ✅ ${TARGET} — ${out.counts.contractKeys} contract keys: ${out.counts.extracted} from the tenant `
    + `extraction, ${out.counts.packageOnly} from an export package alone, ${out.counts.unevidenced} unevidenced`);
  console.log(`     ${out.counts.keysWithMoreThanOneCandidate} keys have more than one candidate flow; `
    + `${out.counts.exportPackages} export packages read, ${out.counts.exportPackagesUnplaced} with no register flow_name match`);
  for (const e of unplaced) console.log(`     ⚠ ${e.displayName} (${e.package}) matches no flow_name in ${REGISTER}`);
}
