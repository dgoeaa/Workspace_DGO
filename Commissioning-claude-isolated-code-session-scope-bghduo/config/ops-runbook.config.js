// DGO R11.6 — the commissioning runbook this platform is actually held to.
//
// WHAT THIS IS, AND WHAT IT IS NOT
//
// `npm run commission` settles what a machine can settle: are the endpoints wired, is a
// signature published, does the module graph resolve, is auth enforced. It ends by printing a
// list of obligations it explicitly *cannot* settle — approval of a routing table, clearance of
// test records, rehearsal of a rollback, verification that each flow checks its own proof. Those
// are the ones that get lost, because a report that ends "5 manual obligations remain" is a
// report, and a report is not a register.
//
// This is the register. Every action below corresponds to a real obligation in this repository,
// and each names the file that owns it, so a reader can go and check rather than take the
// runbook's word for it. Nothing here is invented to fill a stage: the fourteen actions are the
// commissioning path in `scripts/commission-check.mjs` and `docs/deployment/MINIMAL-PILOT.md`,
// ordered by what genuinely blocks what.
//
// THE LOCKED PARAMETERS ARE FACTS ABOUT THE REPOSITORY, NOT DEFAULTS TO EDIT
//
// Four values below are marked `locked`. They are read from the repository's own configuration
// and cannot be retyped in the runbook form. The reason is specific: a runbook whose "approved
// service mailbox" field can be edited will eventually assert a mailbox the platform does not
// use, and the runbook is exactly the document a reviewer would trust over the code.
//
// THE ACCEPTANCE RECORDS ARE PER-ENDPOINT, DERIVED
//
// The acceptance set is generated from the endpoint atlas rather than written out, so a contract
// key added to the estate arrives in the runbook with no separate edit. A key that exists and
// has no acceptance record is a key nobody has to prove works, which is how one gets commissioned
// unverified.

import { EndpointAtlas } from './endpoint-atlas.data.js';
import { AppConfig } from './app.config.js';
import { authPosture } from './auth.config.js';

/* The evidence fields an endpoint acceptance record must carry before it counts as passed.
   Every one is something that exists only after the endpoint was genuinely called: a run id
   cannot be produced by reading a document. */
const ENDPOINT_ACCEPTANCE_FIELDS = Object.freeze(['flowRunId', 'correlationId', 'observedAt', 'testedBy']);

/* ------------------------------------------------------------------ *
 * Parameters
 * ------------------------------------------------------------------ */

export const RunbookParameters = Object.freeze([
  {
    id: 'serviceMailbox',
    label: 'Approved service mailbox',
    required: true,
    locked: true,
    value: 'dgsregistry@nitda.gov.ng',
    source: 'core/state.js — the bootstrap administrator record',
    description: 'The visible sender and reply-to for everything this platform dispatches. Locked: it is read from the repository, not chosen here.',
  },
  {
    id: 'stateSchemaVersion',
    label: 'State schema version',
    required: true,
    locked: true,
    value: String(AppConfig.stateSchemaVersion),
    source: 'config/app.config.js',
    description: 'A device holding an older schema shows stale lists. Recorded so a support call can be matched against what was commissioned.',
  },
  {
    id: 'contractKeyCount',
    label: 'Contract keys in the estate',
    required: true,
    locked: true,
    value: String(EndpointAtlas.keys.length),
    source: 'config/endpoint-atlas.data.js, generated from the tenant register',
    description: 'Every one of these must be wired and proven before the estate is complete.',
  },
  {
    id: 'authPosture',
    label: 'Authentication posture',
    required: true,
    locked: true,
    value: authPosture().enforced ? 'enforced' : 'inert',
    source: 'config/auth.config.js',
    description: 'Inert means caller identity is client-asserted. That is a decision with consequences for what this platform may carry, and it is recorded here rather than assumed.',
  },
  { id: 'targetEnvironment', label: 'Target environment', required: true, locked: false, value: '', source: 'operator', description: 'The Power Platform environment this release is being commissioned into. Its display name, not a guess at its GUID.' },
  { id: 'environmentId', label: 'Environment id', required: true, locked: false, value: '', source: 'operator', pattern: '^[A-Za-z0-9][A-Za-z0-9-]{6,}$', patternHint: 'does not look like an environment identifier', description: 'Read from the Power Platform admin centre. Two environments with similar display names is how a release lands in the wrong one.' },
  { id: 'releaseId', label: 'Release identifier', required: true, locked: false, value: '', source: 'operator', description: 'What this deployment is called in the change record. Everything exported from this runbook carries it.' },
  { id: 'authoritativeCommit', label: 'Authoritative commit', required: true, locked: false, value: '', source: 'operator', pattern: '^[0-9a-f]{7,40}$', patternHint: 'is not a git commit hash', description: 'The exact commit deployed. A branch name is not an answer: branches move.' },
  { id: 'deployedHostname', label: 'Deployed hostname', required: true, locked: false, value: '', source: 'operator', description: 'Where the platform is actually served from. The browser suite must be run once against this, not only against localhost.' },
  { id: 'businessOwner', label: 'Business owner', required: true, locked: false, value: '', source: 'operator', description: 'The named person who owns the service. Not a directorate — a person.' },
  { id: 'technicalOwner', label: 'Technical owner', required: true, locked: false, value: '', source: 'operator', description: 'The named person who owns the flows and the configuration.' },
  { id: 'privacyOwner', label: 'Security and privacy owner', required: true, locked: false, value: '', source: 'operator', description: 'Personal data of roughly 785 individuals is in scope (finding R-01). Someone must own that.' },
  { id: 'routingApprovedBy', label: 'Routing table approved by', required: true, locked: false, value: '', source: 'operator', description: 'Who approved which desk each kind of correspondence lands on (MINIMAL-PILOT §8). It was unapproved at the time this runbook was written.' },
  { id: 'rotationDate', label: 'Signature rotation date', required: true, locked: false, value: '', source: 'operator', pattern: '^\\d{4}-\\d{2}-\\d{2}$', patternHint: 'is not an ISO date (YYYY-MM-DD)', description: 'When the trigger signatures now in use were issued. They are bearer credentials with no expiry, so the age is the only control.' },
  { id: 'supportContact', label: 'Support contact', required: true, locked: false, value: '', source: 'operator', description: 'Where an operator seeing the failure screen is told to go.' },
  { id: 'hypercareEnds', label: 'Hypercare end date', required: true, locked: false, value: '', source: 'operator', pattern: '^\\d{4}-\\d{2}-\\d{2}$', patternHint: 'is not an ISO date (YYYY-MM-DD)', description: 'Hypercare with no end date is not hypercare; it is the normal operating state.' },
  { id: 'rollbackTarget', label: 'Rollback target', required: true, locked: false, value: '', source: 'operator', description: 'The commit and the flow versions this release rolls back to. Established before cutover, not during it.' },
  { id: 'changeReference', label: 'Change record reference', required: true, locked: false, value: '', source: 'operator', description: 'The change record this commissioning is performed under.' },
  { id: 'dataRetention', label: 'Retention decision', required: true, locked: false, value: '', source: 'operator', description: 'How long correspondence and its evidence are kept, and who decided.' },
  { id: 'pilotCohort', label: 'Pilot cohort', required: true, locked: false, value: '', source: 'operator', description: 'Who is being let in first, and how many of them.' },
  { id: 'testRecordsCleared', label: 'Test records cleared by', required: true, locked: false, value: '', source: 'operator', description: 'Commissioning writes real rows into the Correspondence list and the reference sequence keeps issuing from where the test numbers stopped. Someone must clear them and say so.' },
]);

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

export const RunbookActions = Object.freeze([
  {
    id: 'OP-001', stage: 'Decisions', severity: 'Critical', title: 'Approve the operational parameters',
    issue: 'The values a commissioning depends on — environment, owners, release, rotation date — are not recorded anywhere a reviewer can find them.',
    requiredAction: 'Answer every mandatory parameter with a real value obtained from the tenant or from a named person.',
    steps: [
      'Fill every parameter under Parameters. Placeholders are rejected: "TBD" counts as unanswered.',
      'Record named business, technical and security/privacy owners. A directorate is not a name.',
      'Record the change reference this commissioning runs under.',
      'Do not use examples, defaults or values inferred from a similar deployment.',
    ],
    validation: ['The parameter validator reports zero missing and zero suspect values.'],
    stopIf: 'Any owner is unnamed, or any value was inferred rather than obtained.',
    parameters: ['targetEnvironment', 'environmentId', 'releaseId', 'authoritativeCommit', 'businessOwner', 'technicalOwner', 'privacyOwner', 'changeReference'],
    dependsOn: [],
    reference: 'scripts/commission-check.mjs',
  },
  {
    id: 'OP-002', stage: 'Decisions', severity: 'Critical', title: 'Record the authentication posture and what it permits',
    issue: 'Caller identity is client-asserted under the inert posture: editing one localStorage key escalates a viewer to systemAdmin, and a flow called directly answers whoever calls it.',
    requiredAction: 'Decide, in writing, what this platform may carry under the posture actually configured — and who accepted that.',
    steps: [
      'Read the posture reported on System Health. It is derived from config/auth.config.js, not from intent.',
      'If it is inert, record the named person accepting that correspondence is readable by anyone holding a URL.',
      'If it is enforced, confirm OTP_GENERATE and OTP_VERIFY are wired and that each flow verifies the proof itself — no check in this repository can verify a flow.',
    ],
    validation: ['The posture recorded here matches the one System Health reports.', 'A named person has accepted the consequence.'],
    stopIf: 'The posture is inert and the intended use is citizens\' personal data at scale.',
    parameters: ['privacyOwner', 'dataRetention'],
    dependsOn: ['OP-001'],
    reference: 'docs/architecture/AUTHENTICATION_CONTRACT.md',
  },
  {
    id: 'OP-003', stage: 'Decisions', severity: 'Critical', title: 'Approve the routing table',
    issue: 'MINIMAL-PILOT §8 decides which desk each kind of correspondence lands on, and it has not been approved by anyone.',
    requiredAction: 'Have the routing table approved by the business owner and record who approved it.',
    steps: ['Walk the table with the directorates it routes to.', 'Record the approver and the date.'],
    validation: ['Every correspondence category has a named destination desk.'],
    stopIf: 'Any category routes to a desk that has not agreed to receive it.',
    parameters: ['routingApprovedBy'],
    dependsOn: ['OP-001'],
    reference: 'docs/deployment/MINIMAL-PILOT.md §8',
  },
  {
    id: 'OP-004', stage: 'Configuration', severity: 'Critical', title: 'Reconcile the estate against the tenant register',
    issue: 'When the register was first compared against this repository, 25 of 25 keys disagreed. A key pointing at the wrong flow does not fail — it succeeds, against the wrong flow.',
    requiredAction: 'Regenerate the derived records from the register and confirm the console reports no wrong-flow finding.',
    steps: ['npm run reconcile', 'Open Endpoints in this suite and read the Findings tab.', 'Resolve every wrong-flow and name-collision finding before proceeding.'],
    validation: ['Findings reports no error-severity finding.', 'npm run test:endpointids passes.'],
    stopIf: 'Any contract key resolves to a workflow the register does not name for it.',
    parameters: [],
    dependsOn: ['OP-001'],
    reference: 'scripts/reconcile-endpoint-register.mjs',
  },
  {
    id: 'OP-005', stage: 'Configuration', severity: 'Critical', title: 'Wire and sign every contract key',
    issue: 'An unconfigured key is a feature that reports itself unavailable at the moment a user needs it, and a truncated signature fails much later as an opaque 401.',
    requiredAction: 'Supply a complete, correctly signed URL for every contract key the posture requires.',
    steps: [
      'npm run values:template ~/dgo-values.txt',
      'npm run values:sign -- ~/dgo-values.txt <KEY>, once per key.',
      'npm run check:values -- ~/dgo-values.txt — it must report a complete signature for every key.',
      'npm run setup -- --values ~/dgo-values.txt --force',
    ],
    validation: ['Every key reports a 43-character signature in the Endpoints tab.', 'No key reports placeholder text or a non-HTTPS address.'],
    stopIf: 'A signature was pasted from a ticket, an email or a chat message. Those are bearer credentials and are now compromised.',
    parameters: ['rotationDate'],
    dependsOn: ['OP-004'],
    reference: 'scripts/make-values-template.mjs',
  },
  {
    id: 'OP-006', stage: 'Configuration', severity: 'High', title: 'Confirm no signature is published',
    issue: 'A committed SAS URL is a published credential. Deleting the file revokes nothing — only rotation in Power Automate does.',
    requiredAction: 'Run the secret ratchet and confirm the baseline is empty, then confirm config.local.js is untracked.',
    steps: ['npm run test:secrets', 'git status --short config/config.local.js — it must not appear as tracked.', 'If a signature was ever committed, rotate that trigger in Power Automate before continuing.'],
    validation: ['tests/secrets-baseline.txt is empty.', 'The ratchet exits clean.'],
    stopIf: 'A signature is found in a tracked file and has not been rotated.',
    parameters: [],
    dependsOn: ['OP-005'],
    reference: 'tests/check-secrets.mjs',
  },
  {
    id: 'OP-007', stage: 'Verification', severity: 'Critical', title: 'Prove which flow each key actually reaches',
    issue: 'A URL that is present, HTTPS and correctly signed can still address the wrong workflow. Every format check passes.',
    requiredAction: 'Run the identity handshake against every configured key and record the result per key.',
    steps: [
      'Open Live Checks in this suite and run the identity check.',
      'Where a flow does not implement the handshake, record that as an unproven key rather than a passing one.',
      'Investigate every wrong-key and identity-mismatch outcome before proceeding.',
    ],
    validation: ['No key reports WRONG KEY ANSWERED or IDENTITY MISMATCH.', 'Every unproven key is listed, with a reason.'],
    stopIf: 'Nothing reached Power Automate — that measured the network, not the estate, and proves nothing either way.',
    parameters: [],
    dependsOn: ['OP-005'],
    reference: 'core/health-contract.js',
  },
  {
    id: 'OP-008', stage: 'Verification', severity: 'High', title: 'Prove each request shape against its flow',
    issue: 'A payload can be valid JSON, carry every field the caller believed in, and be refused for a required property nobody knew about.',
    requiredAction: 'Compose and validate a representative request for every callable flow the platform uses, and keep the alignment report.',
    steps: [
      'Open Flow Shapes in this suite and select each flow the platform calls.',
      'Compose a representative request and validate it against the trigger schema.',
      'Export the alignment report and attach it to the change record.',
    ],
    validation: ['Every flow the platform calls has an alignment report showing it conforms.', 'Flows with no declared schema are recorded as unchecked, not as aligned.'],
    stopIf: 'A flow that sends mail was invoked without the health contract. Real recipients received real mail.',
    parameters: [],
    dependsOn: ['OP-004'],
    reference: 'core/flow-shapes.js',
  },
  {
    id: 'OP-009', stage: 'Verification', severity: 'High', title: 'Run the quality gate against the deployed build',
    issue: 'The browser suite covers boot, accessibility, every route, themes and the portal — but against a local server. Deployment is where config.local.js presence differs.',
    requiredAction: 'Run the full suite once more against the deployed hostname.',
    steps: ['npm test', 'npm run test:smoke against the deployed hostname, not localhost.', 'npm run commission for the posture being commissioned.'],
    validation: ['npm test is green.', 'The smoke suite is green against the deployed hostname.', 'The commissioning gate reports no blocker.'],
    stopIf: 'The module graph check fails. A missing static import hangs the boot spinner with nothing thrown and nothing logged.',
    parameters: ['deployedHostname'],
    dependsOn: ['OP-005', 'OP-006'],
    reference: 'scripts/commission-check.mjs',
  },
  {
    id: 'OP-010', stage: 'Data', severity: 'Critical', title: 'Clear the test records and reset the reference sequence',
    issue: 'Commissioning verification writes real rows into the Correspondence list, and a reference sequence that has issued test numbers keeps issuing from there.',
    requiredAction: 'Remove every record created during verification and confirm the next reference issued is the first real one.',
    steps: ['List the references minted during verification.', 'Remove those records from the registry.', 'Confirm the next reference the platform mints is the intended starting number.'],
    validation: ['No verification record remains in the Correspondence list.', 'The next reference is the agreed starting number.'],
    stopIf: 'Real correspondence has already arrived — stop and reconcile before deleting anything.',
    parameters: ['testRecordsCleared'],
    dependsOn: ['OP-007', 'OP-008'],
    reference: 'docs/deployment/MINIMAL-PILOT.md §8',
  },
  {
    id: 'OP-011', stage: 'Cutover', severity: 'Critical', title: 'Record the rollback target and rehearse it',
    issue: 'A rollback plan that has never been executed is an assertion. The first time it runs must not be during an incident.',
    requiredAction: 'Establish the rollback target, rehearse the rollback, and record the outcome.',
    steps: [
      'Record the commit and the flow versions being rolled back to.',
      'Disable superseded flows rather than deleting them — a deleted flow cannot be rolled back to.',
      'Perform the rollback in a non-production environment and record how long it took.',
    ],
    validation: ['Rollback rehearsed and timed.', 'Superseded flows are disabled, not deleted.'],
    stopIf: 'Any superseded flow has already been deleted.',
    parameters: ['rollbackTarget'],
    dependsOn: ['OP-009'],
    reference: 'docs/cutover',
  },
  {
    id: 'OP-012', stage: 'Cutover', severity: 'High', title: 'Reconcile in-flight work',
    issue: 'Work in progress at the moment of cutover belongs to neither the old path nor the new one unless someone reconciles it.',
    requiredAction: 'Enumerate in-flight correspondence and tasks, and decide for each which path completes it.',
    steps: ['Enumerate everything not in a terminal state.', 'Decide per item which path completes it.', 'Record the count and the decision.'],
    validation: ['Every in-flight item has a decided path.', 'The count is recorded as evidence.'],
    stopIf: 'The queue cannot be enumerated, because then it cannot be reconciled.',
    parameters: [],
    dependsOn: ['OP-011'],
    reference: 'docs/cutover',
  },
  {
    id: 'OP-013', stage: 'Hypercare', severity: 'High', title: 'Open hypercare with a named end',
    issue: 'Hypercare with no end date is not hypercare — it is the normal operating state, and nobody is watching more closely than usual.',
    requiredAction: 'Start hypercare with a daily review, an escalation route and a dated exit.',
    steps: ['Name who performs the daily review.', 'Record the escalation route and the support contact operators are told to use.', 'Set the exit date and the criteria for exiting early.'],
    validation: ['A daily review, an escalation route and an exit date are all recorded.'],
    stopIf: 'No one has been named for the daily review.',
    parameters: ['hypercareEnds', 'supportContact', 'pilotCohort'],
    dependsOn: ['OP-012'],
    reference: 'docs/cutover',
  },
  {
    id: 'OP-014', stage: 'Authorisation', severity: 'Critical', title: 'Authorise production use',
    issue: 'Nothing above authorises anything. Somebody has to decide, and be recorded as having decided.',
    requiredAction: 'Confirm every gate check is green and record the authorising person and the date.',
    steps: ['Read the Release Gate. Every check must be green.', 'Run the structural audit and confirm no error-severity problem stands.', 'Record the authorising person, the date, and the change reference.'],
    validation: ['The gate reports READY.', 'The structural audit reports no error.'],
    stopIf: 'Any gate check is red. The gate is computed on every read; there is nothing to override.',
    parameters: ['businessOwner', 'changeReference'],
    dependsOn: ['OP-001', 'OP-002', 'OP-003', 'OP-004', 'OP-005', 'OP-006', 'OP-007', 'OP-008', 'OP-009', 'OP-010', 'OP-011', 'OP-012', 'OP-013'],
    reference: 'scripts/commission-check.mjs',
  },
]);

/* ------------------------------------------------------------------ *
 * Acceptance records — one per contract key, derived from the atlas
 * ------------------------------------------------------------------ */

export const RunbookAcceptance = Object.freeze(EndpointAtlas.keys.map((k) => Object.freeze({
  id: `EP-${k.key}`,
  requirement: `${k.key} reaches ${k.flow} and behaves as its contract states`,
  severity: k.surface === 'portal' ? 'Critical' : 'High',
  surface: k.surface,
  workflowId: k.workflowId,
  requiredFields: ENDPOINT_ACCEPTANCE_FIELDS,
  /* Named per record rather than assumed, because the portal keys are called by the public and
     the internal ones are not: the same evidence means different things on the two surfaces. */
  note: k.surface === 'portal'
    ? 'A public-channel endpoint. It is delivered to every visitor\'s browser and answers whoever calls it, so its own validation and rate limiting are the whole control.'
    : 'An internal endpoint. Its flow is the only place authorisation can be enforced, because the browser calls it directly.',
})));

export const OpsRunbookDefinition = Object.freeze({
  id: 'dgo-commissioning',
  version: '1.0.0',
  title: 'Commissioning runbook',
  subtitle: 'The obligations that stand between a green test suite and live usage — the ones no script can settle.',
  authorisingAction: 'OP-014',
  acceptanceRequiredFields: ENDPOINT_ACCEPTANCE_FIELDS,
  stages: Object.freeze(['Decisions', 'Configuration', 'Verification', 'Data', 'Cutover', 'Hypercare', 'Authorisation']),
  parameters: RunbookParameters,
  actions: RunbookActions,
  acceptance: RunbookAcceptance,
});

export default OpsRunbookDefinition;
