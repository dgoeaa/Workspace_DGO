#!/usr/bin/env node
/**
 * DGO_FLOW_TRUTH_PERSISTENCE — the corrected persistence scope.
 *
 *   npm run flowtruth            # build the package and its companions
 *   npm run flowtruth -- --check # fail if the committed artefacts are stale
 *
 * WHAT THIS REPLACES.
 *
 * A hand-written clipboard package, `Scope_SharePoint_Flow_Truth_Persistence`, was submitted for
 * review. Run through the estate's own gate it produced 52 failures where all thirty-four
 * committed packages produce none, and the review in
 * `docs/audits/FLOW_TRUTH_PERSISTENCE_REVIEW.md` records every one of them with its evidence.
 * This is the rebuild. It is generated rather than edited because the repository has been bitten
 * three times by hand-copied artefacts drifting from the thing they describe, and because a
 * package that cannot be regenerated cannot be proved current.
 *
 * THE FOUR DECISIONS THAT SHAPE IT.
 *
 * 1. IT WRITES TO THE ESTATE'S REGISTRY, NOT A SECOND ONE. The submitted scope invented three
 *    lists — `NITDA Flow Truth Registry`, `... History`, `... Artefacts` — on the activity-
 *    tracking site, keyed on `RegistryKey`. `docs/reference/http-flow-registry-spec.json`
 *    already designs that database: seven lists on `/sites/DGO_ECM_GOVERNANCE`, 101 fields,
 *    `RegistryKey` unique and indexed on `DGO_HTTPFlowRegistry`, `ExecutionKey` unique and
 *    indexed on `DGO_HTTPFlowExecutionLedger`. Two registries of one estate is how a fact gets
 *    recorded twice and reconciled never, so this targets the designed one. The site, the list
 *    titles and their GUIDs are read from `docs/deployment/governance/list-bindings.json`, which
 *    is the single place to change if the agency rules otherwise.
 *
 * 2. THE UNIQUE KEY IS THE IDEMPOTENCY GUARD; THE READ IS ONLY AN OPTIMISATION. The submitted
 *    scope read the history list, branched on whether the row existed — and then ran the persist
 *    scope after the CONDITION rather than inside its `else`, so it persisted on both branches
 *    and reported `AlreadyPersisted` while writing a duplicate. Here the persist scope is inside
 *    the `else`, and `ExecutionKey` is unique at the list level so a lost race is refused by
 *    SharePoint rather than by a check that can be raced.
 *
 * 3. IT CAPTURES WHAT THE GOVERNANCE DESIGN SAYS TO CAPTURE. The registry design ships
 *    `CaptureRequestBody=false` and `CaptureHeaders=false` as configuration seeds, and
 *    `tests/http-flow-registry.test.mjs` holds them there on purpose: "a seed flipped to true is
 *    a governance change, not a configuration tweak". The submitted scope composed redacted
 *    headers and queries and then wrote `"outputs": "@triggerOutputs()"` beside them, which
 *    carries the trigger URL and its `sig=` token in `x-ms-igw-external-uri` — the exact leak
 *    `verify-designer-paste.mjs` check 9b exists to stop — while the same record asserted
 *    `credentialsExcluded: true`. This writes the host's REDACTED headers and queries only, and
 *    records the withheld fields by name so the omission is visible rather than silent.
 *
 * 4. NOTHING IS ASSERTED THAT IS NOT MEASURED. `RunStatus: "Succeeded"` was a literal in all
 *    three of the submitted scope's item writes, on a scope that runs after a failed upstream
 *    scope too; `DurationMilliseconds` was the literal `0`; `IntegrityVerified: true` sat beside
 *    a manifest that computes no digest. Outcome is derived from `varStatusCode`, duration from
 *    `varStartTicks`, and the manifest records the ETag and byte size SharePoint returns at
 *    write time — which are verifiable — and says in its own text that no digest is computed,
 *    because the workflow definition language has no hashing function.
 *
 * WHY IT IS NOT IN THE TWO GATED designer-paste DIRECTORIES.
 *
 * Those two directories are gated by `verify-designer-paste.mjs --strict` in CI, and one of its
 * checks is that every SharePoint action targets a list the tenant capture actually holds. The
 * seven governance lists are defined and not built. Committing this beside the thirty-four live
 * packages would either turn CI red or require weakening the check that keeps the other
 * thirty-four honest. It lives here, with its own gate, until `list-bindings.json` carries GUIDs.
 *
 * NO SECRET IS WRITTEN. Connection ids name environment resources; the credential lives in the
 * connection. No trigger URL is read, composed or emitted.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
/* Repo rule: never slice a path root off with string replacement — it breaks on Windows and on
   any checkout whose path differs. */
const rel = (p) => relative(ROOT, p).split(sep).join('/');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const OUT = join(ROOT, 'docs/deployment/governance/flows');
const FLOW = 'DGO_FLOW_TRUTH_PERSISTENCE';
const SCHEMA_VERSION = '2.0';
const PACKAGE_VERSION = '1.0.0';

/* ---------------------------------------------------------------- the bindings */

const bindings = read('docs/deployment/governance/list-bindings.json');
const SITE = bindings.targetSite;
const design = read('docs/reference/http-flow-registry-spec.json');

/* A list that has never been provisioned has no GUID. Until `list-bindings.json` carries one,
   the action targets the list by TITLE and the package is marked not-paste-ready — visibly, in
   its own companion file — rather than shipping a GUID nobody has ever seen. */
const bind = (title) => bindings.lists[title] ?? bindings.libraries[title] ?? title;
const bound = (title) => Boolean(bindings.lists[title] ?? bindings.libraries[title]);

const REGISTRY = 'DGO_HTTPFlowRegistry';
const LEDGER = 'DGO_HTTPFlowExecutionLedger';
const LIBRARY = 'DGO_HTTPFlowArtefacts';
const PASTE_READY = [REGISTRY, LEDGER, LIBRARY].every(bound);

/* Every column this package writes, checked against the design workbook before it is emitted.
   The designer validates `item/<Column>` against the connector's operation definition at SAVE
   time and refuses the whole flow with `WorkflowOperationParametersExtraParameter`; a column
   this repository invented would therefore fail in the operator's browser and not here. */
const DESIGNED = new Map();
for (const f of design.fields) {
  if (!DESIGNED.has(f.listTitle)) DESIGNED.set(f.listTitle, new Map());
  DESIGNED.get(f.listTitle).set(f.internalName, f);
}
const REQUIRED_OF = (list) =>
  [...DESIGNED.get(list)].filter(([, f]) => f.required === 'Yes').map(([n]) => n);

/* The role mailbox the registry design itself names for governance notices. Non-personal, and
   already in the repository — no individual's address is introduced by this build. */
const GOVERNANCE_MAILBOX = design.configSeeds.find((s) => s.configKey === 'GovernanceNotificationEmail').configValue;

/* ---------------------------------------------------------------- action helpers */

let seq = 0;
const mid = () => { seq++; return `c0000000-0000-4000-8000-${String(seq).padStart(12, '0')}`; };
const meta = () => ({ operationMetadataId: mid() });

const SP = 'shared_sharepointonline';
/* Read out of the OTP flow_run_records: SharePoint resolves to exactly one connection across the
   whole corpus, so the pasted actions arrive already wired. `shared_sharepointonline-1` — the
   value the submitted package carried — is a connection-reference name, and naming it while the
   api id still said `shared_sharepointonline` is what made every one of its thirteen connector
   entries fail both halves of the estate's binding check. */
const CONNECTION = '3f1943c5955a4cb8b301e8f22f2b590d';
const host = (operationId) => ({
  apiId: `/providers/Microsoft.PowerApps/apis/${SP}`,
  connection: SP,
  operationId,
});

const after = (...names) => Object.fromEntries(names.map((n) => [n, ['Succeeded']]));
const afterAny = (name, ...statuses) => ({ [name]: statuses });

const compose = (inputs, runAfter) => {
  const a = { type: 'Compose', inputs, metadata: meta() };
  if (runAfter) a.runAfter = runAfter;
  return a;
};
const sp = (operationId, parameters, runAfter) => {
  const a = { type: 'OpenApiConnection', inputs: { parameters, host: host(operationId) }, metadata: meta() };
  if (runAfter) a.runAfter = runAfter;
  return a;
};
const cond = (expression, actions, elseActions, runAfter) => {
  const a = { type: 'If', expression, actions, metadata: meta() };
  if (elseActions) a.else = { actions: elseActions };
  if (runAfter) a.runAfter = runAfter;
  return a;
};
const scope = (actions, runAfter) => {
  const a = { type: 'Scope', actions, metadata: meta() };
  if (runAfter) a.runAfter = runAfter;
  return a;
};

/* The estate's own `$filter` idiom: an OData string literal with every embedded apostrophe
   doubled, so a key carrying one cannot terminate the literal early. */
const eqFilter = (column, valueExpr) =>
  `@concat('${column} eq ''',replace(${valueExpr},'''',''''''),'''')`;

/* ---------------------------------------------------------------- expression fragments */

const HOST = (k) => `outputs('Compose_Host_Inputs')?['${k}']`;
const ID = (k) => `outputs('Compose_Persistence_Identity')?['${k}']`;
const TIMING = (k) => `outputs('Compose_Run_Timing')?['${k}']`;
const OUTCOME = (k) => `outputs('Compose_Run_Outcome')?['${k}']`;
const ROLLUP = (k) => `outputs('Compose_Registry_Rollup')?['${k}']`;

/* SharePoint DateTime columns take an ISO 8601 string. `utcNow()` emits seven fractional digits;
   the estate's own filters use this shorter form everywhere, so the writes use it too. */
const iso = (expr) => `formatDateTime(${expr},'yyyy-MM-ddTHH:mm:ssZ')`;

/* A Note column stops at 63,999 characters and SharePoint rejects the write above it rather
   than trimming. `substring(s,0,min(length(s),n))` is safe for every input length — which
   `if(greater(length(s),n), substring(...), s)` is not, because the workflow language evaluates
   both arms of `if()` and the substring would be computed on the short string too. Every guard
   in this package is written in the safe form for that reason. */
const NOTE_LIMIT = 60000;
const clampNote = (expr) => `substring(${expr},0,min(length(${expr}),${NOTE_LIMIT}))`;

/* SharePoint returns a server-relative path with the library name in it, and these libraries
   have spaces in their titles. An unencoded space produces a URL that resolves for nobody. */
const absoluteUrl = (action) =>
  `@concat('${new URL(SITE).origin}',replace(coalesce(outputs('${action}')?['body/Path'],''),' ','%20'))`;

const fileFacts = (action, name, contentType) => ({
  name,
  contentType,
  path: `@coalesce(outputs('${action}')?['body/Path'],'')`,
  /* ETag and byte size are what SharePoint actually returns at write time. They are recorded
     because they can be checked later against the stored item; no digest is claimed. */
  etag: `@coalesce(outputs('${action}')?['body/ETag'],'')`,
  sizeBytes: `@coalesce(outputs('${action}')?['body/Size'],0)`,
  url: absoluteUrl(action),
});

/* ---------------------------------------------------------------- the host contract */

/* THE SUBMITTED SCOPE READ EIGHT ACTIONS AND SIX VARIABLES THAT LIVE OUTSIDE IT.
 *
 * Each `outputs('X')` naming an action the host flow does not carry is a SAVE-time refusal —
 * "references action 'X' which is not defined in the template" — so the coupling is real and
 * cannot be softened away. What can be fixed is that it was spread across nine actions, none of
 * the reads was null-safe, and three of the six variables were invented names that no flow in
 * this estate declares.
 *
 * So every external read happens once, here, with a coalesce fallback, and everything downstream
 * reads this Compose. One action to edit when a host action is renamed; one action to look at to
 * know what the host must provide. The variables are the estate's own standard block, which
 * every conforming flow already declares — `varStatusCode`, `varErrors`, `varReceivedAtUtc`,
 * `varStartTicks` — instead of `EnvironmentName`, `NotificationCorrelationId`,
 * `FlowsFoundDetails`, `FlowsNotFoundDetails`, `RetrievalErrors` and `FlowsNotFoundCount`, none
 * of which is declared anywhere in this repository or in the fifty-eight tenant exports.
 *
 * The environment is read from `workflow()?['tags']?['environmentName']`, which Power Automate
 * populates on every run, rather than from a variable — one fewer thing the host must provide,
 * and it cannot be stale.
 */
const HOST_ACTIONS = {
  Compose_Redacted_Headers: 'Trigger headers with every secret-bearing header blanked, including x-ms-igw-external-uri and x-ms-igw-raw-target.',
  Compose_Redacted_Queries: 'Trigger query parameters with sig and code blanked.',
  Compose_Extraction_Result: 'The endpoint and flow inventory this run assembled.',
  Compose_Governance_Record: 'The governance assessment for this run.',
  Get_Current_Flow_Definition: 'The Power Automate flow resource for the flow being recorded.',
  Compose_Enterprise_Branded_HTML_Report: 'The rendered HTML report for this run.',
  Scope_Flow_Registry_Processing: 'The scope whose status is recorded (status only — its result() is not read).',
  Scope_Reporting: 'The scope whose status is recorded (status only — its result() is not read).',
};
const HOST_VARIABLES = {
  varStatusCode: 'integer — the run outcome the estate response envelope reports.',
  varErrors: 'array — the run error collection.',
  varReceivedAtUtc: 'string — ISO 8601 instant the run was received.',
  varStartTicks: 'integer — ticks(utcNow()) captured at the top of the run.',
};

const hostInputs = compose({
  contractVersion: PACKAGE_VERSION,
  /* json('{}') and json('[]') keep the shape stable when a host action was skipped: every
     consumer downstream can index into the result without a second guard. */
  redactedHeaders: "@coalesce(outputs('Compose_Redacted_Headers'),json('{}'))",
  redactedQueries: "@coalesce(outputs('Compose_Redacted_Queries'),json('{}'))",
  inventory: "@coalesce(outputs('Compose_Extraction_Result'),json('{}'))",
  governance: "@coalesce(outputs('Compose_Governance_Record'),json('{}'))",
  flowResource: "@coalesce(outputs('Get_Current_Flow_Definition')?['body'],json('{}'))",
  htmlReport: "@coalesce(outputs('Compose_Enterprise_Branded_HTML_Report'),'')",
  /* result() of a scope returns every contained action's inputs and outputs — unredacted, and
     without a size bound. The submitted scope embedded two of them in the record it wrote to
     SharePoint. The status is what the record actually needs. */
  registryProcessingStatus: "@coalesce(actions('Scope_Flow_Registry_Processing')?['status'],'NotRun')",
  reportingStatus: "@coalesce(actions('Scope_Reporting')?['status'],'NotRun')",
  statusCode: "@int(coalesce(variables('varStatusCode'),0))",
  errors: "@coalesce(variables('varErrors'),json('[]'))",
  receivedAtUtc: "@coalesce(variables('varReceivedAtUtc'),'')",
  startTicks: "@int(coalesce(variables('varStartTicks'),0))",
});

/* ---------------------------------------------------------------- identity and timing */

const ENV = "coalesce(workflow()?['tags']?['environmentName'],'UnknownEnvironment')";
const FLOWID = "coalesce(workflow()?['name'],'UnknownFlow')";
const RUNID = "coalesce(workflow()?['run']?['name'],'UnknownRun')";

const identity = compose({
  schemaVersion: SCHEMA_VERSION,
  recordType: 'DGOHTTPFlowTruthIdentity',
  targetSite: SITE,
  registryList: REGISTRY,
  ledgerList: LEDGER,
  artefactLibrary: LIBRARY,
  environmentId: `@${ENV}`,
  flowId: `@${FLOWID}`,
  flowDisplayName: `@coalesce(workflow()?['tags']?['flowDisplayName'],${FLOWID})`,
  runId: `@${RUNID}`,
  correlationId: `@${RUNID}`,
  /* The two keys the two lists enforce as unique. They are rebuilt from the same three
     expressions rather than read back from this Compose because an action cannot reference its
     own outputs. */
  registryKey: `@concat(${ENV},'|',${FLOWID})`,
  executionKey: `@concat(${ENV},'|',${FLOWID},'|',${RUNID})`,
  /* Path segments, separately. A run id and a flow name are Power Automate identifiers and carry
     no path-hostile characters, but the folder is built from these named fields so a future
     change to either is made in one place. */
  artefactFolderPath: `@concat('/${LIBRARY}/',${ENV},'/',${FLOWID},'/',${RUNID})`,
  capturedUtc: '@utcNow()',
}, after('Compose_Host_Inputs'));

/* `ticks()` throws on a string it cannot parse, and `if()` evaluates both arms, so the guard
   cannot live inside the arithmetic. It lives here instead: this Compose is guaranteed to emit
   a parseable instant, and every later action reads the guaranteed value. Duration is computed
   from `varStartTicks` — an integer the host already captured — so no date is parsed at all. */
const timing = compose({
  startedUtc: `@if(empty(${HOST('receivedAtUtc')}),${ID('capturedUtc')},${HOST('receivedAtUtc')})`,
  completedUtc: '@utcNow()',
  startTicks: `@${HOST('startTicks')}`,
}, after('Compose_Persistence_Identity'));

/* THE OUTCOME IS DERIVED, NOT DECLARED.
   `RunStatus: "Succeeded"` was written as a literal into all three of the submitted scope's item
   writes, on a scope whose own runAfter accepts `Failed`, `TimedOut` and `Skipped` from the work
   it reports on. Every run would have been recorded as a success. */
const SUCCEEDED = `and(greaterOrEquals(${HOST('statusCode')},200),less(${HOST('statusCode')},400))`;
const outcome = compose({
  statusCode: `@${HOST('statusCode')}`,
  succeeded: `@${SUCCEEDED}`,
  outcome: `@if(${SUCCEEDED},'Succeeded','Failed')`,
  /* max(0,…) covers a host that never set varStartTicks: startTicks is then 0, the subtraction
     is enormous rather than negative, so the ceiling matters more than the floor — hence the
     zero-start check rather than a bare max(). */
  durationMs: `@if(equals(${TIMING('startTicks')},0),0,max(0,div(sub(ticks(utcNow()),${TIMING('startTicks')}),10000)))`,
  errorCount: `@length(coalesce(${HOST('errors')},json('[]')))`,
  registryProcessingStatus: `@${HOST('registryProcessingStatus')}`,
  reportingStatus: `@${HOST('reportingStatus')}`,
  flowsNotFoundCount: `@int(coalesce(${HOST('inventory')}?['flowsNotFoundCount'],0))`,
  requiresOwnerReview: `@greater(int(coalesce(${HOST('inventory')}?['flowsNotFoundCount'],0)),0)`,
  lifecycleStatus: `@coalesce(${HOST('flowResource')}?['properties']?['state'],'Unknown')`,
  flowDisplayName: `@coalesce(${HOST('flowResource')}?['properties']?['displayName'],${ID('flowDisplayName')})`,
}, after('Compose_Run_Timing'));

/* ---------------------------------------------------------------- the capture policy */

/* `CaptureRequestBody=false` and `CaptureHeaders=false` are configuration seeds of the registry
   design, and tests/http-flow-registry.test.mjs holds them there deliberately. A record that
   silently captured both while asserting `credentialsExcluded: true` would reverse a ratified
   governance position inside a Compose action. The withheld fields are named instead, so a
   reader of the stored record can see what is absent and why. */
const capturePolicy = compose({
  policySource: 'docs/reference/http-flow-registry-spec.json — configSeeds CaptureHeaders, CaptureRequestBody',
  captureHeaders: false,
  captureRequestBody: false,
  headers: `@${HOST('redactedHeaders')}`,
  queries: `@${HOST('redactedQueries')}`,
  requestBody: 'WITHHELD-BY-POLICY',
  triggerOutputs: 'WITHHELD-BY-POLICY',
  redactedValue: '***REDACTED***',
  note: 'Headers and queries are the host redaction actions output; the raw trigger body and raw trigger outputs are not read by this scope.',
}, after('Compose_Run_Outcome'));

/* ---------------------------------------------------------------- the record */

const record = compose({
  schemaVersion: SCHEMA_VERSION,
  recordType: 'DGOHTTPFlowTruthRecord',
  packageVersion: PACKAGE_VERSION,
  /* "Complete" and "lossless: true" were unconditional assertions in the submitted scope, made
     beside a policy that withholds two of the fields and a size limit nothing checked. This
     names the mode honestly and the budget action below reports what actually happened. */
  captureMode: 'GovernedRedacted',
  capturePolicy: "@outputs('Compose_Capture_Policy')",
  identity: "@outputs('Compose_Persistence_Identity')",
  timing: "@outputs('Compose_Run_Timing')",
  outcome: "@outputs('Compose_Run_Outcome')",
  /* workflow() in full carries the whole tag bag and the run envelope. The four fields the
     record needs are named, which keeps the record readable and its size predictable. */
  workflowIdentity: {
    name: "@workflow()?['name']",
    id: "@workflow()?['id']",
    type: "@workflow()?['type']",
    environmentName: `@${ENV}`,
    flowDisplayName: "@coalesce(workflow()?['tags']?['flowDisplayName'],'')",
    runId: `@${RUNID}`,
  },
  inventory: `@${HOST('inventory')}`,
  governance: `@${HOST('governance')}`,
  flowResource: `@${HOST('flowResource')}`,
  errors: `@${HOST('errors')}`,
  credentialContainment: {
    requestBodyCaptured: false,
    requestHeadersCaptured: false,
    hostRedactionApplied: true,
    signedUrlsExcluded: true,
    redactedValue: '***REDACTED***',
  },
  capturedUtc: `@${ID('capturedUtc')}`,
});
/* No runAfter: this is the FIRST action inside Scope_Persist_New_Ledger_Record, and runAfter
   names siblings only. `Compose_Capture_Policy` is a sibling of the scope's owner, not of this
   action — naming it would be an unresolvable anchor the designer refuses. What guarantees the
   ordering is the scope itself: nothing inside it starts until the If chose this branch, and the
   If waits on the probe, which waits on the policy. */

const recordString = compose("@string(outputs('Compose_Flow_Truth_Record'))", after('Compose_Flow_Truth_Record'));

/* A SINGLE ACTION'S OUTPUT IS BOUNDED AND THE RECORD CARRIES A WHOLE FLOW DEFINITION.
   The record embeds the flow resource, the inventory and the governance record; on a large flow
   that is comfortably megabytes. Nothing in the submitted scope measured it, and its record
   asserted `truncated: false` regardless. This measures first, trims to a declared ceiling with
   an expression that is valid at every input length, and reports the truth of what was stored. */
const CAPTURE_LIMIT = 4000000;
const budget = compose({
  characterCount: "@length(outputs('Compose_Flow_Truth_Record_String'))",
  limitCharacters: CAPTURE_LIMIT,
  truncated: `@greater(length(outputs('Compose_Flow_Truth_Record_String')),${CAPTURE_LIMIT})`,
  /* length() counts characters. The stored file is UTF-8, so a multi-byte character costs more
     than one byte — this is a character count and is named as one. */
  countedIn: 'characters',
}, after('Compose_Flow_Truth_Record_String'));

const persistedString = compose(
  `@substring(outputs('Compose_Flow_Truth_Record_String'),0,min(length(outputs('Compose_Flow_Truth_Record_String')),${CAPTURE_LIMIT}))`,
  after('Compose_Capture_Budget'),
);

/* ---------------------------------------------------------------- artefact writes */

/* ONE TOLERANT FOLDER CREATE, NOT THREE INTOLERANT ONES.
   The submitted scope created the environment, flow and run folders in sequence, each tolerating
   the previous one's failure — and then wrote its files to a DIFFERENT path: the folder actions
   used `history/...` and the file actions `/history/...`. `CreateNewFolder` takes the whole
   relative path, so one call reaches the leaf; it tolerates Failed because "the folder is
   already there" is the normal case on the second run into the same environment. */
const runFolder = sp('CreateNewFolder', {
  dataset: SITE,
  table: bind(LIBRARY),
  folderPath: `@${ID('artefactFolderPath')}`,
});

const fileAction = (name, bodyExpr, runAfter) => sp('CreateFile', {
  dataset: SITE,
  /* Every one of the twelve CreateFile actions in the deployed corpus begins its folderPath with
     the library name. The submitted scope's began with `/history/`, which names no library on
     any site in the tenant. */
  folderPath: `@${ID('artefactFolderPath')}`,
  name,
  body: bodyExpr,
}, runAfter);

/* The four content files are independent of each other, so they run as four parallel branches
   off the same predecessor instead of a four-deep chain. The manifest waits on all four and
   requires all four to have Succeeded: a manifest that lists a file nobody wrote is worse than
   no manifest, and a half-written run has no ledger row, so it reads as "not persisted" rather
   than as a partial truth. */
const FILE_FANOUT = after('Create_Run_Folder_Tolerant');

/* ---------------------------------------------------------------- registry rollup */

const REG_FIRST = "first(coalesce(body('Get_Current_Registry_Item')?['value'],json('[]')))";
const prev = (col, dflt) => `int(coalesce(${REG_FIRST}?['${col}'],${dflt}))`;

/* THE SUBMITTED SCOPE'S REGISTRY PATCH WROTE EVERY COLUMN FROM THIS RUN ALONE.
   `DGO_HTTPFlowRegistry` carries running counters — TotalExecutions, SuccessfulExecutions,
   FailedExecutions, ConsecutiveFailures, AverageDurationMs, RecordVersion — and a blind patch
   resets the estate's execution history on every run. They are read back and incremented here.
   AverageDurationMs is a running mean over integer arithmetic: the workflow language has no
   decimal division, so it is a whole number of milliseconds and is documented as one. */
const NEW_TOTAL = `add(${prev('TotalExecutions', 0)},1)`;
const rollup = compose({
  exists: "@greater(length(coalesce(body('Get_Current_Registry_Item')?['value'],json('[]'))),0)",
  itemId: `@${REG_FIRST}?['ID']`,
  totalExecutions: `@${NEW_TOTAL}`,
  successfulExecutions: `@add(${prev('SuccessfulExecutions', 0)},if(${OUTCOME('succeeded')},1,0))`,
  failedExecutions: `@add(${prev('FailedExecutions', 0)},if(${OUTCOME('succeeded')},0,1))`,
  consecutiveFailures: `@if(${OUTCOME('succeeded')},0,add(${prev('ConsecutiveFailures', 0)},1))`,
  averageDurationMs: `@div(add(mul(${prev('AverageDurationMs', 0)},${prev('TotalExecutions', 0)}),${OUTCOME('durationMs')}),${NEW_TOTAL})`,
  recordVersion: `@add(${prev('RecordVersion', 0)},1)`,
  isCompliant: `@and(${OUTCOME('succeeded')},and(equals(${OUTCOME('errorCount')},0),not(${OUTCOME('requiresOwnerReview')})))`,
}, after('Get_Current_Registry_Item'));

/* ---------------------------------------------------------------- item writes */

const ARTEFACT_URLS = {
  runRecordUrl: absoluteUrl('Create_Run_Record_File'),
  flowResourceUrl: absoluteUrl('Create_Flow_Resource_File'),
  htmlReportUrl: absoluteUrl('Create_Html_Report_File'),
  governanceRecordUrl: absoluteUrl('Create_Governance_Record_File'),
  integrityManifestUrl: absoluteUrl('Create_Integrity_Manifest_File'),
};

const ledgerItem = sp('PostItem', {
  dataset: SITE,
  table: bind(LEDGER),
  'item/Title': `@concat(${ID('flowDisplayName')},' | ',${ID('runId')})`,
  'item/ExecutionKey': `@${ID('executionKey')}`,
  'item/RegistryKey': `@${ID('registryKey')}`,
  'item/FlowId': `@${ID('flowId')}`,
  'item/EnvironmentId': `@${ID('environmentId')}`,
  'item/RunId': `@${ID('runId')}`,
  'item/CorrelationId': `@${ID('correlationId')}`,
  'item/StartedUtc': `@${iso(TIMING('startedUtc'))}`,
  'item/CompletedUtc': `@${iso(TIMING('completedUtc'))}`,
  'item/DurationMs': `@${OUTCOME('durationMs')}`,
  'item/Outcome': `@${OUTCOME('outcome')}`,
  'item/HttpStatusCode': `@${OUTCOME('statusCode')}`,
  'item/CallerSystem': `@coalesce(${HOST('governance')}?['callerSystem'],'DGO ECM Platform')`,
  'item/ErrorCode': `@if(${OUTCOME('succeeded')},'',string(${OUTCOME('statusCode')}))`,
  'item/ErrorMessage': `@${clampNote(`string(coalesce(${HOST('errors')},json('[]')))`)}`,
  /* The ledger design carries no artefact-URL columns, so the pointers to the five stored files
     travel in the one Note column that exists for them, clamped to what a Note column accepts. */
  'item/ExecutionMetadataJson': `@${clampNote(`string(json(concat('{"artefacts":',string(outputs('Compose_Integrity_Manifest')),',"capture":',string(outputs('Compose_Capture_Budget')),'}')))`)}`,
}, after('Create_Integrity_Manifest_File'));

/* Both registry writes take the same field block; only the id and the operation differ. Writing
   it once is what keeps the create and the update from drifting: the submitted scope carried the
   same twenty-eight columns twice, differing only by `id`, kept in step by hand and by nothing
   else. A column added to one and not the other is a silent divergence between the row a flow
   creates and the row it later updates. */
const registryFields = {
  dataset: SITE,
  table: bind(REGISTRY),
  'item/Title': `@${ID('flowDisplayName')}`,
  'item/RegistryKey': `@${ID('registryKey')}`,
  'item/FlowId': `@${ID('flowId')}`,
  'item/EnvironmentId': `@${ID('environmentId')}`,
  /* EnvironmentName IS LEFT UNWRITTEN, DELIBERATELY — this is review finding C11.
     The rebuild wrote it from the same expression as EnvironmentId, so both columns carried one
     value and the column the design calls "Human-readable environment name" held an identifier.
     C11's words: "the same value, in two columns, so the display name is unavailable."
     A flow has exactly one environment designator, `workflow()?['tags']?['environmentName']`,
     and despite the key's name that is the identifier, not a display name. Nothing in Power
     Automate exposes the display name to a running flow. So there is no value to write, and
     writing the identifier into a column labelled for a name is the defect rather than a
     workaround for it. The column is optional in the design (required=No), so leaving it empty
     is what the spec permits and what the estate's own rule requires: do not write a value you
     do not have. */
  'item/FlowName': `@${OUTCOME('flowDisplayName')}`,
  'item/SystemName': `@coalesce(${HOST('governance')}?['systemName'],'DGO ECM Platform')`,
  'item/BusinessProcess': `@${clampNote(`string(coalesce(${HOST('governance')}?['businessProcess'],''))`)}`,
  'item/FlowDescription': `@${clampNote(`string(coalesce(${HOST('flowResource')}?['properties']?['definitionSummary'],''))`)}`,
  'item/TechnicalOwnerEmail': `@coalesce(${HOST('governance')}?['technicalOwnerEmail'],'${GOVERNANCE_MAILBOX}')`,
  'item/BusinessOwnerEmail': `@coalesce(${HOST('governance')}?['businessOwnerEmail'],'${GOVERNANCE_MAILBOX}')`,
  'item/SupportEmail': `'${GOVERNANCE_MAILBOX}'`,
  /* Unknown is written where the run genuinely does not know. The submitted scope wrote
     `Criticality: "Medium"` and `RunStatus: "Succeeded"` as literals, which is a guess recorded
     as a fact in the estate's system of record. */
  'item/HttpMethod': `@coalesce(${HOST('inventory')}?['httpMethod'],'Unknown')`,
  'item/AuthenticationMode': `@coalesce(${HOST('inventory')}?['authenticationMode'],'Unknown')`,
  'item/DataClassification': `@coalesce(${HOST('governance')}?['dataClassification'],'Restricted')`,
  'item/Criticality': `@coalesce(${HOST('governance')}?['criticality'],'Unclassified')`,
  'item/LifecycleStatus': `@${OUTCOME('lifecycleStatus')}`,
  'item/DefinitionVersion': `@coalesce(string(${HOST('flowResource')}?['properties']?['definition']?['contentVersion']),'Unknown')`,
  'item/LastRegisteredUtc': `@${iso(TIMING('completedUtc'))}`,
  'item/LastSeenUtc': `@${iso(TIMING('completedUtc'))}`,
  'item/LastSuccessfulCallUtc': `@if(${OUTCOME('succeeded')},${iso(TIMING('completedUtc'))},coalesce(string(${REG_FIRST}?['LastSuccessfulCallUtc']),''))`,
  'item/LastFailureUtc': `@if(${OUTCOME('succeeded')},coalesce(string(${REG_FIRST}?['LastFailureUtc']),''),${iso(TIMING('completedUtc'))})`,
  'item/TotalExecutions': `@${ROLLUP('totalExecutions')}`,
  'item/SuccessfulExecutions': `@${ROLLUP('successfulExecutions')}`,
  'item/FailedExecutions': `@${ROLLUP('failedExecutions')}`,
  'item/ConsecutiveFailures': `@${ROLLUP('consecutiveFailures')}`,
  'item/AverageDurationMs': `@${ROLLUP('averageDurationMs')}`,
  'item/IsCompliant': `@${ROLLUP('isCompliant')}`,
  'item/ComplianceIssues': `@${clampNote(`string(coalesce(${HOST('governance')},json('{}')))`)}`,
  'item/RecordVersion': `@${ROLLUP('recordVersion')}`,
  'item/ResponseContractJson': `@${clampNote("string(json(concat('{\"artefacts\":',string(outputs('Compose_Integrity_Manifest')),'}')))")}`,
};

/* ---------------------------------------------------------------- assembly */

const persistActions = {
  Compose_Flow_Truth_Record: record,
  Compose_Flow_Truth_Record_String: recordString,
  Compose_Capture_Budget: budget,
  Compose_Persisted_Record_String: persistedString,
  Create_Run_Folder_Tolerant: { ...runFolder, runAfter: after('Compose_Persisted_Record_String') },

  Create_Run_Record_File: fileAction('flow-truth-record.json', "@outputs('Compose_Persisted_Record_String')", FILE_FANOUT),
  Create_Flow_Resource_File: fileAction('flow-resource.json', `@string(${HOST('flowResource')})`, FILE_FANOUT),
  Create_Html_Report_File: fileAction('flow-truth-report.html', `@${HOST('htmlReport')}`, FILE_FANOUT),
  Create_Governance_Record_File: fileAction('governance-record.json', `@string(${HOST('governance')})`, FILE_FANOUT),

  Compose_Integrity_Manifest: compose({
    schemaVersion: SCHEMA_VERSION,
    recordType: 'DGOHTTPFlowTruthIntegrityManifest',
    executionKey: `@${ID('executionKey')}`,
    registryKey: `@${ID('registryKey')}`,
    capturedUtc: '@utcNow()',
    /* An honest statement of what is and is not established. The workflow definition language
       has no hashing function, so no content digest is computed and none is claimed; what IS
       recorded is what SharePoint returned when it stored each file, which can be compared
       against the library later. */
    integrityMethod: 'SharePoint ETag and byte size as returned at write time, plus list versioning on the two governance lists. No content digest is computed.',
    capture: "@outputs('Compose_Capture_Budget')",
    folderPath: `@${ID('artefactFolderPath')}`,
    files: [
      fileFacts('Create_Run_Record_File', 'flow-truth-record.json', 'application/json'),
      fileFacts('Create_Flow_Resource_File', 'flow-resource.json', 'application/json'),
      fileFacts('Create_Html_Report_File', 'flow-truth-report.html', 'text/html'),
      fileFacts('Create_Governance_Record_File', 'governance-record.json', 'application/json'),
    ],
  }, after('Create_Run_Record_File', 'Create_Flow_Resource_File', 'Create_Html_Report_File', 'Create_Governance_Record_File')),

  Create_Integrity_Manifest_File: fileAction(
    'integrity-manifest.json',
    "@string(outputs('Compose_Integrity_Manifest'))",
    after('Compose_Integrity_Manifest'),
  ),

  Create_Ledger_Item: ledgerItem,

  Get_Current_Registry_Item: sp('GetItems', {
    dataset: SITE,
    table: bind(REGISTRY),
    $filter: eqFilter('RegistryKey', ID('registryKey')),
    $top: 1,
  }, after('Create_Ledger_Item')),

  Compose_Registry_Rollup: rollup,

  Condition_Registry_Item_Exists: cond(
    { and: [{ equals: [`@${ROLLUP('exists')}`, true] }] },
    { Update_Current_Registry_Item: sp('PatchItem', { ...registryFields, id: `@${ROLLUP('itemId')}` }) },
    { Create_Current_Registry_Item: sp('PostItem', { ...registryFields }) },
    after('Compose_Registry_Rollup'),
  ),

  Compose_Persistence_Receipt: compose({
    status: 'Persisted',
    succeeded: true,
    idempotentReplay: false,
    registryKey: `@${ID('registryKey')}`,
    executionKey: `@${ID('executionKey')}`,
    outcome: `@${OUTCOME('outcome')}`,
    durationMs: `@${OUTCOME('durationMs')}`,
    ledgerItemId: "@coalesce(outputs('Create_Ledger_Item')?['body/ID'],0)",
    registryOperation: `@if(${ROLLUP('exists')},'Updated','Created')`,
    truncated: "@outputs('Compose_Capture_Budget')?['truncated']",
    artefacts: ARTEFACT_URLS,
    persistedUtc: '@utcNow()',
  }, after('Condition_Registry_Item_Exists')),
};

/* THE GUARD THAT WAS BYPASSED.
   In the submitted scope this condition existed, composed a replay result on the true branch,
   left the else branch empty — and then the persist scope ran after the CONDITION, which
   succeeds on both branches. It persisted every time, duplicated the history row and the five
   files on a replay, and the final Compose reported `AlreadyPersisted` while it happened. The
   persist scope belongs inside the else, which is where it is. */
const idempotencyGate = cond(
  { and: [{ greater: ["@length(coalesce(body('Get_Existing_Ledger_Record')?['value'],json('[]')))", 0] }] },
  {
    Compose_Idempotent_Replay_Result: compose({
      status: 'AlreadyPersisted',
      succeeded: true,
      idempotentReplay: true,
      registryKey: `@${ID('registryKey')}`,
      executionKey: `@${ID('executionKey')}`,
      existingItemId: "@first(coalesce(body('Get_Existing_Ledger_Record')?['value'],json('[]')))?['ID']",
      completedUtc: '@utcNow()',
    }),
  },
  { Scope_Persist_New_Ledger_Record: scope(persistActions) },
  after('Get_Existing_Ledger_Record'),
);

const failureScope = scope({
  Compose_Persistence_Failure_Record: compose({
    status: 'PersistenceFailed',
    succeeded: false,
    idempotentReplay: false,
    registryKey: `@${ID('registryKey')}`,
    executionKey: `@${ID('executionKey')}`,
    /* result() is read HERE and only here — a catch scope is what it is for, and the failure
       record is not written to SharePoint, so its size and its unredacted contents stay inside
       the run history. */
    failedActions: "@result('Scope_Persist_New_Ledger_Record')",
    failedUtc: '@utcNow()',
  }),
}, afterAny('Condition_Ledger_Record_Already_Exists', 'Failed', 'TimedOut'));

const actions = {
  Compose_Host_Inputs: hostInputs,
  Compose_Persistence_Identity: identity,
  Compose_Run_Timing: timing,
  Compose_Run_Outcome: outcome,
  Compose_Capture_Policy: capturePolicy,

  /* THE PROBE RUNS BEFORE THE RECORD IS BUILT.
     The submitted scope composed the complete record, stringified it, and only then asked
     whether the run had already been persisted — so a replay paid for the whole capture before
     discovering it had nothing to do. One GetItems is cheaper than a megabyte of string(). */
  Get_Existing_Ledger_Record: sp('GetItems', {
    dataset: SITE,
    table: bind(LEDGER),
    $filter: eqFilter('ExecutionKey', ID('executionKey')),
    $top: 1,
  }, after('Compose_Capture_Policy')),

  Condition_Ledger_Record_Already_Exists: idempotencyGate,
  Scope_Persistence_Failure: failureScope,

  Compose_Final_Persistence_Result: compose(
    `@if(greater(length(coalesce(body('Get_Existing_Ledger_Record')?['value'],json('[]'))),0),outputs('Compose_Idempotent_Replay_Result'),if(equals(actions('Condition_Ledger_Record_Already_Exists')?['status'],'Succeeded'),outputs('Compose_Persistence_Receipt'),outputs('Compose_Persistence_Failure_Record')))`,
    {
      Condition_Ledger_Record_Already_Exists: ['Succeeded', 'Failed', 'TimedOut'],
      Scope_Persistence_Failure: ['Succeeded', 'Skipped'],
    },
  ),
};

/* ---------------------------------------------------------------- envelope */

const NODE_ID = 'Scope_Global_Flow_Truth_Persistence';

const walk = (node, visit) => {
  for (const [name, act] of Object.entries(node.actions || {})) {
    visit(name, act);
    walk(act, visit);
    if (act.else) walk(act.else, visit);
  }
};

const serializedValue = {
  type: 'Scope',
  actions,
  /* A package is a root. The submitted file shipped `runAfter: {Scope_Global_System_Endpoints:
     [...]}` at the top, which is the signature of a scope copied back OUT of the designer after
     it had been pasted under something — and with it comes whatever else that round trip
     rewrote. Everything generated here ships an empty anchor. */
  runAfter: {},
  metadata: meta(),
};

const pkg = { nodeId: NODE_ID, serializedValue, allConnectionData: {}, staticResults: {}, isScopeNode: true, mslaNode: true };
walk(serializedValue, (name, act) => {
  if (act.type !== 'OpenApiConnection') return;
  pkg.allConnectionData[name] = {
    connectionReference: {
      api: { id: `/providers/Microsoft.PowerApps/apis/${SP}` },
      connection: { id: `/providers/Microsoft.PowerApps/apis/${SP}/connections/${CONNECTION}` },
      connectionName: CONNECTION,
    },
    referenceKey: SP,
  };
});

/* ---------------------------------------------------------------- self-checks */

/* A generator that emits a column the design does not carry has produced a package that fails in
   the operator's browser at save time. It fails here instead. */
const problems = [];
const written = new Map();
walk(serializedValue, (name, act) => {
  const p = act.inputs?.parameters;
  if (!p) return;
  const listTitle = Object.entries(bindings.lists).find(([t]) => bind(t) === p.table)?.[0];
  if (!listTitle) return;
  const cols = DESIGNED.get(listTitle);
  const seen = written.get(listTitle) ?? new Set();
  for (const k of Object.keys(p)) {
    if (!k.startsWith('item/')) continue;
    const col = k.slice(5);
    if (col === 'Title' || col === 'ID') continue;
    if (!cols.has(col)) problems.push(`${name} writes ${listTitle}.${col}, which the design workbook does not declare`);
    seen.add(col);
  }
  if (act.inputs.host.operationId === 'PostItem') written.set(listTitle, seen);
});
for (const [listTitle, seen] of written) {
  for (const req of REQUIRED_OF(listTitle)) {
    if (!seen.has(req)) problems.push(`the create path for ${listTitle} omits ${req}, which the design marks Required`);
  }
}
/* Reachability: every outputs()/body()/actions() reference either names an action in this
   package or is declared in the host contract. Nothing may be read that is neither. */
const names = new Set();
walk(serializedValue, (n) => names.add(n));
const REF = /\b(?:outputs|body|actions|result)\('([^']+)'\)/g;
for (const m of JSON.stringify(serializedValue).matchAll(REF)) {
  if (!names.has(m[1]) && !(m[1] in HOST_ACTIONS)) problems.push(`reads '${m[1]}', which is neither in the package nor in the host contract`);
}
if (problems.length) {
  console.error(`\n${FLOW}: the build refuses to emit\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

/* ---------------------------------------------------------------- companions */

const variablesPackage = {
  nodeId: `${NODE_ID}_Variables`,
  serializedValue: {
    type: 'Scope',
    actions: Object.fromEntries(Object.entries(HOST_VARIABLES).map(([name, why], i, all) => [
      `Initialize_variable_${name}`,
      {
        type: 'InitializeVariable',
        inputs: { variables: [{ name, type: { varStatusCode: 'integer', varErrors: 'array', varReceivedAtUtc: 'string', varStartTicks: 'integer' }[name], value: { varStatusCode: 500, varErrors: [], varReceivedAtUtc: '@utcNow()', varStartTicks: '@ticks(utcNow())' }[name] }] },
        metadata: { operationMetadataId: `d0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}` },
        ...(i ? { runAfter: { [`Initialize_variable_${all[i - 1][0]}`]: ['Succeeded'] } } : {}),
        ...(why ? {} : {}),
      },
    ])),
    runAfter: {},
  },
  allConnectionData: {},
  staticResults: {},
  isScopeNode: true,
  mslaNode: true,
};

const hostContract = {
  contractVersion: PACKAGE_VERSION,
  package: `${FLOW}.designer-paste.json`,
  purpose: 'What the host flow must already contain before this scope is pasted into it. Every entry is a SAVE-time dependency: the designer refuses a definition that references an action it cannot find.',
  actions: HOST_ACTIONS,
  variables: HOST_VARIABLES,
  reads: 'All eight actions are read exactly once, in Compose_Host_Inputs, with a coalesce fallback. Rename one in the host and there is one action to edit here.',
  notRead: {
    'triggerBody()': 'CaptureRequestBody=false in the registry design configuration seeds.',
    'triggerOutputs()': 'Carries the unredacted trigger headers, including x-ms-igw-external-uri and its sig token.',
    "result('Scope_Flow_Registry_Processing')": 'Unbounded, unredacted, and only the status is needed. The status is read instead.',
    "result('Scope_Reporting')": 'Same.',
  },
};

const provisioning = {
  state: PASTE_READY ? 'BOUND' : 'BLOCKED-ON-PROVISIONING',
  site: SITE,
  resources: [
    { title: REGISTRY, kind: 'List', guid: bindings.lists[REGISTRY], uniqueKey: 'RegistryKey', indexed: ['RegistryKey', 'FlowId', 'EnvironmentId', 'FlowName', 'LastSeenUtc'] },
    { title: LEDGER, kind: 'List', guid: bindings.lists[LEDGER], uniqueKey: 'ExecutionKey', indexed: ['ExecutionKey', 'RegistryKey', 'FlowId', 'RunId', 'StartedUtc', 'Outcome'] },
    { title: LIBRARY, kind: 'DocumentLibrary', guid: bindings.libraries[LIBRARY], uniqueKey: null, indexed: [] },
  ],
};

/* ---------------------------------------------------------------- emit */

const j = (o) => `${JSON.stringify(o, null, 2)}\n`;
const files = new Map([
  [`${FLOW}.designer-paste.json`, j(pkg)],
  [`${FLOW}.variables.designer-paste.json`, j(variablesPackage)],
  [`${FLOW}.host-contract.json`, j({ ...hostContract, provisioning })],
]);

const actionCount = (() => { let n = 0; walk(serializedValue, () => n++); return n; })();

files.set(`${FLOW}.variables.md`, `# ${FLOW} — prerequisites

Generated by \`scripts/build-flow-truth-persistence.mjs\`. Do not edit; run \`npm run flowtruth\`.

## Provisioning state — ${provisioning.state}

${PASTE_READY
  ? 'Every list and library this package targets is bound to a GUID in `docs/deployment/governance/list-bindings.json`. The package targets them by GUID, which is what all 265 SharePoint actions in the deployed corpus do.'
  : `The three resources below do not exist in the tenant. \`tests/http-flow-registry.test.mjs\` asserts that none of the seven governance lists appears in the capture of ${SITE}, and this package cannot be pasted until they are built and their GUIDs recorded in \`docs/deployment/governance/list-bindings.json\`. While a GUID is missing the actions target the list by **title**, which the estate's convention does not permit — that is the visible marker of the blocked state, not a decision.`}

| Resource | Kind | Unique key | GUID |
|---|---|---|---|
${provisioning.resources.map((r) => `| \`${r.title}\` | ${r.kind} | ${r.uniqueKey ? `\`${r.uniqueKey}\`` : '—' } | ${r.guid ? `\`${r.guid}\`` : '**not provisioned**'} |`).join('\n')}

The unique keys are not decoration. \`ExecutionKey\` unique on \`${LEDGER}\` is what makes this
scope idempotent under a lost race: the read-before-write below is an optimisation, and SharePoint
is the guard. \`RegistryKey\` unique on \`${REGISTRY}\` is what stops two concurrent runs
from creating two registry rows for one flow.

## Variables the host flow must declare

Logic Apps accepts \`InitializeVariable\` only at a workflow's top level, so a clipboard package
cannot declare them — paste \`${FLOW}.variables.designer-paste.json\` at the
top of the flow first, or confirm the flow already carries the estate's standard block.

| Variable | Type | Why |
|---|---|---|
${Object.entries(HOST_VARIABLES).map(([n, why]) => `| \`${n}\` | ${why.split('—')[0].trim()} | ${why.split('—').slice(1).join('—').trim()} |`).join('\n')}

## Actions the host flow must already contain

Each is a save-time dependency. All eight are read exactly once, in \`Compose_Host_Inputs\`.

| Action | What it must produce |
|---|---|
${Object.entries(HOST_ACTIONS).map(([n, why]) => `| \`${n}\` | ${why} |`).join('\n')}

## What this scope deliberately does not read

| Not read | Why |
|---|---|
${Object.entries(hostContract.notRead).map(([n, why]) => `| \`${n}\` | ${why} |`).join('\n')}

## Shape

${actionCount} actions, ${Object.keys(pkg.allConnectionData).length} bound connector actions, one
connection (\`${CONNECTION}\`). Capture ceiling ${CAPTURE_LIMIT.toLocaleString('en-GB')} characters;
Note columns clamped at ${NOTE_LIMIT.toLocaleString('en-GB')}.
`);

files.set('README.md', `# Governance flow packages

One package: \`${FLOW}\`, the corrected replacement for the
\`Scope_SharePoint_Flow_Truth_Persistence\` clipboard scope submitted for review. The review is
[\`docs/audits/FLOW_TRUTH_PERSISTENCE_REVIEW.md\`](../../../audits/FLOW_TRUTH_PERSISTENCE_REVIEW.md).

## Why it is here and not beside the other thirty-four

\`docs/deployment/sharepoint/flows/designer-paste/\` and
\`docs/deployment/internal/flows/designer-paste/\` are gated in CI by
\`verify-designer-paste.mjs --strict\`, and one of its checks is that every SharePoint action
targets a list the tenant capture actually holds. The seven \`DGO_HTTPFlow*\` governance lists are
**defined and not built** — \`tests/http-flow-registry.test.mjs\` says so by name and goes red the
day a capture contains them. Committing this package into either gated directory would mean
either turning CI red or weakening the check that keeps the other thirty-four honest.

It has its own gate instead: \`npm run test:flowtruth\`.

## Moving it into the estate

1. Provision the two lists and the library on ${SITE}, from
   \`docs/reference/http-flow-registry-spec.json\` — including \`RegistryKey\` and
   \`ExecutionKey\` as indexed **and** unique, which is what makes this scope idempotent.
2. Record their GUIDs in \`../list-bindings.json\`.
3. \`npm run flowtruth\` — the package re-emits targeting by GUID and its companion flips to
   \`BOUND\`.
4. Move the four files into \`docs/deployment/internal/flows/designer-paste/\` and run
   \`npm run designerpaste\`; the estate gate then covers it and this directory can go.
`);

/* ---------------------------------------------------------------- write or check */

mkdirSync(OUT, { recursive: true });
let stale = 0;
for (const [name, content] of files) {
  const path = join(OUT, name);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === content) continue;
  if (CHECK) { stale++; console.log(`  ✗ ${rel(path)} is stale`); continue; }
  writeFileSync(path, content);
  console.log(`  ✅ ${rel(path)}`);
}

if (CHECK) {
  if (stale) {
    console.log(`\n  ${stale} artefact(s) stale — run \`npm run flowtruth\`.\n`);
    process.exit(1);
  }
  console.log(`\n  ${FLOW}: ${files.size} artefact(s) current · ${actionCount} actions · ${provisioning.state}\n`);
} else {
  console.log(`\n  ${FLOW}: ${actionCount} actions · ${Object.keys(pkg.allConnectionData).length} bound · ${provisioning.state}\n`);
}
