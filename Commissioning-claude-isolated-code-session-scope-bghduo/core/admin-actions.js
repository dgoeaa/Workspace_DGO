// DGO R11.6 — the administrative action catalogue.
//
// WHY A CATALOGUE AND NOT JUST BUTTONS
//
// Administrative capability in this platform was, until this file, whatever buttons happened to
// exist on five screens. Nothing enumerated it. So there was no way to answer three questions
// that an administrator, an auditor and a support engineer each ask constantly:
//
//   · What am I actually able to do here?  A control you cannot find is a control you do not
//     have, and the ones that matter most are used rarely enough that nobody remembers where
//     they live.
//   · What will this do that I cannot undo?  "Clear this device's saved data" and "Copy
//     connection report" were the same size, the same colour and one row apart.
//   · Who is allowed to do it?  The permission was checked at the point of use and written down
//     nowhere, so the only way to know a role's real reach was to sign in as it and look.
//
// This table answers all three, and the suite renders from it rather than from hand-placed
// buttons — so an action that exists is listed, and an action that is listed exists. The two
// cannot drift, because there is only one record.
//
// `blast` IS THE FIELD THAT MATTERS
//
//   read        Changes nothing. Safe to run while wondering whether to.
//   device      Changes this browser on this device only. An administrator who "fixed" the
//               estate from one laptop has fixed nothing for anyone else, and the suite says so
//               at the point of the control rather than in a note further down the page.
//   tenant      Reaches Power Automate. It leaves this building.
//   estate      Changes what every user of this deployment sees.
//   irreversible  There is no undo and no copy. Confirmed by typing, never by clicking.
//
// EVERY ENTRY DECLARES ITS AUDIT EVENT. `run()` records one before dispatching and one after,
// including on failure. An administrative action that succeeded and left no trace is
// indistinguishable from one that never happened, which is the property an audit trail exists to
// deny.

import { AuditLog } from './audit-log.js';
import { Permissions } from '../config/rbac.config.js';

export const BLAST = Object.freeze({
  READ: 'read',
  DEVICE: 'device',
  TENANT: 'tenant',
  ESTATE: 'estate',
  IRREVERSIBLE: 'irreversible',
});

export const BLAST_LABEL = Object.freeze({
  read: 'reads only',
  device: 'this device only',
  tenant: 'reaches the tenant',
  estate: 'affects everyone here',
  irreversible: 'cannot be undone',
});

export const BLAST_TONE = Object.freeze({
  read: '', device: 'info', tenant: 'warning', estate: 'warning', irreversible: 'danger',
});

/** Ordered by how much an administrator should hesitate. Used to sort the catalogue. */
export const BLAST_WEIGHT = Object.freeze({ irreversible: 0, estate: 1, tenant: 2, device: 3, read: 4 });

export const DOMAINS = Object.freeze([
  { id: 'estate', label: 'Endpoint estate', detail: 'The addresses this platform calls, and what answers on them.' },
  { id: 'flows', label: 'Flow operations', detail: 'Request shapes, composed calls and the evidence they produce.' },
  { id: 'runbook', label: 'Commissioning', detail: 'The register of obligations no script can settle.' },
  { id: 'capsule', label: 'Capsule registry', detail: 'Alias lifecycle, where a registry is deployed.' },
  { id: 'people', label: 'People and access', detail: 'Who may sign in, and what each of them may do.' },
  { id: 'platform', label: 'Platform control', detail: 'Data, cache, queues and this device\'s own state.' },
  { id: 'evidence', label: 'Audit and evidence', detail: 'What was done, by whom, and the artefacts that prove it.' },
]);

/**
 * Every administrative action this platform offers.
 *
 * `id` is stable and is what the audit trail records — a label may be rewritten for clarity, an
 * id may not, or last year's audit entries stop matching this year's catalogue.
 *
 * `requiresTypedConfirmation` is declared per entry rather than derived from `blast`, because the
 * two are not the same question. Every irreversible action needs it — but so does sending a
 * composed request to a live flow, which is reversible in the sense that nothing is destroyed and
 * entirely irreversible in the sense that the email has been sent. `confirmWord` is the word that
 * arms it, and it lives here so the suite cannot draw a control armed by a different word from
 * the one the action expects.
 */
export const AdminActions = Object.freeze([
  /* ---- Endpoint estate ------------------------------------------------------------- */
  { id: 'estate.review', domain: 'estate', label: 'Review the endpoint estate', blast: BLAST.READ, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Every contract key checked against the workflow the tenant register names for it.', audit: 'audit:admin-estate-reviewed' },
  { id: 'estate.health-contract', domain: 'estate', label: 'Run the non-destructive health check', blast: BLAST.TENANT, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Calls every configured endpoint with validationOnly:true. A flow that implements the contract writes nothing; one that does not is reported as unimplemented, and that call may have reached its write path.',
    confirm: 'This calls every configured endpoint in the tenant. Flows that implement the health contract write nothing. Flows that do not implement it may take their normal path — the result will say which did what.',
    audit: 'audit:admin-health-probe' },
  { id: 'estate.identity-verify', domain: 'estate', label: 'Prove which flow each key reaches', blast: BLAST.TENANT, permission: Permissions.SETTINGS_MANAGE,
    detail: 'The identity handshake. The only check here that can detect a correctly-signed URL addressing the wrong workflow.',
    confirm: 'This calls every configured endpoint in the tenant with a verification envelope. Flows that implement the handshake answer with their own identity and write nothing.',
    audit: 'audit:admin-identity-probe' },
  { id: 'estate.read-probe', domain: 'estate', label: 'Call the read-only endpoints', blast: BLAST.TENANT, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Exercises the real path a feature takes, for the endpoints whose contract says they only read. Write endpoints are refused, not skipped quietly.',
    confirm: 'This calls the endpoints declared read-only in their contract. No write endpoint is called.',
    audit: 'audit:admin-read-probe' },
  { id: 'estate.override-set', domain: 'estate', label: 'Override an endpoint address', blast: BLAST.DEVICE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'A repair tool for one workstation. The estate is configured by npm run setup and shipped by npm run package; an override here fixes nothing for anyone else.',
    confirm: 'This changes where this browser sends requests for that contract key. It applies to this device only, and to nobody else using this deployment.',
    audit: 'audit:admin-endpoint-override' },
  { id: 'estate.override-clear', domain: 'estate', label: 'Clear every override on this device', blast: BLAST.DEVICE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Returns every connection to the address supplied when this workspace was installed. Correct for almost every site.',
    confirm: 'Every endpoint on this device returns to the installed address. Any repair made here is discarded.',
    audit: 'audit:admin-endpoint-override-cleared' },
  { id: 'estate.export', domain: 'estate', label: 'Export the redacted estate report', blast: BLAST.READ, permission: Permissions.SETTINGS_MANAGE,
    detail: 'The whole estate as JSON with every signature replaced by ***. Written to be safe to send to support.', audit: 'audit:admin-estate-exported' },

  /* ---- Flow operations ------------------------------------------------------------- */
  { id: 'flows.inspect', domain: 'flows', label: 'Inspect a flow\'s request shape', blast: BLAST.READ, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Every field the trigger declares, with its type, requiredness and constraints, read from the tenant\'s own export.', audit: 'audit:admin-shape-inspected' },
  { id: 'flows.validate', domain: 'flows', label: 'Validate a composed request', blast: BLAST.READ, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Checks a payload against the schema the flow itself enforces. Shape only — it says nothing about authority or tenant state.', audit: 'audit:admin-request-validated' },
  { id: 'flows.send', domain: 'flows', label: 'Send a composed request', blast: BLAST.TENANT, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Invokes the flow for real. If the flow sends mail, real recipients receive real mail; if it writes, the write happens.',
    confirm: 'This invokes the flow in the tenant. It is not a simulation: anything the flow does — assigning, emailing, writing to the registry — happens.',
    requiresTypedConfirmation: true,
    confirmWord: 'SEND',
    audit: 'audit:admin-request-sent' },
  { id: 'flows.export-alignment', domain: 'flows', label: 'Export an alignment report', blast: BLAST.READ, permission: Permissions.SETTINGS_MANAGE,
    detail: 'The evidence artefact: which flow, which source export and its SHA-256, which payload, and whether it conforms.', audit: 'audit:admin-alignment-exported' },
  { id: 'flows.example', domain: 'flows', label: 'Fill in an example request', blast: BLAST.READ, permission: Permissions.SETTINGS_MANAGE,
    detail: 'A payload that conforms to this trigger\'s schema, for a flow you have never called. Where the schema names required fields it takes those; where it names none it takes every top-level property, because an empty example teaches nothing.', audit: 'audit:admin-example-generated' },
  { id: 'flows.curl', domain: 'flows', label: 'Copy this request as curl', blast: BLAST.READ, permission: Permissions.SETTINGS_MANAGE,
    detail: 'A browser cannot read a Power Automate response — the endpoints send no CORS headers — so the call succeeds and the answer is unreadable. This hands you a command that can. The signature is redacted, so it does not run as pasted.', audit: 'audit:admin-curl-copied' },
  { id: 'flows.export-tables', domain: 'flows', label: 'Export the flow tables as CSV', blast: BLAST.READ, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Five tables — flow summary, request fields, response actions, mail actions and endpoint keys. JSON is what a machine reads; a spreadsheet is what a review meeting reads.', audit: 'audit:admin-tables-exported' },

  /* ---- Commissioning --------------------------------------------------------------- */
  { id: 'runbook.set-parameter', domain: 'runbook', label: 'Answer a commissioning parameter', blast: BLAST.ESTATE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Recorded against your name. Placeholder text is refused: a required field containing "TBD" answers nothing.', audit: 'audit:admin-runbook-parameter' },
  { id: 'runbook.set-status', domain: 'runbook', label: 'Change an action\'s status', blast: BLAST.ESTATE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Dependencies are enforced, not advised, and Resolved requires evidence.', audit: 'audit:admin-runbook-status' },
  { id: 'runbook.attach-evidence', domain: 'runbook', label: 'Attach evidence', blast: BLAST.ESTATE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'The reason to believe a claim. An action cannot be resolved without one.', audit: 'audit:admin-runbook-evidence' },
  { id: 'runbook.accept-risk', domain: 'runbook', label: 'Accept a residual risk', blast: BLAST.ESTATE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Closes an action without resolving it. Requires a rationale naming who accepted it and on what basis.',
    confirm: 'Accepting a risk closes this action without the work being done. It is recorded against your name, with your rationale, and it appears in the release gate as an accepted risk rather than as a pass.',
    audit: 'audit:admin-runbook-risk-accepted' },
  { id: 'runbook.export', domain: 'runbook', label: 'Export the commissioning record', blast: BLAST.READ, permission: Permissions.AUDIT_VIEW,
    detail: 'Every parameter, action, acceptance record, risk and gate check in one artefact fit to attach to a change record.', audit: 'audit:admin-runbook-exported' },
  { id: 'runbook.print', domain: 'runbook', label: 'Print the commissioning record', blast: BLAST.READ, permission: Permissions.AUDIT_VIEW,
    detail: 'The same record laid out for paper or PDF, for the people who sign one. Opens the browser\'s print dialogue.', audit: 'audit:admin-runbook-printed' },
  { id: 'runbook.import', domain: 'runbook', label: 'Restore a commissioning record', blast: BLAST.IRREVERSIBLE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Reads a record exported from this runbook and REPLACES what is held here. Locked parameters are discarded from the file; unknown actions are dropped and reported; a record that contradicts itself is imported and warned about rather than accepted silently.',
    confirm: 'Everything currently recorded in this runbook — every parameter, status, evidence entry, acceptance result and accepted risk — is replaced by what the file holds. The current record is not kept. Export it first if any of it is needed.',
    requiresTypedConfirmation: true,
    confirmWord: 'RESTORE',
    audit: 'audit:admin-runbook-imported' },
  { id: 'runbook.reset', domain: 'runbook', label: 'Reset the commissioning record', blast: BLAST.IRREVERSIBLE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Discards every answer, status, piece of evidence and accepted risk recorded in this runbook.',
    confirm: 'Every parameter, status, evidence entry, acceptance record and accepted risk in this runbook is discarded. There is no copy. Export the record first if any of it is needed.',
    requiresTypedConfirmation: true,
    confirmWord: 'RESET',
    audit: 'audit:admin-runbook-reset' },

  /* ---- Capsule registry ------------------------------------------------------------ */
  { id: 'capsule.connect', domain: 'capsule', label: 'Connect to a capsule registry', blast: BLAST.READ, permission: Permissions.SETTINGS_MANAGE,
    detail: 'The administration token is held for this tab only and is never written to disk. It has to be entered again next session.', audit: 'audit:admin-capsule-connected' },
  { id: 'capsule.verify', domain: 'capsule', label: 'Verify an alias', blast: BLAST.TENANT, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Makes the registry re-run its live identity handshake against the alias\'s active version.', audit: 'audit:admin-capsule-verified' },
  { id: 'capsule.disable', domain: 'capsule', label: 'Disable an alias', blast: BLAST.ESTATE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Every caller of that alias is refused immediately, with no redeploy. Reversible.',
    confirm: 'Every caller of this alias is refused from the moment you confirm, across every application using this registry. It can be enabled again.',
    audit: 'audit:admin-capsule-disabled' },
  { id: 'capsule.enable', domain: 'capsule', label: 'Enable an alias', blast: BLAST.ESTATE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Returns the alias to service on its currently active version.', audit: 'audit:admin-capsule-enabled' },
  { id: 'capsule.rollback', domain: 'capsule', label: 'Roll an alias back to a retained version', blast: BLAST.ESTATE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'The registry re-checks integrity and re-verifies identity before it activates anything, so a rollback to a deleted flow fails rather than leaving the alias pointing at nothing.',
    confirm: 'Every caller of this alias moves to the selected version as soon as the registry activates it. The registry verifies the version is live before switching; if that fails, nothing changes.',
    audit: 'audit:admin-capsule-rolled-back' },
  { id: 'capsule.register', domain: 'capsule', label: 'Register or rotate an alias', blast: BLAST.ESTATE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Stores a complete signed URL in the registry, which fingerprints and verifies it before activating a new version. The URL is passed through byte-for-byte.',
    confirm: 'The URL is sent to the registry, which verifies it live and — only if that succeeds — activates it as the new version for every caller of this alias. The previous version is retained and can be rolled back to.',
    requiresTypedConfirmation: true,
    confirmWord: 'ROTATE',
    audit: 'audit:admin-capsule-registered' },

  /* ---- People and access ----------------------------------------------------------- */
  { id: 'people.create', domain: 'people', label: 'Add a person', blast: BLAST.ESTATE, permission: Permissions.USER_CREATE,
    detail: 'Grants access from the next time they load the workspace.', audit: 'audit:user-created' },
  { id: 'people.update', domain: 'people', label: 'Edit a person', blast: BLAST.ESTATE, permission: Permissions.USER_UPDATE,
    detail: 'Changes what that person may do. Recorded against your name.', audit: 'audit:user-updated' },
  { id: 'people.assign-role', domain: 'people', label: 'Change a person\'s role', blast: BLAST.ESTATE, permission: Permissions.ROLE_ASSIGN,
    detail: 'A role grants what its row in the access table lists and denies everything else.',
    confirm: 'This changes which screens and actions that person can reach, from the next time they load the workspace.',
    audit: 'audit:role-assigned' },
  { id: 'people.disable', domain: 'people', label: 'Withdraw a person\'s access', blast: BLAST.ESTATE, permission: Permissions.USER_DISABLE,
    detail: 'They can no longer sign in. Their records are untouched. A reason is required and is kept in the audit trail.',
    confirm: 'That person can no longer open this workspace. Records they created are not affected.',
    audit: 'audit:user-disabled' },
  { id: 'people.export', domain: 'people', label: 'Export the access directory', blast: BLAST.READ, permission: Permissions.AUDIT_VIEW,
    detail: 'Everyone who may sign in, their role, and what that role permits.', audit: 'audit:admin-directory-exported' },

  /* ---- Platform control ------------------------------------------------------------ */
  { id: 'platform.reload-data', domain: 'platform', label: 'Reload from the registry', blast: BLAST.TENANT, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Fetches every collection again. Anything queued on this device is untouched.', audit: 'audit:admin-data-reloaded' },
  { id: 'platform.clear-cache', domain: 'platform', label: 'Clear the response cache', blast: BLAST.DEVICE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Forces the next read of each collection to go to the registry. No stored record is lost.', audit: 'audit:admin-cache-cleared' },
  { id: 'platform.retry-queue', domain: 'platform', label: 'Retry everything queued', blast: BLAST.TENANT, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Sends the writes this device queued while it could not reach the registry.',
    confirm: 'Every write queued on this device is sent now. These are real actions that were deferred, not drafts.',
    audit: 'audit:admin-queue-retried' },
  { id: 'platform.flush-queue', domain: 'platform', label: 'Discard everything queued', blast: BLAST.IRREVERSIBLE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Deletes the pending writes without sending them. The actions they represent never happen.',
    confirm: 'The queued writes are deleted without being sent. Each one is an action somebody performed that will now never reach the registry, and there is no record of what they were once this completes.',
    requiresTypedConfirmation: true,
    confirmWord: 'DISCARD',
    audit: 'audit:admin-queue-flushed' },
  { id: 'platform.clear-receipts', domain: 'platform', label: 'Clear the receipt ledger', blast: BLAST.DEVICE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Empties this device\'s record of acknowledgement receipts. The registry\'s copy is unaffected.', audit: 'audit:admin-receipts-cleared' },
  { id: 'platform.import-records', domain: 'platform', label: 'Import records from a file', blast: BLAST.DEVICE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Loads a file exported from this workspace into this device\'s state. It does not write to the registry.', audit: 'audit:admin-records-imported' },
  { id: 'platform.export-state', domain: 'platform', label: 'Export this device\'s state', blast: BLAST.READ, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Everything this browser holds, for support to read. Endpoint overrides are redacted.', audit: 'audit:admin-state-exported' },
  { id: 'platform.clear-local', domain: 'platform', label: 'Clear this device\'s saved data', blast: BLAST.IRREVERSIBLE, permission: Permissions.SETTINGS_MANAGE,
    detail: 'Removes the profile, settings, loaded lists, queued writes and local audit copy. Registry records are not deleted.',
    confirm: 'Everything this workspace has saved on this device is removed, including anything still waiting to be sent, which will be lost. Records held in the registry are not deleted.',
    requiresTypedConfirmation: true,
    confirmWord: 'CLEAR',
    audit: 'audit:admin-local-cleared' },

  /* ---- Audit and evidence ---------------------------------------------------------- */
  { id: 'evidence.review-audit', domain: 'evidence', label: 'Review the audit trail', blast: BLAST.READ, permission: Permissions.AUDIT_VIEW,
    detail: 'Every governed action recorded in this session and everything hydrated from stored state.', audit: 'audit:admin-audit-reviewed' },
  { id: 'evidence.export-audit', domain: 'evidence', label: 'Export the audit trail', blast: BLAST.READ, permission: Permissions.AUDIT_VIEW,
    detail: 'The trail as JSON, for a change record or an investigation.', audit: 'audit:admin-audit-exported' },
  { id: 'evidence.export-bundle', domain: 'evidence', label: 'Export the full evidence bundle', blast: BLAST.READ, permission: Permissions.AUDIT_VIEW,
    detail: 'Estate, findings, probe results, commissioning record and audit trail in one artefact. Signatures redacted throughout.', audit: 'audit:admin-bundle-exported' },
]);

const byId = new Map(AdminActions.map((a) => [a.id, a]));
export const actionById = (id) => byId.get(id) || null;
export const actionsInDomain = (domain) => AdminActions.filter((a) => a.domain === domain);

/**
 * The catalogue as one role sees it.
 *
 * Actions a role cannot run are returned marked `permitted:false` rather than filtered out. That
 * is the deliberate choice: an administrator who cannot find a control does not conclude they
 * lack the permission, they conclude the platform cannot do it — and then someone builds it
 * again. Showing the control greyed with the permission it needs answers the question instead.
 */
export function catalogueFor(user, hasPermission) {
  return AdminActions.map((a) => ({ ...a, permitted: Boolean(hasPermission(user, a.permission)) }))
    .sort((a, b) => (BLAST_WEIGHT[a.blast] - BLAST_WEIGHT[b.blast]) || a.id.localeCompare(b.id));
}

/**
 * Run one catalogued action, recording it either way.
 *
 * The permission is re-checked here and not only where the button was drawn. A disabled button is
 * a presentation choice; this is the check that decides, and it is the one that runs when
 * something reaches this function by a path nobody drew.
 */
export async function run(id, fn, { actor = {}, hasPermission, ref = '', meta = {} } = {}) {
  const action = actionById(id);
  if (!action) throw new Error(`No administrative action is registered as ${id}.`);
  if (hasPermission && !hasPermission(actor, action.permission)) {
    AuditLog.record({ ref, actor, event: 'audit:admin-action-denied', meta: { action: id, permission: action.permission } });
    const err = new Error(`Your role does not include ${action.permission}, which this action requires.`);
    err.code = 'PERMISSION_DENIED';
    throw err;
  }

  const started = Date.now();
  AuditLog.record({ ref, actor, event: action.audit, phase: 'started', meta: { action: id, blast: action.blast, ...meta } });
  try {
    const result = await fn();
    AuditLog.record({ ref, actor, event: action.audit, phase: 'completed', meta: { action: id, blast: action.blast, ms: Date.now() - started, ...meta } });
    return result;
  } catch (e) {
    /* Recorded with the reason. An action that failed and left only a "started" entry reads, a
       year later, exactly like one that is still running. */
    AuditLog.record({ ref, actor, event: action.audit, phase: 'failed', meta: { action: id, blast: action.blast, ms: Date.now() - started, error: String(e?.message || e), ...meta } });
    throw e;
  }
}

/** Counts for the catalogue's own summary strip. */
export function summarise(catalogue) {
  const counts = {};
  for (const a of catalogue) counts[a.blast] = (counts[a.blast] || 0) + 1;
  return {
    total: catalogue.length,
    permitted: catalogue.filter((a) => a.permitted).length,
    irreversible: counts[BLAST.IRREVERSIBLE] || 0,
    tenantReaching: (counts[BLAST.TENANT] || 0),
    counts,
  };
}

export const AdminActionCatalogue = Object.freeze({
  AdminActions, DOMAINS, BLAST, BLAST_LABEL, BLAST_TONE, BLAST_WEIGHT,
  actionById, actionsInDomain, catalogueFor, run, summarise,
});
export default AdminActionCatalogue;
