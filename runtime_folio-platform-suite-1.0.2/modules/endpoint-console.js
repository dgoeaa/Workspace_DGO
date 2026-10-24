// DGO R11.6 — Endpoint Console.
//
// The administrative console for the whole endpoint estate: every contract key on both
// surfaces, every workflow in the tenant, what each is doing, what is wrong with it, and the
// controls to change it.
//
// WHY THIS EXISTS RATHER THAN MORE PANELS ON THE SCREENS THAT WERE ALREADY THERE
//
// Two screens touched endpoints before this one, and between them they covered less than they
// appeared to:
//
//   · System Health counted "Endpoints configured n/n" from `EndpointKeys` — 19 entries. The
//     estate has 25 contract keys. The seven portal keys were in neither the count nor the
//     view, and SCAN_INTAKE is absent from the contract table, so the count can read a
//     complete green while that key is unconfigured and registry scanning is dead.
//   · Administration offered a text box per key. It could change an address; it could not say
//     whether the address was the right one, because nothing in the browser knew which flow a
//     key was supposed to call.
//
// The tenant's register changed that. `config/endpoint-atlas.data.js` — generated from it by
// `npm run reconcile` — states which of the 51 workflows each of the 25 keys must call. That
// makes a class of fault visible for the first time: a URL that is present, HTTPS, correctly
// signed and pointing at the wrong flow. It fails nothing. It succeeds against the wrong flow,
// which is why no check written before the register could catch it, and why the first tab here
// is Findings rather than a list of green ticks.
//
// It is also why the estate view shows all 51 workflows and not just the 20 in use: 14 of them
// carry a contract-key name while serving nothing, and 8 of those still answer. Wiring by name
// is a mistake this tenant is actively set up to reward.
//
// WHAT IT WILL NOT DO
//
//   · It never displays a signature. Everything on screen comes through
//     `EndpointRegistry.redact()`, and the export is redacted by construction. This is
//     asserted on the rendered HTML in tests/endpoint-console.test.mjs, not merely intended.
//   · It does not invoke write endpoints. The health probe calls read-only contracts only,
//     because a console that can dispatch correspondence as a side effect of a health check is
//     not a console.
//   · It changes nothing without a confirmation that names the consequence, and every change
//     is audited.
//
// SCOPE OF A CHANGE MADE HERE. An override is stored in this browser's state, for this device.
// That is a repair tool, not estate management: the estate is configured by
// `npm run setup -- --values <file> --force` and shipped by `npm run package`. The
// Configuration tab says so where the controls are, because an administrator who believes they
// have fixed the estate from one laptop has been misled by the interface.

import { State } from '../core/state.js';
import { EndpointRegistry } from '../core/endpoint-registry.js';
import { EndpointKeys, EndpointContracts } from '../config/endpoints.config.js';
import { EndpointAtlas } from '../config/endpoint-atlas.data.js';
import {
  describeEstate, describeKey, findings, summarise, exportReport, SEVERITY, SIGNATURE_LENGTH,
} from '../core/endpoint-atlas.js';
import { getCurrentUser, hasPermission } from '../core/current-user.js';
import { Permissions } from '../config/rbac.config.js';
import { AuditLog } from '../core/audit-log.js';
import { hydrateGovernance } from '../core/governed-actions.js';
import { head, kpis, esc, badge, table, chips, emptyState, toast, confirmAction, fmtDateTime } from '../core/ui.js';

/* ------------------------------------------------------------------ *
 * View state — deliberately not in State.
 *
 * Which tab is open and what is typed in a filter are not facts about the estate, and putting
 * them in the audited application state would make "the administrator looked at the portal tab"
 * an entry in the same log as "the administrator changed an endpoint address".
 * ------------------------------------------------------------------ */
const view = { tab: 'findings', surface: 'all', status: 'all', q: '', estateFilter: 'all', probe: null, busy: false };

const TABS = [
  ['findings', 'Findings'],
  ['keys', 'Endpoints'],
  ['estate', 'Flow estate'],
  ['health', 'Live health'],
  ['config', 'Configuration'],
  ['reference', 'Reference'],
];

const overrides = () => State.get().settings?.endpoints || {};
const resolve = (key) => EndpointRegistry.url(key, { overrides: overrides() });

const STATUS_TONE = {
  'ok': 'success', 'shares-flow': '', 'unconfigured': 'pending',
  'wrong-flow': 'danger', 'no-signature': 'danger', 'bad-signature': 'danger',
  'not-https': 'danger', 'placeholder': 'warn', 'no-contract': 'warn',
};
const STATUS_LABEL = {
  'ok': 'healthy', 'unconfigured': 'not configured', 'wrong-flow': 'WRONG FLOW',
  'no-signature': 'no signature', 'bad-signature': 'bad signature', 'not-https': 'not HTTPS',
  'placeholder': 'placeholder', 'no-contract': 'no contract',
};

const SEV_TONE = { error: 'danger', warn: 'warn', info: '' };

/* ------------------------------------------------------------------ *
 * Panels
 * ------------------------------------------------------------------ */

function summaryStrip() {
  const s = summarise({ resolve });
  return kpis([
    ['Endpoints healthy', `${s.healthy}/${s.keys}`],
    ['Signed', `${s.signed}/${s.keys}`],
    ['Internal · Portal', `${s.internal} · ${s.portal}`],
    ['Workflows in tenant', `${s.workflowsBound}/${s.workflows} in use`],
    ['Findings', `${s.errors} error · ${s.warnings} warning`],
  ]);
}

function findingsPanel() {
  const fs = findings({ resolve });
  if (!fs.length) {
    return `<section class="panel">${emptyState('Nothing to report',
      'Every contract key resolves to the workflow the tenant register names for it, with a complete signature, and no workflow is impersonating a key.')}</section>`;
  }
  return fs.map((f) => `<section class="panel">
    <div class="eyebrow">${badge(f.severity, SEV_TONE[f.severity])} <code>${esc(f.code)}</code></div>
    <h2>${esc(f.title)}</h2>
    <p>${esc(f.detail)}</p>
    ${f.items?.length ? `<details><summary>${f.items.length} affected</summary>${itemsTable(f)}</details>` : ''}
  </section>`).join('');
}

function itemsTable(f) {
  if (f.code === 'estate.name-collision') {
    return table([
      { label: 'Workflow', key: 'workflowId', render: (r) => `<code>${esc(r.workflowId)}</code>` },
      { label: 'Flow name', key: 'name' },
      { label: 'Claims the key', key: 'claims', render: (r) => r.claims.map((c) => badge(c, 'warn')).join(' ') },
      { label: 'Endpoint', key: 'live', render: (r) => r.live ? badge('LIVE — callable', 'danger') : badge('none shared', 'pending') },
      { label: 'Actually served by', key: 'servedInsteadBy', render: (r) => r.servedInsteadBy.map((w) => `<code>${esc(w)}</code>`).join('<br>') || '—' },
    ], f.items, null, { label: 'Workflows carrying a contract-key name' });
  }
  if (f.code === 'estate.wrong-flow') {
    return table([
      { label: 'Key', key: 'key' },
      { label: 'Register says', key: 'expected', render: (r) => `<code>${esc(r.expected || '—')}</code>` },
      { label: 'Actually calls', key: 'actual', render: (r) => `<code class="danger">${esc(r.actual || '—')}</code>` },
    ], f.items, null, { label: 'Keys calling the wrong workflow' });
  }
  return `<ul>${f.items.map((i) => `<li><code>${esc(i.key || i.workflowId || '')}</code>${
    i.length !== undefined ? ` — signature ${i.length === null ? 'absent' : `${i.length} chars`}` : ''
  }${i.surface ? ` — ${esc(i.surface)}` : ''}${i.sourceKey ? ` — resolves via <code>${esc(i.sourceKey)}</code>` : ''}</li>`).join('')}</ul>`;
}

function keysPanel() {
  const rows = describeEstate({ resolve })
    .filter((r) => view.surface === 'all' || r.surface === view.surface)
    .filter((r) => view.status === 'all'
      || (view.status === 'problem' ? !r.healthy : r.status === view.status))
    .filter((r) => !view.q || (r.key + ' ' + (r.expected?.flow || '') + ' ' + (r.expected?.workflowId || ''))
      .toLowerCase().includes(view.q.toLowerCase()))
    .sort((a, b) => (SEVERITY[a.status] - SEVERITY[b.status]) || a.key.localeCompare(a.key === b.key ? a.key : b.key) || (a.key < b.key ? -1 : 1));

  const surfaceChips = chips([
    { value: 'all', label: `All ${EndpointAtlas.keys.length}` },
    { value: 'internal', label: 'Internal 18' },
    { value: 'portal', label: 'Portal 7' },
  ], view.surface, 'data-surface');

  const statusChips = chips([
    { value: 'all', label: 'Any state' },
    { value: 'problem', label: 'Problems only' },
    { value: 'ok', label: 'Healthy' },
    { value: 'unconfigured', label: 'Not configured' },
  ], view.status, 'data-status');

  return `<section class="panel">
    <h2>Contract keys</h2>
    <p class="meta">All ${EndpointAtlas.keys.length} keys across both surfaces, each checked against the workflow the tenant register names for it. Addresses are shown with the signature removed.</p>
    <div class="form-row">${surfaceChips}${statusChips}</div>
    <label class="wide">Search key, flow or workflow id<input data-q value="${esc(view.q)}" placeholder="e.g. SUBMISSION, CG_Upload, 62fe121e"></label>
    ${table([
      { label: 'Key', key: 'key', render: (r) => `<b>${esc(r.key)}</b>${r.sharesFlowWith.length ? `<br><small class="meta">shares its flow with ${esc(r.sharesFlowWith.join(', '))}</small>` : ''}` },
      { label: 'Surface', key: 'surface', render: (r) => badge(r.surface, r.surface === 'portal' ? 'warn' : '') },
      { label: 'Flow the register names', key: 'flow', render: (r) => `${esc(r.expected?.flow || '—')}<br><small class="meta"><code>${esc(r.expected?.workflowId || '')}</code></small>` },
      { label: 'Method', key: 'method', render: (r) => esc(r.expected?.method || r.contract?.method || '—') },
      { label: 'State', key: 'status', render: (r) => badge(STATUS_LABEL[r.status] || r.status, STATUS_TONE[r.status] || '') },
      { label: 'Signature', key: 'sig', render: (r) => r.signatureLength === null ? '<span class="meta">absent</span>'
        : r.signatureLength === SIGNATURE_LENGTH ? badge(`${SIGNATURE_LENGTH} chars`, 'success')
        : badge(`${r.signatureLength} chars`, 'danger') },
      { label: 'Resolved address (redacted)', key: 'target', render: (r) => r.target ? `<code class="meta">${esc(r.target)}</code>` : '<span class="meta">—</span>' },
    ], rows, (r) => `data-key="${esc(r.key)}"`, { label: 'Endpoint contract keys' })}
    ${rows.length ? `<p class="meta">${rows.length} of ${EndpointAtlas.keys.length} shown. Select a row for detail.</p>` : ''}
  </section>
  ${detailPanel()}`;
}

function detailPanel() {
  if (!view.selected) return '';
  const r = describeKey(view.selected, { resolve });
  const c = r.contract;
  return `<section class="panel" data-detail>
    <div class="eyebrow">Endpoint detail</div>
    <h2>${esc(r.key)} ${badge(STATUS_LABEL[r.status] || r.status, STATUS_TONE[r.status] || '')}</h2>
    <div class="grid">
      <div><small class="meta">Surface</small><p>${esc(r.surface)}</p></div>
      <div><small class="meta">Flow</small><p>${esc(r.expected?.flow || '—')}</p></div>
      <div><small class="meta">Workflow id (register)</small><p><code>${esc(r.expected?.workflowId || '—')}</code></p></div>
      <div><small class="meta">Workflow id (resolved)</small><p><code>${esc(r.actualWorkflow || '—')}</code></p></div>
      <div><small class="meta">Method</small><p>${esc(r.expected?.method || c?.method || '—')}</p></div>
      <div><small class="meta">Routing segment</small><p>${esc(r.expected?.routingSegment || '—')}</p></div>
      <div><small class="meta">Read-only</small><p>${c ? (c.readOnly ? 'yes — safe to probe' : 'no — a write; never probed') : 'no contract on record'}</p></div>
      <div><small class="meta">Timeout</small><p>${c?.timeoutMs ? `${c.timeoutMs} ms` : 'default'}</p></div>
      <div><small class="meta">Fixed action</small><p>${c?.action ? `<code>${esc(c.action)}</code>` : '—'}</p></div>
      <div><small class="meta">Address supplied by</small><p>${esc(EndpointRegistry.source(r.key, overrides()) || 'nothing')}</p></div>
    </div>
    <p><small class="meta">Resolved address, signature removed</small><br><code>${esc(r.target || '— not configured —')}</code></p>
    ${r.sharesFlowWith.length ? `<p class="meta"><b>Shares its flow with ${esc(r.sharesFlowWith.join(', '))}.</b> Regenerating this trigger in Power Automate invalidates every key on it, so all of them must be re-signed together.</p>` : ''}
    ${r.problems.length ? `<div class="panel danger-zone"><h3>What is wrong</h3><ul>${r.problems.map((p) => `<li>${esc(p.text)}</li>`).join('')}</ul></div>` : '<p class="meta">No problems detected for this key.</p>'}
    <button type="button" class="btn ghost" data-close-detail>Close</button>
  </section>`;
}

function estatePanel() {
  const rows = EndpointAtlas.workflows
    .filter((w) => view.estateFilter === 'all'
      || (view.estateFilter === 'bound' && w.bound)
      || (view.estateFilter === 'unbound' && !w.bound && w.hasEndpoint)
      || (view.estateFilter === 'noendpoint' && !w.hasEndpoint)
      || (view.estateFilter === 'collision' && !w.bound && w.names.some((n) => EndpointAtlas.keys.some((k) => k.key === n))))
    .filter((w) => !view.q || (w.workflowId + ' ' + w.names.join(' ')).toLowerCase().includes(view.q.toLowerCase()));

  const counts = {
    all: EndpointAtlas.workflows.length,
    bound: EndpointAtlas.workflows.filter((w) => w.bound).length,
    unbound: EndpointAtlas.workflows.filter((w) => !w.bound && w.hasEndpoint).length,
    noendpoint: EndpointAtlas.workflows.filter((w) => !w.hasEndpoint).length,
    collision: EndpointAtlas.workflows.filter((w) => !w.bound && w.names.some((n) => EndpointAtlas.keys.some((k) => k.key === n))).length,
  };

  return `<section class="panel">
    <h2>Flow estate</h2>
    <p class="meta">Every workflow the tenant register describes — not only the ${counts.bound} this platform calls. The rest matter because ${counts.collision} of them carry a contract-key name while serving no key.</p>
    <div class="form-row">${chips([
      { value: 'all', label: `All ${counts.all}` },
      { value: 'bound', label: `In use ${counts.bound}` },
      { value: 'unbound', label: `Live but unused ${counts.unbound}` },
      { value: 'collision', label: `Name collisions ${counts.collision}` },
      { value: 'noendpoint', label: `No endpoint ${counts.noendpoint}` },
    ], view.estateFilter, 'data-estate')}</div>
    <label class="wide">Search workflow id or name<input data-q value="${esc(view.q)}" placeholder="e.g. CG_Status, 34dd28b4"></label>
    ${table([
      { label: 'Workflow id', key: 'workflowId', render: (w) => `<code>${esc(w.workflowId)}</code>` },
      { label: 'Names in the tenant', key: 'names', render: (w) => w.names.map((n) => esc(n)).join('<br>') },
      { label: 'Category', key: 'category', render: (w) => esc(w.category || '—') },
      { label: 'Endpoint', key: 'hasEndpoint', render: (w) => w.hasEndpoint ? badge(`${w.method || 'method not recorded'} · ${w.routingSegment || ''}`, 'success') : badge('not shared', 'pending') },
      { label: 'Serves', key: 'serves', render: (w) => w.serves.length
        ? w.serves.map((k) => badge(k, 'success')).join(' ')
        : (w.names.some((n) => EndpointAtlas.keys.some((k) => k.key === n))
            ? badge('claims a key it does not serve', 'danger')
            : '<span class="meta">nothing</span>') },
    ], rows, null, { label: 'Tenant workflow estate' })}
    <p class="meta">${rows.length} of ${counts.all} shown.</p>
  </section>`;
}

function healthPanel() {
  const probe = view.probe;
  const readable = describeEstate({ resolve })
    .filter((r) => r.configured && r.contract?.readOnly === true);

  return `<section class="panel">
    <h2>Live health</h2>
    <p>Calls every configured <b>read-only</b> endpoint and reports what came back. Write endpoints are never called: a health check that registers correspondence is not a health check.</p>
    <p class="meta">${readable.length} endpoint(s) are read-only, configured and therefore probeable. Requests go directly from this browser to Power Automate, so a corporate proxy may answer instead of the tenant — the result says which.</p>
    <div class="form-row">
      <button class="btn" data-probe ${view.busy ? 'disabled' : ''}>${view.busy ? 'Probing…' : 'Run live health check'}</button>
      ${probe ? `<button type="button" class="btn ghost" data-clear-probe>Clear results</button>` : ''}
    </div>
    ${probe ? probeResults(probe) : `<p class="meta">No probe has been run in this session.</p>`}
  </section>`;
}

function probeResults(p) {
  const reached = p.rows.filter((r) => r.reached).length;
  return `${kpis([
    ['Probed', String(p.rows.length)],
    ['Answered by the tenant', `${reached}/${p.rows.length}`],
    ['Ran at', fmtDateTime(p.at)],
  ])}
  ${reached === 0 && p.rows.length ? `<div class="panel danger-zone"><h3>Nothing reached Power Automate</h3><p>Every call was answered by something other than the tenant — an egress filter or proxy. This measured the network, not the estate: no conclusion about any signature can be drawn from it.</p></div>` : ''}
  ${table([
    { label: 'Key', key: 'key' },
    { label: 'Status', key: 'status', render: (r) => r.status ? badge(String(r.status), r.ok ? 'success' : 'danger') : badge(r.error || 'no response', 'danger') },
    { label: 'Latency', key: 'ms', render: (r) => r.ms == null ? '—' : `${r.ms} ms` },
    { label: 'Reached the tenant', key: 'reached', render: (r) => r.reached ? badge('yes', 'success') : badge('no — answered by something else', 'warn') },
    { label: 'Body', key: 'note', render: (r) => esc(r.note || '—') },
  ], p.rows, null, { label: 'Live probe results' })}`;
}

function configPanel(canManage) {
  if (!canManage) {
    return `<section class="panel">${emptyState('Not your permission',
      'Changing endpoint addresses needs the settings:manage permission, held by systemAdmin. You can read every other tab.')}</section>`;
  }
  const rows = describeEstate({ resolve }).filter((r) => EndpointKeys.includes(r.key));
  const ov = overrides();
  return `<section class="panel danger-zone">
    <div class="eyebrow">${badge('changes this device only', 'warn')}</div>
    <h2>Address overrides</h2>
    <p><b>An override here applies to this browser, on this device, and nowhere else.</b> It is a
    repair tool for one workstation. The estate is configured with
    <code>npm run setup -- --values &lt;file&gt; --force</code> and shipped by
    <code>npm run package</code>; an administrator who fixes an address here has not fixed it for
    anyone else.</p>
    <p class="meta">Leave a box empty to use the address supplied when this workspace was installed —
    correct for almost every site. A value you type is checked before it is saved: it must be HTTPS,
    carry a ${SIGNATURE_LENGTH}-character signature, and address the workflow the register names for
    that key.</p>
    <form data-config>
      <div class="grid">${rows.map((r) => `<label class="wide">${esc(r.key)}
        <input name="${esc(r.key)}" value="${esc(ov[r.key] || '')}" placeholder="Leave empty to use the installed address" autocomplete="off" spellcheck="false">
        <small class="meta">must address <code>${esc(r.expected?.workflowId || 'unknown')}</code> · ${esc(r.expected?.flow || '')} · currently ${r.configured ? esc(EndpointRegistry.source(r.key, ov)) : 'not set up'}</small>
      </label>`).join('')}</div>
      <div class="form-row">
        <button class="btn" data-save-config>Validate and save</button>
        <button type="button" class="btn ghost" data-clear-overrides>Clear every override on this device</button>
      </div>
    </form>
  </section>
  <section class="panel">
    <h2>Export a report</h2>
    <p class="meta">The full estate as JSON, with every signature replaced by <code>***</code>. Safe to send to support.</p>
    <div class="form-row">
      <button type="button" class="btn ghost" data-copy-report>Copy redacted report</button>
      <button type="button" class="btn ghost" data-download-report>Download report</button>
    </div>
  </section>`;
}

function referencePanel() {
  const a = EndpointAtlas;
  return `<section class="panel">
    <h2>Where these facts come from</h2>
    <table class="dgo-table"><tbody>
      <tr><th>Authority</th><td><code>${esc(a.authority?.file || '')}</code></td></tr>
      <tr><th>Status</th><td>${esc(a.authority?.redistributionStatus || '')}</td></tr>
      <tr><th>Generated by</th><td><code>${esc(a.generatedBy)}</code></td></tr>
      <tr><th>Contract keys</th><td>${a.keys.length} — ${a.totals.internalKeys} internal, ${a.totals.portalKeys} portal</td></tr>
      <tr><th>Workflow records</th><td>${a.workflows.length}, of which ${a.totals.workflowsWithEndpoint} share an endpoint and ${a.totals.workflowsBound} are in use</td></tr>
      <tr><th>Authentication posture</th><td>${esc(JSON.stringify(a.authenticationPosture || {}))}</td></tr>
    </tbody></table>
    <p class="meta">${esc(a.authority?.note || '')}</p>
  </section>
  <section class="panel">
    <h2>Changing the estate, not this device</h2>
    <ol>
      <li><code>npm run reconcile</code> — regenerate the id map and this console's atlas from the register.</li>
      <li><code>npm run values:template ~/dgo-values.txt</code> — all ${a.keys.length} URLs, complete but for their signatures.</li>
      <li><code>npm run values:sign -- ~/dgo-values.txt &lt;KEY&gt;</code> — once per key.</li>
      <li><code>npm run check:values -- ~/dgo-values.txt</code> — must report ${a.keys.length} complete signatures.</li>
      <li><code>npm run setup -- --values ~/dgo-values.txt --force</code></li>
      <li><code>npm run commission</code> — the readiness gate.</li>
    </ol>
    <p class="meta">A signature is ${SIGNATURE_LENGTH} characters and is a bearer credential. It belongs only in
    <code>config.local.js</code>, which is git-ignored. Never in a ticket, an email, or a message.</p>
  </section>`;
}

/* ------------------------------------------------------------------ *
 * Live probe
 * ------------------------------------------------------------------ */

/**
 * A read-only probe of every configured read endpoint.
 *
 * `reached` is the load-bearing field and it is not the status code. Power Automate answers a
 * refused call with JSON; an egress filter answers with an HTML error page and a 403 that looks
 * identical at the status line. Reporting the second as "the signature is revoked" has happened
 * in this estate before — it produced a report declaring 39 flows dead on a machine whose
 * network simply blocked the host. So a non-JSON body means the tenant was never reached, and
 * the row says so instead of drawing a conclusion the call cannot support.
 */
async function runProbe() {
  const targets = describeEstate({ resolve }).filter((r) => r.configured && r.contract?.readOnly === true);
  const rows = [];
  for (const t of targets) {
    const started = Date.now();
    const row = { key: t.key, status: null, ms: null, ok: false, reached: false, note: '', error: '' };
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), Math.min(t.contract?.timeoutMs || 30000, 30000));
      const res = await fetch(resolve(t.key), {
        /* The atlas verb first. The read-only filter above means only JSON contracts reach
           here today, but a contract-first lookup is the trap that made the standalone
           console POST the two raw-bytes PUT deposits; taking the same order in both keeps
           the two consoles from disagreeing if that filter ever widens. */
        method: t.expected?.method || t.contract?.method || 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(t.contract?.action ? { action: t.contract.action } : {}),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      row.status = res.status;
      row.ms = Date.now() - started;
      const text = await res.text();
      try {
        const body = JSON.parse(text);
        row.reached = true;
        row.ok = res.ok;
        row.note = `JSON · keys: ${Object.keys(body || {}).slice(0, 6).join(', ') || 'none'}`;
      } catch {
        row.reached = false;
        row.note = 'non-JSON body — something other than Power Automate answered';
      }
    } catch (e) {
      row.ms = Date.now() - started;
      row.error = e?.name === 'AbortError' ? 'timed out' : (e?.message || 'network error');
      row.note = 'the request did not complete';
    }
    rows.push(row);
  }
  return { at: new Date().toISOString(), rows };
}

/* ------------------------------------------------------------------ *
 * Validation for the override editor
 * ------------------------------------------------------------------ */

/** Reasons one typed address must not be saved. Empty is always allowed — it means "use the installed one". */
export function validateOverride(key, value, atlas = EndpointAtlas) {
  const v = String(value || '').trim();
  if (!v) return [];
  const out = [];
  let u = null;
  try { u = new URL(v); } catch { return [`${key}: that is not a URL.`]; }
  if (u.protocol !== 'https:') out.push(`${key}: must be HTTPS — the browser calls this flow directly.`);
  const sig = u.searchParams.get('sig');
  if (sig === null) out.push(`${key}: no sig= parameter. The URL was cut short on copy.`);
  else if (sig.length !== SIGNATURE_LENGTH) out.push(`${key}: the signature is ${sig.length} characters, not ${SIGNATURE_LENGTH}.`);
  const expected = atlas.keys.find((k) => k.key === key);
  const actual = (/\/workflows\/([0-9a-f]{32})\b/i.exec(u.pathname) || [])[1]?.toLowerCase() || '';
  if (expected?.workflowId && actual && actual !== expected.workflowId) {
    out.push(`${key}: addresses workflow ${actual}, but the register says this key must call ${expected.workflowId} (${expected.flow}).`);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Render + mount
 * ------------------------------------------------------------------ */

function render(el) {
  const user = getCurrentUser();
  const canManage = hasPermission(user, Permissions.SETTINGS_MANAGE);
  const body =
      view.tab === 'findings' ? findingsPanel()
    : view.tab === 'keys' ? keysPanel()
    : view.tab === 'estate' ? estatePanel()
    : view.tab === 'health' ? healthPanel()
    : view.tab === 'config' ? configPanel(canManage)
    : referencePanel();

  el.innerHTML = `<div class="workspace">
    ${head('Endpoint Console',
      `Every contract key and every workflow in the tenant, checked against ${esc(EndpointAtlas.authority?.file || 'the register')}. Addresses are shown with signatures removed.`,
      'ADMINISTRATION')}
    ${summaryStrip()}
    <div class="form-row">${chips(TABS.map(([value, label]) => ({ value, label })), view.tab, 'data-tab')}</div>
    ${body}
  </div>`;
}

export async function mount(el) {
  hydrateGovernance();
  render(el);

  el.addEventListener('click', async (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;

    const tab = t.closest('[data-tab]');
    if (tab) { view.tab = tab.getAttribute('data-tab'); view.selected = null; return render(el); }

    const surface = t.closest('[data-surface]');
    if (surface) { view.surface = surface.getAttribute('data-surface'); return render(el); }

    const status = t.closest('[data-status]');
    if (status) { view.status = status.getAttribute('data-status'); return render(el); }

    const estate = t.closest('[data-estate]');
    if (estate) { view.estateFilter = estate.getAttribute('data-estate'); return render(el); }

    if (t.closest('[data-close-detail]')) { view.selected = null; return render(el); }

    const row = t.closest('tr[data-key]');
    if (row) {
      view.selected = row.getAttribute('data-key');
      render(el);
      el.querySelector('[data-detail]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }

    if (t.closest('[data-probe]')) {
      view.busy = true; render(el);
      try { view.probe = await runProbe(); }
      finally { view.busy = false; render(el); }
      AuditLog.record({ event: 'audit:endpoint-console-probe', actor: State.get().profile || {},
        ref: `${view.probe?.rows.length || 0} endpoint(s)`, meta: { reached: view.probe?.rows.filter((r) => r.reached).length } });
      return;
    }

    if (t.closest('[data-clear-probe]')) { view.probe = null; return render(el); }

    if (t.closest('[data-copy-report]') || t.closest('[data-download-report]')) {
      const report = exportReport({ resolve });
      const text = JSON.stringify(report, null, 2);
      if (t.closest('[data-download-report]')) {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: `dgo-endpoint-report-${report.generatedAt.slice(0, 10)}.json` });
        a.click(); URL.revokeObjectURL(url);
        toast('Report downloaded. Signatures are removed.', 'success');
      } else {
        try { await navigator.clipboard?.writeText(text); toast('Report copied. Signatures are removed, so it is safe to paste.', 'success'); }
        catch { toast('Could not copy. Use Download report instead.', 'info'); }
      }
      AuditLog.record({ event: 'audit:endpoint-console-export', actor: State.get().profile || {}, ref: 'redacted report', meta: {} });
      return;
    }

    if (t.closest('[data-clear-overrides]')) {
      if (!await confirmAction({
        title: 'Clear every override on this device',
        body: '<p>Remove every address override stored in this browser, so each key goes back to the address supplied when this workspace was installed?</p><p class="meta">This is the correct state for almost every site. Nothing on the server changes.</p>',
        confirmText: 'Clear overrides', cancelText: 'Cancel',
      })) return;
      State.patch({ settings: { ...State.get().settings, endpoints: {} } },
        { action: 'endpoint-console:clear-overrides', module: 'endpoint-console', event: 'audit:endpoint-overrides-cleared' });
      toast('Every override on this device was cleared.', 'success');
      return render(el);
    }

    if (t.closest('[data-save-config]')) {
      e.preventDefault();
      const form = el.querySelector('form[data-config]');
      if (!form) return;
      const typed = Object.fromEntries(EndpointKeys.map((k) => [k, String(new FormData(form).get(k) || '').trim()]));
      const errors = EndpointKeys.flatMap((k) => validateOverride(k, typed[k]));
      if (errors.length) {
        toast(`${errors.length} address(es) were refused — see the panel.`, 'error');
        const box = document.createElement('div');
        box.className = 'panel danger-zone';
        box.innerHTML = `<h3>Not saved — ${errors.length} problem(s)</h3><ul>${errors.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
        form.prepend(box);
        return;
      }
      const before = overrides();
      const changed = EndpointKeys.filter((k) => (typed[k] || '') !== (before[k] || ''));
      if (!changed.length) return toast('Nothing changed.', 'info');
      if (!await confirmAction({
        title: 'Save address overrides',
        body: `<p><b>${changed.length}</b> address${changed.length === 1 ? '' : 'es'} will change on this device: ${changed.map((k) => `<code>${esc(k)}</code>`).join(', ')}.</p><p class="meta">Every value was checked: HTTPS, a ${SIGNATURE_LENGTH}-character signature, and the workflow the register names. This affects this browser only.</p>`,
        confirmText: 'Save overrides', cancelText: 'Cancel',
      })) return;
      const next = {};
      for (const k of EndpointKeys) if (typed[k]) next[k] = typed[k];
      State.patch({ settings: { ...State.get().settings, endpoints: next } },
        { action: 'endpoint-console:save-overrides', module: 'endpoint-console', event: 'audit:endpoint-overrides-saved' });
      /* The keys that changed are audited; the values are not, because a value is a credential. */
      AuditLog.record({ event: 'audit:endpoint-overrides-saved', actor: State.get().profile || {},
        ref: `${changed.length} key(s)`, meta: { keys: changed } });
      toast(`${changed.length} override(s) saved for this device.`, 'success');
      return render(el);
    }
  });

  el.addEventListener('input', (e) => {
    const q = e.target?.closest?.('[data-q]');
    if (!q) return;
    view.q = q.value;
    const pos = q.selectionStart;
    render(el);
    const again = el.querySelector('[data-q]');
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });
}

export default { mount };
