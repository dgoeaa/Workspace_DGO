#!/usr/bin/env node
/**
 * Builds the identification kit's paste packages from scripts/lib/identification-kit.mjs.
 *
 *   npm run idkit
 *   npm run idkit -- --check
 *
 * Output: docs/folio-Master-Flows-and-Endpoints/packages/identification-kit/. One designer-paste file per block, and a README
 * that says what each block does, what it needs, and in which order to paste. tests/identification-kit.test.mjs
 * checks the B1 paste rules on every file.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from './lib/identification-kit.mjs';
import { connectionData } from './lib/folio-flows-live-flow.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const OUT = 'docs/folio-Master-Flows-and-Endpoints/packages/identification-kit';
const cat = JSON.parse(readFileSync(join(ROOT, 'docs/reference/identification/identifier-catalogue.json'), 'utf8'));
const CONFIG_SITE = 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING';
const DATASETS = cat.datasets.filter((d) => d.entityType || d.key === 'SEQUENCE_COUNTERS').map((d) => d.key);
const TARGETABLE = cat.datasets.filter((d) => d.entityType && d.role !== 'event-stream').map((d) => d.key);

const header = () => [K.readDatasetBindings({ keys: DATASETS, configSite: CONFIG_SITE }), K.environmentPrefix(), K.requestContext()];

const PACKAGES = [
  { file: '00-identity-header', scope: 'Scope_Identity_Header', title: 'Identity header',
    what: 'Reads the dataset bindings and ENVIRONMENT_CODE from Flow Configuration, sets the environment prefix (Z outside production, and Z if ENVIRONMENT_CODE is missing), and mints the Request ID. Every other block needs it, so it is pasted first, once per flow.',
    blocks: header },
  { file: '01-claim-registry-reference', scope: 'Scope_Claim_Registry_Reference', title: 'Claim a Registry Reference (NITDA-YYYY-NNNNN)',
    what: 'Mints the record\'s Entity Key and claims one number from the NITDA counter in up to 10 flat attempts, then answers 503 RETRY_LATER if every attempt failed. Output: Compose_EntityKey_Record and Compose_Claim_Registry ({ ok, year, first, last, references }).',
    blocks: () => [K.entityKey('Record'), K.claimReference({ tag: 'Registry', prefix: 'NITDA' }), K.claimFailedResponse('Registry')] },
  { file: '02-claim-task-references', scope: 'Scope_Claim_Task_References', title: 'Claim Task References (TASK-YYYY-NNNNN), single or bulk',
    what: 'Claims as many task numbers as the request has tasks (body tasks[], or 1) in one counter update, and hands them out in order. Output: Compose_Claim_Task.references[].',
    blocks: () => [K.claimReference({ tag: 'Task', prefix: 'TASK', count: "@max(1, length(coalesce(triggerBody()?['tasks'], json('[]'))))" }), K.claimFailedResponse('Task')] },
  { file: '03-claim-file-reference', scope: 'Scope_Claim_File_Reference', title: 'Claim a File Reference (FILE-YYYY-NNNNN)',
    what: 'For DYNAMIC_ACTIONS open_file: mints the registry file\'s Entity Key and claims one FILE number.',
    blocks: () => [K.entityKey('File'), K.claimReference({ tag: 'File', prefix: 'FILE' }), K.claimFailedResponse('File')] },
  { file: '04-case-reference', scope: 'Scope_Case_Reference', title: 'Draw a Case Reference (CASE-XXXXXX)',
    what: 'Draws CASE- plus 6 characters from the unambiguous alphabet with rand(), checks SUPPORT_CASES for a collision, and redraws up to 5 times. Any reference sent by the client is ignored. Output: Compose_CaseRef_Case.',
    blocks: () => [K.entityKey('Case'), K.caseReference({})] },
  { file: '05-guarded-update', scope: 'Scope_Guarded_Update', title: 'Guarded Update (Rev + IF-MATCH)',
    what: 'Applies the request\'s changes to a TASK_QUEUE row with IF-MATCH, bumping Rev, in up to 3 flat attempts that each re-read the row. Copy it for any governed list by changing the dataset and the changes expression. Output: Compose_Updated_Task ({ ok, revAfter }).',
    blocks: () => [K.guardedUpdate({ tag: 'Task', dataset: 'TASK_QUEUE', itemId: "@{triggerBody()?['itemId']}", changes: "coalesce(triggerBody()?['changes'], json('{}'))" })] },
  { file: '06-void-registry-row', scope: 'Scope_Void_Registry_Row', title: 'VOID row for a claimed Registry Reference',
    what: 'Runs when the record write fails after a claim (set its run-after to the record write: has failed). Writes the register\'s required columns as owner decision Q2 (3 October 2026) set them: Title VOID, ReferenceId = the claimed number, Status void, SenderEmail, plus VoidReason and IdState VOID, so the number is accounted for.',
    blocks: () => [K.voidRow({ tag: 'Registry', dataset: 'INTAKE_REGISTER', referenceColumn: 'ReferenceId', reference: "@{first(outputs('Compose_Claim_Registry')?['references'])}", reason: 'RECORD_WRITE_FAILED', fields: { Title: 'VOID', Status: 'void', SenderEmail: "@{toLower(trim(string(coalesce(triggerBody()?['payload']?['email'], triggerBody()?['email'], ''))))}" } })] },
  { file: '07-client-request-hash', scope: 'Scope_Client_Request_Hash', title: 'Repeat-request check (ClientRequestHash)',
    what: 'Before creating anything for a Folio action, looks for a row created from the same action in the last 7 days. When Compose_Replay_Task is not null, the flow returns that row unchanged.',
    blocks: () => [K.clientRequestHashCheck({ tag: 'Task', dataset: 'TASK_QUEUE' })] },
  { file: '08-resolve-target', scope: 'Scope_Resolve_Target', title: 'Resolve a target (Entity Key, else spo: locator)',
    what: 'Classifies the request\'s target as an Entity Key or an spo:<listGuid>/<itemId> locator on a bound dataset. Anything else is unresolved, and the flow answers 400 TARGET_UNRESOLVED. A bare item ID, RefIDD or title is never accepted.',
    blocks: () => [K.resolveTarget({ tag: 'Request', datasets: TARGETABLE })] },
];

const files = {};
for (const p of PACKAGES) {
  const actions = K.chain(...p.blocks());
  files[`${p.file}.designer-paste.json`] = JSON.stringify({
    nodeId: p.scope,
    serializedValue: { type: 'Scope', actions, runAfter: {} },
    allConnectionData: connectionData(actions),
    staticResults: {}, isScopeNode: true, mslaNode: true,
  }, null, 2) + '\n';
}

const cfgRows = ['ENVIRONMENT_CODE', ...DATASETS.flatMap((k) => [`DATASET_${k}_SITE_URL`, `DATASET_${k}_LIST_ID`])];
files['README.md'] = `# Identification kit

**Generated by \`npm run idkit\` from \`scripts/lib/identification-kit.mjs\`. Do not edit by hand.**

The one source of every block a flow uses to mint, claim, update or resolve an identifier
([IDENTIFICATION_SYSTEM.md](../../../reference/identification/IDENTIFICATION_SYSTEM.md) §8). Each file is
a scope for the flow designer's clipboard: open the flow, select the step after which the block belongs,
and paste.

## Paste rules every block obeys (B1)

- No variables. A pasted scope cannot declare one, so every value is a Compose, evaluated once per run.
- No Until loop and no Filter array. Retries are flat attempts: attempt *k* runs only if attempt *k-1* failed.
- Every SharePoint write that must not lose a concurrent change is an HTTP MERGE with \`IF-MATCH\` (B9).
- No list is addressed by title or a hard-coded GUID, except Flow Configuration, which holds the bindings.
- The Request ID is always \`guid()\`. A client value is kept only as \`clientCorrelationId\`.

## Before the first paste

Flow Configuration needs these rows (Title, ConfigValue). Phase 1 creates them
(\`docs/reference/identification/provisioning/\`):

${cfgRows.map((t) => `- \`${t}\``).join('\n')}

## Blocks, in paste order

| File | Block | What it does |
|---|---|---|
${PACKAGES.map((p) => `| \`${p.file}.designer-paste.json\` | ${p.title} | ${p.what.replace(/\|/g, '\\|')} |`).join('\n')}

\`00-identity-header\` goes first, once. The others go where the flow needs them. Two blocks in one flow
need different tags; tags are set when the kit is generated, so ask for a variant rather than renaming
actions by hand.
`;

let stale = 0;
if (!CHECK) mkdirSync(join(ROOT, OUT), { recursive: true });
for (const [name, text] of Object.entries(files)) {
  const p = join(ROOT, OUT, name);
  if (CHECK) {
    if (!existsSync(p) || readFileSync(p, 'utf8') !== text) { console.error(`stale: ${OUT}/${name}`); stale++; }
  } else writeFileSync(p, text);
}
if (CHECK && stale) { console.error('Run: npm run idkit'); process.exit(1); }
console.log(`identification kit: ${Object.keys(files).length} files ${CHECK ? 'up to date' : 'written'}`);
