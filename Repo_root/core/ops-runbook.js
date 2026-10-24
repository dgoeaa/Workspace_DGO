// DGO R11.6 — the operations runbook: dependency-gated actions, evidence, and the release gate.
//
// WHAT THIS IS FOR
//
// A platform is not commissioned by its tests passing. `npm run commission` can settle the
// questions a machine can settle — are the endpoints wired, is the register clean, is auth
// enforced — and it says so plainly. What it cannot settle is the other half: has a named person
// approved the service mailbox, has rollback been rehearsed, is there evidence that requirement
// RN-014 was actually observed to work in the tenant. Those are decisions and observations, they
// belong to people, and before this module they lived in spreadsheets emailed between them.
//
// So this is the register for the half a machine cannot check, held in the platform's own audited
// state and gated by the same rules a reviewer would apply by hand:
//
//   DEPENDENCIES ARE ENFORCED, NOT DOCUMENTED. An action whose prerequisites are not closed
//   cannot be moved past BLOCKED. Ordering written into a runbook and not enforced is ordering
//   that gets skipped under time pressure, which is when it matters.
//
//   RESOLVED REQUIRES EVIDENCE. An action cannot be marked resolved with no evidence attached.
//   The status field is the claim; the evidence is the reason to believe it, and a register full
//   of unsupported claims is worse than an empty one because it reads as complete.
//
//   A LOCKED PARAMETER CANNOT BE EDITED HERE. Values that are facts about the repository — the
//   release id, the approved service mailbox, the recurrence time zone — are read from the
//   configuration that owns them. Letting them be retyped in a form is how a runbook comes to
//   assert a mailbox the platform does not use.
//
//   THE GATE IS COMPUTED, NEVER SET. `decision` is derived from the checks every time it is
//   read. There is no field anywhere that says READY, so there is nothing to set by hand, and a
//   gate that has gone back to NO-GO cannot stay green because nobody re-ran it.
//
// WHAT IT WILL NOT DO. It does not invent a value, and it will not accept one that looks
// invented: `validateParameters()` reports placeholders, examples and defaults as missing. A
// runbook whose parameters are filled with plausible-looking text is a runbook that has been
// completed rather than performed.

/* Status vocabulary. `RISK_ACCEPTED` closes an action without resolving it — a real outcome
   that the previous binary (open/closed) had to be lied to in order to express. */
export const STATUS = Object.freeze({
  BLOCKED: 'BLOCKED',
  READY: 'READY',
  IN_PROGRESS: 'IN_PROGRESS',
  APPLIED_UNVERIFIED: 'APPLIED_UNVERIFIED',
  RESOLVED: 'RESOLVED',
  RISK_ACCEPTED: 'RISK_ACCEPTED',
});

export const STATUS_LABEL = Object.freeze({
  BLOCKED: 'Blocked', READY: 'Ready', IN_PROGRESS: 'In progress',
  APPLIED_UNVERIFIED: 'Applied — unverified', RESOLVED: 'Resolved', RISK_ACCEPTED: 'Risk accepted',
});

export const STATUS_TONE = Object.freeze({
  BLOCKED: 'danger', READY: 'info', IN_PROGRESS: 'warning',
  APPLIED_UNVERIFIED: 'warning', RESOLVED: 'success', RISK_ACCEPTED: 'escalated',
});

/** Closed means "needs no further work". It does not mean "succeeded". */
export const isClosed = (status) => status === STATUS.RESOLVED || status === STATUS.RISK_ACCEPTED;

export const ACCEPTANCE_STATUS = Object.freeze({
  BLOCKED: 'BLOCKED', IN_TEST: 'IN_TEST', PASSED: 'PASSED', FAILED: 'FAILED', RISK_ACCEPTED: 'RISK_ACCEPTED',
});

/* Text that means a field was filled in rather than answered. Checked case-insensitively against
   the whole value, so a real value containing the word "example" is not rejected. */
const PLACEHOLDER = /^(tbd|tba|n\/?a|none|todo|xxx+|test|example|sample|placeholder|changeme|your[_ -]?\w+|<[^>]*>|-+)$/i;

/* ------------------------------------------------------------------ *
 * State shape
 * ------------------------------------------------------------------ */

/**
 * The empty runbook for a given definition.
 *
 * Built from the definition rather than stored, so adding an action or an acceptance record to
 * the configuration cannot leave existing installations reading a state that is missing it —
 * `hydrate()` fills the gap on next read instead of failing on an undefined lookup.
 */
export function blankState(definition) {
  return {
    definitionId: definition.id,
    definitionVersion: definition.version,
    startedAt: '',
    parameters: {},
    actions: Object.fromEntries(definition.actions.map((a) => [a.id, { status: STATUS.BLOCKED, note: '', owner: '', at: '', evidence: [] }])),
    acceptance: Object.fromEntries(definition.acceptance.map((r) => [r.id, { status: ACCEPTANCE_STATUS.BLOCKED, fields: {}, evidence: [] }])),
    risks: [],
    cutover: { status: 'NOT_STARTED', oldFlowHashesRecorded: false, rollbackRehearsed: false, inFlightReconciled: false, supersededFlowsDisabledNotDeleted: false, evidence: [] },
    hypercare: { active: false, dailyReview: '', escalationRoute: '', exitCriteria: '', evidence: [] },
  };
}

/**
 * Merge stored state onto the current definition.
 *
 * Records for actions the definition no longer declares are dropped, and the drop is reported in
 * `orphaned` rather than performed silently — a gate that quietly stopped counting a requirement
 * is a gate that got easier without anyone deciding it should.
 */
export function hydrate(definition, stored = {}) {
  const blank = blankState(definition);
  const actions = { ...blank.actions };
  const acceptance = { ...blank.acceptance };
  const orphaned = [];

  for (const [id, rec] of Object.entries(stored.actions || {})) {
    if (actions[id]) actions[id] = { ...actions[id], ...rec, evidence: [...(rec.evidence || [])] };
    else orphaned.push({ kind: 'action', id });
  }
  for (const [id, rec] of Object.entries(stored.acceptance || {})) {
    if (acceptance[id]) acceptance[id] = { ...acceptance[id], ...rec, fields: { ...(rec.fields || {}) }, evidence: [...(rec.evidence || [])] };
    else orphaned.push({ kind: 'acceptance', id });
  }

  return {
    ...blank,
    ...stored,
    definitionId: definition.id,
    definitionVersion: definition.version,
    parameters: { ...(stored.parameters || {}) },
    actions,
    acceptance,
    risks: [...(stored.risks || [])],
    cutover: { ...blank.cutover, ...(stored.cutover || {}) },
    hypercare: { ...blank.hypercare, ...(stored.hypercare || {}) },
    orphaned,
  };
}

/* ------------------------------------------------------------------ *
 * Parameters
 * ------------------------------------------------------------------ */

/** The effective value of a parameter: a locked one comes from the definition, always. */
export function parameterValue(definition, state, id) {
  const spec = definition.parameters.find((p) => p.id === id);
  if (!spec) return '';
  if (spec.locked) return String(spec.value ?? '');
  return String(state.parameters?.[id] ?? spec.value ?? '');
}

/**
 * Which mandatory parameters are still unanswered.
 *
 * A placeholder counts as unanswered. That is the whole point of the check: a required field
 * containing "TBD" satisfies every test for non-emptiness and answers nothing, and a gate that
 * accepts it is a gate that can be passed by typing.
 */
export function validateParameters(definition, state) {
  const missing = [];
  const suspect = [];
  for (const spec of definition.parameters) {
    if (!spec.required) continue;
    const value = parameterValue(definition, state, spec.id).trim();
    if (!value) { missing.push({ id: spec.id, label: spec.label, reason: 'not supplied' }); continue; }
    if (PLACEHOLDER.test(value)) { missing.push({ id: spec.id, label: spec.label, reason: `reads as placeholder text ("${value}")` }); continue; }
    if (spec.pattern && !new RegExp(spec.pattern).test(value)) {
      suspect.push({ id: spec.id, label: spec.label, reason: spec.patternHint || `does not match the expected form` });
    }
  }
  return { missing, suspect, ok: missing.length === 0 && suspect.length === 0 };
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

/** Whether every prerequisite of an action is closed. */
export function dependenciesMet(definition, state, actionId) {
  const action = definition.actions.find((a) => a.id === actionId);
  if (!action) return false;
  return (action.dependsOn || []).every((id) => isClosed(state.actions?.[id]?.status));
}

/** The prerequisites that are not closed, for a message that names them. */
export const blockingDependencies = (definition, state, actionId) =>
  (definition.actions.find((a) => a.id === actionId)?.dependsOn || [])
    .filter((id) => !isClosed(state.actions?.[id]?.status));

/**
 * Decide whether one status change is allowed, and say why when it is not.
 *
 * Returns `{ allowed, reason }` rather than throwing, because every caller is a UI that has to
 * render the reason next to a disabled control — an exception would have to be caught and
 * turned back into this.
 */
export function canSetStatus(definition, state, actionId, next) {
  const action = definition.actions.find((a) => a.id === actionId);
  if (!action) return { allowed: false, reason: 'No such action in this runbook.' };
  const record = state.actions?.[actionId] || {};

  if (next !== STATUS.BLOCKED && !dependenciesMet(definition, state, actionId)) {
    const blockers = blockingDependencies(definition, state, actionId);
    return { allowed: false, reason: `${blockers.join(', ')} must be closed first. This ordering is the runbook's, and it is enforced rather than advisory.` };
  }
  if (next === STATUS.RESOLVED) {
    if (!record.evidence?.length) return { allowed: false, reason: 'Resolved requires at least one piece of evidence. The status is the claim; the evidence is the reason to believe it.' };
    const params = (action.parameters || []).filter((id) => !parameterValue(definition, state, id).trim());
    if (params.length) return { allowed: false, reason: `These parameters this action depends on are still unanswered: ${params.join(', ')}.` };
  }
  if (next === STATUS.RISK_ACCEPTED && !record.note?.trim()) {
    return { allowed: false, reason: 'Accepting a risk requires a note recording who accepted it and on what basis. An accepted risk with no rationale is an unrecorded decision.' };
  }
  return { allowed: true, reason: '' };
}

/* ------------------------------------------------------------------ *
 * Acceptance records
 * ------------------------------------------------------------------ */

/**
 * Whether one acceptance record carries the evidence its own status claims.
 *
 * PASSED must carry every field the definition names as required for that record plus at least
 * one evidence entry. RISK_ACCEPTED needs the rationale instead — it is not a pass and does not
 * pretend to the same proof.
 */
export function acceptanceComplete(definition, state, recordId) {
  const spec = definition.acceptance.find((r) => r.id === recordId);
  const rec = state.acceptance?.[recordId];
  if (!spec || !rec) return false;
  if (rec.status === ACCEPTANCE_STATUS.RISK_ACCEPTED) return Boolean(String(rec.fields?.rationale || '').trim());
  if (rec.status !== ACCEPTANCE_STATUS.PASSED) return false;
  const required = spec.requiredFields || definition.acceptanceRequiredFields || [];
  return required.every((f) => String(rec.fields?.[f] || '').trim()) && Boolean(rec.evidence?.length);
}

/* ------------------------------------------------------------------ *
 * Metrics, gate, audit
 * ------------------------------------------------------------------ */

export function metrics(definition, state) {
  const actions = definition.actions.map((a) => ({ ...a, record: state.actions?.[a.id] || {} }));
  const params = validateParameters(definition, state);
  const closed = actions.filter((a) => isClosed(a.record.status));
  const criticalOpen = actions.filter((a) => a.severity === 'Critical' && !isClosed(a.record.status));
  const acceptance = definition.acceptance.map((r) => ({ ...r, record: state.acceptance?.[r.id] || {}, complete: acceptanceComplete(definition, state, r.id) }));

  return {
    actions: actions.length,
    closed: closed.length,
    criticalOpen: criticalOpen.length,
    missingParameters: params.missing.length,
    suspectParameters: params.suspect.length,
    acceptanceTotal: acceptance.length,
    acceptanceAccepted: acceptance.filter((r) => r.complete).length,
    risks: (state.risks || []).length,
    openRisks: (state.risks || []).filter((r) => r.status !== 'CLOSED').length,
    /* Progress counts closed actions only. Weighting it by acceptance records or parameters
       would make a number that moves early and stalls late, which is the opposite of what a
       progress figure is read for. */
    progress: actions.length ? Math.round((closed.length / actions.length) * 100) : 0,
  };
}

/**
 * The release gate. Computed on every read; there is no stored verdict to go stale.
 *
 * Each check names what it requires, so NO-GO is actionable rather than a mood.
 */
export function releaseGate(definition, state) {
  const m = metrics(definition, state);
  const checks = [
    { id: 'parameters', ok: m.missingParameters === 0, label: 'Every mandatory parameter is answered', detail: m.missingParameters ? `${m.missingParameters} still unanswered or holding placeholder text.` : '' },
    { id: 'critical', ok: m.criticalOpen === 0, label: 'Every critical action is closed', detail: m.criticalOpen ? `${m.criticalOpen} critical action(s) open.` : '' },
    { id: 'actions', ok: m.closed === m.actions, label: `All ${m.actions} actions are closed`, detail: m.closed === m.actions ? '' : `${m.actions - m.closed} still open.` },
    { id: 'evidence', ok: definition.actions.every((a) => !isClosed(state.actions?.[a.id]?.status) || state.actions[a.id].evidence?.length || state.actions[a.id].status === STATUS.RISK_ACCEPTED), label: 'Every resolved action carries evidence', detail: '' },
    { id: 'acceptance', ok: m.acceptanceAccepted === m.acceptanceTotal, label: `All ${m.acceptanceTotal} acceptance records passed or accepted with evidence`, detail: `${m.acceptanceAccepted} of ${m.acceptanceTotal}.` },
    { id: 'rollback', ok: Boolean(state.cutover?.rollbackRehearsed), label: 'Rollback rehearsed', detail: '' },
    { id: 'inflight', ok: Boolean(state.cutover?.inFlightReconciled), label: 'In-flight work reconciled', detail: '' },
    { id: 'superseded', ok: Boolean(state.cutover?.supersededFlowsDisabledNotDeleted), label: 'Superseded flows disabled, not deleted', detail: 'A deleted flow cannot be rolled back to.' },
    { id: 'hypercare', ok: Boolean(state.hypercare?.active), label: 'Hypercare active', detail: '' },
    { id: 'risks', ok: m.openRisks === 0, label: 'No residual risk left open', detail: m.openRisks ? `${m.openRisks} open.` : '' },
  ];
  if (definition.authorisingAction) {
    checks.push({
      id: 'authorisation',
      ok: state.actions?.[definition.authorisingAction]?.status === STATUS.RESOLVED,
      label: 'Production authorisation recorded',
      detail: `${definition.authorisingAction} must be resolved, by the person who holds that authority.`,
    });
  }
  return { checks, decision: checks.every((c) => c.ok) ? 'READY' : 'NO-GO', failing: checks.filter((c) => !c.ok) };
}

/**
 * Structural faults: places where the register contradicts itself.
 *
 * Distinct from the gate. The gate asks "may this go live?"; this asks "is what I am reading
 * internally consistent?" — and a register that says an action is resolved with no evidence is
 * not a register that is merely incomplete, it is one that cannot be relied on.
 */
export function structuralAudit(definition, state) {
  const problems = [];
  const params = validateParameters(definition, state);

  params.missing.forEach((p) => problems.push({ severity: 'error', code: 'parameter.missing', message: `${p.label} (${p.id}) is mandatory and ${p.reason}.` }));
  params.suspect.forEach((p) => problems.push({ severity: 'warn', code: 'parameter.suspect', message: `${p.label} (${p.id}) ${p.reason}.` }));

  for (const action of definition.actions) {
    const rec = state.actions?.[action.id] || {};
    if (rec.status === STATUS.RESOLVED && !rec.evidence?.length) {
      problems.push({ severity: 'error', code: 'action.no-evidence', message: `${action.id} is resolved with no evidence attached. The claim has no support.` });
    }
    if (rec.status === STATUS.RISK_ACCEPTED && !rec.note?.trim()) {
      problems.push({ severity: 'error', code: 'action.no-rationale', message: `${action.id} carries an accepted risk with no rationale recorded.` });
    }
    if (!isClosed(rec.status) && rec.status !== STATUS.BLOCKED && !dependenciesMet(definition, state, action.id)) {
      problems.push({ severity: 'error', code: 'action.out-of-order', message: `${action.id} was progressed while ${blockingDependencies(definition, state, action.id).join(', ')} remained open.` });
    }
  }

  for (const spec of definition.acceptance) {
    const rec = state.acceptance?.[spec.id] || {};
    if (rec.status === ACCEPTANCE_STATUS.PASSED && !acceptanceComplete(definition, state, spec.id)) {
      problems.push({ severity: 'error', code: 'acceptance.incomplete', message: `${spec.id} is recorded as passed without the full evidence set its definition requires.` });
    }
  }

  (state.orphaned || []).forEach((o) => problems.push({
    severity: 'warn',
    code: 'state.orphaned',
    message: `A stored ${o.kind} record for ${o.id} does not exist in the current runbook definition and is no longer counted.`,
  }));

  return {
    problems,
    ok: problems.every((p) => p.severity !== 'error'),
    /* Said every time, because a clean structural audit is the single easiest result in this
       module to over-read. It proves the register is coherent, not that the work was done. */
    scope: 'This checks the register against itself. It does not inspect the tenant, and a clean '
      + 'result says only that what has been recorded is internally consistent.',
  };
}

/** The evidence bundle: everything the register holds, in one artefact fit to attach to a change record. */
export function exportRunbook(definition, state, { generatedAt = new Date().toISOString(), actor = {} } = {}) {
  const gate = releaseGate(definition, state);
  return {
    schema: 'dgo-ops-runbook/v1',
    generatedAt,
    exportedBy: { name: actor.fullName || actor.name || '', email: actor.email || '', role: actor.role || '' },
    definition: { id: definition.id, version: definition.version, title: definition.title },
    metrics: metrics(definition, state),
    decision: gate.decision,
    gate: gate.checks,
    parameters: definition.parameters.map((p) => ({ id: p.id, label: p.label, required: p.required, locked: p.locked, source: p.source, value: parameterValue(definition, state, p.id) })),
    actions: definition.actions.map((a) => ({ id: a.id, stage: a.stage, title: a.title, severity: a.severity, ...state.actions?.[a.id] })),
    acceptance: definition.acceptance.map((r) => ({ id: r.id, requirement: r.requirement, severity: r.severity, ...state.acceptance?.[r.id], complete: acceptanceComplete(definition, state, r.id) })),
    risks: state.risks || [],
    cutover: state.cutover,
    hypercare: state.hypercare,
    structuralAudit: structuralAudit(definition, state),
  };
}

/**
 * Restore a commissioning record from a bundle `exportRunbook()` produced.
 *
 * WHY THIS EXISTS, AND WHY IT REFUSES MORE THAN IT ACCEPTS
 *
 * A register you can export and cannot import is not a register: it cannot be moved to the
 * machine the commissioning is actually happening on, cannot be restored after a device is
 * cleared, and cannot be handed to the person who takes over. That is the whole gap this closes.
 *
 * But import is the one operation that can write a claim nobody made. Everything else in this
 * module is a person recording what they did; this reads a file. So it validates before it
 * accepts, and every refusal names what is wrong rather than failing generically:
 *
 *   · the schema must be this schema — a bundle from another tool is refused, not coerced;
 *   · the definition id must match — a different runbook's answers are not this runbook's;
 *   · a LOCKED parameter in the file is DISCARDED, never applied. Locked values are facts about
 *     the repository, and a file is exactly the vector by which one would be replaced with a
 *     plausible-looking wrong one;
 *   · an action or acceptance id the current definition does not declare is dropped and reported,
 *     for the same reason `hydrate()` reports orphans: a gate that quietly stopped counting a
 *     requirement is a gate that got easier without anyone deciding it should;
 *   · a status the vocabulary does not contain is refused rather than stored, or the gate would
 *     later compare against a value nothing can satisfy.
 *
 * The definition VERSION is allowed to differ, and that is deliberate: refusing a bundle written
 * against 1.0.0 when the runbook has moved to 1.1.0 would make every version bump destroy the
 * evidence collected under it. The mismatch is reported so the reader knows the answers predate
 * the current wording.
 *
 * Returns `{ ok, state, warnings, errors }`. It never throws and never mutates its input: the
 * caller decides whether to commit the returned state, which is what lets the suite show the
 * warnings before anything is written.
 */
export function importRunbook(definition, bundle) {
  const errors = [];
  const warnings = [];

  if (!bundle || typeof bundle !== 'object') {
    return { ok: false, state: null, warnings, errors: [{ code: 'not-an-object', message: 'That file does not contain a commissioning record.' }] };
  }
  if (bundle.schema !== 'dgo-ops-runbook/v1') {
    errors.push({ code: 'wrong-schema', message: `This file declares schema "${String(bundle.schema ?? 'none')}". A commissioning record declares dgo-ops-runbook/v1. It has not been read.` });
    return { ok: false, state: null, warnings, errors };
  }
  if (bundle.definition?.id && bundle.definition.id !== definition.id) {
    errors.push({ code: 'wrong-runbook', message: `This record belongs to the "${bundle.definition.id}" runbook; this platform holds "${definition.id}". Another runbook's answers are not this one's, so nothing has been read.` });
    return { ok: false, state: null, warnings, errors };
  }
  if (bundle.definition?.version && bundle.definition.version !== definition.version) {
    warnings.push({ code: 'version-differs', message: `The record was written against runbook version ${bundle.definition.version}; this platform holds ${definition.version}. The answers were kept — they predate the current wording, so re-read the actions they close.` });
  }

  const next = blankState(definition);
  const known = new Set(definition.actions.map((a) => a.id));
  const knownAcceptance = new Set(definition.acceptance.map((r) => r.id));
  const statuses = new Set(Object.values(STATUS));
  const acceptanceStatuses = new Set(Object.values(ACCEPTANCE_STATUS));
  const text = (v) => (v === undefined || v === null ? '' : String(v));

  /* Parameters. A locked one is read from the definition by parameterValue() regardless of what
     is stored, so writing it here would be inert — but it is dropped explicitly and reported,
     because "inert" is a property of today's reader and not a guarantee about tomorrow's. */
  for (const p of bundle.parameters || []) {
    const spec = definition.parameters.find((x) => x.id === p?.id);
    if (!spec) { warnings.push({ code: 'unknown-parameter', message: `Parameter "${text(p?.id)}" is not in this runbook and was dropped.` }); continue; }
    if (spec.locked) {
      if (text(p.value) && text(p.value) !== text(spec.value)) {
        warnings.push({ code: 'locked-parameter', message: `"${spec.label}" is locked to the value this repository declares. The file's differing value was discarded.` });
      }
      continue;
    }
    next.parameters[spec.id] = text(p.value).trim();
  }

  for (const a of bundle.actions || []) {
    if (!known.has(a?.id)) { warnings.push({ code: 'unknown-action', message: `Action "${text(a?.id)}" is not in this runbook and was dropped.` }); continue; }
    const status = statuses.has(a.status) ? a.status : STATUS.BLOCKED;
    if (a.status && !statuses.has(a.status)) {
      warnings.push({ code: 'unknown-status', message: `${a.id} carried status "${text(a.status)}", which is not a status this runbook recognises. It was reset to Blocked.` });
    }
    next.actions[a.id] = {
      status,
      note: text(a.note),
      owner: text(a.owner),
      at: text(a.at),
      evidence: (Array.isArray(a.evidence) ? a.evidence : [])
        .filter((e) => e && text(e.text).trim())
        .map((e) => ({ text: text(e.text), by: text(e.by), at: text(e.at) })),
    };
  }

  for (const r of bundle.acceptance || []) {
    if (!knownAcceptance.has(r?.id)) { warnings.push({ code: 'unknown-acceptance', message: `Acceptance record "${text(r?.id)}" is not in this runbook and was dropped.` }); continue; }
    const status = acceptanceStatuses.has(r.status) ? r.status : ACCEPTANCE_STATUS.BLOCKED;
    if (r.status && !acceptanceStatuses.has(r.status)) {
      warnings.push({ code: 'unknown-acceptance-status', message: `${r.id} carried result "${text(r.status)}", which this runbook does not recognise. It was reset to Blocked.` });
    }
    next.acceptance[r.id] = {
      status,
      fields: Object.fromEntries(Object.entries(r.fields || {}).map(([k, v]) => [k, text(v)])),
      evidence: (Array.isArray(r.evidence) ? r.evidence : [])
        .filter((e) => e && text(e.text).trim())
        .map((e) => ({ text: text(e.text), by: text(e.by), at: text(e.at) })),
    };
  }

  next.risks = (Array.isArray(bundle.risks) ? bundle.risks : [])
    .filter((x) => x && text(x.title).trim())
    .map((x) => ({
      id: text(x.id) || `RISK-${Math.random().toString(36).slice(2, 10)}`,
      title: text(x.title), acceptedBy: text(x.acceptedBy), basis: text(x.basis),
      status: x.status === 'CLOSED' ? 'CLOSED' : 'OPEN', at: text(x.at),
    }));

  for (const key of ['oldFlowHashesRecorded', 'rollbackRehearsed', 'inFlightReconciled', 'supersededFlowsDisabledNotDeleted']) {
    next.cutover[key] = bundle.cutover?.[key] === true;
  }
  next.cutover.status = text(bundle.cutover?.status) || next.cutover.status;
  next.hypercare = {
    ...next.hypercare,
    active: bundle.hypercare?.active === true,
    dailyReview: text(bundle.hypercare?.dailyReview),
    escalationRoute: text(bundle.hypercare?.escalationRoute),
    exitCriteria: text(bundle.hypercare?.exitCriteria),
  };
  next.startedAt = text(bundle.startedAt) || text(bundle.generatedAt);

  /* Contradiction is reported; incompleteness is not.
     An imported record whose actions are resolved without evidence, or progressed before their
     prerequisites, was edited by hand between export and import — the gate would otherwise
     accept it silently, and that is worth a warning at the moment of import.
     An unanswered parameter is NOT that. A record exported half-way through commissioning has
     unanswered parameters by definition, and reporting seventeen of them as "does not hold
     together" would make the one warning that matters unreadable. The Parameters tab already
     shows exactly which are outstanding. */
  const CONTRADICTION = /^(action\.|acceptance\.)/;
  for (const p of structuralAudit(definition, next).problems) {
    if (p.severity !== 'error' || !CONTRADICTION.test(p.code)) continue;
    warnings.push({ code: `imported.${p.code}`, message: `Imported, and this part does not hold together: ${p.message}` });
  }

  return { ok: true, state: next, warnings, errors };
}

export const OpsRunbook = Object.freeze({
  STATUS, STATUS_LABEL, STATUS_TONE, ACCEPTANCE_STATUS, isClosed,
  blankState, hydrate, parameterValue, validateParameters,
  dependenciesMet, blockingDependencies, canSetStatus, acceptanceComplete,
  metrics, releaseGate, structuralAudit, exportRunbook, importRunbook,
});
export default OpsRunbook;
