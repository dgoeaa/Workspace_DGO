// DGO R11.6 — the Admin Suite.
//
// ONE INTERFACE, BECAUSE THE ALTERNATIVE WAS EIGHT
//
// Administration of this estate was spread across five in-platform screens and a drawer of
// standalone HTML consoles, each built for one commissioning problem and each carrying a
// capability the others lacked. An endpoint console that could diagnose a wrong-flow binding but
// could not test a request shape. A workbench that held every trigger schema in the tenant but
// knew nothing about which contract key called what. A launchpad that could run a non-destructive
// health test but had no register to test against. A live-operations console that tracked the
// obligations no script can settle, in a file that had to be emailed between the people settling
// them. A capsule registry with version history and rollback, administered only from a shell.
//
// Each of those was right about something. None of them could see the others' facts, so the
// question an administrator actually asks — *is this estate fit to go live, and if not, what do I
// do about it* — could not be answered from any one of them, or from all of them together, because
// the joins were in somebody's head.
//
// This is those tools merged, with the joins made real:
//
//   · the endpoint estate and the flow request shapes are the same catalogue, so a contract key
//     opens the trigger schema of the workflow the register says it calls;
//   · a live probe result attaches to the endpoint it probed and to the commissioning action that
//     required it;
//   · the commissioning register lives in the platform's audited state, not in a spreadsheet;
//   · every control in the suite is drawn from `core/admin-actions.js`, which states its blast
//     radius and the permission it needs, so what an administrator can do is enumerable rather
//     than discovered.
//
// WHAT IT WILL NOT DO
//
//   · It never renders a signature it resolved. Every address the suite reads — from the
//     registry, from a probe result, from an export — goes through a redactor before it reaches
//     the DOM, and tests/admin-suite.spec.js asserts that against the rendered page rather than
//     trusting the intention. There is exactly one exception and it is not a leak: the override
//     field echoes the URL an operator typed into it on this device, because a field you cannot
//     read back is a field you cannot correct. The capsule registration field, which is not
//     re-read from storage, is a password input.
//   · It does not invoke a write endpoint by accident. The probes call read contracts and the
//     health contract; sending a composed request to a real flow is a separate, typed
//     confirmation that names what the flow does.
//   · It does not pretend a device is an estate. Every control that changes only this browser
//     says so where the control is, not in a note further down.
//
// SCOPE OF A CHANGE MADE HERE, once, because it is the misunderstanding that costs most: an
// endpoint override is stored in this browser's state, for this device. The estate is configured
// by `npm run setup -- --values <file> --force` and shipped by `npm run package`.

import { State } from '../core/state.js';
import { EndpointRegistry } from '../core/endpoint-registry.js';
import { EndpointKeys, EndpointContracts } from '../config/endpoints.config.js';
import { EndpointAtlas } from '../config/endpoint-atlas.data.js';
import { describeEstate, describeKey, findings as estateFindings, summarise as summariseEstate, exportReport, SEVERITY, SIGNATURE_LENGTH } from '../core/endpoint-atlas.js';
import { EndpointFormation } from '../core/endpoint-formation.js';
import { HealthContract, OUTCOME_LABEL, OUTCOME_SEVERITY } from '../core/health-contract.js';
import * as Shapes from '../core/flow-shapes.js';
import { OpsRunbook, STATUS, STATUS_LABEL, STATUS_TONE, ACCEPTANCE_STATUS, isClosed } from '../core/ops-runbook.js';
import { OpsRunbookDefinition } from '../config/ops-runbook.config.js';
import { CapsuleClient } from '../core/capsule-client.js';
import { AdminActions, DOMAINS, BLAST, BLAST_LABEL, BLAST_TONE, catalogueFor, summarise as summariseActions, run as runAction, actionById } from '../core/admin-actions.js';
import { getCurrentUser, hasPermission, personaLabel } from '../core/current-user.js';
import { Permissions, RoleList, RolePersonaMap, RoleRouteAccess } from '../config/rbac.config.js';
import { AuditLog } from '../core/audit-log.js';
import { hydrateGovernance } from '../core/governed-actions.js';
import { CacheManager } from '../core/cache-manager.js';
import { PendingQueue } from '../core/pending-queue.js';
import { ReceiptLedger } from '../core/receipt-ledger.js';
import { loadRuntimeData } from '../core/data-loader.js';
import { capRows, RenderBudget } from '../core/render-budget.js';
import { head, kpis, esc, badge, table, chips, emptyState, toast, confirmAction, fmtDateTime } from '../core/ui.js';

/* ------------------------------------------------------------------ *
 * View state
 *
 * Deliberately not in State, and for the same reason the Endpoint Console keeps it out: which
 * section is open and what is typed in a filter are not facts about the estate. Putting them in
 * the audited state would make "the administrator looked at the capsule tab" an entry in the same
 * log as "the administrator rolled an alias back".
 * ------------------------------------------------------------------ */
const view = {
  section: 'overview',
  q: '',
  estateStatus: 'all',
  estateSurface: 'all',
  flowId: '',
  flowTab: 'shape',
  compose: {},
  body: '',
  probe: null,
  probeBusy: false,
  runbookTab: 'actions',
  runbookAction: '',
  runbookStage: 'all',
  capsule: { probe: null, aliases: null, versions: null, alias: '', busy: false },
  actionDomain: 'all',
  sent: [],
  typed: {},
  printing: false,
  curl: '',
  importReport: null,
};

const SECTIONS = [
  ['overview', 'Overview'],
  ['estate', 'Endpoints'],
  ['checks', 'Live checks'],
  ['shapes', 'Flow shapes'],
  ['runbook', 'Commissioning'],
  ['capsule', 'Capsule registry'],
  ['people', 'People & access'],
  ['control', 'Platform control'],
  ['actions', 'Action catalogue'],
  ['evidence', 'Audit & evidence'],
];

const overrides = () => State.get().settings?.endpoints || {};
const resolve = (key) => EndpointRegistry.url(key, { overrides: overrides() });
const actor = () => getCurrentUser();
const can = (permission) => hasPermission(actor(), permission);

const STATUS_TONE_KEY = {
  'ok': 'success', 'shares-flow': '', 'unconfigured': 'pending',
  'wrong-flow': 'danger', 'no-signature': 'danger', 'bad-signature': 'danger',
  'not-https': 'danger', 'placeholder': 'warn', 'no-contract': 'warn',
};
const STATUS_LABEL_KEY = {
  'ok': 'healthy', 'unconfigured': 'not configured', 'wrong-flow': 'WRONG FLOW',
  'no-signature': 'no signature', 'bad-signature': 'bad signature', 'not-https': 'not HTTPS',
  'placeholder': 'placeholder', 'no-contract': 'no contract',
};
const SEV_TONE = { error: 'danger', warn: 'warn', info: '' };
const OUTCOME_TONE = {
  healthy: 'success', 'wrong-endpoint-key': 'danger', 'identity-mismatch': 'danger',
  refused: 'danger', 'not-implemented': 'warn', unreachable: 'warn', blocked: 'warn',
  'not-configured': 'pending', 'unsafe-to-probe': 'pending',
};

/* ------------------------------------------------------------------ *
 * Runbook state — held in the platform's own audited state
 * ------------------------------------------------------------------ */

const runbookState = () => OpsRunbook.hydrate(OpsRunbookDefinition, State.get().adminRunbook || {});

function patchRunbook(mutate, meta) {
  const next = runbookState();
  mutate(next);
  delete next.orphaned;
  State.patch({ adminRunbook: next }, { module: 'admin-suite', action: meta.action, event: meta.event || 'audit:admin-runbook-changed', ref: meta.ref || '' });
  return next;
}

/* ------------------------------------------------------------------ *
 * Shared fragments
 * ------------------------------------------------------------------ */

/**
 * A control that must be typed to be armed.
 *
 * Used for every irreversible action. A confirmation dialog with a Continue button is dismissed
 * by muscle memory; typing the action's own name is the smallest barrier that cannot be crossed
 * without reading what it says.
 */
function armed(id, label, wordOverride) {
  /* The word comes from the catalogue, not from the call site. A control armed by a different
     word from the one its action declares is a control that reads as protected and is not. */
  const word = wordOverride || actionById(id)?.confirmWord || 'CONFIRM';
  const typed = view.typed[id] || '';
  const ready = typed.trim().toUpperCase() === word.toUpperCase();
  return `<div class="form-row">
    <label>Type <code>${esc(word)}</code> to enable<input data-typed="${esc(id)}" value="${esc(typed)}" autocomplete="off" spellcheck="false" aria-label="Type ${esc(word)} to enable: ${esc(label)}"></label>
    <button type="button" class="btn danger" data-act="${esc(id)}" ${ready ? '' : 'disabled'}>${esc(label)}</button>
  </div>`;
}

/** A button drawn from the catalogue, carrying its own blast radius. */
function actionButton(id, { label, ghost = true, disabled = false } = {}) {
  const a = actionById(id);
  if (!a) return '';
  const permitted = can(a.permission);
  const text = label || a.label;
  /* Keyed on the declared flag rather than on the blast radius. `flows.send` is not
     irreversible in the sense that nothing is destroyed, and entirely irreversible in the sense
     that the email has been sent; reading only `blast` here would have drawn it as an ordinary
     button on any panel that reached it through this helper. */
  if (a.requiresTypedConfirmation) return permitted ? armed(id, text) : '';
  return `<button type="button" class="btn${ghost ? ' ghost' : ''}" data-act="${esc(id)}" ${permitted && !disabled ? '' : 'disabled'} title="${esc(a.detail)}">${esc(text)}</button>`
    + (permitted ? '' : `<small class="meta">needs ${esc(a.permission)}</small>`);
}

const sectionNav = () => `<nav class="chips" aria-label="Administration sections">${SECTIONS
  .map(([id, label]) => `<button type="button" class="chip dgo-chip ${view.section === id ? 'active' : ''}" data-section="${id}" aria-current="${view.section === id}">${esc(label)}</button>`)
  .join('')}</nav>`;

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

/**
 * What needs attention now, across every domain, in one list.
 *
 * The point of the suite in one panel. Each row names the section that fixes it, because a
 * finding an administrator cannot act on from where they are reading it becomes a finding they
 * read repeatedly and never fix.
 */
function attention() {
  const rows = [];
  const est = summariseEstate({ resolve });

  for (const f of estateFindings({ resolve })) {
    rows.push({ severity: f.severity, area: 'Endpoints', section: 'estate', title: f.title, detail: f.detail });
  }
  for (const f of Shapes.shapeFindings()) {
    rows.push({ severity: f.severity, area: 'Flow shapes', section: 'shapes', title: f.title, detail: f.detail });
  }

  const rb = OpsRunbook.metrics(OpsRunbookDefinition, runbookState());
  if (rb.missingParameters) {
    rows.push({ severity: 'error', area: 'Commissioning', section: 'runbook', title: `${rb.missingParameters} commissioning parameter(s) unanswered`, detail: 'A mandatory value is missing or holds placeholder text. The release gate cannot clear while any stands.' });
  }
  if (rb.criticalOpen) {
    rows.push({ severity: 'error', area: 'Commissioning', section: 'runbook', title: `${rb.criticalOpen} critical commissioning action(s) open`, detail: 'These are the obligations no script can settle. They are open, which means nobody has settled them.' });
  }
  if (rb.acceptanceAccepted < rb.acceptanceTotal) {
    rows.push({ severity: 'warn', area: 'Commissioning', section: 'runbook', title: `${rb.acceptanceTotal - rb.acceptanceAccepted} endpoint(s) not yet proven in the tenant`, detail: 'An endpoint with no acceptance record is one nobody has had to prove works.' });
  }

  const pending = PendingQueue.stats();
  if (pending.count) {
    rows.push({ severity: 'warn', area: 'Platform', section: 'control', title: `${pending.count} write(s) queued on this device`, detail: 'Actions people performed that have not reached the registry. They are held here and nowhere else.' });
  }

  const s = State.get();
  if (s.runtime?.lastLoad?.ok === false) {
    rows.push({ severity: 'error', area: 'Platform', section: 'control', title: 'The last load from the registry failed', detail: `Lists on this device may be empty or stale. ${String(s.runtime.lastLoad.message || '')}`.trim() });
  }
  const disabledUsers = (s.users || []).filter((u) => u.status === 'disabled' && !String(u.disabledReason || '').trim());
  if (disabledUsers.length) {
    rows.push({ severity: 'warn', area: 'People', section: 'people', title: `${disabledUsers.length} disabled account(s) carry no reason`, detail: 'Access was withdrawn without recording why. The audit trail cannot say what it does not hold.' });
  }
  if (!est.signed && est.keys) {
    rows.push({ severity: 'error', area: 'Endpoints', section: 'estate', title: 'No contract key carries a signature', detail: 'Nothing in this deployment can reach the registry. This is a deployment that was never commissioned, not a deployment that has failed.' });
  }

  const order = { error: 0, warn: 1, info: 2 };
  return rows.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
}

function overviewPanel() {
  const est = summariseEstate({ resolve });
  const rb = OpsRunbook.metrics(OpsRunbookDefinition, runbookState());
  const gate = OpsRunbook.releaseGate(OpsRunbookDefinition, runbookState());
  const st = State.get();
  const rows = attention();
  const cat = catalogueFor(actor(), hasPermission);
  const actions = summariseActions(cat);

  return `${kpis([
    ['Endpoints healthy', `${est.healthy}/${est.keys}`],
    ['Findings', `${est.errors} error · ${est.warnings} warning`],
    ['Flows catalogued', `${Shapes.totals().callable}/${Shapes.totals().flows} callable`],
    ['Commissioning', `${rb.progress}%`],
    ['Release gate', gate.decision],
  ])}
  <section class="panel ${gate.decision === 'READY' ? '' : 'danger-zone'}">
    <div class="eyebrow">Release gate</div>
    <h2>${gate.decision === 'READY' ? 'Every gate check is green' : `${gate.failing.length} gate check${gate.failing.length === 1 ? '' : 's'} stand between this deployment and live use`}</h2>
    <p class="meta">The gate is computed every time this screen is read. There is no stored verdict, so nothing here can stay green because it was green once.</p>
    ${gate.failing.length ? `<ul>${gate.failing.map((c) => `<li><b>${esc(c.label)}</b>${c.detail ? ` — ${esc(c.detail)}` : ''}</li>`).join('')}</ul>` : ''}
    <div class="form-row"><button type="button" class="btn" data-section="runbook">Open the commissioning register</button></div>
  </section>

  <section class="panel">
    <h2>What needs attention</h2>
    ${rows.length
      ? `<p class="meta">${rows.length} condition${rows.length === 1 ? '' : 's'} across ${new Set(rows.map((r) => r.area)).size} area(s), worst first. Each names the section that fixes it.</p>
         <div class="dashboard-grid">${rows.map((r) => `<div class="panel">
           <div class="eyebrow">${badge(r.severity, SEV_TONE[r.severity])} ${esc(r.area)}</div>
           <h3>${esc(r.title)}</h3><p class="meta">${esc(r.detail)}</p>
           <button type="button" class="btn ghost" data-section="${esc(r.section)}">Go to ${esc(SECTIONS.find((s) => s[0] === r.section)?.[1] || r.section)}</button>
         </div>`).join('')}</div>`
      : emptyState('Nothing is asking for attention',
          'Every contract key resolves to the workflow the register names for it, every commissioning parameter is answered, nothing is queued, and no flow finding stands.')}
  </section>

  <div class="dashboard-grid">
    <section class="panel"><h2>Estate</h2>
      <div class="action-row"><span>Contract keys</span><b>${est.keys}</b></div>
      <div class="action-row"><span>Signed</span><b>${est.signed}/${est.keys}</b></div>
      <div class="action-row"><span>Internal · Portal</span><b>${est.internal} · ${est.portal}</b></div>
      <div class="action-row"><span>Workflows in the tenant</span><b>${est.workflowsBound}/${est.workflows} in use</b></div>
      <button type="button" class="btn ghost" data-section="estate">Open Endpoints</button>
    </section>
    <section class="panel"><h2>Flow estate</h2>
      <div class="action-row"><span>Flows catalogued</span><b>${Shapes.totals().flows}</b></div>
      <div class="action-row"><span>HTTP callable</span><b>${Shapes.totals().callable}</b></div>
      <div class="action-row"><span>Trigger fields</span><b>${Shapes.totals().triggerFields}</b></div>
      <div class="action-row"><span>Flows that send mail</span><b>${Shapes.flows().filter((f) => f.mailActions.length).length}</b></div>
      <button type="button" class="btn ghost" data-section="shapes">Open Flow shapes</button>
    </section>
    <section class="panel"><h2>This device</h2>
      <div class="action-row"><span>Queued writes</span><b>${st.pending.length}</b></div>
      <div class="action-row"><span>Cached responses</span><b>${CacheManager.stats().entries}</b></div>
      <div class="action-row"><span>Last registry load</span><b>${st.runtime?.lastLoad?.ok === true ? 'succeeded' : st.runtime?.lastLoad?.ok === false ? 'FAILED' : 'not attempted'}</b></div>
      <div class="action-row"><span>Endpoint overrides</span><b>${Object.keys(overrides()).length}</b></div>
      <button type="button" class="btn ghost" data-section="control">Open Platform control</button>
    </section>
    <section class="panel"><h2>Your authority</h2>
      <div class="action-row"><span>Signed in as</span><b>${esc(actor().fullName || actor().email || '—')}</b></div>
      <div class="action-row"><span>Role</span><b>${esc(RoleList.find((r) => r.id === actor().role)?.label || actor().role || '—')}</b></div>
      <div class="action-row"><span>Actions available to you</span><b>${actions.permitted} of ${actions.total}</b></div>
      <div class="action-row"><span>Of those, irreversible</span><b>${cat.filter((a) => a.permitted && a.blast === BLAST.IRREVERSIBLE).length}</b></div>
      <button type="button" class="btn ghost" data-section="actions">Open the action catalogue</button>
    </section>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

function estatePanel() {
  const all = describeEstate({ resolve });
  const rows = all
    .filter((r) => view.estateSurface === 'all' || r.surface === view.estateSurface)
    .filter((r) => view.estateStatus === 'all' || (view.estateStatus === 'problem' ? !r.healthy : r.status === view.estateStatus))
    .filter((r) => !view.q || `${r.key} ${r.expected?.flow || ''} ${r.expected?.workflowId || ''}`.toLowerCase().includes(view.q.toLowerCase()))
    .sort((a, b) => (SEVERITY[a.status] - SEVERITY[b.status]) || a.key.localeCompare(b.key));

  const fs = estateFindings({ resolve });

  return `${fs.length ? fs.map((f) => `<section class="panel">
      <div class="eyebrow">${badge(f.severity, SEV_TONE[f.severity])} <code>${esc(f.code)}</code></div>
      <h2>${esc(f.title)}</h2><p>${esc(f.detail)}</p>
      ${f.items?.length ? `<details><summary>${f.items.length} affected</summary><ul>${f.items.map((i) => `<li><code>${esc(i.key || i.workflowId || '')}</code>${i.claims ? ` — claims ${esc(i.claims.join(', '))}` : ''}${i.live ? ' — <b>still live</b>' : ''}</li>`).join('')}</ul></details>` : ''}
    </section>`).join('')
    : `<section class="panel">${emptyState('No estate finding stands', 'Every contract key resolves to the workflow the tenant register names for it, with a complete signature, and no workflow is impersonating a key.')}</section>`}

  <section class="panel">
    <h2>Contract keys</h2>
    <p class="meta">All ${EndpointAtlas.keys.length} keys across both surfaces, each checked against the workflow the tenant register names for it. Addresses are shown with the signature removed.</p>
    <div class="form-row">
      ${chips([{ value: 'all', label: `All ${EndpointAtlas.keys.length}` }, { value: 'internal', label: `Internal ${EndpointAtlas.totals.internalKeys}` }, { value: 'portal', label: `Portal ${EndpointAtlas.totals.portalKeys}` }], view.estateSurface, 'data-surface')}
      ${chips([{ value: 'all', label: 'Any state' }, { value: 'problem', label: 'Problems only' }, { value: 'ok', label: 'Healthy' }, { value: 'unconfigured', label: 'Not configured' }], view.estateStatus, 'data-estate-status')}
    </div>
    <label class="wide">Search key, flow or workflow id<input data-q value="${esc(view.q)}" placeholder="e.g. SUBMISSION, CG_Upload, 62fe121e"></label>
    ${table([
      { label: 'Key', key: 'key', render: (r) => `<b>${esc(r.key)}</b>${r.sharesFlowWith.length ? `<br><small class="meta">shares its flow with ${esc(r.sharesFlowWith.join(', '))}</small>` : ''}` },
      { label: 'Surface', key: 'surface', render: (r) => badge(r.surface, r.surface === 'portal' ? 'warn' : '') },
      { label: 'Flow the register names', key: 'flow', render: (r) => `${esc(r.expected?.flow || '—')}<br><small class="meta"><code>${esc(r.expected?.workflowId || '')}</code></small>` },
      { label: 'State', key: 'status', render: (r) => badge(STATUS_LABEL_KEY[r.status] || r.status, STATUS_TONE_KEY[r.status] || '') },
      { label: 'Signature', key: 'sig', render: (r) => r.signatureLength === null ? '<span class="meta">absent</span>' : r.signatureLength === SIGNATURE_LENGTH ? badge(`${SIGNATURE_LENGTH} chars`, 'success') : badge(`${r.signatureLength} chars`, 'danger') },
      { label: 'Shape', key: 'shape', render: (r) => { const f = Shapes.flowByWorkflowId(r.expected?.workflowId || ''); return f ? `<button type="button" class="btn ghost dgo-btn--sm" data-open-flow="${esc(f.workflowId)}">${esc(String(Shapes.topLevelFields(f.triggers.find((t) => t.kind === 'Http') || f.triggers[0] || {}).length))} fields</button>` : '<span class="meta">no export</span>'; } },
      { label: 'Resolved address (redacted)', key: 'target', render: (r) => r.target ? `<code class="meta">${esc(r.target)}</code>` : '<span class="meta">—</span>' },
    ], rows, null, { label: 'Endpoint contract keys' })}
    <p class="meta">${rows.length} of ${all.length} shown. The <b>Shape</b> column is the join this suite exists to make: it opens the request schema of the workflow the register says this key calls.</p>
  </section>

  ${overridePanel()}`;
}

function overridePanel() {
  if (!can(Permissions.SETTINGS_MANAGE)) {
    return `<section class="panel">${emptyState('Address overrides need settings:manage', 'Everything else on this section is readable to you. Changing an address is held by systemAdmin.')}</section>`;
  }
  const ov = overrides();
  const rows = describeEstate({ resolve }).filter((r) => EndpointKeys.includes(r.key));
  return `<section class="panel danger-zone">
    <div class="eyebrow">${badge('this device only', 'warn')}</div>
    <h2>Address overrides</h2>
    <p><b>An override here applies to this browser, on this device, and nowhere else.</b> It is a repair tool for one workstation. The estate is configured with <code>npm run setup -- --values &lt;file&gt; --force</code> and shipped by <code>npm run package</code>.</p>
    <p class="meta">A value typed here is checked against every formation rule before it is saved — HTTPS, an approved Power Automate host, the invocation path, no fragment, no duplicated parameter, a ${SIGNATURE_LENGTH}-character signature, and the workflow the register names for that key.</p>
    <form data-overrides>
      <div class="grid">${rows.map((r) => `<label class="wide">${esc(r.key)}
        <input name="${esc(r.key)}" value="${esc(ov[r.key] || '')}" placeholder="Leave empty to use the installed address" autocomplete="off" spellcheck="false">
        <small class="meta">must address <code>${esc(r.expected?.workflowId || 'unknown')}</code> · ${esc(r.expected?.flow || '')} · currently ${r.configured ? esc(EndpointRegistry.source(r.key, ov)) : 'not set up'}</small>
      </label>`).join('')}</div>
      <div class="form-row">
        ${actionButton('estate.override-set', { label: 'Validate and save', ghost: false })}
        ${actionButton('estate.override-clear')}
        ${actionButton('estate.export', { label: 'Download redacted report' })}
      </div>
    </form>
  </section>`;
}

/** Formation + register agreement, in one verdict, for a value about to be saved. */
export function validateOverride(key, value) {
  const raw = String(value || '').trim();
  if (!raw) return { ok: true, cleared: true, issues: [] };
  const inspection = EndpointFormation.inspect(raw);
  const expected = EndpointAtlas.keys.find((k) => k.key === key);
  const issues = inspection.issues.map((i) => i.message);
  if (expected?.workflowId && inspection.workflowId && inspection.workflowId !== expected.workflowId) {
    issues.push(`This address calls workflow ${inspection.workflowId}, but the register says ${key} must call ${expected.workflowId} (${expected.flow}). The URL is valid, so nothing would fail — it would succeed against the wrong flow.`);
  }
  if (expected?.workflowId && !inspection.workflowId) {
    issues.push(`This address names no workflow id, so it cannot be checked against the register's ${expected.workflowId}.`);
  }
  return { ok: issues.length === 0, cleared: false, issues };
}

/* ------------------------------------------------------------------ *
 * Live checks
 * ------------------------------------------------------------------ */

function checksPanel() {
  const p = view.probe;
  const configured = describeEstate({ resolve }).filter((r) => r.configured);
  const readable = configured.filter((r) => EndpointContracts[r.key]?.readOnly === true);

  return `<section class="panel">
    <h2>Live checks</h2>
    <p>Three probes, and they answer different questions. Read what each one does before running it — two of them reach the tenant.</p>
    <div class="dashboard-grid">
      <div class="panel"><h3>Non-destructive health check</h3>
        <p class="meta">Calls every configured endpoint with <code>validationOnly:true</code>. A flow implementing the contract validates itself and writes nothing. One that does not is reported as unimplemented — and that call may have reached its write path.</p>
        <p class="meta"><b>${configured.length}</b> configured endpoint(s) would be called.</p>
        ${actionButton('estate.health-contract', { label: 'Run health check', ghost: false, disabled: view.probeBusy })}</div>
      <div class="panel"><h3>Identity handshake</h3>
        <p class="meta">Makes each flow state its own identity against a correlation id issued for the call. The only check here that catches a correctly-signed URL addressing the wrong workflow.</p>
        <p class="meta"><b>${configured.length}</b> configured endpoint(s) would be called.</p>
        ${actionButton('estate.identity-verify', { label: 'Run identity check', ghost: false, disabled: view.probeBusy })}</div>
      <div class="panel"><h3>Read-only call</h3>
        <p class="meta">Exercises the real path a feature takes, for the endpoints whose contract declares them read-only. Write endpoints are refused by name, not skipped quietly.</p>
        <p class="meta"><b>${readable.length}</b> of ${configured.length} configured endpoint(s) are read-only.</p>
        ${actionButton('estate.read-probe', { label: 'Call read endpoints', ghost: false, disabled: view.probeBusy })}</div>
    </div>
    ${view.probeBusy ? '<p class="meta" role="status">Probing, one endpoint at a time. Twenty-five simultaneous calls to one tenant gets throttled and produces failures that read as endpoint faults.</p>' : ''}
  </section>
  ${p ? probeResults(p) : '<section class="panel"><p class="meta">No probe has been run in this session.</p></section>'}`;
}

function probeResults(p) {
  const s = HealthContract.summariseProbes(p.rows);
  const sorted = [...p.rows].sort((a, b) => (OUTCOME_SEVERITY[a.outcome] ?? 50) - (OUTCOME_SEVERITY[b.outcome] ?? 50));
  return `<section class="panel">
    <h2>Results — ${esc(p.label)}</h2>
    ${kpis([
      ['Probed', String(s.total)],
      ['Answered by the tenant', `${s.reached}/${s.attempted}`],
      ['Healthy', String(s.healthy)],
      ['Ran at', fmtDateTime(p.at)],
    ])}
    ${s.conclusive ? '' : `<div class="panel danger-zone"><h3>This run proved nothing about the estate</h3><p>${esc(s.note)}</p></div>`}
    ${table([
      { label: 'Key', key: 'key' },
      { label: 'Outcome', key: 'outcome', render: (r) => badge(OUTCOME_LABEL[r.outcome] || r.outcome, OUTCOME_TONE[r.outcome] || '') },
      { label: 'Status', key: 'status', render: (r) => r.status ? esc(String(r.status)) : '—' },
      { label: 'Latency', key: 'ms', render: (r) => r.ms == null ? '—' : `${r.ms} ms` },
      { label: 'Reached the tenant', key: 'reached', render: (r) => r.reached ? badge('yes', 'success') : badge('no', 'warn') },
      { label: 'What it means', key: 'note', render: (r) => esc(r.note || '—') },
    ], sorted, null, { label: 'Live probe results' })}
    <p class="meta">Every address above is shown redacted, and the results carry no signature. <b>Reached the tenant</b> is the field that carries the weight: Power Automate always answers JSON, so a non-JSON body means something between this browser and the tenant answered instead.</p>
    <div class="form-row"><button type="button" class="btn ghost" data-download-probe>Download these results</button><button type="button" class="btn ghost" data-clear-probe>Clear</button></div>
  </section>`;
}

/* ------------------------------------------------------------------ *
 * Flow shapes
 * ------------------------------------------------------------------ */

const selectedFlow = () => (view.flowId ? Shapes.flowByWorkflowId(view.flowId) : null) || Shapes.flows()[0] || null;
const httpTrigger = (flow) => (flow?.triggers || []).find((t) => t.kind === 'Http') || flow?.triggers?.[0] || null;

function shapesPanel() {
  const list = Shapes.searchFlows(view.q);
  const flow = selectedFlow();
  const trigger = httpTrigger(flow);
  const t = Shapes.totals();

  return `${kpis([
    ['Flows', String(t.flows)],
    ['HTTP callable', String(t.callable)],
    ['Trigger fields', String(t.triggerFields)],
    ['Actions', String(t.actions)],
    ['Mail actions', String(t.mailActions)],
  ])}
  <section class="panel">
    <h2>Flow catalogue</h2>
    <p class="meta">Derived from the tenant's own workflow exports in <code>${esc(Shapes.authority().directory)}</code>. Where this and any hand-written description of a request shape disagree, the export is correct — it is what the flow will actually accept.</p>
    <label class="wide">Search flow name, workflow id or connector<input data-q value="${esc(view.q)}" placeholder="e.g. Bulk_Assign, sharepointonline"></label>
    ${table([
      { label: 'Flow', key: 'name', render: (f) => `<b>${esc(f.name)}</b>${f.displayName && f.displayName !== f.name ? `<br><small class="meta">${esc(f.displayName)}</small>` : ''}` },
      { label: 'Workflow id', key: 'workflowId', render: (f) => `<code>${esc(f.workflowId || '—')}</code>` },
      { label: 'Trigger', key: 'callable', render: (f) => f.callable ? badge('HTTP callable', 'success') : badge('event trigger', 'pending') },
      { label: 'Fields', key: 'fields', render: (f) => String(Shapes.fieldsOf(httpTrigger(f) || {}).length) },
      { label: 'Actions', key: 'actionCount' },
      { label: 'Sends mail', key: 'mail', render: (f) => f.mailActions.length ? badge(`${f.mailActions.length}`, 'warn') : '<span class="meta">no</span>' },
    ], capRows(list, RenderBudget.tableRows), (f) => `data-open-flow="${esc(f.workflowId || f.name)}"`, { label: 'Flow catalogue' })}
    <p class="meta">${list.length} of ${t.flows} shown. Select a row to inspect it.</p>
    <div class="form-row">${actionButton('flows.export-tables', { label: 'Download the five tables as CSV' })}</div>
    <p class="meta">Flow summary, request fields, response actions, mail actions and endpoint keys — the column contracts of the provisioning workbook, with rows derived from this catalogue rather than frozen at export time. No endpoint URL or signature appears in any of them.</p>
  </section>
  ${flow ? flowDetail(flow, trigger) : ''}`;
}

function flowDetail(flow, trigger) {
  const tabs = [['shape', 'Request shape'], ['compose', 'Compose & validate'], ['schema', 'Schema'], ['actions', `Actions (${flow.actionCount})`], ['responses', `Responses (${flow.responses.length})`], ['mail', `Mail (${flow.mailActions.length})`]];
  return `<section class="panel">
    <div class="eyebrow">Flow detail</div>
    <h2>${esc(flow.name)} ${flow.callable ? badge('HTTP callable', 'success') : badge('event trigger', 'pending')}</h2>
    <div class="grid">
      <div><small class="meta">Workflow id</small><p><code>${esc(flow.workflowId || '—')}</code></p></div>
      <div><small class="meta">Environment</small><p>${esc(flow.environmentName || '—')}</p></div>
      <div><small class="meta">Method</small><p>${esc(trigger?.method || '—')}</p></div>
      <div><small class="meta">Trigger authentication</small><p>${trigger?.authentication === 'All' ? badge('All — any caller', 'warn') : esc(trigger?.authentication || '—')}</p></div>
      <div><small class="meta">Additional properties</small><p>${trigger?.allowsAdditionalProperties === false ? 'refused' : trigger?.allowsAdditionalProperties === true ? 'accepted' : '—'}</p></div>
      <div><small class="meta">Connectors</small><p>${esc(flow.connectors.join(', ') || 'none')}</p></div>
      <div><small class="meta">Exported</small><p>${esc(flow.exportedAtUtc || '—')}</p></div>
      <div><small class="meta">Source SHA-256</small><p><code class="meta">${esc(flow.sourceSha256.slice(0, 16))}…</code></p></div>
    </div>
    ${flow.mailActions.length ? `<div class="panel danger-zone"><h3>This flow sends email</h3><p>${flow.mailActions.length} mail action(s), reaching ${new Set(flow.mailActions.map((m) => m.to).filter(Boolean)).size} distinct recipient expression(s). Invoking it from the composer sends real mail unless it implements the health contract.</p></div>` : ''}
    <div class="form-row">${chips(tabs.map(([v, l]) => ({ value: v, label: l })), view.flowTab, 'data-flow-tab')}</div>
    ${flowTabBody(flow, trigger)}
  </section>`;
}

function flowTabBody(flow, trigger) {
  if (view.flowTab === 'schema') {
    return `<p class="meta">The trigger's own JSON Schema, exactly as the tenant exported it.</p>
      <pre class="preview-box">${esc(JSON.stringify(trigger?.schema || {}, null, 2))}</pre>`;
  }
  if (view.flowTab === 'actions') {
    return table([
      { label: 'Action', key: 'name' },
      { label: 'Type', key: 'type' },
      { label: 'Operation', key: 'operationId', render: (a) => esc(a.operationId || '—') },
      { label: 'Connector', key: 'connector', render: (a) => esc(a.connector || '—') },
      { label: 'Path', key: 'path', render: (a) => `<code class="meta">${esc(a.path)}</code>` },
    ], capRows(Shapes.actionRecords(flow), RenderBudget.tableRows), null, { label: `Actions in ${flow.name}` });
  }
  if (view.flowTab === 'responses') {
    return table([
      { label: 'Response', key: 'name', render: (r) => esc(Shapes.actionRecord(flow, r.action).name) },
      { label: 'Status code', key: 'statusCode', render: (r) => `<code>${esc(r.statusCode || '—')}</code>` },
      { label: 'Headers', key: 'headers', render: (r) => `<code class="meta">${esc(r.headers || '—')}</code>` },
      { label: 'Body', key: 'body', render: (r) => `<code class="meta">${esc(r.body || '—')}</code>` },
    ], flow.responses, null, { label: `Response actions in ${flow.name}` });
  }
  if (view.flowTab === 'mail') {
    return flow.mailActions.length
      ? table([
        { label: 'Action', key: 'name', render: (m) => esc(Shapes.actionRecord(flow, m.action).name) },
        { label: 'To', key: 'to' }, { label: 'Cc', key: 'cc' }, { label: 'Bcc', key: 'bcc' },
        { label: 'Subject', key: 'subject' }, { label: 'Importance', key: 'importance' },
      ], flow.mailActions, null, { label: `Mail actions in ${flow.name}` })
      : emptyState('This flow sends no email', 'No mail action appears anywhere in its definition.');
  }
  if (view.flowTab === 'compose') return composePanel(flow, trigger);

  const fields = Shapes.fieldsOf(trigger || {});
  return fields.length
    ? `<p class="meta">Every addressable field the trigger declares, including nested paths. <code>[]</code> marks an array's item shape.</p>
       ${table([
      { label: 'Path', key: 'path', render: (f) => `<code>${esc(f.path)}</code>` },
      { label: 'Type', key: 'types', render: (f) => esc(f.types.join(' | ') || '—') },
      { label: 'Required', key: 'required', render: (f) => f.required ? badge('required', 'danger') : '<span class="meta">optional</span>' },
      { label: 'Constraints', key: 'c', render: (f) => esc([f.format && `format ${f.format}`, f.enum && `enum: ${f.enum.join(', ')}`, f.minLength != null && `minLength ${f.minLength}`, f.maxLength != null && `maxLength ${f.maxLength}`, f.minimum != null && `minimum ${f.minimum}`, f.maximum != null && `maximum ${f.maximum}`, f.pattern && `pattern ${f.pattern}`].filter(Boolean).join('; ') || '—') },
      { label: 'Description', key: 'description', render: (f) => esc(f.description || '—') },
    ], fields, null, { label: `Request shape of ${flow.name}` })}`
    : emptyState('This trigger declares no request schema',
        'Nothing can be validated against it before sending. A payload that conforms to nothing can still be refused by the flow.');
}

function composePanel(flow, trigger) {
  if (!flow.callable) {
    return emptyState('This flow is not HTTP callable', 'It runs from an event trigger, so there is no request to compose and no address to send one to.');
  }
  const fields = Shapes.topLevelFields(trigger || {});
  const body = view.body || JSON.stringify(Shapes.composeBody(trigger || {}, view.compose), null, 2);
  let parsed;
  let parseError = '';
  try { parsed = JSON.parse(body || '{}'); } catch (e) { parseError = String(e.message || e); }
  const result = parseError ? null : Shapes.validateRequest(flow, parsed);

  return `<p class="meta">Fill the form or edit the JSON — they are the same payload. Validation runs against the schema the flow itself enforces.</p>
    <div class="grid">${fields.map((f) => `<label class="wide">${esc(f.name)} ${f.required ? badge('required', 'danger') : ''}
      <input data-compose="${esc(f.name)}" value="${esc(view.compose[f.name] ?? '')}" placeholder="${esc(f.description || f.format || f.types.join(' | '))}" autocomplete="off">
      <small class="meta">${esc(f.types.join(' | '))}${f.enum ? ` · one of ${esc(f.enum.join(', '))}` : ''}${f.description ? ` · ${esc(f.description)}` : ''}</small>
    </label>`).join('') || '<p class="meta">This trigger declares no top-level properties, so there is no form to render. Edit the JSON directly.</p>'}</div>
    <label class="wide">Request body<textarea data-body rows="12" spellcheck="false">${esc(body)}</textarea></label>
    ${parseError
      ? `<div class="panel danger-zone"><h3>Not valid JSON</h3><p>${esc(parseError)}</p></div>`
      : result.checked
        ? (result.conforms
          ? `<div class="panel"><h3>${badge('conforms', 'success')} This payload matches the trigger schema</h3><p class="meta">Shape only. This says nothing about your authority to call the flow, the state of the tenant, or whether the flow should be called at all.</p></div>`
          : `<div class="panel danger-zone"><h3>${badge(`${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}`, 'danger')} This payload would be refused</h3><ul>${result.errors.map((e) => `<li><code>${esc(e.path)}</code> — ${esc(e.message)}</li>`).join('')}</ul></div>`)
        : `<div class="panel"><h3>${badge('unchecked', 'warn')} Nothing was checked</h3><p class="meta">${esc(result.note || 'This trigger declares no request schema.')}</p></div>`}
    <div class="form-row">
      ${actionButton('flows.example', { label: 'Fill in an example' })}
      ${actionButton('flows.curl', { label: 'Copy as curl' })}
      ${actionButton('flows.export-alignment', { label: 'Export alignment report' })}
    </div>
    ${view.curl ? `<label class="wide">This request as a terminal command — the signature is redacted, so replace the <code>***</code> before running
      <textarea rows="7" spellcheck="false" readonly aria-label="curl command">${esc(view.curl)}</textarea></label>` : ''}
    ${sendPanel(flow, parseError, result)}
    ${view.sent.length ? sentPanel() : ''}`;
}

function sendPanel(flow, parseError, result) {
  if (!can(Permissions.SETTINGS_MANAGE)) return '';
  const key = EndpointAtlas.keys.find((k) => k.workflowId === flow.workflowId);
  const url = key ? resolve(key.key) : '';
  const blocked = parseError || (result?.checked && !result.conforms);

  return `<section class="panel danger-zone">
    <div class="eyebrow">${badge('reaches the tenant', 'warning')}</div>
    <h3>Send this request</h3>
    ${key
      ? `<p class="meta">This flow is contract key <b>${esc(key.key)}</b>. The address resolved for it on this device is used; it is never shown.</p>`
      : '<p class="meta">No contract key in the register calls this workflow, so this platform holds no address for it. It cannot be sent from here.</p>'}
    ${url ? '' : '<p class="meta">No address resolves for that key in this deployment, so there is nothing to send to.</p>'}
    <p><b>This is not a simulation.</b> Anything the flow does — assigning, emailing, writing to the registry — happens.${flow.mailActions.length ? ` This flow has ${flow.mailActions.length} mail action(s): real recipients receive real mail.` : ''}</p>
    ${blocked ? `<p class="meta">${parseError ? 'The body is not valid JSON' : 'The payload does not match the trigger schema'}, so sending is disabled. Correct it first.</p>` : ''}
    ${key && url && !blocked ? armed('flows.send', `Send to ${key.key}`) : ''}
  </section>`;
}

function sentPanel() {
  return `<section class="panel">
    <h2>Sent in this session</h2>
    <p class="meta">Held in this tab only, and discarded when it closes. Every entry carries the alignment report the request was sent under, so what was sent is reconstructable from the record.</p>
    ${table([
      { label: 'At', key: 'at', render: (r) => fmtDateTime(r.at) },
      { label: 'Flow', key: 'flow' },
      { label: 'Key', key: 'key' },
      { label: 'Conformed', key: 'conformed', render: (r) => r.conformed ? badge('yes', 'success') : badge('no', 'danger') },
      { label: 'Status', key: 'status', render: (r) => r.status ? badge(String(r.status), r.ok ? 'success' : 'danger') : badge(r.error || 'no answer', 'danger') },
      { label: 'Latency', key: 'ms', render: (r) => r.ms == null ? '—' : `${r.ms} ms` },
    ], view.sent, null, { label: 'Requests sent in this session' })}
    <div class="form-row"><button type="button" class="btn ghost" data-download-sent>Download the session record</button></div>
  </section>`;
}

/* ------------------------------------------------------------------ *
 * Commissioning
 * ------------------------------------------------------------------ */

function runbookPanel() {
  const D = OpsRunbookDefinition;
  const s = runbookState();
  const m = OpsRunbook.metrics(D, s);
  const gate = OpsRunbook.releaseGate(D, s);
  const tabs = [['actions', `Actions (${m.closed}/${m.actions})`], ['parameters', `Parameters (${D.parameters.length - m.missingParameters}/${D.parameters.length})`], ['acceptance', `Endpoint acceptance (${m.acceptanceAccepted}/${m.acceptanceTotal})`], ['risks', `Residual risk (${m.openRisks})`], ['cutover', 'Cutover & hypercare'], ['gate', `Release gate — ${gate.decision}`]];

  return `${kpis([
    ['Actions closed', `${m.closed}/${m.actions}`],
    ['Critical open', String(m.criticalOpen)],
    ['Parameters unanswered', String(m.missingParameters)],
    ['Endpoints proven', `${m.acceptanceAccepted}/${m.acceptanceTotal}`],
    ['Decision', gate.decision],
  ])}
  <section class="panel">
    <div class="eyebrow">${esc(D.title)} v${esc(D.version)}</div>
    <h2>${esc(D.subtitle)}</h2>
    <div class="progress" role="img" aria-label="${m.progress}% of commissioning actions closed"><i style="width:${m.progress}%"></i></div>
    <p class="meta">${m.progress}% of commissioning actions closed.</p>
    <p class="meta">Held in this platform's own audited state. Every change is recorded against the person who made it, and the release gate is computed on every read — there is no stored verdict to go stale.</p>
    <div class="form-row">${chips(tabs.map(([v, l]) => ({ value: v, label: l })), view.runbookTab, 'data-runbook-tab')}</div>
  </section>
  ${runbookTabBody(D, s, m, gate)}`;
}

function runbookTabBody(D, s, m, gate) {
  if (view.runbookTab === 'parameters') return runbookParameters(D, s);
  if (view.runbookTab === 'acceptance') return runbookAcceptance(D, s);
  if (view.runbookTab === 'risks') return runbookRisks(s);
  if (view.runbookTab === 'cutover') return runbookCutover(s);
  if (view.runbookTab === 'gate') return runbookGate(D, s, gate);
  return runbookActions(D, s);
}

function runbookActions(D, s) {
  const stages = ['all', ...D.stages];
  const list = D.actions.filter((a) => view.runbookStage === 'all' || a.stage === view.runbookStage);
  const selected = D.actions.find((a) => a.id === view.runbookAction) || null;

  return `<section class="panel">
    <h2>Commissioning actions</h2>
    <p class="meta">Ordered by what genuinely blocks what. The ordering is <b>enforced</b>: an action whose prerequisites are open cannot be moved past Blocked.</p>
    <div class="form-row">${chips(stages.map((v) => ({ value: v, label: v === 'all' ? `All ${D.actions.length}` : v })), view.runbookStage, 'data-stage')}</div>
    ${table([
      { label: 'Action', key: 'id', render: (a) => `<b>${esc(a.id)}</b><br><small class="meta">${esc(a.title)}</small>` },
      { label: 'Stage', key: 'stage' },
      { label: 'Severity', key: 'severity', render: (a) => badge(a.severity, a.severity === 'Critical' ? 'danger' : 'warn') },
      { label: 'Status', key: 'status', render: (a) => badge(STATUS_LABEL[s.actions[a.id]?.status] || '—', STATUS_TONE[s.actions[a.id]?.status] || '') },
      { label: 'Evidence', key: 'ev', render: (a) => String(s.actions[a.id]?.evidence?.length || 0) },
      { label: 'Waiting on', key: 'dep', render: (a) => { const b = OpsRunbook.blockingDependencies(D, s, a.id); return b.length ? `<span class="meta">${esc(b.join(', '))}</span>` : '<span class="meta">—</span>'; } },
    ], list, (a) => `data-runbook-action="${esc(a.id)}"`, { label: 'Commissioning actions' })}
  </section>
  ${selected ? runbookActionDetail(D, s, selected) : '<section class="panel"><p class="meta">Select an action to read what it requires and record its outcome.</p></section>'}`;
}

function runbookActionDetail(D, s, a) {
  const rec = s.actions[a.id] || {};
  const editable = can(Permissions.SETTINGS_MANAGE);
  const options = Object.values(STATUS).map((v) => {
    const check = OpsRunbook.canSetStatus(D, s, a.id, v);
    return `<option value="${v}" ${rec.status === v ? 'selected' : ''} ${check.allowed || rec.status === v ? '' : 'disabled'}>${esc(STATUS_LABEL[v])}${check.allowed || rec.status === v ? '' : ' — not available'}</option>`;
  }).join('');
  const blocked = OpsRunbook.canSetStatus(D, s, a.id, STATUS.RESOLVED);

  return `<section class="panel" data-detail>
    <div class="eyebrow">${badge(a.severity, a.severity === 'Critical' ? 'danger' : 'warn')} ${esc(a.stage)} · <code>${esc(a.reference)}</code></div>
    <h2>${esc(a.id)} — ${esc(a.title)}</h2>
    <h3>The problem</h3><p>${esc(a.issue)}</p>
    <h3>What is required</h3><p>${esc(a.requiredAction)}</p>
    <h3>Steps</h3><ol>${a.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <h3>How you know it is done</h3><ul>${a.validation.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    ${a.stopIf ? `<div class="panel danger-zone"><h3>Stop if</h3><p>${esc(a.stopIf)}</p></div>` : ''}
    ${a.dependsOn.length ? `<p class="meta"><b>Depends on:</b> ${a.dependsOn.map((d) => `${esc(d)} (${esc(STATUS_LABEL[s.actions[d]?.status] || '—')})`).join(', ')}</p>` : ''}
    ${a.parameters.length ? `<p class="meta"><b>Parameters it depends on:</b> ${a.parameters.map((p) => `${esc(p)}${OpsRunbook.parameterValue(D, s, p).trim() ? '' : ' <b>(unanswered)</b>'}`).join(', ')}</p>` : ''}

    ${editable ? `<form data-runbook-form data-action-id="${esc(a.id)}">
      <div class="grid">
        <label>Status<select name="status">${options}</select>
          ${blocked.allowed ? '' : `<small class="meta">${esc(blocked.reason)}</small>`}</label>
        <label>Recorded by<input name="owner" value="${esc(rec.owner || '')}" placeholder="Who performed or accepted this"></label>
        <label class="wide">Note<textarea name="note" rows="3" placeholder="Required when accepting a risk: who accepted it, and on what basis.">${esc(rec.note || '')}</textarea></label>
        <label class="wide">Add evidence<input name="evidence" placeholder="A run id, a ticket reference, a document — what makes the claim believable"></label>
      </div>
      <div class="form-row"><button class="btn">Record</button></div>
    </form>` : '<p class="meta">Recording an outcome needs settings:manage.</p>'}

    ${rec.evidence?.length ? `<h3>Evidence</h3><ul>${rec.evidence.map((e) => `<li>${esc(e.text)} <span class="meta">— ${esc(e.by || 'unattributed')}, ${esc(fmtDateTime(e.at))}</span></li>`).join('')}</ul>` : '<p class="meta">No evidence recorded. This action cannot be resolved without at least one entry.</p>'}
  </section>`;
}

function runbookParameters(D, s) {
  const check = OpsRunbook.validateParameters(D, s);
  const editable = can(Permissions.SETTINGS_MANAGE);
  return `<section class="panel">
    <h2>Operational parameters</h2>
    <p class="meta">${check.missing.length} of ${D.parameters.filter((p) => p.required).length} mandatory values are unanswered. Placeholder text counts as unanswered: a required field containing "TBD" satisfies every test for non-emptiness and answers nothing.</p>
    ${check.suspect.length ? `<div class="panel danger-zone"><h3>${check.suspect.length} value(s) do not look right</h3><ul>${check.suspect.map((p) => `<li><b>${esc(p.label)}</b> — ${esc(p.reason)}</li>`).join('')}</ul></div>` : ''}
    <form data-params>
      <div class="grid">${D.parameters.map((p) => {
        const value = OpsRunbook.parameterValue(D, s, p.id);
        const missing = p.required && !value.trim();
        return `<label class="wide">${esc(p.label)} ${p.required ? badge('required', missing ? 'danger' : '') : ''} ${p.locked ? badge('locked', 'info') : ''}
          <input name="${esc(p.id)}" value="${esc(value)}" ${p.locked || !editable ? 'disabled' : ''} placeholder="${esc(p.description)}" autocomplete="off">
          <small class="meta">${esc(p.description)} · source: ${esc(p.source)}</small>
        </label>`;
      }).join('')}</div>
      ${editable ? '<div class="form-row"><button class="btn">Save answers</button></div>' : '<p class="meta">Answering a parameter needs settings:manage.</p>'}
    </form>
    <p class="meta">Locked values are read from this repository's own configuration and cannot be retyped here. A runbook whose "approved service mailbox" can be edited will eventually assert a mailbox the platform does not use — and the runbook is exactly the document a reviewer trusts over the code.</p>
  </section>`;
}

function runbookAcceptance(D, s) {
  const editable = can(Permissions.SETTINGS_MANAGE);
  const rows = D.acceptance.map((r) => ({ ...r, record: s.acceptance[r.id] || {}, complete: OpsRunbook.acceptanceComplete(D, s, r.id) }));
  return `<section class="panel">
    <h2>Endpoint acceptance</h2>
    <p class="meta">One record per contract key, derived from the tenant register — a key added to the estate arrives here with no separate edit. A key with no acceptance record is a key nobody has to prove works.</p>
    <p class="meta">A record counts as passed only when it carries ${D.acceptanceRequiredFields.map((f) => `<code>${esc(f)}</code>`).join(', ')} <b>and</b> at least one evidence entry. Every one of those is something that exists only after the endpoint was genuinely called.</p>
    ${table([
      { label: 'Endpoint', key: 'id', render: (r) => `<b>${esc(r.id.replace(/^EP-/, ''))}</b><br><small class="meta">${esc(r.surface)}</small>` },
      { label: 'Requirement', key: 'requirement' },
      { label: 'Status', key: 'st', render: (r) => badge(r.record.status || ACCEPTANCE_STATUS.BLOCKED, r.record.status === 'PASSED' ? 'success' : r.record.status === 'FAILED' ? 'danger' : r.record.status === 'RISK_ACCEPTED' ? 'escalated' : 'pending') },
      { label: 'Complete', key: 'complete', render: (r) => r.complete ? badge('evidenced', 'success') : badge('not evidenced', 'warn') },
      { label: 'Run id', key: 'run', render: (r) => esc(r.record.fields?.flowRunId || '—') },
      { label: 'Tested by', key: 'by', render: (r) => esc(r.record.fields?.testedBy || '—') },
    ], rows, (r) => `data-acceptance="${esc(r.id)}"`, { label: 'Endpoint acceptance records' })}
    ${editable && view.runbookAction.startsWith('EP-') ? acceptanceForm(D, s, view.runbookAction) : '<p class="meta">Select a row to record its result.</p>'}
  </section>`;
}

function acceptanceForm(D, s, id) {
  const spec = D.acceptance.find((r) => r.id === id);
  if (!spec) return '';
  const rec = s.acceptance[id] || { fields: {}, evidence: [] };
  return `<form class="panel" data-acceptance-form data-acceptance-id="${esc(id)}">
    <div class="eyebrow">${esc(spec.id)}</div>
    <h3>${esc(spec.requirement)}</h3>
    <p class="meta">${esc(spec.note)}</p>
    <div class="grid">
      <label>Result<select name="status">${Object.values(ACCEPTANCE_STATUS).map((v) => `<option value="${v}" ${rec.status === v ? 'selected' : ''}>${esc(v.replace(/_/g, ' ').toLowerCase())}</option>`).join('')}</select></label>
      ${spec.requiredFields.map((f) => `<label>${esc(f)}<input name="${esc(f)}" value="${esc(rec.fields?.[f] || '')}" autocomplete="off"></label>`).join('')}
      <label class="wide">Rationale (required when accepting a risk)<textarea name="rationale" rows="2">${esc(rec.fields?.rationale || '')}</textarea></label>
      <label class="wide">Add evidence<input name="evidence" placeholder="What makes this result believable"></label>
    </div>
    <div class="form-row"><button class="btn">Record result</button></div>
    ${rec.evidence?.length ? `<ul>${rec.evidence.map((e) => `<li>${esc(e.text)} <span class="meta">— ${esc(e.by || 'unattributed')}, ${esc(fmtDateTime(e.at))}</span></li>`).join('')}</ul>` : ''}
  </form>`;
}

function runbookRisks(s) {
  const editable = can(Permissions.SETTINGS_MANAGE);
  return `<section class="panel">
    <h2>Residual risk</h2>
    <p class="meta">Anything accepted rather than resolved. The release gate does not clear while one is open, so a risk recorded here is a decision somebody has to close, not a note.</p>
    ${(s.risks || []).length
      ? table([
        { label: 'Risk', key: 'title' },
        { label: 'Accepted by', key: 'acceptedBy' },
        { label: 'Basis', key: 'basis' },
        { label: 'Status', key: 'status', render: (r) => badge(r.status || 'OPEN', r.status === 'CLOSED' ? 'success' : 'warn') },
        { label: 'At', key: 'at', render: (r) => fmtDateTime(r.at) },
        { label: '', key: 'x', render: (r) => editable ? `<button type="button" class="btn ghost dgo-btn--sm" data-close-risk="${esc(r.id)}">${r.status === 'CLOSED' ? 'Reopen' : 'Close'}</button>` : '' },
      ], s.risks, null, { label: 'Residual risks' })
      : emptyState('No residual risk recorded', 'Nothing has been accepted rather than resolved.')}
    ${editable ? `<form data-risk-form class="grid">
      <label class="wide">Risk<input name="title" placeholder="What is being accepted" required></label>
      <label>Accepted by<input name="acceptedBy" placeholder="The person accepting it" required></label>
      <label class="wide">Basis<input name="basis" placeholder="Why it is acceptable, and what mitigates it" required></label>
      <div class="wide"><button class="btn">Record a residual risk</button></div>
    </form>` : ''}
  </section>`;
}

function runbookCutover(s) {
  const editable = can(Permissions.SETTINGS_MANAGE);
  const box = (name, label, checked, note) => `<div class="action-row"><input type="checkbox" data-cutover="${esc(name)}" ${checked ? 'checked' : ''} ${editable ? '' : 'disabled'} id="cut-${esc(name)}"><label for="cut-${esc(name)}"><b>${esc(label)}</b><br><span class="meta">${esc(note)}</span></label></div>`;
  return `<section class="panel">
    <h2>Cutover</h2>
    ${box('oldFlowHashesRecorded', 'Superseded flow definitions recorded', s.cutover.oldFlowHashesRecorded, 'Their SHA-256, so what was replaced is provable later.')}
    ${box('rollbackRehearsed', 'Rollback rehearsed', s.cutover.rollbackRehearsed, 'A rollback plan that has never been executed is an assertion. The first time it runs must not be during an incident.')}
    ${box('inFlightReconciled', 'In-flight work reconciled', s.cutover.inFlightReconciled, 'Work in progress at cutover belongs to neither path unless somebody decides which completes it.')}
    ${box('supersededFlowsDisabledNotDeleted', 'Superseded flows disabled, not deleted', s.cutover.supersededFlowsDisabledNotDeleted, 'A deleted flow cannot be rolled back to.')}
  </section>
  <section class="panel">
    <h2>Hypercare</h2>
    ${box('hypercareActive', 'Hypercare active', s.hypercare.active, 'Heightened monitoring, with a named reviewer and a dated exit.')}
    <form data-hypercare class="grid">
      <label>Daily review by<input name="dailyReview" value="${esc(s.hypercare.dailyReview || '')}" ${editable ? '' : 'disabled'} placeholder="The named person performing it"></label>
      <label>Escalation route<input name="escalationRoute" value="${esc(s.hypercare.escalationRoute || '')}" ${editable ? '' : 'disabled'} placeholder="Where an operator goes when something breaks"></label>
      <label class="wide">Exit criteria<input name="exitCriteria" value="${esc(s.hypercare.exitCriteria || '')}" ${editable ? '' : 'disabled'} placeholder="What must be true to leave hypercare, and by when"></label>
      ${editable ? '<div class="wide"><button class="btn">Save hypercare</button></div>' : ''}
    </form>
    <p class="meta">Hypercare with no end date is not hypercare — it is the normal operating state, and nobody is watching more closely than usual.</p>
  </section>`;
}

function runbookGate(D, s, gate) {
  const audit = OpsRunbook.structuralAudit(D, s);
  return `<section class="panel ${gate.decision === 'READY' ? '' : 'danger-zone'}">
    <div class="eyebrow">Production readiness</div>
    <h2>${esc(gate.decision)}</h2>
    <p class="meta">Computed every time this is read. There is no field anywhere that says READY, so there is nothing to set by hand and nothing that can stay green because nobody re-ran it.</p>
    <div class="dashboard-grid">${gate.checks.map((c) => `<div class="panel${c.ok ? '' : ' danger-zone'}"><p><b>${c.ok ? '✓' : '✕'} ${esc(c.label)}</b></p>${c.detail ? `<p class="meta">${esc(c.detail)}</p>` : ''}</div>`).join('')}</div>
  </section>
  <section class="panel">
    <h2>Structural audit</h2>
    <p class="meta">${esc(audit.scope)}</p>
    ${audit.problems.length
      ? `<div class="dashboard-grid">${audit.problems.map((p) => `<div class="panel${p.severity === 'error' ? ' danger-zone' : ''}"><p>${badge(p.severity, SEV_TONE[p.severity])} <code>${esc(p.code)}</code></p><p>${esc(p.message)}</p></div>`).join('')}</div>`
      : emptyState('The register is internally consistent', 'No action is resolved without evidence, none was progressed out of order, and no acceptance record claims more than it carries.')}
    <div class="form-row">
      ${actionButton('runbook.export', { label: 'Export the commissioning record' })}
      ${actionButton('runbook.print', { label: 'Print / save as PDF' })}
      ${actionButton('evidence.export-bundle', { label: 'Export the full evidence bundle' })}
    </div>
    ${importPanel()}
    <div class="form-row">${actionButton('runbook.reset', { label: 'Reset the commissioning record' })}</div>
  </section>`;
}

/**
 * Restoring a record, and showing what the file cost before it is committed.
 *
 * The file is read, validated and REPORTED first; nothing is written until the administrator has
 * seen what was dropped. That ordering is the point — an import that silently discarded a locked
 * parameter or an unknown action would be indistinguishable from one that accepted them.
 */
function importPanel() {
  if (!can(Permissions.SETTINGS_MANAGE)) return '';
  const r = view.importReport;
  return `<section class="panel danger-zone">
    <div class="eyebrow">${badge('cannot be undone', 'danger')}</div>
    <h3>Restore a record</h3>
    <p>Reads a record exported from this runbook and <b>replaces</b> what is held here. Use it to
    move a commissioning between machines, or to restore one after a device was cleared.</p>
    <p class="meta">Locked parameters in the file are discarded — they are facts about this
    repository, and a file is exactly how one would be replaced with a plausible wrong value.
    Actions the current runbook does not declare are dropped and named. A record that contradicts
    itself is imported and warned about, never accepted quietly.</p>
    <div class="form-row">
      <button type="button" class="btn ghost" data-pick-runbook>Choose a file…</button>
      <input hidden type="file" data-runbook-file accept="application/json" aria-label="Choose an exported commissioning record to restore">
    </div>
    ${r ? importReport(r) : ''}
  </section>`;
}

function importReport(r) {
  if (r.errors.length) {
    return `<div class="panel danger-zone"><h3>${badge('refused', 'danger')} Nothing was read</h3>
      <ul>${r.errors.map((e) => `<li>${esc(e.message)}</li>`).join('')}</ul></div>`;
  }
  return `<div class="panel">
    <h3>${badge('ready to restore', 'success')} ${esc(r.fileName)}</h3>
    <p class="meta">${r.summary}</p>
    ${r.warnings.length
      ? `<p class="meta"><b>${r.warnings.length} thing${r.warnings.length === 1 ? '' : 's'} to know before you restore:</b></p>
         <ul>${r.warnings.map((w) => `<li><code>${esc(w.code)}</code> — ${esc(w.message)}</li>`).join('')}</ul>`
      : '<p class="meta">Nothing was dropped and nothing contradicts itself.</p>'}
    ${armed('runbook.import', 'Replace the record with this file')}
  </div>`;
}

/**
 * The record laid out for paper.
 *
 * A separate rendering rather than a print stylesheet over the live screen, because the two want
 * different things: the screen wants filters, tabs and controls, and the page wants every row of
 * every table in reading order with nothing collapsed. `@media print` in the design system hides
 * the shell chrome; this supplies the body.
 */
function printView(D, s) {
  const m = OpsRunbook.metrics(D, s);
  const gate = OpsRunbook.releaseGate(D, s);
  const audit = OpsRunbook.structuralAudit(D, s);
  const u = actor();
  const rows = (cols, xs) => `<table class="dgo-table"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${xs.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  return `<div class="workspace" data-print-view>
    <header class="dgo-page-head">
      <p class="dgo-page-head__eyebrow">${esc(D.title)} v${esc(D.version)}</p>
      <h1 class="dgo-page-head__title">Commissioning record — ${esc(gate.decision)}</h1>
      <p class="dgo-page-head__subtitle">Printed ${esc(fmtDateTime(new Date().toISOString()))} by ${esc(u.fullName || u.email || 'an unnamed operator')}. ${m.closed} of ${m.actions} actions closed · ${m.acceptanceAccepted} of ${m.acceptanceTotal} endpoints proven · ${m.missingParameters} parameter(s) unanswered.</p>
    </header>
    <section class="panel"><h2>Release gate — ${esc(gate.decision)}</h2>
      ${rows(['Check', 'Result', 'Detail'], gate.checks.map((c) => [c.label, c.ok ? 'PASS' : 'NOT MET', c.detail || '']))}</section>
    <section class="panel"><h2>Parameters</h2>
      ${rows(['Parameter', 'Value', 'Required', 'Locked', 'Source'], D.parameters.map((p) => [p.label, OpsRunbook.parameterValue(D, s, p.id) || '— unanswered —', p.required ? 'yes' : 'no', p.locked ? 'yes' : 'no', p.source]))}</section>
    <section class="panel"><h2>Actions</h2>
      ${rows(['Id', 'Stage', 'Title', 'Severity', 'Status', 'Recorded by', 'Evidence'], D.actions.map((a) => {
        const rec = s.actions[a.id] || {};
        return [a.id, a.stage, a.title, a.severity, STATUS_LABEL[rec.status] || '—', rec.owner || '—', (rec.evidence || []).map((e) => e.text).join(' · ') || '—'];
      }))}</section>
    <section class="panel"><h2>Endpoint acceptance</h2>
      ${rows(['Id', 'Requirement', 'Result', 'Evidenced', 'Run id', 'Tested by'], D.acceptance.map((r) => {
        const rec = s.acceptance[r.id] || {};
        return [r.id, r.requirement, rec.status || '—', OpsRunbook.acceptanceComplete(D, s, r.id) ? 'yes' : 'no', rec.fields?.flowRunId || '—', rec.fields?.testedBy || '—'];
      }))}</section>
    <section class="panel"><h2>Residual risk</h2>
      ${(s.risks || []).length ? rows(['Risk', 'Accepted by', 'Basis', 'Status'], s.risks.map((r) => [r.title, r.acceptedBy, r.basis, r.status])) : '<p>None recorded.</p>'}</section>
    <section class="panel"><h2>Cutover and hypercare</h2>
      ${rows(['Item', 'State'], [
        ['Superseded flow definitions recorded', s.cutover.oldFlowHashesRecorded ? 'yes' : 'no'],
        ['Rollback rehearsed', s.cutover.rollbackRehearsed ? 'yes' : 'no'],
        ['In-flight work reconciled', s.cutover.inFlightReconciled ? 'yes' : 'no'],
        ['Superseded flows disabled, not deleted', s.cutover.supersededFlowsDisabledNotDeleted ? 'yes' : 'no'],
        ['Hypercare active', s.hypercare.active ? 'yes' : 'no'],
        ['Daily review by', s.hypercare.dailyReview || '—'],
        ['Escalation route', s.hypercare.escalationRoute || '—'],
        ['Exit criteria', s.hypercare.exitCriteria || '—'],
      ])}</section>
    <section class="panel"><h2>Structural audit</h2>
      <p class="meta">${esc(audit.scope)}</p>
      ${audit.problems.length ? rows(['Severity', 'Code', 'Problem'], audit.problems.map((p) => [p.severity, p.code, p.message])) : '<p>The register is internally consistent.</p>'}</section>
    <div class="form-row"><button type="button" class="btn" data-do-print>Print</button><button type="button" class="btn ghost" data-close-print>Back to the suite</button></div>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Capsule registry
 * ------------------------------------------------------------------ */

function capsulePanel() {
  const st = CapsuleClient.status();
  const c = view.capsule;

  return `<section class="panel">
    <h2>Capsule registry</h2>
    <p>The alternative posture for deployments that can run a server. The registry holds each complete signed URL as an opaque string it never returns, and exposes an alias instead — so the signature stops at the registry rather than reaching every browser.</p>
    <p class="meta">It gives the estate three things the direct-call model structurally cannot have: version history per alias with rollback, an enable/disable switch that takes effect without a redeploy, and an audit row per invocation. The service is <code>flowcapsule.py</code>, deployed beside the tenant; this administers it.</p>
    ${st.connected
      ? `<p>${badge('connected', 'success')} <code>${esc(st.baseUrl)}</code> since ${esc(fmtDateTime(st.connectedAt))}</p>
         <div class="form-row"><button type="button" class="btn ghost" data-capsule-refresh>Refresh</button><button type="button" class="btn ghost" data-capsule-disconnect>Disconnect</button></div>`
      : `<form data-capsule-connect class="grid">
          <label>Registry address<input name="baseUrl" placeholder="https://registry.internal" autocomplete="off" required></label>
          <label>Administration token<input name="token" type="password" autocomplete="off" required></label>
          <div class="wide"><button class="btn">Connect</button></div>
        </form>
        <p class="meta"><b>The token is held for this tab only and is never written to disk.</b> It is a credential that can rotate every URL in the estate; requiring it to be re-entered per session is a smaller cost than one sitting in a browser profile on a shared laptop. Plain <code>http</code> is accepted only for a loopback address.</p>`}
    ${c.probe ? `<div class="grid">
      <div><small class="meta">Reachable</small><p>${c.probe.reachable ? badge('yes', 'success') : badge('no', 'danger')}</p></div>
      <div><small class="meta">Token accepted</small><p>${c.probe.authorised ? badge('yes', 'success') : badge('no', 'danger')}</p></div>
      <div><small class="meta">Service version</small><p>${esc(c.probe.version || '—')}</p></div>
      <div><small class="meta">Aliases</small><p>${c.probe.aliases == null ? '—' : c.probe.aliases}</p></div>
    </div>${c.probe.error ? `<p class="meta">${esc(c.probe.error)}</p>` : ''}` : ''}
  </section>
  ${st.connected && c.aliases ? capsuleAliases(c) : ''}
  ${st.connected ? capsuleRegisterPanel() : ''}`;
}

function capsuleAliases(c) {
  return `<section class="panel">
    <h2>Aliases</h2>
    <p class="meta">The registry returns a fingerprint per alias and never the URL. That fingerprint is the point: it can be compared against the SHA-256 of the URL in your own hand, establishing that the two match without either side transmitting it.</p>
    ${table([
      { label: 'Alias', key: 'alias', render: (a) => `<b>${esc(a.alias)}</b>` },
      { label: 'State', key: 'enabled', render: (a) => a.enabled ? badge('enabled', 'success') : badge('disabled', 'danger') },
      { label: 'Version', key: 'activeVersion', render: (a) => String(a.activeVersion ?? '—') },
      { label: 'Identity', key: 'flowIdentity' },
      { label: 'Environment', key: 'environment' },
      { label: 'Contract', key: 'contractVersion' },
      { label: 'Fingerprint', key: 'fingerprint', render: (a) => `<code class="meta">${esc(String(a.fingerprint).slice(0, 16))}…</code>` },
      { label: 'Verified', key: 'verifiedAt', render: (a) => fmtDateTime(a.verifiedAt) },
      { label: '', key: 'x', render: (a) => `<button type="button" class="btn ghost dgo-btn--sm" data-capsule-alias="${esc(a.alias)}">Manage</button>` },
    ], c.aliases, null, { label: 'Registry aliases' })}
  </section>
  ${c.alias ? capsuleAliasDetail(c) : ''}`;
}

function capsuleAliasDetail(c) {
  const a = c.aliases.find((x) => x.alias === c.alias);
  if (!a) return '';
  return `<section class="panel" data-detail>
    <div class="eyebrow">Alias</div>
    <h2>${esc(a.alias)} ${a.enabled ? badge('enabled', 'success') : badge('disabled', 'danger')}</h2>
    <div class="form-row">
      ${actionButton('capsule.verify', { label: 'Verify against the tenant' })}
      ${a.enabled ? actionButton('capsule.disable', { label: 'Disable this alias' }) : actionButton('capsule.enable', { label: 'Enable this alias' })}
    </div>
    ${c.versions
      ? `<h3>Retained versions</h3>
         <p class="meta">Rolling back re-checks the stored URL's integrity and re-verifies its identity against the tenant before activating anything, so a rollback to a version whose flow has since been deleted fails rather than leaving the alias pointing at nothing.</p>
         ${table([
           { label: 'Version', key: 'version', render: (v) => `${v.version}${v.version === a.activeVersion ? ` ${badge('active', 'success')}` : ''}` },
           { label: 'Identity', key: 'flowIdentity' },
           { label: 'Environment', key: 'environment' },
           { label: 'Contract', key: 'contractVersion' },
           { label: 'Fingerprint', key: 'fingerprint', render: (v) => `<code class="meta">${esc(String(v.fingerprint).slice(0, 16))}…</code>` },
           { label: 'Registered by', key: 'createdBy' },
           { label: '', key: 'x', render: (v) => v.version === a.activeVersion ? '' : `<button type="button" class="btn ghost dgo-btn--sm" data-capsule-rollback="${esc(v.version)}" ${can(Permissions.SETTINGS_MANAGE) ? '' : 'disabled'}>Roll back to ${esc(v.version)}</button>` },
         ], c.versions, null, { label: `Retained versions of ${a.alias}` })}`
      : '<p class="meta">Loading versions…</p>'}
  </section>`;
}

function capsuleRegisterPanel() {
  if (!can(Permissions.SETTINGS_MANAGE)) return '';
  return `<section class="panel danger-zone">
    <div class="eyebrow">${badge('affects everyone here', 'warning')}</div>
    <h2>Register or rotate an alias</h2>
    <p>The registry inspects the URL, fingerprints it, verifies it live against the identity you state, and only then activates it as the new version for every caller. The previous version is retained and can be rolled back to. If verification fails, nothing changes.</p>
    <p class="meta">The URL is passed through byte-for-byte, including anything odd about it. The registry fingerprints the exact string it is given, and a client that helpfully trimmed it would produce a stored URL that no longer matches what you copied from Power Automate.</p>
    <form data-capsule-register class="grid">
      <label>Alias<input name="alias" placeholder="dgo.fetch-activities" autocomplete="off" required></label>
      <label>Flow identity<input name="flowIdentity" autocomplete="off" required></label>
      <label>Environment<input name="environment" autocomplete="off" required></label>
      <label>Contract version<input name="contractVersion" autocomplete="off" required></label>
      <label class="wide">Complete signed URL<input name="url" type="password" autocomplete="off" required placeholder="Paste the whole trigger URL, unmodified"></label>
      <div class="wide">${armed('capsule.register', 'Register or rotate')}</div>
    </form>
  </section>`;
}

/* ------------------------------------------------------------------ *
 * People & access
 * ------------------------------------------------------------------ */

function peoplePanel() {
  const s = State.get();
  const users = s.users || [];
  const roleLabel = (id) => RoleList.find((r) => r.id === id)?.label || String(id || '—');

  return `${kpis([
    ['People', String(users.length)],
    ['Active', String(users.filter((u) => u.status !== 'disabled').length)],
    ['Disabled', String(users.filter((u) => u.status === 'disabled').length)],
    ['Roles in use', String(new Set(users.map((u) => u.role)).size)],
    ['Shared accounts', String(users.filter((u) => /^(registry|admin|info|support)@/i.test(u.email || '')).length)],
  ])}
  <section class="panel">
    <h2>Who can sign in</h2>
    <p class="meta">Adding and editing people is done on <a href="#/user-admin">User Administration</a>, which owns that action. This is the read-across: who exists, what their role actually grants, and where an account is recorded without the detail an audit would need.</p>
    ${users.length ? table([
      { label: 'Name', key: 'fullName', render: (u) => esc(u.fullName || '—') },
      { label: 'Email', key: 'email' },
      { label: 'Directorate', key: 'directorate', render: (u) => esc(u.directorate || '—') },
      { label: 'Role', key: 'role', render: (u) => esc(roleLabel(u.role)) },
      { label: 'Access group', key: 'persona', render: (u) => esc(personaLabel(u.persona || RolePersonaMap[u.role] || 'general')) },
      { label: 'Workspaces', key: 'routes', render: (u) => { const xs = RoleRouteAccess[u.role] || []; return xs.includes('*') ? badge('every workspace', 'warn') : String(xs.length); } },
      { label: 'Status', key: 'status', render: (u) => u.status === 'disabled' ? badge('disabled', 'danger') : badge('active', 'success') },
      { label: 'Reason (if disabled)', key: 'disabledReason', render: (u) => u.status === 'disabled' ? (String(u.disabledReason || '').trim() ? esc(u.disabledReason) : badge('none recorded', 'warn')) : '—' },
    ], capRows(users, RenderBudget.tableRows), null, { label: 'People and access' }) : emptyState('No people are enrolled', 'Nobody but the bootstrap administrator can sign in.')}
    <div class="form-row"><a class="btn ghost" href="#/user-admin">Open User Administration</a>${actionButton('people.export', { label: 'Export the access directory' })}</div>
  </section>
  <section class="panel">
    <h2>What each role grants</h2>
    <p class="meta">A role answers from its own row and only from its own row: it grants what is listed and denies everything else. There is no fall-through to an access group.</p>
    ${table([
      { label: 'Role', key: 'label', render: (r) => `<b>${esc(r.label)}</b><br><small class="meta"><code>${esc(r.id)}</code></small>` },
      { label: 'People', key: 'n', render: (r) => String(users.filter((u) => u.role === r.id).length) },
      { label: 'Workspaces', key: 'w', render: (r) => { const xs = RoleRouteAccess[r.id] || []; return xs.includes('*') ? badge('every workspace', 'warn') : `${xs.length}<br><small class="meta">${esc(xs.join(', '))}</small>`; } },
      { label: 'Capabilities', key: 'p', render: (r) => r.permissions.length ? `${r.permissions.length}<br><small class="meta">${esc(r.permissions.join(', '))}</small>` : '<span class="meta">none — read only</span>' },
      { label: 'Admin actions', key: 'a', render: (r) => `${AdminActions.filter((a) => r.permissions.includes(a.permission)).length} of ${AdminActions.length}` },
    ], RoleList, null, { label: 'Role capability matrix' })}
  </section>`;
}

/* ------------------------------------------------------------------ *
 * Platform control
 * ------------------------------------------------------------------ */

function controlPanel() {
  const s = State.get();
  const cache = CacheManager.stats();
  const pending = PendingQueue.stats();
  const receipts = ReceiptLedger.stats();

  return `${kpis([
    ['Queued writes', String(pending.count)],
    ['Cached responses', String(cache.entries)],
    ['Cache hit rate', `${cache.hitRate}%`],
    ['Receipts', String(receipts.count)],
    ['Schema version', String(s.schemaVersion)],
  ])}
  <section class="panel">
    <h2>Registry data</h2>
    <p class="meta">Last load: ${s.runtime?.lastLoad?.ok === true ? `succeeded at ${esc(fmtDateTime(s.runtime.lastLoad.at))}` : s.runtime?.lastLoad?.ok === false ? `<b>FAILED</b> at ${esc(fmtDateTime(s.runtime.lastLoad.at))} — ${esc(String(s.runtime.lastLoad.message || ''))}` : 'not attempted in this session'}</p>
    ${table([
      { label: 'Collection', key: 'k' },
      { label: 'Records', key: 'n' },
    ], [['Activities', s.activities], ['Tasks', s.tracking], ['Correspondence', s.correspondence], ['Comments', s.comments], ['Users', s.users], ['Categories', s.categories], ['Departments', s.departments], ['Emails', s.emails], ['Approvals', s.approvals], ['Dispatches', s.dispatches]].map(([k, v]) => ({ k, n: (v || []).length })), null, { label: 'Loaded collections' })}
    <div class="form-row">${actionButton('platform.reload-data', { label: 'Reload from the registry' })}${actionButton('platform.clear-cache')}</div>
  </section>

  <section class="panel">
    <h2>Queued writes</h2>
    <p class="meta">Writes this device could not deliver. Each is an action somebody performed that has not reached the registry, held here and nowhere else.</p>
    ${pending.count ? table([
      { label: 'Queued', key: 'at', render: (r) => fmtDateTime(r.at) },
      { label: 'Endpoint', key: 'key' },
      { label: 'Operation', key: 'operation', render: (r) => esc(r.operation || '—') },
      { label: 'Reference', key: 'ref', render: (r) => esc(r.ref || '—') },
      { label: 'Retries', key: 'retryCount', render: (r) => String(r.retryCount || 0) },
      { label: 'Last error', key: 'lastError', render: (r) => esc(r.lastError || r.error || '—') },
    ], capRows(s.pending || [], RenderBudget.tableRows), null, { label: 'Queued writes' })
      : emptyState('Nothing is queued', 'Every write this device attempted reached the registry.')}
    <div class="form-row">${actionButton('platform.retry-queue')}</div>
    ${pending.count ? `<div class="panel danger-zone"><h3>Discarding the queue</h3><p>Deletes these writes without sending them. Each one is an action somebody performed that will then never reach the registry, and once this completes there is no record of what they were.</p>${actionButton('platform.flush-queue')}</div>` : ''}
  </section>

  <section class="panel">
    <h2>This device</h2>
    <div class="action-row"><span>Receipt ledger</span><b>${receipts.count} (${receipts.failed} failed)</b></div>
    <div class="action-row"><span>Endpoint overrides</span><b>${Object.keys(overrides()).length}</b></div>
    <div class="action-row"><span>Theme · density</span><b>${esc(s.settings.theme)} · ${esc(s.settings.density)}</b></div>
    <div class="form-row">${actionButton('platform.clear-receipts')}${actionButton('platform.export-state')}<a class="btn ghost" href="#/settings">Open Administration settings</a><a class="btn ghost" href="#/diagnostics">Open System Health</a></div>
    <div class="panel danger-zone"><h3>Clearing this device</h3><p>Removes the profile, settings, loaded lists, queued writes and the local audit copy. Records held in the registry are not deleted. Anything still waiting to be sent is lost.</p>${actionButton('platform.clear-local')}</div>
  </section>`;
}

/* ------------------------------------------------------------------ *
 * Action catalogue
 * ------------------------------------------------------------------ */

function actionsPanel() {
  const cat = catalogueFor(actor(), hasPermission);
  const s = summariseActions(cat);
  const rows = cat.filter((a) => view.actionDomain === 'all' || a.domain === view.actionDomain)
    .filter((a) => !view.q || `${a.id} ${a.label} ${a.detail}`.toLowerCase().includes(view.q.toLowerCase()));

  return `${kpis([
    ['Actions in the catalogue', String(s.total)],
    ['Available to you', String(s.permitted)],
    ['Reach the tenant', String(s.tenantReaching)],
    ['Irreversible', String(s.irreversible)],
    ['Your role', esc(RoleList.find((r) => r.id === actor().role)?.label || actor().role || '—')],
  ])}
  <section class="panel">
    <h2>Every administrative action</h2>
    <p>Each control in this suite is drawn from this table, so an action that exists is listed and an action that is listed exists. The two cannot drift: there is only one record.</p>
    <p class="meta">Actions your role cannot run are shown greyed rather than hidden. An administrator who cannot find a control does not conclude they lack the permission — they conclude the platform cannot do it, and then somebody builds it again.</p>
    <div class="form-row">${chips([{ value: 'all', label: `All ${cat.length}` }, ...DOMAINS.map((d) => ({ value: d.id, label: `${d.label} (${cat.filter((a) => a.domain === d.id).length})` }))], view.actionDomain, 'data-action-domain')}</div>
    <label class="wide">Search actions<input data-q value="${esc(view.q)}" placeholder="e.g. rollback, queue, evidence"></label>
    ${table([
      { label: 'Action', key: 'label', render: (a) => `<b>${esc(a.label)}</b><br><small class="meta"><code>${esc(a.id)}</code></small>` },
      { label: 'Area', key: 'domain', render: (a) => esc(DOMAINS.find((d) => d.id === a.domain)?.label || a.domain) },
      { label: 'Reach', key: 'blast', render: (a) => badge(BLAST_LABEL[a.blast], BLAST_TONE[a.blast]) },
      { label: 'What it does', key: 'detail' },
      { label: 'Needs', key: 'permission', render: (a) => `<code class="meta">${esc(a.permission)}</code>` },
      { label: 'You', key: 'permitted', render: (a) => a.permitted ? badge('may run', 'success') : badge('not permitted', 'pending') },
    ], rows, null, { label: 'Administrative action catalogue' })}
    <p class="meta">${rows.length} of ${cat.length} shown. <b>Reach</b> is the column that matters: ${BLAST_LABEL.device} means this browser and nobody else's; ${BLAST_LABEL.estate} means everyone using this deployment; ${BLAST_LABEL.irreversible} means there is no undo and no copy.</p>
  </section>`;
}

/* ------------------------------------------------------------------ *
 * Audit & evidence
 * ------------------------------------------------------------------ */

function evidencePanel() {
  if (!can(Permissions.AUDIT_VIEW)) {
    return `<section class="panel">${emptyState('The audit trail needs audit:view', 'Your role does not include reading the audit trail. Nothing here is hidden from you by mistake.')}</section>`;
  }
  const events = AuditLog.query({}).filter((e) => !view.q || `${e.event} ${e.ref} ${e.actor?.email || ''}`.toLowerCase().includes(view.q.toLowerCase()));
  const admin = events.filter((e) => String(e.event).startsWith('audit:admin-'));

  return `${kpis([
    ['Events in this session', String(AuditLog.query({}).length)],
    ['Administrative', String(admin.length)],
    ['Distinct actors', String(new Set(events.map((e) => e.actor?.email).filter(Boolean)).size)],
    ['Stored on this device', String((State.get().audit || []).length)],
  ])}
  <section class="panel">
    <h2>Audit trail</h2>
    <p class="meta">Every governed action recorded in this session, plus everything hydrated from stored state. An administrative action that succeeded and left no trace is indistinguishable from one that never happened, so each one here is recorded before it is dispatched and again when it settles — including when it fails.</p>
    <label class="wide">Search events<input data-q value="${esc(view.q)}" placeholder="e.g. capsule, override, user"></label>
    ${events.length ? table([
      { label: 'At', key: 'at', render: (e) => fmtDateTime(e.at) },
      { label: 'Event', key: 'event', render: (e) => `<code>${esc(e.event)}</code>` },
      { label: 'Phase', key: 'phase', render: (e) => e.phase ? badge(e.phase, e.phase === 'failed' ? 'danger' : e.phase === 'completed' ? 'success' : '') : '—' },
      { label: 'Actor', key: 'actor', render: (e) => esc(e.actor?.email || e.actor?.name || '—') },
      { label: 'Reference', key: 'ref', render: (e) => esc(e.ref || '—') },
      { label: 'Detail', key: 'meta', render: (e) => esc(JSON.stringify(e.meta || {}).slice(0, 160)) },
    ], capRows(events, RenderBudget.tableRows), null, { label: 'Audit trail' })
      : emptyState('No audit events yet', 'Nothing governed has happened in this session.')}
    <div class="form-row">${actionButton('evidence.export-audit')}${actionButton('evidence.export-bundle')}</div>
  </section>`;
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

function bodyFor() {
  switch (view.section) {
    case 'estate': return estatePanel();
    case 'checks': return checksPanel();
    case 'shapes': return shapesPanel();
    case 'runbook': return runbookPanel();
    case 'capsule': return capsulePanel();
    case 'people': return peoplePanel();
    case 'control': return controlPanel();
    case 'actions': return actionsPanel();
    case 'evidence': return evidencePanel();
    default: return overviewPanel();
  }
}

let host = null;

function render() {
  if (!host) return;
  const u = actor();
  if (view.printing) {
    host.innerHTML = printView(OpsRunbookDefinition, runbookState());
    host.querySelector('[data-do-print]')?.addEventListener('click', () => window.print());
    host.querySelector('[data-close-print]')?.addEventListener('click', () => { view.printing = false; render(); });
    return;
  }
  host.innerHTML = `<div class="workspace">
    ${head('Admin Suite', 'One interface for the endpoint estate, the flow catalogue, commissioning, the capsule registry, people, and this platform\'s own controls.', 'Administration')}
    ${sectionNav()}
    ${bodyFor()}
    <section class="panel">
      <p class="meta">Signed in as ${esc(u.fullName || u.email || '—')} · ${esc(RoleList.find((r) => r.id === u.role)?.label || u.role || '—')}. Every action taken here is recorded against you. No signature is ever displayed on any section of this screen.</p>
    </section>
  </div>`;
  wire();
}

/* ------------------------------------------------------------------ *
 * Behaviour
 * ------------------------------------------------------------------ */

function download(name, payload) {
  /* The type is chosen from the extension, not fixed. A CSV served as application/json is a file
     the operating system hands to a text editor instead of a spreadsheet, which defeats the one
     reason these tables exist. */
  const csv = /\.csv$/i.test(name);
  const blob = new Blob([typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)],
    { type: csv ? 'text/csv;charset=utf-8' : 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

/** Everything the suite knows, in one artefact, redacted throughout. */
function evidenceBundle() {
  const s = runbookState();
  return {
    schema: 'dgo-admin-evidence/v1',
    generatedAt: new Date().toISOString(),
    generatedBy: { name: actor().fullName || '', email: actor().email || '', role: actor().role || '' },
    estate: exportReport({ resolve }),
    flowShapes: { authority: Shapes.authority(), totals: Shapes.totals(), findings: Shapes.shapeFindings() },
    probes: view.probe ? { label: view.probe.label, at: view.probe.at, rows: view.probe.rows, summary: HealthContract.summariseProbes(view.probe.rows) } : null,
    commissioning: OpsRunbook.exportRunbook(OpsRunbookDefinition, s, { actor: actor() }),
    audit: AuditLog.query({}),
    note: 'Every address in this bundle is redacted and no signature is present. It is written to be safe to attach to a change record.',
  };
}

async function dispatch(id) {
  const a = actionById(id);
  if (!a) return;
  const opts = { actor: actor(), hasPermission, ref: id };

  if (a.confirm && a.blast !== BLAST.IRREVERSIBLE && !await confirmAction({ title: a.label, body: `<p>${esc(a.confirm)}</p>` })) return;

  try {
    await runAction(id, () => perform(id), opts);
  } catch (e) {
    toast(String(e?.message || e), 'error');
  }
  view.typed[id] = '';
  render();
}

async function perform(id) {
  const D = OpsRunbookDefinition;
  switch (id) {
    case 'estate.health-contract':
    case 'estate.identity-verify':
    case 'estate.read-probe': {
      const probe = id === 'estate.identity-verify' ? 'identityVerify' : id === 'estate.read-probe' ? 'readOnlyCall' : 'healthContract';
      const label = id === 'estate.identity-verify' ? 'Identity handshake' : id === 'estate.read-probe' ? 'Read-only call' : 'Non-destructive health check';
      const targets = describeEstate({ resolve })
        .filter((r) => probe !== 'readOnlyCall' || EndpointContracts[r.key]?.readOnly === true)
        .map((r) => ({
          key: r.key,
          url: resolve(r.key),
          contract: EndpointContracts[r.key] ? EndpointRegistry.contract(r.key) : null,
          expected: { flowIdentity: r.expected?.flow || '' },
        }));
      view.probeBusy = true;
      render();
      let rows;
      try { rows = await HealthContract.runProbes(targets, { probe }); }
      finally {
        /* Cleared in a finally, because a probe that threw and left this set would leave the
           screen reporting work that is not happening, with the buttons that would restart it
           disabled. */
        view.probeBusy = false;
      }
      view.probe = { label, at: new Date().toISOString(), rows };
      const s = HealthContract.summariseProbes(rows);
      toast(s.conclusive ? `${s.healthy} of ${s.attempted} healthy` : 'Nothing reached the tenant — this measured the network, not the estate', s.conclusive && s.healthy === s.attempted ? 'success' : 'error');
      return rows;
    }
    case 'estate.override-set': return saveOverrides();
    case 'estate.override-clear': {
      State.patch({ settings: { ...State.get().settings, endpoints: {} } }, { module: 'admin-suite', action: 'endpoint-override-clear', event: 'audit:admin-endpoint-override-cleared' });
      toast('Every override on this device was cleared. Each connection now uses the installed address.', 'success');
      return true;
    }
    case 'estate.export': {
      download(`dgo-endpoint-estate-${stamp()}.json`, exportReport({ resolve }));
      toast('Downloaded. Every signature is replaced by ***, so it is safe to send to support.', 'success');
      return true;
    }
    case 'flows.export-alignment': {
      const flow = selectedFlow();
      let body = {};
      try { body = JSON.parse(view.body || '{}'); } catch { /* reported in the report itself */ }
      download(`dgo-alignment-${flow?.workflowId || 'flow'}-${stamp()}.json`, Shapes.alignmentReport(flow, body));
      toast('Alignment report downloaded.', 'success');
      return true;
    }
    case 'flows.send': return sendComposed();
    case 'flows.example': {
      const flow = selectedFlow();
      const trigger = httpTrigger(flow);
      const example = Shapes.exampleFor(trigger);
      view.body = JSON.stringify(example, null, 2);
      /* The form is filled from the example too, so the two halves of the composer agree —
         leaving the form empty beside a populated body is how an operator edits one and sends
         the other. */
      view.compose = Object.fromEntries(Object.entries(example)
        .map(([k, v]) => [k, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)]));
      const check = Shapes.validateRequest(flow, example);
      toast(check.checked && !check.conforms
        ? `An example was filled in, and it does not satisfy this flow's own schema — ${check.errors.length} problem(s). That is a defect in the exported definition, not in what you typed.`
        : 'An example request was filled in. Replace the placeholder values with real ones before sending.',
      check.checked && !check.conforms ? 'error' : 'success');
      return example;
    }
    case 'flows.curl': {
      const flow = selectedFlow();
      const key = EndpointAtlas.keys.find((k) => k.workflowId === flow?.workflowId);
      let body = {};
      try { body = JSON.parse(view.body || '{}'); } catch { /* rendered as-is; the command shows what is there */ }
      view.curl = Shapes.toCurl(flow, body, { url: key ? resolve(key.key) : '' });
      try {
        await navigator.clipboard?.writeText(view.curl);
        toast('Copied. The signature is redacted, so replace the *** before running it.', 'success');
      } catch {
        toast('Shown below — this browser refused clipboard access, so copy it by hand. The signature is redacted.', 'info');
      }
      return view.curl;
    }
    case 'flows.export-tables': {
      const at = stamp();
      download(`dgo-flow-summary-${at}.csv`, Shapes.flowSummaryCsv());
      download(`dgo-request-fields-${at}.csv`, Shapes.requestFieldsCsv());
      download(`dgo-response-actions-${at}.csv`, Shapes.responseActionsCsv());
      download(`dgo-mail-actions-${at}.csv`, Shapes.mailActionsCsv());
      download(`dgo-endpoint-keys-${at}.csv`, Shapes.endpointKeysCsv({ keys: EndpointAtlas.keys, resolve }));
      toast('Five tables downloaded. None carries an endpoint URL or a signature.', 'success');
      return true;
    }
    case 'runbook.print': {
      view.printing = true;
      return true;
    }
    case 'runbook.import': {
      const r = view.importReport;
      if (!r || r.errors.length || !r.state) throw new Error('Choose a record file first — nothing has been read.');
      State.patch({ adminRunbook: r.state }, { module: 'admin-suite', action: 'runbook-import', event: 'audit:admin-runbook-imported', ref: r.fileName });
      view.importReport = null;
      toast(`Restored from ${r.fileName}.${r.warnings.length ? ` ${r.warnings.length} warning(s) — read them on the Release gate tab.` : ''}`, 'success');
      return true;
    }
    case 'runbook.export': {
      download(`dgo-commissioning-${stamp()}.json`, OpsRunbook.exportRunbook(D, runbookState(), { actor: actor() }));
      toast('Commissioning record downloaded.', 'success');
      return true;
    }
    case 'runbook.reset': {
      State.patch({ adminRunbook: OpsRunbook.blankState(D) }, { module: 'admin-suite', action: 'runbook-reset', event: 'audit:admin-runbook-reset' });
      toast('The commissioning record was reset. Every answer, status and piece of evidence is gone.', 'info');
      return true;
    }
    case 'capsule.verify': {
      const out = await CapsuleClient.verify(view.capsule.alias);
      toast(out?.verified ? `${view.capsule.alias} verified against the tenant.` : `${view.capsule.alias} did not verify.`, out?.verified ? 'success' : 'error');
      return refreshCapsule();
    }
    case 'capsule.enable':
    case 'capsule.disable': {
      await CapsuleClient.setEnabled(view.capsule.alias, id === 'capsule.enable');
      toast(`${view.capsule.alias} is now ${id === 'capsule.enable' ? 'enabled' : 'disabled'} for every caller of this registry.`, 'success');
      return refreshCapsule();
    }
    case 'capsule.rollback': {
      const version = view.capsule.rollbackTo;
      const out = await CapsuleClient.rollback(view.capsule.alias, version);
      toast(`${view.capsule.alias} is now serving version ${out?.activeVersion ?? version}.`, 'success');
      return refreshCapsule();
    }
    case 'capsule.register': return registerCapsuleAlias();
    case 'people.export': {
      download(`dgo-access-directory-${stamp()}.json`, {
        schema: 'dgo-access-directory/v1',
        generatedAt: new Date().toISOString(),
        roles: RoleList.map((r) => ({ id: r.id, label: r.label, permissions: r.permissions, workspaces: RoleRouteAccess[r.id] || [] })),
        people: (State.get().users || []).map((u) => ({ fullName: u.fullName, email: u.email, directorate: u.directorate, role: u.role, persona: u.persona, status: u.status, disabledReason: u.disabledReason || '' })),
      });
      toast('Access directory downloaded.', 'success');
      return true;
    }
    case 'platform.reload-data': {
      await loadRuntimeData();
      toast('Reloaded from the registry.', 'success');
      return true;
    }
    case 'platform.clear-cache': {
      const n = CacheManager.clear();
      toast(`${n} cached response(s) cleared. The next read of each collection goes to the registry.`, 'success');
      return n;
    }
    case 'platform.retry-queue': {
      const { OfflineActionQueue } = await import('../core/offline-action-queue.js');
      const r = await OfflineActionQueue.retryAckQueue();
      toast(`${r.ok} sent, ${r.fail} still failing.`, r.fail ? 'error' : 'success');
      return r;
    }
    case 'platform.flush-queue': {
      const n = (State.get().pending || []).length;
      PendingQueue.clear();
      toast(`${n} queued write(s) discarded without being sent.`, 'info');
      return n;
    }
    case 'platform.clear-receipts': {
      ReceiptLedger.clear();
      toast('Receipt ledger cleared on this device. The registry\'s copy is untouched.', 'success');
      return true;
    }
    case 'platform.export-state': {
      const s = State.get();
      download(`dgo-device-state-${stamp()}.json`, {
        schema: 'dgo-device-state/v1',
        generatedAt: new Date().toISOString(),
        schemaVersion: s.schemaVersion,
        profile: s.profile,
        settings: { ...s.settings, endpoints: Object.fromEntries(Object.entries(s.settings.endpoints || {}).map(([k, v]) => [k, EndpointFormation.mask(v)])) },
        counts: Object.fromEntries(['activities', 'tracking', 'correspondence', 'comments', 'users', 'categories', 'departments', 'emails', 'pending'].map((k) => [k, (s[k] || []).length])),
        runtime: s.runtime,
      });
      toast('Device state downloaded. Endpoint overrides are redacted.', 'success');
      return true;
    }
    case 'platform.clear-local': {
      State.reset();
      toast('This device\'s saved data was cleared. Reloading…', 'success');
      setTimeout(() => location.reload(), 250);
      return true;
    }
    case 'evidence.export-audit': {
      download(`dgo-audit-${stamp()}.json`, { schema: 'dgo-audit-trail/v1', generatedAt: new Date().toISOString(), events: AuditLog.query({}) });
      toast('Audit trail downloaded.', 'success');
      return true;
    }
    case 'evidence.export-bundle': {
      download(`dgo-evidence-bundle-${stamp()}.json`, evidenceBundle());
      toast('Evidence bundle downloaded. Signatures are redacted throughout.', 'success');
      return true;
    }
    default: return true;
  }
}

function saveOverrides() {
  const form = host.querySelector('[data-overrides]');
  if (!form) return false;
  const next = {};
  const problems = [];
  for (const key of EndpointKeys) {
    const field = form.elements[key];
    if (!field) continue;
    const value = String(field.value || '').trim();
    field.removeAttribute('aria-invalid');
    if (!value) continue;
    const verdict = validateOverride(key, value);
    if (!verdict.ok) { problems.push({ key, issues: verdict.issues }); field.setAttribute('aria-invalid', 'true'); continue; }
    next[key] = value;
  }
  if (problems.length) {
    toast(`${problems.length} address${problems.length === 1 ? '' : 'es'} were refused. ${problems[0].key}: ${problems[0].issues[0]}`, 'error');
    const err = new Error(`${problems.length} address(es) failed validation.`);
    err.problems = problems;
    throw err;
  }
  State.patch({ settings: { ...State.get().settings, endpoints: next } }, { module: 'admin-suite', action: 'endpoint-override', event: 'audit:admin-endpoint-override' });
  toast(`${Object.keys(next).length} override(s) saved — on this device only.`, 'success');
  return next;
}

async function sendComposed() {
  const flow = selectedFlow();
  const key = EndpointAtlas.keys.find((k) => k.workflowId === flow?.workflowId);
  const url = key ? resolve(key.key) : '';
  if (!url) throw new Error('No address resolves for that contract key in this deployment.');

  let body;
  try { body = JSON.parse(view.body || '{}'); }
  catch (e) { throw new Error(`The request body is not valid JSON: ${e.message}`); }

  const report = Shapes.alignmentReport(flow, body);
  if (report.checked && !report.conforms) throw new Error('The payload does not match the trigger schema. It was not sent.');

  const trigger = httpTrigger(flow);
  const started = Date.now();
  const record = { at: new Date().toISOString(), flow: flow.name, key: key.key, conformed: report.conforms, alignment: report, status: null, ok: false, ms: null, error: '' };
  try {
    const res = await fetch(url, {
      method: trigger?.method || 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    record.status = res.status;
    record.ok = res.ok;
    record.ms = Date.now() - started;
    const text = await res.text();
    try { record.body = JSON.parse(text); } catch { record.body = text.slice(0, 500); record.nonJson = true; }
    toast(res.ok ? `${key.key} answered ${res.status} in ${record.ms} ms.` : `${key.key} answered ${res.status}.`, res.ok ? 'success' : 'error');
  } catch (e) {
    record.error = String(e?.message || e);
    record.ms = Date.now() - started;
    toast(`The request did not complete: ${record.error}`, 'error');
  }
  view.sent = [record, ...view.sent].slice(0, 100);
  return record;
}

async function refreshCapsule() {
  view.capsule.probe = await CapsuleClient.probe();
  if (view.capsule.probe.authorised) {
    view.capsule.aliases = await CapsuleClient.listFlows();
    if (view.capsule.alias) view.capsule.versions = await CapsuleClient.versions(view.capsule.alias);
  }
  return view.capsule.probe;
}

async function registerCapsuleAlias() {
  const form = host.querySelector('[data-capsule-register]');
  if (!form) return false;
  const d = Object.fromEntries(new FormData(form));
  const out = await CapsuleClient.register({
    alias: String(d.alias || '').trim(),
    url: String(d.url || ''),
    flowIdentity: String(d.flowIdentity || '').trim(),
    environment: String(d.environment || '').trim(),
    contractVersion: String(d.contractVersion || '').trim(),
  });
  toast(`${out.alias} is now serving version ${out.activeVersion}. The previous version is retained.`, 'success');
  form.reset();
  return refreshCapsule();
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

function wire() {
  const q = (sel) => host.querySelectorAll(sel);

  q('[data-section]').forEach((b) => b.addEventListener('click', () => { view.section = b.dataset.section; view.q = ''; render(); }));
  q('[data-surface]').forEach((b) => b.addEventListener('click', () => { view.estateSurface = b.dataset.surface; render(); }));
  q('[data-estate-status]').forEach((b) => b.addEventListener('click', () => { view.estateStatus = b.dataset.estateStatus; render(); }));
  q('[data-flow-tab]').forEach((b) => b.addEventListener('click', () => { view.flowTab = b.dataset.flowTab; render(); }));
  q('[data-runbook-tab]').forEach((b) => b.addEventListener('click', () => { view.runbookTab = b.dataset.runbookTab; view.runbookAction = ''; render(); }));
  q('[data-stage]').forEach((b) => b.addEventListener('click', () => { view.runbookStage = b.dataset.stage; render(); }));
  q('[data-action-domain]').forEach((b) => b.addEventListener('click', () => { view.actionDomain = b.dataset.actionDomain; render(); }));

  q('[data-open-flow]').forEach((el) => el.addEventListener('click', () => {
    view.flowId = el.dataset.openFlow;
    view.section = 'shapes';
    view.flowTab = 'shape';
    view.compose = {};
    view.body = '';
    render();
  }));
  q('[data-runbook-action]').forEach((el) => el.addEventListener('click', () => { view.runbookAction = el.dataset.runbookAction; render(); }));
  q('[data-acceptance]').forEach((el) => el.addEventListener('click', () => { view.runbookAction = el.dataset.acceptance; render(); }));

  /* The search box is re-rendered on every keystroke, so the caret has to be put back where it
     was. Re-rendering the whole section per character is the cost of a single render path; the
     alternative is a second, partial update path that can disagree with the first. */
  const search = host.querySelector('[data-q]');
  if (search) {
    search.addEventListener('input', () => {
      const pos = search.selectionStart;
      view.q = search.value;
      render();
      const next = host.querySelector('[data-q]');
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    });
  }

  q('[data-typed]').forEach((el) => el.addEventListener('input', () => {
    const pos = el.selectionStart;
    view.typed[el.dataset.typed] = el.value;
    render();
    const next = host.querySelector(`[data-typed="${CSS.escape(el.dataset.typed)}"]`);
    if (next) { next.focus(); next.setSelectionRange(pos, pos); }
  }));

  q('[data-act]').forEach((b) => b.addEventListener('click', () => dispatch(b.dataset.act)));

  q('[data-compose]').forEach((el) => el.addEventListener('input', () => {
    const pos = el.selectionStart;
    view.compose[el.dataset.compose] = el.value;
    const trigger = httpTrigger(selectedFlow());
    view.body = JSON.stringify(Shapes.composeBody(trigger || {}, view.compose), null, 2);
    render();
    const next = host.querySelector(`[data-compose="${CSS.escape(el.dataset.compose)}"]`);
    if (next) { next.focus(); next.setSelectionRange(pos, pos); }
  }));

  const bodyBox = host.querySelector('[data-body]');
  if (bodyBox) {
    bodyBox.addEventListener('input', () => { view.body = bodyBox.value; });
    bodyBox.addEventListener('change', () => { view.body = bodyBox.value; render(); });
  }

  host.querySelector('[data-clear-probe]')?.addEventListener('click', () => { view.probe = null; render(); });
  host.querySelector('[data-download-probe]')?.addEventListener('click', () => {
    download(`dgo-probe-${stamp()}.json`, { schema: 'dgo-endpoint-probe/v1', ...view.probe, summary: HealthContract.summariseProbes(view.probe.rows) });
  });
  host.querySelector('[data-download-sent]')?.addEventListener('click', () => {
    download(`dgo-sent-requests-${stamp()}.json`, { schema: 'dgo-sent-requests/v1', generatedAt: new Date().toISOString(), requests: view.sent });
  });

  host.querySelector('[data-runbook-form]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const id = form.dataset.actionId;
    const d = Object.fromEntries(new FormData(form));
    const D = OpsRunbookDefinition;
    const current = runbookState();
    const evidence = String(d.evidence || '').trim();

    /* Evidence is attached before the status is judged. Typing a run id and selecting Resolved
       in one gesture is one intention, and refusing it because the evidence was not saved in a
       previous submission would be a rule about form mechanics, not about evidence. */
    const staged = OpsRunbook.hydrate(D, current);
    staged.actions[id] = { ...staged.actions[id], note: String(d.note || ''), owner: String(d.owner || '') };
    if (evidence) staged.actions[id].evidence = [...(staged.actions[id].evidence || []), { text: evidence, by: actor().email || actor().fullName || '', at: new Date().toISOString() }];

    const next = String(d.status || staged.actions[id].status);
    const verdict = OpsRunbook.canSetStatus(D, staged, id, next);
    if (next !== staged.actions[id].status && !verdict.allowed) { toast(verdict.reason, 'error'); return; }

    patchRunbook((s) => {
      s.actions[id] = { ...staged.actions[id], status: next, at: new Date().toISOString() };
      if (!s.startedAt) s.startedAt = new Date().toISOString();
    }, { action: 'runbook-status', event: 'audit:admin-runbook-status', ref: id });
    toast(`${id} recorded as ${STATUS_LABEL[next]}.`, 'success');
    render();
  });

  host.querySelector('[data-params]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    patchRunbook((s) => {
      for (const p of OpsRunbookDefinition.parameters) {
        if (p.locked) continue;
        if (d[p.id] !== undefined) s.parameters[p.id] = String(d[p.id]).trim();
      }
    }, { action: 'runbook-parameters', event: 'audit:admin-runbook-parameter' });
    const check = OpsRunbook.validateParameters(OpsRunbookDefinition, runbookState());
    toast(check.missing.length ? `Saved. ${check.missing.length} mandatory value(s) still unanswered.` : 'Saved. Every mandatory value is answered.', check.missing.length ? 'info' : 'success');
    render();
  });

  host.querySelector('[data-acceptance-form]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const id = form.dataset.acceptanceId;
    const d = Object.fromEntries(new FormData(form));
    const evidence = String(d.evidence || '').trim();
    patchRunbook((s) => {
      const rec = s.acceptance[id] || { fields: {}, evidence: [] };
      rec.status = String(d.status || rec.status);
      rec.fields = { ...rec.fields };
      for (const [k, v] of Object.entries(d)) { if (k !== 'status' && k !== 'evidence') rec.fields[k] = String(v).trim(); }
      if (evidence) rec.evidence = [...(rec.evidence || []), { text: evidence, by: actor().email || '', at: new Date().toISOString() }];
      s.acceptance[id] = rec;
    }, { action: 'runbook-acceptance', event: 'audit:admin-runbook-acceptance', ref: id });
    const complete = OpsRunbook.acceptanceComplete(OpsRunbookDefinition, runbookState(), id);
    toast(complete ? `${id} recorded, with the full evidence set.` : `${id} recorded. It does not yet carry everything a pass requires.`, complete ? 'success' : 'info');
    render();
  });

  host.querySelector('[data-risk-form]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (!String(d.title || '').trim() || !String(d.acceptedBy || '').trim() || !String(d.basis || '').trim()) {
      toast('A residual risk needs what is being accepted, who accepted it, and on what basis. An accepted risk with no rationale is an unrecorded decision.', 'error');
      return;
    }
    patchRunbook((s) => {
      s.risks = [{ id: `RISK-${Date.now().toString(36)}`, title: String(d.title).trim(), acceptedBy: String(d.acceptedBy).trim(), basis: String(d.basis).trim(), status: 'OPEN', at: new Date().toISOString() }, ...(s.risks || [])];
    }, { action: 'runbook-risk', event: 'audit:admin-runbook-risk-accepted' });
    toast('Residual risk recorded. The release gate does not clear while it is open.', 'info');
    render();
  });

  q('[data-close-risk]').forEach((b) => b.addEventListener('click', () => {
    patchRunbook((s) => {
      s.risks = (s.risks || []).map((r) => r.id === b.dataset.closeRisk ? { ...r, status: r.status === 'CLOSED' ? 'OPEN' : 'CLOSED' } : r);
    }, { action: 'runbook-risk-state', event: 'audit:admin-runbook-risk-accepted', ref: b.dataset.closeRisk });
    render();
  }));

  q('[data-cutover]').forEach((box) => box.addEventListener('change', () => {
    const name = box.dataset.cutover;
    patchRunbook((s) => {
      if (name === 'hypercareActive') s.hypercare.active = box.checked;
      else s.cutover[name] = box.checked;
      s.cutover.status = Object.entries(s.cutover).filter(([k]) => k !== 'status' && k !== 'evidence').every(([, v]) => v) ? 'COMPLETE' : 'IN_PROGRESS';
    }, { action: 'runbook-cutover', event: 'audit:admin-runbook-status', ref: name });
    render();
  }));

  host.querySelector('[data-hypercare]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    patchRunbook((s) => { s.hypercare = { ...s.hypercare, dailyReview: String(d.dailyReview || '').trim(), escalationRoute: String(d.escalationRoute || '').trim(), exitCriteria: String(d.exitCriteria || '').trim() }; },
      { action: 'runbook-hypercare', event: 'audit:admin-runbook-status' });
    toast('Hypercare saved.', 'success');
    render();
  });

  host.querySelector('[data-capsule-connect]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await runAction('capsule.connect', async () => {
        CapsuleClient.connect({ baseUrl: String(d.baseUrl || ''), token: String(d.token || '') });
        await refreshCapsule();
      }, { actor: actor(), hasPermission, ref: String(d.baseUrl || '') });
      const p = view.capsule.probe;
      toast(p?.authorised ? `Connected. ${p.aliases} alias(es).` : p?.reachable ? 'The registry answered, and the token was refused.' : 'The registry did not answer.', p?.authorised ? 'success' : 'error');
    } catch (err) {
      CapsuleClient.disconnect();
      toast(String(err?.message || err), 'error');
    }
    render();
  });

  host.querySelector('[data-capsule-disconnect]')?.addEventListener('click', () => {
    CapsuleClient.disconnect();
    view.capsule = { probe: null, aliases: null, versions: null, alias: '', busy: false };
    toast('Disconnected. The token was never written to disk and is now gone from this tab.', 'success');
    render();
  });
  host.querySelector('[data-capsule-refresh]')?.addEventListener('click', async () => {
    try { await refreshCapsule(); } catch (e) { toast(String(e?.message || e), 'error'); }
    render();
  });
  q('[data-capsule-alias]').forEach((b) => b.addEventListener('click', async () => {
    view.capsule.alias = b.dataset.capsuleAlias;
    try { view.capsule.versions = await CapsuleClient.versions(view.capsule.alias); }
    catch (e) { view.capsule.versions = []; toast(String(e?.message || e), 'error'); }
    render();
  }));
  host.querySelector('[data-pick-runbook]')?.addEventListener('click', () => host.querySelector('[data-runbook-file]')?.click());
  host.querySelector('[data-runbook-file]')?.addEventListener('change', async (e) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    try {
      const bundle = JSON.parse(await file.text());
      const result = OpsRunbook.importRunbook(OpsRunbookDefinition, bundle);
      const m = result.ok ? OpsRunbook.metrics(OpsRunbookDefinition, result.state) : null;
      view.importReport = {
        fileName: file.name,
        errors: result.errors,
        warnings: result.warnings,
        state: result.ok ? result.state : null,
        summary: m
          ? `${m.closed} of ${m.actions} actions closed · ${m.acceptanceAccepted} of ${m.acceptanceTotal} endpoints evidenced · ${m.missingParameters} parameter(s) unanswered · ${m.openRisks} open risk(s).`
          : '',
      };
    } catch (err) {
      /* The parser's own message is dropped: "Unexpected token o in JSON at position 1" tells an
         operator nothing they can act on, and it is recorded in the audit trail either way. */
      view.importReport = { fileName: file.name, errors: [{ code: 'not-json', message: 'That file is not readable as JSON. It must be a record exported from this runbook.' }], warnings: [], state: null, summary: '' };
    } finally {
      e.currentTarget.value = '';
      render();
    }
  });

  q('[data-capsule-rollback]').forEach((b) => b.addEventListener('click', () => {
    view.capsule.rollbackTo = Number(b.dataset.capsuleRollback);
    dispatch('capsule.rollback');
  }));
}

/* ------------------------------------------------------------------ *
 * Mount
 * ------------------------------------------------------------------ */

export async function mount(el) {
  hydrateGovernance();
  host = el;
  /* A deep link opens the section it names: `/?section=capsule#/admin-suite`.
     The section rides on the PAGE query string and not on the hash, because the hash is the
     route and core/router.js reads all of it: `#/admin-suite?section=capsule` is not the path
     `admin-suite`, it is an unregistered path, and the router correctly answers "Workspace not
     found". `#/admin-suite` alone opens the overview, which is the right default for the screen
     an administrator reaches when something is wrong and they do not yet know what. */
  const section = new URLSearchParams(location.search).get('section');
  if (section && SECTIONS.some(([id]) => id === section)) view.section = section;
  render();
}

export const AdminSuiteSections = SECTIONS.map(([id]) => id);
