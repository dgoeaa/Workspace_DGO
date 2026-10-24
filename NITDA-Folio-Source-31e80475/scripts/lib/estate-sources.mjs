import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
/**
 * Every source in this branch that describes a SharePoint list or a Power Automate flow.
 *
 * WHY THIS IS A DECLARED LIST AND NOT A DIRECTORY WALK
 *
 * A walk finds what is there. It cannot say what each file's *authority* is, and authority is the
 * whole problem: `sharepoint-list-index.json` is an observation of the tenant on one date,
 * `http-flow-registry-spec.json` is a design for lists that do not exist, and
 * `portal-field-spec.json` is a mixture — captured columns beside ones marked PENDING. Merging
 * those three without saying which is which produces a register that reads as fact and is partly
 * intention.
 *
 * So every source is declared with what kind of statement it makes, and the register carries that
 * kind on every record it derives. `tests/estate-register.test.mjs` fails if a file matching the
 * shapes below exists and is not declared here, so the list cannot fall behind the repository.
 *
 * KINDS
 *   observed     read from the tenant on a stated date. The strongest claim available.
 *   specified    a design. It says what should exist, which is not evidence that it does.
 *   derived      computed from other sources by a generator in this repository.
 *   exported     a definition exported from Power Automate — authoritative about its own body.
 *   superseded   kept for provenance; something else replaced it. Never merged into totals.
 */

export const SOURCES = [
  /* ── lists ──────────────────────────────────────────────────────────────────────────────── */
  {
    id: 'tenant-capture',
    path: 'docs/reference/sharepoint-list-index.json',
    kind: 'observed',
    describes: ['lists'],
    authority:
      'The 2026-08-18 capture of every list and library visible across five site collections. '
      + 'The only source in this branch that observed the tenant rather than describing it.',
    caveat:
      'Dated. Anything created, renamed or deleted since is invisible to it — GOV-09 records rows '
      + 'written 13 days after it, and GOV-11 records three resources reported created 23 days after.',
  },
  {
    id: 'governance-registry',
    path: 'docs/reference/governance-list-registry.json',
    kind: 'derived',
    describes: ['lists'],
    authority: 'The GOV-01 decision: which 10 governance lists are authoritative and which 17 instances retire.',
  },
  {
    id: 'governance-spec',
    path: 'docs/reference/sharepoint-provisioning-spec.json',
    kind: 'specified',
    describes: ['lists', 'fields'],
    authority: 'The governance provisioning specification — what the 10 governance lists must carry.',
    caveat:
      'Carries TWO field tables. `tables.Fields.records` is the verbatim workbook extraction; '
      + '`fields` at the top level is that extraction with GOV-03 and GOV-08 applied by '
      + 'scripts/correct-governance-fields.mjs. The counts differ and the register reports both.',
  },
  {
    id: 'registry-spec',
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/http-flow-registry-spec.json',
    kind: 'specified',
    describes: ['lists', 'fields'],
    authority: 'The HTTP flow registry design: 7 lists, extracted from a workbook plus declared amendments.',
    caveat: 'NOT BUILT. No list in it exists on any tenant. Every row is intention.',
  },
  {
    id: 'portal-spec',
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/portal-field-spec.json',
    kind: 'specified',
    describes: ['lists', 'fields'],
    authority: 'The document portal and correspondence-gateway lists, with a captured state per column.',
    caveat:
      'Mixed. Each column carries capturedState — LIVE means observed on the tenant, PENDING means '
      + 'specified and not provisioned. The register keeps the distinction per column.',
  },
  {
    id: 'internal-evidence',
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/internal/internal-field-evidence.json',
    kind: 'observed',
    describes: ['lists', 'fields'],
    authority: 'Columns observed deployed on the internal platform lists, per list, from tenant evidence.',
  },
  {
    id: 'index-targets',
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/index-targets.json',
    kind: 'specified',
    describes: ['lists'],
    authority: 'Columns that must carry a SharePoint index, on lists at or past the list-view threshold.',
  },
  {
    id: 'legacy-list-spec',
    path: 'docs/folio-Master-Flows-and-Endpoints/packages/sharepoint-lists.json',
    kind: 'superseded',
    describes: ['lists'],
    authority: 'An earlier 7-list specification. It names its own successor.',
  },
  {
    id: 'proof-ledger',
    path: 'docs/reference/internal-proof-ledger.json',
    kind: 'specified',
    describes: ['lists', 'fields'],
    authority:
      "The platform owner's 2026-09-24 decision that the internal platform and the Correspondence "
      + 'Gateway keep SEPARATE proof ledgers, with the one list that decision requires.',
    caveat: 'listId is null and status is AWAITING_PROVISIONING. The list does not exist yet.',
  },
  {
    id: 'mailer-catalogue',
    path: 'mailer/flows/flows.catalogue.json',
    kind: 'specified',
    describes: ['lists', 'fields', 'flows'],
    authority:
      'The DGO Correspondence Mailer, contract dgo-mail/2.0: the 8 lists and 7 flows that platform '
      + 'runs on, on the NITDADGO-EAAACTIVITYTRACKING site.',
    caveat:
      "The mailer's own setup provisions these lists on first run. The 2026-08-18 tenant capture "
      + 'predates the platform, so nothing in this branch has observed them.',
  },

  /* ── flows ──────────────────────────────────────────────────────────────────────────────── */
  {
    id: 'endpoint-register',
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json',
    kind: 'observed',
    describes: ['flows'],
    authority:
      'Exported from the tenant. 25 configured contract keys and a 51-workflow complete registry, '
      + 'each keyed by the 32-hex Logic Apps workflow id.',
    caveat: 'Every sig= is removed. The register carries the URL shape, never a credential.',
  },
  {
    id: 'workflow-ids',
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/endpoint-workflow-ids.json',
    kind: 'derived',
    describes: ['flows'],
    authority: 'The 25 contract keys resolved to workflow ids, 18 internal and 7 portal, with method and routing.',
  },
  {
    id: 'portal-workflow-ids',
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/portal-endpoint-workflow-ids.json',
    kind: 'observed',
    describes: ['flows'],
    authority: 'The 7 portal endpoints captured from the tenant, with their own changelog.',
  },
  {
    id: 'internal-register',
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/internal-flow-register.json',
    kind: 'derived',
    describes: ['flows'],
    authority: 'The internal platform: 20 contract keys mapped onto 16 physical flows.',
  },
  {
    id: 'definition-map',
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/flow-definition-map.json',
    kind: 'derived',
    describes: ['flows'],
    authority:
      'The attempted join between exported definitions and the tenant register. It is the measurement '
      + 'behind GOV-06 and states its own limits.',
    caveat:
      'ZERO exported definitions carry an id the register knows. 13 of 77 match on normalised display '
      + 'name. This source exists to record that the two identifier spaces do not join.',
  },
  {
    id: 'flow-list-map',
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/flow-list-map.json',
    kind: 'derived',
    describes: ['flows', 'lists'],
    authority:
      'Every SharePoint reference in every flow definition held in this branch: which flow touches '
      + 'which list, at which action, by GUID or by title.',
  },
  {
    id: 'flow-candidates',
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/inventory-flow-candidates.json',
    kind: 'derived',
    describes: ['flows'],
    authority: 'Candidate mappings for endpoints whose flow was not settled, with a confirmation status.',
    caveat: 'Candidates, explicitly unconfirmed. Never counted as a resolved mapping.',
  },
  {
    id: 'workbench-catalog',
    path: 'tools/flow-workbench/catalog.json',
    kind: 'derived',
    describes: ['flows'],
    authority: 'The flow workbench catalogue: request shapes for 50 flows, with its source boundary declared.',
  },
  {
    id: 'request-shapes',
    path: 'tools/flow-workbench/ALL_FLOW_REQUEST_SHAPES.json',
    kind: 'derived',
    describes: ['flows'],
    authority:
      'The request shape of every HTTP-triggered flow the workbench holds — 50 flows, each with the '
      + 'path and SHA-256 of the definition it was read from.',
    caveat:
      'Declares its own boundary: supplied active definitions only, Request/PowerAppV2 triggers excluded '
      + 'because those are invoked through the Power Platform connector rather than by HTTP.',
  },
  {
    id: 'tenant-flow-inventory',
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-18-tenant-flow-inventory.json',
    kind: 'observed',
    describes: ['flows'],
    authority:
      'A live read of the tenant through the Power Automate Flow Management API on 2026-09-18: 20 flows '
      + 'with state, trigger, method and trigger authentication type, and 6 requested identifiers not found.',
    caveat:
      "The source's own header reads status: failed / WRITE_FAILED. That is the capture flow failing to "
      + 'write its output to its intended list, not a failure to read — the reading is in the record.',
  },
  {
    id: 'flow-usage',
    path: 'docs/folio-Master-Flows-and-Endpoints/audits/flow-usage-analysis-2026-09-26.json',
    kind: 'observed',
    describes: ['flows'],
    authority:
      "The 2026-09-26 export of the tenant's whole flow estate — 648 flows, each with state, trigger, "
      + 'action count and connectors — classified by whether this estate uses it and in which role.',
    caveat:
      'The widest tenant reading in this branch by an order of magnitude. Its flow_guid is the dashed '
      + 'Power Automate id, which GOV-06 records as not resolving to the workflow ids the endpoints key on.',
  },
  {
    id: 'email-flow-adoption',
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-24-email-flow-adoption.json',
    kind: 'observed',
    describes: ['flows'],
    authority:
      'Two packages supplied for the EMAIL contract key, compared action by action: the same flow saved '
      + 'twice eight minutes apart under two names and two flow ids, with the adopted one named.',
  },
  {
    id: 'tenant-remediation',
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-24-tenant-remediation-verified.json',
    kind: 'observed',
    describes: ['flows'],
    authority:
      'Two tenant changes verified on 2026-09-24 from fresh artefacts: SCAN_INTAKE is Tenant-authenticated '
      + 'again, and FETCH_ALL refuses the caller it served on 2026-09-22.',
  },
  {
    id: 'registry-seed',
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/FLOW_REGISTRY_SEED.json',
    kind: 'derived',
    describes: ['flows', 'lists'],
    authority:
      'Every flow the estate knows in one row each, in DGO_HTTPFlowRegistry column shape — 109 registry '
      + 'rows, 168 dependency rows and the 45 lists those dependencies name. The seed GOV-06 names as its '
      + 'own resolution.',
    caveat:
      'The two registry lists it targets are not provisioned, and it says so. Its rows are a seed for a '
      + 'list that does not exist; the columns it leaves empty are the ones no evidence can fill.',
  },
  {
    id: 'registry-decisions',
    path: 'docs/folio-Master-Flows-and-Endpoints/reference/REGISTRY_DECISIONS.json',
    kind: 'derived',
    describes: ['flows'],
    authority:
      'The four REQUIRED registry columns that need a person, with what can be proposed from evidence for '
      + 'each of 109 flows and what cannot.',
    caveat: 'Proposals, explicitly not decisions. Nothing here has been ratified by anyone.',
  },
  {
    id: 'identity-crosswalk',
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/flow-identity-crosswalk.json',
    kind: 'derived',
    describes: ['flows'],
    authority:
      'Each contract key set against both identifier domains at once: the application workflow id the '
      + 'endpoint register keys on, and the tenant flow ids that serve it.',
    caveat:
      'It states the relationship between the two domains rather than asserting one resolves to the other. '
      + 'Keys with more than one candidate are counted as such, not collapsed.',
  },
  {
    id: 'contract-key-map',
    path: 'docs/folio-Master-Flows-and-Endpoints/reference/contract-key-flow-map.json',
    kind: 'specified',
    describes: ['flows'],
    authority:
      'The contract key → flow mapping supplied by the platform owner on 2026-09-24, for 24 keys, with a '
      + 'confidence on each row.',
    caveat:
      "A statement of INTENT — expectedFlowName is the field's own word. For what serves traffic today the "
      + 'file directs the reader to the endpoint register instead.',
  },
  {
    id: 'contract-key-reconciliation',
    path: 'docs/folio-Master-Flows-and-Endpoints/reference/contract-key-flow-reconciliation.json',
    kind: 'derived',
    describes: ['flows'],
    authority:
      'Every key the owner map names, set against what the estate is wired to, with the difference '
      + 'classified per row: 15 already wired as named, 5 answered by the map, 4 naming a different flow.',
    caveat: 'It picks no winner. Each row carries a verdict and an action, and nothing is applied.',
  },
  {
    id: 'package-provenance',
    path: 'docs/folio-Master-Flows-and-Endpoints/reference/flow-package-provenance.json',
    kind: 'derived',
    describes: ['flows'],
    authority:
      'Each supplied export package joined by its own flow id to the 2026-09-18 tenant reading and to this '
      + "repository's recorded exports — 20 packages, with import hazards named.",
    caveat:
      'The join is on the dashed flow id, the only identifier all three readings carry. No package carries '
      + 'a workflow id that any wired endpoint knows.',
  },
  {
    id: 'connector-register',
    path: 'docs/folio-Master-Flows-and-Endpoints/reference/connector/connector-register.json',
    kind: 'derived',
    describes: ['flows', 'lists'],
    authority:
      'Every connector and connection used by every flow action and trigger in this repository: 222 flow '
      + 'labels, 324 artefacts, 4131 actions walked, and the 59 SharePoint site/list targets they address.',
    caveat:
      'Keyed by flow LABEL, not by either identifier. A label is how the artefact names itself, so rows '
      + 'join to this register by name and are held as name-only where no identifier appears beside them.',
  },
  {
    id: 'authorisation-gates',
    path: 'docs/folio-Master-Flows-and-Endpoints/reference/authorisation-gates.json',
    kind: 'derived',
    describes: ['flows'],
    authority:
      'Every place in the estate where an authorisation decision branches on a constant — a gate that '
      + 'cannot return false whatever the request carries.',
    caveat:
      'It says what it does not claim: that a flow with no finding authorises correctly. It asks only '
      + 'whether a decision CAN go both ways.',
    /* A clean estate gives this source nothing to say: its findings list is empty (2026-10-06, after the
       superseded FETCH_ALL export that held the one known finding was retired). */
    silentWhenEmpty: 'findings',
  },
  {
    id: 'rotation-worksheet',
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/rotation/rotation-worksheet.json',
    kind: 'derived',
    describes: ['flows'],
    authority:
      'Which of the 25 endpoint keys need a new trigger URL after the ITEM-22 rotation and which do not, '
      + 'computed per flow from the disclosed signatures.',
  },
  {
    id: 'portal-wiring',
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/portal-wiring.json',
    kind: 'derived',
    describes: ['flows', 'lists'],
    authority:
      'Which flow reads and writes which portal list, what crosses into the internal estate and where, and '
      + 'what is not yet wired — 7 endpoints, the bridge, and every measured crossing.',
    caveat:
      'The portal estate is a trust boundary in this file: a crossing is recorded whether or not it is '
      + 'accepted, and its state says which.',
  },
  {
    id: 'operations-manifest',
    path: 'docs/reference/operations-manifest.json',
    kind: 'derived',
    describes: ['flows'],
    authority:
      "A static extraction of the internal client's own endpoint table — 10 endpoints, each with the "
      + 'workflow id, method and trigger the shipping page calls, and the functions that call it.',
    caveat:
      'Read from the client, so it evidences what the client calls, not what answers. Dated 2026-07-30 and '
      + 'the oldest reading the register holds.',
  },
];

/**
 * Files that look like a source and are deliberately not one, each with the reason.
 *
 * An exclusion is a claim too, so it is written down rather than left to the shape of a regular
 * expression. `tests/estate-register.test.mjs` sweeps every JSON file under docs/, mailer/, tools/
 * and config/, and fails on any file that enumerates lists or flows and is neither declared above
 * nor excluded here. That is what makes "nothing was silently omitted" checkable rather than
 * asserted.
 */
const EVIDENCE_DIR = fileURLToPath(new URL('../../docs/folio-Master-Flows-and-Endpoints/evidence/', import.meta.url));
export const CONSIDERED_AND_EXCLUDED = [
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/notification-instrument/tenant-execution/evidence/rollback-rehearsal-2026-10-17.json',
    reason:
      'The rollback rehearsal for the notification release (ITEM-71, 2026-10-17): one adopted flow\'s definition hashes before, '
      + 'during and after a flows:update restore. It is release evidence: it adds no list and names one flow already in the '
      + 'flow adoption ledger.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/notification-instrument/tenant-execution/evidence/tenant-inventory.json',
    reason:
      'The notification release baseline (ITEM-71 gate 1, captured 2026-10-16): the adopted flows\' state, trigger, connectors '
      + 'and last runs, the contract-key map and the started flows that are not adopted. It is release evidence, not an estate '
      + 'source: it adds no list, and every flow in it is already in the flow adoption ledger or the environment capture.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/notification-instrument/tenant-execution/cutover-register.json',
    reason:
      'The notification cutover record (ITEM-71): the Started adopted flows from the same 2026-10-16 read, with the rollback '
      + 'rehearsal and hypercare owners. It adds no list and no flow.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/notification-instrument/tenant-execution/evidence/notification-test-results.json',
    reason:
      'The notification test results (ITEM-71): one row per required notice, naming the flow and run that proved it. '
      + 'Every flow it names is already in the estate from the deployed contracts. It adds no list and no flow.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/evidence/2026-10-10-live-read.json',
    reason:
      'A live read (2026-10-10) of four adopted flows\' state, trigger folder and recent runs (the AI flow\'s header, the two '
      + 'scan flows, the sweep), kept as evidence for ITEM-70, ITEM-75 and ITEM-80. It adds no list and no flow.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/evidence/2026-10-20-final-live-set.json',
    reason:
      'The live state of every adopted Folio flow at the end of commissioning (2026-10-20), read from the tenant: the '
      + 'flows already in the estate from flow-adoption.json, with their state and last run. It adds no list and no flow.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/evidence/2026-10-20-centre-flow-watch-live.json',
    reason:
      'A read-only run (2026-10-20) of the Central Administration Centre against the tenant: the state and newest run of '
      + 'every flow in flow-catalogue.json, already in the estate. It adds no list and no flow.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/flow-catalogue.json',
    reason:
      'The plain-English catalogue the handover packs print (npm run handover): for each Folio flow in the final live set, '
      + 'its group, purpose and trigger. Its flows are those of 2026-10-20-final-live-set.json; it adds no list and no flow.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/evidence/2026-10-19-gov01-provisioning-report.json',
    reason:
      'The report 01 - GOV - Provision HTTP Flow Registry e-mailed after its run of 2026-10-19 (RN-028): it validates the seven '
      + 'DGO_HTTPFlow* lists, already in the estate from the HTTP flow registry specification. It adds no list and no flow.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/evidence/2026-10-10-list-columns.json',
    reason:
      'A live column read (2026-10-10) of two lists already in the estate, Global Tracking Queue and DGO DIGITAL OPS, kept '
      + 'as evidence for ITEM-25 and read by the identification package checks. It adds no list and no flow.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/identification-paste-ledger.json',
    reason:
      'The paste ledger: by fingerprint, which identification package each flow runs. It names packages, not flows or '
      + 'lists; the flows are the adopted flows read here from contracts/deployed.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/config-build-ledger.json',
    reason:
      'The config build ledger: for the last delivered config files, each contract key\'s flow, workflow id and a digest of '
      + 'its URL. Its flows are the adopted flows, read here from contracts/deployed; it states what a build holds, not a '
      + 'flow or a list.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/identification-release.json',
    reason: 'The identification package release: each package file and its fingerprint. Names packages, not flows or lists.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/identification-phase3-status.json',
    reason:
      'Each identification Phase 3 package\'s tenant state, generated by scripts/build-identification-phase3.mjs for the '
      + 'Folio Estate Console. Its flows are the adopted flows, read here from contracts/deployed; it states paste status, '
      + 'not a flow or a list.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/identification-phase4-status.json',
    reason:
      'Each identification Phase 4 package\'s tenant state, generated by scripts/build-identification-phase4.mjs for the '
      + 'Folio Estate Console. Its flows are the adopted flows, read here from contracts/deployed; it states paste status, '
      + 'not a flow or a list.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json',
    reason:
      'The adoption ledger, generated by scripts/build-flow-adoption.mjs. Its adopted flows are exactly the '
      + 'definitions in contracts/deployed, which are read here; its retired flows are no longer in the estate. '
      + 'Reading it too would count the adopted flows twice.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/reference/endpoints.json',
    reason:
      'The endpoint dataset, generated by scripts/build-endpoint-dataset.mjs from the endpoint register '
      + 'and the deployed definitions. Both are already read here, so reading it too would count the same '
      + 'flows twice.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/reference/folio-flows-in-use.power-automate.json',
    reason: 'The Power Automate form of folio-flows-in-use.json, built by the same generator; no statement of its own.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/reference/folio-flows-in-use.power-automate.schema.json',
    reason: 'The Power Automate form of folio-flows-in-use.json, built by the same generator; no statement of its own.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/reference/folio-flows-in-use.json',
    reason:
      'Built by scripts/build-folio-flows.mjs from this register and the 2026-09-26 usage analysis, '
      + 'so it adds no statement of its own; reading it back would count the same evidence twice.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/reference/estate-register.json',
    reason:
      'The register itself. It is this file\'s output, so reading it as an input would let yesterday\'s '
      + 'totals justify today\'s.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/live-operations-console/EMBEDDED_DATA_MODEL.json',
    reason:
      'Declared as a source for one build and withdrawn: its 38 acceptance rows carry a flowId field '
      + 'and every value in it is an empty string, so the file names no flow. The console it belonged '
      + 'to is retired, and the check that every declared source contributes a statement caught it.',
  },
  {
    path: 'docs/reference/process-inventory.json',
    reason:
      'The process documentation inventory, built by scripts/process-discovery.mjs from these same '
      + 'sources. Merging it would count every list and flow a second time through a second generator.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-08-31-dynamic-actions-column-evidence.json',
    reason:
      'The column-mining run whose conclusions are carried, per list and per column, by the declared '
      + 'docs/folio-Master-Flows-and-Endpoints/deployment/internal/internal-field-evidence.json. It names no list that source does not.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/evidence/2026-09-01-paste-state-by-flow.json',
    reason:
      'A dated comparison of twelve exports against their replacement packages. The packages, and the '
      + 'register of which flow each targeted, were retired on 2026-10-06 (registers/flow-retirement.json).',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/evidence/2026-09-02-provisioning-dry-run.json',
    reason:
      'A DRY_RUN reading of the column state that portal-field-spec.json carries per column as '
      + 'capturedState. It creates nothing and enumerates no list the spec does not.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/evidence/p1-1-list-check-2026-10-03.json',
    reason:
      'A read-only P1-1 reading of column, index and item-count state for the datasets the identifier '
      + 'catalogue (docs/reference/identification/identifier-catalogue.json) already declares. It names no '
      + 'list the catalogue does not, and creates nothing.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/evidence/p1-1-list-check-2026-10-04-after-completion.json',
    reason:
      'The read-only P1-1 check re-run after ID_Phase1_Complete: column, index and item-count state for the 27 '
      + 'datasets the identifier catalogue declares. It names no list the catalogue does not.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/evidence/phase1-completion-rerun-2026-10-04.summary.json',
    reason:
      'Per-column and per-row outcome of the ID_Phase1_Complete re-run, against the lists and Flow Configuration '
      + 'rows that identity-provisioning.json (generated from the catalogue) declares. It names nothing new.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/evidence/phase1-finish-2026-10-04.summary.json',
    reason:
      'Per-step outcome of the ID_Phase1_Finish run: index and column changes on lists the identifier catalogue '
      + 'already declares. It names no list the catalogue does not.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/evidence/phase1-gtq-indexes-2026-10-04.summary.json',
    reason:
      'Per-column outcome of the Global Tracking Queue index run (5 indexes set, 1 legacy index freed), on a list the '
      + 'identifier catalogue already declares. It names nothing new.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/evidence/p1-1-list-check-2026-10-04-after-finish.json',
    reason:
      'The read-only P1-1 check re-run after ID_Phase1_Finish: column, index and item-count state for the 27 '
      + 'datasets the identifier catalogue declares. It names no list the catalogue does not.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase2/evidence/phase2-claim-test-2026-10-04-run1.summary.json',
    reason:
      'Per-claim outcome of the first Phase 2 claim test run: numbers drawn from the ZTST test counter in Portal '
      + 'Sequence Counters, a list the identifier catalogue already declares. It names nothing new.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase2/evidence/phase2-claim-test-2026-10-04-run2.summary.json',
    reason:
      'Per-claim outcome of the second Phase 2 claim test run, on the ZTST test counter in Portal Sequence Counters, '
      + 'a list the identifier catalogue already declares. It names nothing new.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase2/evidence/phase2-claim-test-2026-10-04-run3.summary.json',
    reason:
      'Per-claim outcome of the third Phase 2 claim test run (the Phase 2 exit pass), on the ZTST test counter in Portal '
      + 'Sequence Counters, a list the identifier catalogue already declares. It names nothing new.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/evidence/p1-1-list-check-2026-10-03-after-p1-2.json',
    reason:
      'The same read-only P1-1 check re-run after P1-2, recording the identity columns and indexes now present on '
      + 'datasets the identifier catalogue already declares. It names no list the catalogue does not.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/evidence/2026-08-31-bridge-superseded-export.json',
    reason:
      'A finding about one flow id having two exports of different ages. The definitions themselves are '
      + 'read from the declared definition directories, which carry both.',
  },
  {
    path: 'docs/reference/identification/identifier-catalogue.json',
    reason:
      'The identification system catalogue. Its dataset bindings name lists by the GUID, title and site '
      + 'this register already records (tests/identification-system.test.mjs checks each one against '
      + 'estate-register-lists.csv), so it adds no list and reading it would count the same lists twice.',
  },
  {
    path: 'docs/reference/identification/provisioning/identity-provisioning.json',
    reason:
      'The Phase 1 provisioning plan, generated by scripts/build-identification-provisioning.mjs from the '
      + 'identification catalogue, which is itself excluded above. It names the same lists by the same GUIDs, '
      + 'plus eight lists that do not exist yet, so reading it would count lists twice or report planned '
      + 'lists as estate.',
  },
  {
    path: 'docs/folio-Master-Flows-and-Endpoints/surfaces/governance/DGO_FLOW_TRUTH_PERSISTENCE.designer-paste.json',
    reason:
      'A designer-paste fragment — a scope to paste into an open designer, not a flow definition. The '
      + 'governance flow bodies are read from the .corrected.json files in the same directory.',
  },
  /* Reports of npm run flows:update (--record) and live fingerprint reads: hashes and dates of packages written into
     flows, not a statement of which flows or lists exist. Picked up by name so each new run needs no entry here. */
  ...readdirSync(EVIDENCE_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}-(flows-(check|apply|restore)(-\d+)?|live-fingerprints)\.json$/.test(f)).sort()
    .map((f) => ({ path: `docs/folio-Master-Flows-and-Endpoints/evidence/${f}`,
      reason: 'A flows-update report or a live fingerprint read: package and flow hashes at a moment, written by npm run flows:update --record or the release check. It names flows already read here from contracts/deployed; it states no flow or list of its own.' })),
  { path: 'docs/folio-Master-Flows-and-Endpoints/evidence/2026-10-07-otp-generate-created.json',
    reason: 'The creation record of IP_OTP_GENERATE (ITEM-82, owner approval 2026-10-07): what was sent, the create status and the read-back. The flow is not yet wired to a contract key; it enters the estate sources through its capture and the adoption ledger when Folio\'s OTP_GENERATE points at it.' },
  /* Owner-approved live operations (ITEM-40 trigger hardening, ITEM-65 endpoint values read): the outcome of each
     write or read, per flow. Picked up by name like the reports above. */
  ...readdirSync(EVIDENCE_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}-(item\d+-(triggers|sharepoint)|endpoint-values-read|estate-live-read|closure-operations)\.json$/.test(f)).sort()
    .map((f) => ({ path: `docs/folio-Master-Flows-and-Endpoints/evidence/${f}`,
      reason: 'A report of an owner-approved live operation: per flow, what was read or written and the read-back result. It names flows already read here from contracts/deployed and carries no URL or signature; it states no flow or list of its own.' })),

];

/** Directories of exported flow definitions, each authoritative about its own bodies. */
export const DEFINITION_DIRS = [
  {
    id: 'deployed-definitions',
    dir: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed',
    kind: 'exported',
    authority: 'Definitions exported from Power Automate. Authoritative about what each flow contains.',
  },
  {
    id: 'foundational-definitions',
    dir: 'docs/reference/foundational/flows/definitions',
    kind: 'exported',
    authority: 'Definitions held under the foundational lineage, from an earlier release.',
    caveat: 'Lineage. These describe an earlier release and are not the live estate.',
  },
  {
    id: 'mailer-definitions',
    dir: 'mailer/flows/definitions',
    kind: 'specified',
    match: /\.definition\.json$/,
    authority: "The seven mailer flow bodies as this repository builds them, contract dgo-mail/2.0.",
    caveat:
      'Built here and installed by the mailer\'s own setup. A body in this directory is what the setup '
      + 'creates, not a reading of what the tenant runs.',
  },
  {
    id: 'corrected-definitions',
    dir: 'docs/folio-Master-Flows-and-Endpoints/surfaces/governance',
    kind: 'specified',
    match: /\.corrected\.json$/,
    authority: 'The four governance flows as corrected in this repository, not yet applied to the tenant.',
    caveat: 'Corrections. The tenant still runs the uncorrected bodies until Step 4 is executed.',
  },
];

/**
 * The site collections are NOT declared here.
 *
 * They were, for one draft, as a five-item list — and one of the five was wrong: I typed
 * `DGODIGITALOPS` where the capture says `DRC`. A hand-typed list of things a source already
 * enumerates is a fifth chance to be wrong about them, so the register reads
 * `sharepoint-list-index.json`'s own `sites` array and nothing else.
 */
