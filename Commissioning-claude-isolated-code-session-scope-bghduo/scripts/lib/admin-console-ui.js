/* The standalone administrative console's interface.
 *
 * Inlined verbatim into tools/admin-console.html by scripts/build-admin-console.mjs, after the
 * estate data and the shared analysis from core/endpoint-atlas.js. It is a plain script, not a
 * module: the console is one <script> in one file, and it must run from file:// where module
 * loading and fetch are both restricted.
 *
 * IT COMMISSIONS. It does not merely report.
 *
 * The first version of this console was read-only, and that was a decision nobody asked for. An
 * administrator holding it could see that SUBMISSION had no signature and could do nothing about
 * it without a checkout, Node, and a terminal — which is exactly the situation the standalone
 * tool exists to serve. So the Commission tab takes the signatures, validates each against the
 * register as it is typed, and writes both config.local.js files, byte-identical to what
 * `npm run setup` emits. That is the whole job, done from one file.
 *
 * The constraint that is real, and kept: nothing is persisted and nothing is transmitted. A
 * signature lives in a variable until the tab closes. Generating a file the operator downloads is
 * not storage — it is the deliverable.
 */

/* eslint-disable no-var */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pill = (t, k = '') => '<span class="pill ' + k + '">' + esc(t) + '</span>';

/**
 * Everything the session holds. In memory, for the life of the tab.
 *
 * `urls` is the working set the whole console reasons about — loaded from a file, typed into the
 * Commission tab, or both. `baseline` is a second set held only for the Compare tab. Neither is
 * written to storage of any kind: this file gets opened on machines nobody controls, and a
 * signature in a browser profile outlives the tab, the session, and the person's memory of having
 * pasted it.
 */
let S = {
  urls: {},           // KEY -> full URL, as supplied
  sourceName: '',
  baseline: null,     // { urls, name } for Compare
  probe: null,
  rotated: {},        // KEY -> true, the rotation tracker's ticks
  busy: false,
};

const resolve = (key) => S.urls[key] || '';
const loadedCount = () => Object.values(S.urls).filter(Boolean).length;

const view = {
  tab: 'overview', surface: 'all', status: 'all', q: '', estateFilter: 'all',
  selected: null, sortKey: 'status', sortDir: 1, wf: null, includeWrites: false,
};

const STATUS_LABEL = { ok: 'healthy', unconfigured: 'not configured', 'wrong-flow': 'WRONG FLOW',
  'no-signature': 'no signature', 'bad-signature': 'bad signature', 'not-https': 'not HTTPS',
  placeholder: 'placeholder', 'no-contract': 'no contract' };
const STATUS_KIND = { ok: 'ok', unconfigured: '', 'wrong-flow': 'bad', 'no-signature': 'bad',
  'bad-signature': 'bad', 'not-https': 'bad', placeholder: 'warn', 'no-contract': 'warn' };
const SEV_KIND = { error: 'bad', warn: 'warn', info: 'info' };

/* ── shared helpers ───────────────────────────────────────────────────────────────────── */

/** A redacted URL is still ~200 characters. Rows must be readable; the full value is in detail. */
function compactTarget(url) {
  if (!url) return '<span class="tiny">—</span>';
  const seg = (url.match(/\/cu\/(\d+)\//) || [])[1];
  const sig = /sig=\*\*\*/.test(url) ? 'sig=***' : /sig=/.test(url) ? 'sig=' : 'no sig';
  return '<code>' + (seg ? 'cu/' + esc(seg) + ' · ' : '') + '…/invoke?' + esc(sig) + '</code>';
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast(what + ' copied.'); }
  catch { toast('Could not copy — use Download instead.', 'bad'); }
}

function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('in'), 10);
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, 3200);
}

const sigLen = (url) => { const m = /[?&]sig=([A-Za-z0-9_%-]*)/i.exec(url || ''); return m ? decodeURIComponent(m[1]).length : null; };
const keysOf = (surface) => EndpointAtlas.keys.filter((k) => !surface || k.surface === surface);

/* ── input parsing ────────────────────────────────────────────────────────────────────── */

function parseValues(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1].replace(/^(DGO|PF)_ENDPOINT_/, '')] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/** Read by pattern, never evaluated. Running a file someone handed you is not a thing a tool does. */
function parseConfigLocal(text) {
  const out = {};
  for (const m of String(text).matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:\s*(["'])([^"']*)\2/gm)) {
    if (m[3]) out[m[1]] = m[3];
  }
  return out;
}

function readAny(text) {
  const looksConfig = /DGO_CONFIG|PF_CONFIG/.test(text);
  return { urls: looksConfig ? parseConfigLocal(text) : parseValues(text), kind: looksConfig ? 'config.local.js' : 'values file' };
}

function load(text, name, asBaseline) {
  const { urls, kind } = readAny(text);
  const n = Object.values(urls).filter(Boolean).length;
  if (!n) { toast('No endpoint values found in ' + name + '.', 'bad'); return; }
  if (asBaseline) { S.baseline = { urls, name: name + ' (' + kind + ')' }; view.tab = 'compare'; }
  else { S.urls = Object.assign({}, S.urls, urls); S.sourceName = name + ' (' + kind + ')'; S.probe = null; view.tab = 'endpoints'; }
  toast(n + ' value(s) read from ' + name + '. Nothing was uploaded.');
  render();
}

/* ── config generation — byte-identical to `npm run setup` ────────────────────────────── */

const pad = (s, w) => String(s) + ' '.repeat(Math.max(0, w - String(s).length));

function renderRuntimeConfig(values) {
  const keys = keysOf('internal').map((k) => k.key);
  const w = Math.max(...keys.map((k) => k.length)) + 2;
  const lines = keys.map((k) => '    ' + pad(k + ':', w) + JSON.stringify(values[k] || '') + ',');
  return [
    '/* DGO R11.6 runtime — endpoint configuration.',
    ' *',
    ' * WRITTEN BY the standalone administrative console (tools/admin-console.html).',
    ' * Identical in form to what `npm run setup` emits. Git-ignored on purpose: every URL below',
    ' * is a signed Power Automate trigger, and a signed trigger URL is a bearer credential —',
    ' * possession alone authorises invoking the flow.',
    ' *',
    ' * This file is delivered verbatim to every browser that loads the platform, so treat each URL',
    ' * as public from the moment you deploy. There is no proxy in the request path: the flow behind',
    ' * each URL is the only place authentication, authorisation, validation and rate limiting can',
    ' * happen, and it must do all four itself.',
    ' *',
    ' * Rotate on a schedule: regenerate the signature in Power Automate, rebuild this file,',
    ' * redeploy. That is the only way to revoke one.',
    ' *',
    ' * An empty value is not a failure — that endpoint\'s feature reports itself unconfigured',
    ' * rather than pretending an action succeeded.',
    ' *',
    ' * MERGED, NOT ASSIGNED, so an injected window.DGO_CONFIG still wins.',
    ' */',
    'window.DGO_CONFIG = window.DGO_CONFIG || {};',
    'window.DGO_CONFIG.endpoints = Object.assign({',
    lines.join('\n'),
    '}, window.DGO_CONFIG.endpoints);',
    '',
  ].join('\n');
}

function renderPortalConfig(values) {
  const keys = keysOf('portal').map((k) => k.key);
  const w = Math.max(...keys.map((k) => k.length)) + 2;
  const lines = keys.map((k) => '    ' + pad(k + ':', w) + JSON.stringify(values[k] || '') + ',');
  return [
    '/* Document portal — endpoint configuration.',
    ' *',
    ' * WRITTEN BY the standalone administrative console (tools/admin-console.html).',
    ' * Identical in form to what `npm run setup` emits. Git-ignored on purpose.',
    ' *',
    ' * ⚠  This is the PUBLIC portal. Every URL below is readable by anyone who fetches a static',
    ' * asset from the site, so configure only endpoints whose flows are built to be invoked by an',
    ' * anonymous stranger: each must validate its own input, rate-limit its own callers, return',
    ' * only what that caller is entitled to see, and be rotatable.',
    ' *',
    ' * Leave SUBMISSION empty and the portal stays in DEMO MODE — everything stays on the device',
    ' * and nothing is transmitted, which is the safe failure for a public channel.',
    ' *',
    ' * MERGED, NOT ASSIGNED, so an injected window.PF_CONFIG still wins.',
    ' */',
    'window.PF_CONFIG = window.PF_CONFIG || {};',
    'window.PF_CONFIG.endpoints = Object.assign({',
    lines.join('\n'),
    '}, window.PF_CONFIG.endpoints);',
    '',
  ].join('\n');
}

function valuesFileText(values) {
  const out = ['# DGO endpoint values. Add the 43-character signature after each "sig=".',
    '# Generated by the standalone administrative console. Never commit this file.', ''];
  for (const surface of ['internal', 'portal']) {
    out.push('# ' + '='.repeat(72), '# ' + surface.toUpperCase(), '# ' + '='.repeat(72));
    let last = null;
    for (const k of keysOf(surface)) {
      if (k.workflowId !== last) {
        last = k.workflowId;
        const peers = EndpointAtlas.keys.filter((x) => x.workflowId === k.workflowId).map((x) => x.key);
        out.push('', '# ' + k.flow + '  ·  workflow ' + k.workflowId
          + (peers.length > 1 ? '  ·  ' + peers.length + ' keys, ONE url' : ''));
      }
      out.push((surface === 'portal' ? 'PF_ENDPOINT_' : 'DGO_ENDPOINT_') + k.key + '='
        + (values && values[k.key] ? values[k.key] : k.urlTemplate));
    }
    out.push('');
  }
  return out.join('\n');
}

/* ── commissioning readiness, computed here ───────────────────────────────────────────── */

/**
 * The gate `npm run commission` applies, evaluated in the browser.
 *
 * PILOT is the honest posture for this estate and the one the gate infers, so the required set is
 * the minimal-pilot subset — the endpoints without which correspondence cannot flow end to end.
 * Everything else is a feature you may legitimately leave off, and reporting an unconfigured
 * feature as a blocker would train people to ignore blockers.
 */
const PILOT_KEYS = ['FETCH_ALL', 'DYNAMIC_ACTIONS', 'SINGLE_ASSIGNMENT', 'BULK_ASSIGNMENT', 'SUBMISSION', 'UPLOAD'];

function readiness() {
  const rows = describeEstate({ resolve });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const blockers = [];
  const warnings = [];

  const missingPilot = PILOT_KEYS.filter((k) => !byKey[k] || !byKey[k].configured);
  if (missingPilot.length) {
    blockers.push({ title: missingPilot.length + ' required endpoint(s) unwired',
      detail: 'Correspondence cannot flow end to end without: ' + missingPilot.join(', ') + '.',
      fix: 'Commission tab — paste each signature, then generate the config files.' });
  }
  const wrong = rows.filter((r) => r.status === 'wrong-flow');
  if (wrong.length) {
    blockers.push({ title: wrong.length + ' key(s) call the wrong workflow',
      detail: wrong.map((r) => r.key).join(', ') + ' — the URL is valid, so nothing fails. It succeeds against the wrong flow.',
      fix: 'Commission tab — the affected keys are marked; re-copy from the flow the register names.' });
  }
  const badSig = rows.filter((r) => ['no-signature', 'bad-signature'].includes(r.status));
  if (badSig.length) {
    blockers.push({ title: badSig.length + ' key(s) have no usable signature',
      detail: badSig.map((r) => r.key + ' (' + (r.signatureLength === null ? 'absent' : r.signatureLength + ' chars') + ')').join(', '),
      fix: 'A signature is exactly ' + SIGNATURE_LENGTH + ' characters.' });
  }
  const notHttps = rows.filter((r) => r.status === 'not-https');
  if (notHttps.length) blockers.push({ title: notHttps.length + ' key(s) are not HTTPS', detail: notHttps.map((r) => r.key).join(', '), fix: 'Re-copy the URL.' });

  const off = rows.filter((r) => r.status === 'unconfigured' && !PILOT_KEYS.includes(r.key));
  if (off.length) warnings.push({ title: off.length + ' optional feature(s) are not configured', detail: off.map((r) => r.key).join(', ') + ' — each reports itself unavailable rather than failing mid-action.' });
  const collisions = EndpointAtlas.workflows.filter((w) => !w.bound && w.hasEndpoint && w.names.some((n) => EndpointAtlas.keys.some((k) => k.key === n)));
  if (collisions.length) warnings.push({ title: collisions.length + ' live workflow(s) impersonate a contract key', detail: 'Wiring by flow name instead of workflow id gives a working URL to a retired flow. See Findings.' });

  return { blockers, warnings, rows, cleared: blockers.length === 0 && loadedCount() > 0 };
}

/* ── panels ───────────────────────────────────────────────────────────────────────────── */

const kpi = (l, v, k) => '<div class="kpi ' + (k || '') + '"><small>' + l + '</small><b>' + esc(v) + '</b></div>';

function summaryStrip() {
  const s = summarise({ resolve });
  const r = readiness();
  return '<div class="kpis">'
    + kpi('Contract keys', EndpointAtlas.keys.length)
    + kpi('Configured', loadedCount() ? s.configured + '/' + s.keys : '—')
    + kpi('Healthy', loadedCount() ? s.healthy + '/' + s.keys : '—')
    + kpi('Tenant workflows', s.workflowsBound + '/' + s.workflows + ' in use')
    + kpi('Readiness', loadedCount() ? (r.cleared ? 'CLEARED' : r.blockers.length + ' blocker' + (r.blockers.length === 1 ? '' : 's')) : 'nothing loaded',
        loadedCount() ? (r.cleared ? 'good' : 'bad') : '')
    + '</div>';
}

function overviewPanel() {
  const r = readiness();
  const s = summarise({ resolve });
  if (!loadedCount()) {
    return '<section class="panel"><h2>Start here</h2>'
      + '<p class="muted">This console administers the whole endpoint estate — all ' + EndpointAtlas.keys.length
      + ' contract keys across the internal platform and the public portal, and all ' + EndpointAtlas.workflows.length
      + ' workflows in the tenant. It runs entirely in this page.</p>'
      + '<div class="cards">'
      + card('Commission from scratch', 'Paste ' + EndpointAtlas.keys.length + ' signatures and generate both config.local.js files. No checkout, no Node.', 'commission', 'Open the workspace')
      + card('Inspect a deployment', 'Load a values file or a config.local.js and see exactly what it will call.', null, 'Load a file', 'data-pick')
      + card('Explore the estate', 'All ' + EndpointAtlas.workflows.length + ' tenant workflows, including the ' + (s.workflows - s.workflowsBound) + ' this system does not call.', 'estate', 'Open the estate')
      + '</div>'
      + dropZone()
      + '</section>' + findingsPanel(true);
  }
  return '<section class="panel ' + (r.cleared ? 'good' : 'danger') + '">'
    + '<h2>' + (r.cleared ? 'Cleared for pilot usage' : r.blockers.length + ' blocker' + (r.blockers.length === 1 ? '' : 's')) + '</h2>'
    + '<p class="muted">From <b>' + esc(S.sourceName || 'values entered here') + '</b>. '
    + (r.cleared ? 'Every required endpoint is wired, well-formed, and points at the workflow the tenant register names for it.'
      : 'Correspondence cannot flow end to end until these are resolved.') + '</p>'
    + (r.blockers.length ? '<div class="stack">' + r.blockers.map((b) =>
        '<div class="issue bad"><b>' + esc(b.title) + '</b><p class="muted">' + esc(b.detail) + '</p><p class="tiny">' + esc(b.fix) + '</p></div>').join('') + '</div>' : '')
    + (r.warnings.length ? '<h3>Worth knowing</h3><div class="stack">' + r.warnings.map((w) =>
        '<div class="issue warn"><b>' + esc(w.title) + '</b><p class="muted">' + esc(w.detail) + '</p></div>').join('') + '</div>' : '')
    + '<div class="row"><button class="btn" data-tab="commission">Open the commissioning workspace</button>'
    + '<button class="btn ghost" data-tab="export">Generate config files</button>'
    + '<button class="btn ghost" data-unload>Unload</button></div>'
    + '</section>';
}

const card = (title, body, tab, action, attr) =>
  '<div class="card"><h3>' + esc(title) + '</h3><p class="muted">' + esc(body) + '</p>'
  + '<button class="btn ghost" ' + (tab ? 'data-tab="' + tab + '"' : (attr || '')) + '>' + esc(action) + '</button></div>';

const dropZone = () => '<div class="drop" data-drop>Drop a values file or a <code>config.local.js</code> here — '
  + '<button class="btn ghost" data-pick>choose one</button> — '
  + '<button class="btn ghost" data-paste-toggle>or paste</button>'
  + '<input type="file" data-file hidden accept=".txt,.js,.env,text/plain,text/javascript">'
  + '<div data-paste hidden><textarea data-paste-text placeholder="Paste a values file or a config.local.js"></textarea>'
  + '<div class="row"><button class="btn" data-paste-load>Load</button></div></div>'
  + '<p class="tiny">Read in this browser. Nothing is uploaded and nothing is stored — closing the tab discards it.</p></div>';

/* ---- Commission: the workspace that makes this a console rather than a report ---------- */

function commissionPanel() {
  const groups = [];
  const seen = new Set();
  for (const k of EndpointAtlas.keys) {
    if (seen.has(k.workflowId)) continue;
    seen.add(k.workflowId);
    groups.push({ workflowId: k.workflowId, flow: k.flow, method: k.method, seg: k.routingSegment,
      keys: EndpointAtlas.keys.filter((x) => x.workflowId === k.workflowId) });
  }
  const done = groups.filter((g) => g.keys.every((k) => sigLen(resolve(k.key)) === SIGNATURE_LENGTH)).length;

  return '<section class="panel"><h2>Commissioning workspace</h2>'
    + '<p class="muted">One row per <b>workflow</b>, not per key — ' + groups.length + ' flows serve the '
    + EndpointAtlas.keys.length + ' keys, so this is ' + groups.length + ' visits to Power Automate, not '
    + EndpointAtlas.keys.length + '. Paste the signature (or the whole URL) and every key on that flow is filled in.</p>'
    + '<div class="progress"><div class="bar" style="width:' + Math.round(done / groups.length * 100) + '%"></div>'
    + '<span>' + done + ' of ' + groups.length + ' flows signed</span></div>'
    + '<div class="note">Open each flow at <code>make.powerautomate.com</code> → <b>Edit</b> → the <b>When an HTTP request is received</b> trigger → copy <b>HTTP POST URL</b>. Paste the part after <code>sig=</code>, or paste the whole URL and this will take the signature out of it.</div>'
    + '<div class="stack">' + groups.map(commissionRow).join('') + '</div>'
    + '<div class="row">'
    + '<button class="btn" data-gen-both>Generate both config files</button>'
    + '<button class="btn ghost" data-gen-values>Download values file</button>'
    + '<button class="btn ghost" data-clear-sigs>Clear every signature</button>'
    + '</div></section>';
}

function commissionRow(g) {
  const cur = resolve(g.keys[0].key);
  const len = sigLen(cur);
  const ok = len === SIGNATURE_LENGTH;
  const wrong = g.keys.some((k) => { const r = describeKey(k.key, { resolve }); return r.status === 'wrong-flow'; });
  return '<div class="issue ' + (wrong ? 'bad' : ok ? 'good' : '') + '" data-flow="' + esc(g.workflowId) + '">'
    + '<div class="flowhead"><b>' + esc(g.flow) + '</b> ' + pill(g.method || 'POST') + ' ' + pill(esc(g.seg || 'routing ?'))
    + (ok ? pill('signed', 'ok') : pill('not signed', 'warn'))
    + (wrong ? pill('WRONG FLOW', 'bad') : '') + '</div>'
    + '<div class="tiny mono">' + esc(g.workflowId) + '</div>'
    + '<div class="tiny">serves ' + g.keys.map((k) => pill(k.key, k.surface === 'portal' ? 'warn' : '')).join(' ') + '</div>'
    + '<div class="row"><input type="text" data-sig="' + esc(g.workflowId) + '" spellcheck="false" autocomplete="off"'
    + ' placeholder="Paste the signature (43 characters) or the whole trigger URL"'
    + ' value="" aria-label="Signature for ' + esc(g.flow) + '">'
    + '<a class="btn ghost" target="_blank" rel="noreferrer" href="https://make.powerautomate.com/environments/Default-'
    + 'ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1/flows/' + esc(g.workflowId) + '/details">Open flow ↗</a>'
    + (ok ? '<button class="btn ghost" data-clear-sig="' + esc(g.workflowId) + '">Clear</button>' : '')
    + '</div>'
    + (len !== null && !ok ? '<p class="tiny bad">' + len + ' characters — a signature is exactly ' + SIGNATURE_LENGTH + '.</p>' : '')
    + '</div>';
}

/** Accepts a bare signature or a whole URL; splices it onto every key sharing that workflow. */
function applySignature(workflowId, raw) {
  const text = String(raw || '').trim();
  if (!text) { for (const k of EndpointAtlas.keys.filter((x) => x.workflowId === workflowId)) delete S.urls[k.key]; return { ok: true, cleared: true }; }
  let sig = text;
  const fromUrl = /[?&]sig=([A-Za-z0-9_%-]+)/i.exec(text);
  if (fromUrl) sig = decodeURIComponent(fromUrl[1]);
  else if (/^sig=/i.test(sig)) sig = sig.slice(4);
  sig = sig.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(sig)) return { ok: false, why: 'that is not a signature — it contains characters a signature cannot contain' };
  if (sig.length !== SIGNATURE_LENGTH) return { ok: false, why: sig.length + ' characters, expected ' + SIGNATURE_LENGTH + (sig.length < SIGNATURE_LENGTH ? ' — the copy was cut short' : ' — something was copied with it') };
  /* If a whole URL was pasted, honour ITS workflow id: pasting the wrong flow's URL is exactly
     the mistake the wrong-flow finding exists to catch, and silently rewriting it onto the
     register's id would hide it. */
  const pastedWf = (/\/workflows\/([0-9a-f]{32})\b/i.exec(text) || [])[1];
  for (const k of EndpointAtlas.keys.filter((x) => x.workflowId === workflowId)) {
    let base = k.urlTemplate;
    if (pastedWf && pastedWf.toLowerCase() !== workflowId) base = base.replace(/\/workflows\/[0-9a-f]{32}/i, '/workflows/' + pastedWf.toLowerCase());
    S.urls[k.key] = base + sig;
  }
  return { ok: true };
}

/* ---- Endpoints ------------------------------------------------------------------------ */

const COLS = [
  { id: 'key', label: 'Key', get: (r) => r.key },
  { id: 'surface', label: 'Surface', get: (r) => r.surface },
  { id: 'flow', label: 'Flow the register names', get: (r) => (r.expected && r.expected.flow) || '' },
  { id: 'method', label: 'Method', get: (r) => (r.expected && r.expected.method) || '' },
  { id: 'status', label: 'State', get: (r) => SEVERITY[r.status] },
  { id: 'sig', label: 'Signature', get: (r) => r.signatureLength === null ? -1 : r.signatureLength },
  { id: 'target', label: 'Address (redacted)', get: (r) => r.target || '' },
];

function endpointsPanel() {
  if (!loadedCount()) return '<section class="panel"><h2>Nothing loaded</h2><p class="muted">Commission from scratch, or load a deployment to inspect.</p>' + dropZone() + '</section>';
  let rows = describeEstate({ resolve })
    .filter((r) => view.surface === 'all' || r.surface === view.surface)
    .filter((r) => view.status === 'all' || (view.status === 'problem' ? !r.healthy : r.status === view.status))
    .filter((r) => !view.q || (r.key + ' ' + ((r.expected && r.expected.flow) || '') + ' ' + ((r.expected && r.expected.workflowId) || '')).toLowerCase().includes(view.q.toLowerCase()));
  const col = COLS.find((c) => c.id === view.sortKey) || COLS[4];
  rows.sort((a, b) => { const x = col.get(a), y = col.get(b); return (x < y ? -1 : x > y ? 1 : 0) * view.sortDir || (a.key < b.key ? -1 : 1); });

  return '<section class="panel"><h2>Contract keys</h2>'
    + '<p class="muted">All ' + EndpointAtlas.keys.length + ' keys, each checked against the workflow the tenant register names for it. From <b>' + esc(S.sourceName || 'values entered here') + '</b>. Addresses are shown with the signature removed.</p>'
    + '<div class="row">' + chipRow('data-surface', view.surface, [['all', 'All ' + EndpointAtlas.keys.length], ['internal', 'Internal ' + keysOf('internal').length], ['portal', 'Portal ' + keysOf('portal').length]])
    + chipRow('data-status', view.status, [['all', 'Any state'], ['problem', 'Problems only'], ['ok', 'Healthy'], ['unconfigured', 'Not configured']]) + '</div>'
    + '<div class="row"><input type="search" data-q placeholder="Search key, flow or workflow id" value="' + esc(view.q) + '"></div>'
    + '<div class="tablewrap"><table><thead><tr>'
    + COLS.map((c) => '<th data-sort="' + c.id + '" class="sortable' + (view.sortKey === c.id ? ' on' : '') + '">' + esc(c.label) + (view.sortKey === c.id ? (view.sortDir > 0 ? ' ▲' : ' ▼') : '') + '</th>').join('')
    + '<th></th></tr></thead><tbody>'
    + rows.map((r) => '<tr data-key="' + esc(r.key) + '"><td><b>' + esc(r.key) + '</b>'
      + (r.sharesFlowWith.length ? '<br><span class="tiny">shares with ' + esc(r.sharesFlowWith.join(', ')) + '</span>' : '') + '</td>'
      + '<td>' + pill(r.surface, r.surface === 'portal' ? 'warn' : '') + '</td>'
      + '<td>' + esc((r.expected && r.expected.flow) || '—') + '<br><span class="tiny mono">' + esc((r.expected && r.expected.workflowId) || '') + '</span></td>'
      + '<td>' + esc((r.expected && r.expected.method) || '—') + '</td>'
      + '<td>' + pill(STATUS_LABEL[r.status] || r.status, STATUS_KIND[r.status]) + '</td>'
      + '<td>' + (r.signatureLength === null ? '<span class="tiny">absent</span>' : r.signatureLength === SIGNATURE_LENGTH ? pill('43', 'ok') : pill(String(r.signatureLength), 'bad')) + '</td>'
      + '<td>' + compactTarget(r.target) + '</td>'
      + '<td><button class="btn ghost tiny-btn" data-probe-one="' + esc(r.key) + '"' + (r.contract && r.contract.readOnly ? '' : ' disabled title="write endpoint — never probed automatically"') + '>probe</button></td>'
      + '</tr>').join('')
    + '</tbody></table></div><p class="tiny">' + rows.length + ' of ' + EndpointAtlas.keys.length + ' shown. Select a row for detail.</p></section>'
    + detailPanel();
}

const chipRow = (attr, active, items) => items.map(([v, l]) =>
  '<button class="chip' + (active === v ? ' on' : '') + '" ' + attr + '="' + v + '">' + esc(l) + '</button>').join('');

function detailPanel() {
  if (!view.selected) return '';
  const r = describeKey(view.selected, { resolve });
  const c = r.contract;
  const probe = S.probe && S.probe.rows.find((x) => x.key === r.key);
  const f = (l, v) => '<div><small class="tiny">' + l + '</small><div>' + v + '</div></div>';
  return '<section class="panel" data-detail><h2>' + esc(r.key) + ' ' + pill(STATUS_LABEL[r.status] || r.status, STATUS_KIND[r.status]) + '</h2>'
    + '<div class="grid2">'
    + f('Surface', esc(r.surface))
    + f('Flow', esc((r.expected && r.expected.flow) || '—'))
    + f('Workflow — register', '<code>' + esc((r.expected && r.expected.workflowId) || '—') + '</code>')
    + f('Workflow — resolved', '<code>' + esc(r.actualWorkflow || '—') + '</code>')
    + f('Method', esc((r.expected && r.expected.method) || (c && c.method) || '—'))
    + f('Routing segment', esc((r.expected && r.expected.routingSegment) || '—'))
    + f('Read-only', c ? (c.readOnly ? 'yes — safe to probe' : 'no — a write') : 'no contract on record')
    + f('Timeout', c && c.timeoutMs ? c.timeoutMs + ' ms' : 'default')
    + f('Fixed action', c && c.action ? '<code>' + esc(c.action) + '</code>' : '—')
    + f('Signature', r.signatureLength === null ? 'absent' : r.signatureLength + ' characters')
    + '</div>'
    + '<h3>Resolved address, signature removed</h3><p><code>' + esc(r.target || '— not configured —') + '</code></p>'
    + (r.sharesFlowWith.length ? '<div class="note"><b>Shares its flow with ' + esc(r.sharesFlowWith.join(', ')) + '.</b> Regenerating this trigger invalidates every key on it — all of them must be re-signed together.</div>' : '')
    + (r.problems.length ? '<h3>What is wrong</h3><ul class="plain">' + r.problems.map((p) => '<li>' + esc(p.text) + '</li>').join('') + '</ul>' : '<p class="muted">No problems detected.</p>')
    + (probe ? '<h3>Last probe</h3><p class="muted">' + esc(String(probe.status || probe.error)) + ' · ' + (probe.ms == null ? '—' : probe.ms + ' ms') + ' · ' + esc(probe.note) + '</p>' : '')
    + '<div class="row"><button class="btn ghost" data-close>Close</button>'
    + (c && c.readOnly ? '<button class="btn ghost" data-probe-one="' + esc(r.key) + '">Probe this endpoint</button>' : '')
    + '</div></section>';
}

/* ---- Estate + workflow drill-down ------------------------------------------------------ */

function estatePanel() {
  const counts = {
    all: EndpointAtlas.workflows.length,
    bound: EndpointAtlas.workflows.filter((w) => w.bound).length,
    unbound: EndpointAtlas.workflows.filter((w) => !w.bound && w.hasEndpoint).length,
    noendpoint: EndpointAtlas.workflows.filter((w) => !w.hasEndpoint).length,
    collision: EndpointAtlas.workflows.filter((w) => !w.bound && w.names.some((n) => EndpointAtlas.keys.some((k) => k.key === n))).length,
  };
  const rows = EndpointAtlas.workflows
    .filter((w) => view.estateFilter === 'all'
      || (view.estateFilter === 'bound' && w.bound)
      || (view.estateFilter === 'unbound' && !w.bound && w.hasEndpoint)
      || (view.estateFilter === 'noendpoint' && !w.hasEndpoint)
      || (view.estateFilter === 'collision' && !w.bound && w.names.some((n) => EndpointAtlas.keys.some((k) => k.key === n))))
    .filter((w) => !view.q || (w.workflowId + ' ' + w.names.join(' ')).toLowerCase().includes(view.q.toLowerCase()));

  return '<section class="panel"><h2>Flow estate</h2>'
    + '<p class="muted">Every workflow the tenant register describes — not only the ' + counts.bound
    + ' this system calls. The rest matter because <b>' + counts.collision + '</b> carry a contract-key name while serving no key.</p>'
    + '<div class="row">' + chipRow('data-estate', view.estateFilter, [['all', 'All ' + counts.all], ['bound', 'In use ' + counts.bound],
      ['unbound', 'Live but unused ' + counts.unbound], ['collision', 'Name collisions ' + counts.collision], ['noendpoint', 'No endpoint ' + counts.noendpoint]]) + '</div>'
    + '<div class="row"><input type="search" data-q placeholder="Search workflow id or name" value="' + esc(view.q) + '"></div>'
    + '<div class="tablewrap"><table><thead><tr><th>Workflow id</th><th>Names in the tenant</th><th>Cat</th><th>Endpoint</th><th>Serves</th></tr></thead><tbody>'
    + rows.map((w) => '<tr data-wf="' + esc(w.workflowId) + '"><td><code>' + esc(w.workflowId) + '</code></td><td>' + w.names.map(esc).join('<br>')
      + '</td><td>' + esc(w.category || '—') + '</td><td>'
      + (w.hasEndpoint ? pill((w.method || 'method not recorded') + ' · ' + (w.routingSegment || ''), 'ok') : pill('not shared'))
      + '</td><td>' + (w.serves.length ? w.serves.map((k) => pill(k, 'ok')).join(' ')
        : (w.names.some((n) => EndpointAtlas.keys.some((k) => k.key === n)) ? pill('claims a key it does not serve', 'bad') : '<span class="tiny">nothing</span>'))
      + '</td></tr>').join('')
    + '</tbody></table></div><p class="tiny">' + rows.length + ' of ' + counts.all + ' shown. Select a row for detail.</p></section>'
    + workflowPanel();
}

function workflowPanel() {
  if (!view.wf) return '';
  const w = EndpointAtlas.workflows.find((x) => x.workflowId === view.wf);
  if (!w) return '';
  const claims = w.names.filter((n) => EndpointAtlas.keys.some((k) => k.key === n));
  return '<section class="panel" data-detail><h2>' + esc(w.names[0] || w.workflowId) + '</h2>'
    + '<div class="grid2">'
    + '<div><small class="tiny">Workflow id</small><div><code>' + esc(w.workflowId) + '</code></div></div>'
    + '<div><small class="tiny">Category</small><div>' + esc(w.category || '—') + '</div></div>'
    + '<div><small class="tiny">Method</small><div>' + esc(w.method || '—') + '</div></div>'
    + '<div><small class="tiny">Routing segment</small><div>' + esc(w.routingSegment || '—') + '</div></div>'
    + '<div><small class="tiny">Endpoint</small><div>' + (w.hasEndpoint ? 'shared' : 'not shared') + '</div></div>'
    + '<div><small class="tiny">Register status</small><div>' + esc(w.endpointStatus || '—') + '</div></div>'
    + '</div>'
    + '<h3>All names this workflow carries in the tenant</h3><ul class="plain">' + w.names.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>'
    + (w.serves.length ? '<h3>Serves</h3><p>' + w.serves.map((k) => pill(k, 'ok')).join(' ') + '</p>'
      : claims.length ? '<div class="note bad"><b>This workflow carries the name ' + claims.map(esc).join(', ')
        + ' but serves no contract key.</b> ' + (w.hasEndpoint ? 'It still answers on a live endpoint, so wiring a key by NAME rather than by workflow id gives a valid, working URL that calls a flow the estate no longer uses — and every format check passes.' : 'It shares no endpoint.')
        + ' ' + claims.map((c) => c + ' is actually served by ' + ((EndpointAtlas.keys.find((k) => k.key === c) || {}).workflowId || '?')).join('; ') + '.</div>'
      : '<p class="muted">Serves no contract key, and carries no contract-key name.</p>')
    + '<div class="row"><a class="btn ghost" target="_blank" rel="noreferrer" href="https://make.powerautomate.com/environments/Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1/flows/' + esc(w.workflowId) + '/details">Open in Power Automate ↗</a>'
    + '<button class="btn ghost" data-close>Close</button></div></section>';
}

/* ---- Findings -------------------------------------------------------------------------- */

function findingsPanel(embedded) {
  const fs = findings({ resolve });
  if (!fs.length) return '<section class="panel"><h2>Nothing to report</h2><p class="muted">Every key resolves to the workflow the register names, with a complete signature, and no workflow is impersonating a key.</p></section>';
  return '<section class="panel"><h2>Findings</h2>'
    + (embedded || loadedCount() ? '' : '<p class="muted">No deployment is loaded, so only estate-level findings are shown.</p>')
    + fs.map((f) => '<div class="finding ' + f.severity + '"><div>' + pill(f.severity, SEV_KIND[f.severity])
      + ' <code>' + esc(f.code) + '</code></div><h3>' + esc(f.title) + '</h3><p class="muted">' + esc(f.detail) + '</p>'
      + (f.items && f.items.length ? '<details><summary class="tiny">' + f.items.length + ' affected</summary>' + itemsHtml(f) + '</details>' : '')
      + '</div>').join('') + '</section>';
}

function itemsHtml(f) {
  if (f.code === 'estate.name-collision') {
    return '<div class="tablewrap"><table><thead><tr><th>Workflow</th><th>Name</th><th>Claims</th><th>Endpoint</th><th>Actually served by</th></tr></thead><tbody>'
      + f.items.map((i) => '<tr data-wf="' + esc(i.workflowId) + '"><td><code>' + esc(i.workflowId) + '</code></td><td>' + esc(i.name) + '</td><td>'
        + i.claims.map((c) => pill(c, 'warn')).join(' ') + '</td><td>'
        + (i.live ? pill('LIVE — callable', 'bad') : pill('none shared')) + '</td><td>'
        + i.servedInsteadBy.map((w) => '<code>' + esc(w) + '</code>').join('<br>') + '</td></tr>').join('')
      + '</tbody></table></div>';
  }
  return '<ul class="plain">' + f.items.map((i) => '<li><code>' + esc(i.key || i.workflowId || '') + '</code>'
    + (i.expected ? ' — register says <code>' + esc(i.expected) + '</code>, calls <code>' + esc(i.actual) + '</code>' : '')
    + (i.length !== undefined ? ' — signature ' + (i.length === null ? 'absent' : i.length + ' chars') : '')
    + (i.surface ? ' — ' + esc(i.surface) : '') + '</li>').join('') + '</ul>';
}

/* ---- Health ---------------------------------------------------------------------------- */

function healthPanel() {
  const readable = describeEstate({ resolve }).filter((r) => r.configured && r.contract && r.contract.readOnly === true);
  const writes = describeEstate({ resolve }).filter((r) => r.configured && !(r.contract && r.contract.readOnly === true));
  return '<section class="panel"><h2>Live health</h2>'
    + '<p class="muted">' + readable.length + ' configured read-only endpoint(s) can be probed safely. '
    + writes.length + ' configured endpoint(s) are writes.</p>'
    + '<div class="note"><b>A browser probe is not conclusive.</b> This page has no origin the flows allow, so a failure may be CORS rather than the endpoint. A JSON answer proves the endpoint responded; a failure proves nothing on its own. <code>npm run verify:endpoints</code> from a checkout is the authoritative check.</div>'
    + '<label class="check"><input type="checkbox" data-writes' + (view.includeWrites ? ' checked' : '') + '> '
    + '<span><b>Include write endpoints.</b> These create real records — correspondence, assignments, emails. Off by default; you will be asked to confirm.</span></label>'
    + '<div class="row"><button class="btn" data-probe' + (loadedCount() ? '' : ' disabled') + '>' + (S.busy ? 'Probing…' : 'Run probe') + '</button>'
    + (S.probe ? '<button class="btn ghost" data-clear-probe>Clear</button><button class="btn ghost" data-probe-csv>Download CSV</button>' : '') + '</div>'
    + (S.probe ? probeResults(S.probe) : '<p class="tiny">No probe has been run in this session.</p>')
    + '</section>';
}

function probeResults(p) {
  const reached = p.rows.filter((r) => r.reached).length;
  return '<div class="kpis">' + kpi('Probed', p.rows.length) + kpi('Answered by the tenant', reached + '/' + p.rows.length)
    + kpi('Ran at', p.at.slice(11, 19) + ' UTC') + '</div>'
    + (reached === 0 && p.rows.length ? '<div class="note bad"><b>Nothing reached Power Automate.</b> Every call was answered by something else, or blocked. This measured the network, not the estate — no conclusion about any signature can be drawn from it.</div>' : '')
    + '<div class="tablewrap"><table><thead><tr><th>Key</th><th>Status</th><th>Latency</th><th>Reached</th><th>Note</th></tr></thead><tbody>'
    + p.rows.map((r) => '<tr><td>' + esc(r.key) + '</td><td>' + (r.status ? pill(String(r.status), r.ok ? 'ok' : 'bad') : pill(r.error || 'no response', 'bad'))
      + '</td><td>' + (r.ms == null ? '—' : r.ms + ' ms') + '</td><td>' + (r.reached ? pill('yes', 'ok') : pill('no', 'warn'))
      + '</td><td class="tiny">' + esc(r.note || '—') + '</td></tr>').join('') + '</tbody></table></div>';
}

/* ---- Rotation -------------------------------------------------------------------------- */

function rotationPanel() {
  const groups = [];
  const seen = new Set();
  for (const k of EndpointAtlas.keys) {
    if (seen.has(k.workflowId)) continue;
    seen.add(k.workflowId);
    groups.push({ workflowId: k.workflowId, flow: k.flow, keys: EndpointAtlas.keys.filter((x) => x.workflowId === k.workflowId) });
  }
  const done = groups.filter((g) => S.rotated[g.workflowId]).length;
  return '<section class="panel"><h2>Rotation plan</h2>'
    + '<p class="muted">Rotation is <b>per flow</b>, not per key: regenerating one trigger invalidates every key on it at once. '
    + groups.length + ' flows serve the ' + EndpointAtlas.keys.length + ' keys, and ' + groups.filter((g) => g.keys.length > 1).length
    + ' of them serve more than one — those keys must be re-signed together or the ones you miss will 401.</p>'
    + '<div class="note">Order matters at the end, not the start: do not treat an old signature as revoked until the new one is confirmed working. Regenerating replaces it, so the sequence is regenerate → sign here → generate configs → deploy → verify.</div>'
    + '<div class="progress"><div class="bar" style="width:' + Math.round(done / groups.length * 100) + '%"></div><span>' + done + ' of ' + groups.length + ' flows marked rotated</span></div>'
    + '<div class="tablewrap"><table><thead><tr><th>Done</th><th>Flow</th><th>Workflow id</th><th>Keys invalidated together</th><th>Signed here</th></tr></thead><tbody>'
    + groups.map((g) => {
      const signed = g.keys.every((k) => sigLen(resolve(k.key)) === SIGNATURE_LENGTH);
      return '<tr><td><input type="checkbox" data-rotated="' + esc(g.workflowId) + '"' + (S.rotated[g.workflowId] ? ' checked' : '') + '></td>'
        + '<td>' + esc(g.flow) + '</td><td><code class="tiny">' + esc(g.workflowId) + '</code></td>'
        + '<td>' + g.keys.map((k) => pill(k.key, k.keys > 1 ? 'warn' : '')).join(' ') + (g.keys.length > 1 ? ' ' + pill(g.keys.length + ' together', 'warn') : '') + '</td>'
        + '<td>' + (signed ? pill('yes', 'ok') : pill('no')) + '</td></tr>';
    }).join('') + '</tbody></table></div>'
    + '<div class="row"><button class="btn ghost" data-rotation-csv>Download plan as CSV</button><button class="btn ghost" data-rotation-reset>Reset ticks</button></div>'
    + '</section>';
}

/* ---- Compare --------------------------------------------------------------------------- */

function comparePanel() {
  if (!loadedCount()) return '<section class="panel"><h2>Compare</h2><p class="muted">Load a deployment first, then load a second one here to diff them.</p></section>';
  if (!S.baseline) {
    return '<section class="panel"><h2>Compare two deployments</h2>'
      + '<p class="muted">Current: <b>' + esc(S.sourceName || 'values entered here') + '</b>. Load a second file — an older <code>config.local.js</code>, a colleague\'s values file, a build you are about to replace — and every difference is listed. Signatures are compared by length and identity, never shown.</p>'
      + '<div class="drop" data-drop-baseline>Drop the second file here — <button class="btn ghost" data-pick-baseline>choose one</button>'
      + '<input type="file" data-file-baseline hidden accept=".txt,.js,.env,text/plain,text/javascript"></div></section>';
  }
  const rows = EndpointAtlas.keys.map((k) => {
    const a = S.urls[k.key] || '', b = S.baseline.urls[k.key] || '';
    const wfA = (/\/workflows\/([0-9a-f]{32})/i.exec(a) || [])[1] || '';
    const wfB = (/\/workflows\/([0-9a-f]{32})/i.exec(b) || [])[1] || '';
    let verdict = 'same';
    if (!a && !b) verdict = 'both empty';
    else if (!a) verdict = 'only in baseline';
    else if (!b) verdict = 'only in current';
    else if (a === b) verdict = 'identical';
    else if (wfA !== wfB) verdict = 'DIFFERENT WORKFLOW';
    else verdict = 'different signature';
    return { key: k.key, verdict, wfA, wfB, sigA: sigLen(a), sigB: sigLen(b) };
  });
  const differing = rows.filter((r) => !['identical', 'both empty'].includes(r.verdict));
  return '<section class="panel"><h2>Compare</h2>'
    + '<p class="muted"><b>Current:</b> ' + esc(S.sourceName || 'values entered here') + ' · <b>Baseline:</b> ' + esc(S.baseline.name) + '</p>'
    + '<div class="kpis">' + kpi('Keys', rows.length) + kpi('Identical', rows.filter((r) => r.verdict === 'identical').length)
    + kpi('Differing', differing.length, differing.length ? 'bad' : 'good')
    + kpi('Different workflow', rows.filter((r) => r.verdict === 'DIFFERENT WORKFLOW').length, rows.some((r) => r.verdict === 'DIFFERENT WORKFLOW') ? 'bad' : '') + '</div>'
    + '<div class="tablewrap"><table><thead><tr><th>Key</th><th>Verdict</th><th>Current workflow</th><th>Baseline workflow</th><th>Signature length</th></tr></thead><tbody>'
    + rows.map((r) => '<tr><td>' + esc(r.key) + '</td><td>' + pill(r.verdict, r.verdict === 'DIFFERENT WORKFLOW' ? 'bad' : r.verdict === 'identical' ? 'ok' : r.verdict === 'both empty' ? '' : 'warn')
      + '</td><td><code class="tiny">' + esc(r.wfA || '—') + '</code></td><td><code class="tiny">' + esc(r.wfB || '—') + '</code></td>'
      + '<td class="tiny">' + (r.sigA === null ? '—' : r.sigA) + ' vs ' + (r.sigB === null ? '—' : r.sigB) + '</td></tr>').join('')
    + '</tbody></table></div>'
    + '<div class="row"><button class="btn ghost" data-clear-baseline>Clear baseline</button><button class="btn ghost" data-compare-csv>Download CSV</button></div></section>';
}

/* ---- Export ---------------------------------------------------------------------------- */

function exportPanel() {
  const s = summarise({ resolve });
  return '<section class="panel"><h2>Configuration files</h2>'
    + '<p class="muted">Written in the same form <code>npm run setup</code> emits, so they drop straight into a checkout or a deployed build. '
    + '<b>These carry live signatures.</b> They are git-ignored by design — never commit them, never send them.</p>'
    + '<div class="kpis">' + kpi('Internal', s.configured ? keysOf('internal').filter((k) => resolve(k.key)).length + '/' + keysOf('internal').length : '0/' + keysOf('internal').length)
    + kpi('Portal', keysOf('portal').filter((k) => resolve(k.key)).length + '/' + keysOf('portal').length) + '</div>'
    + '<div class="row"><button class="btn" data-gen-runtime' + (loadedCount() ? '' : ' disabled') + '>Download config/config.local.js</button>'
    + '<button class="btn" data-gen-portal' + (loadedCount() ? '' : ' disabled') + '>Download document-portal/config.local.js</button>'
    + '<button class="btn ghost" data-gen-both' + (loadedCount() ? '' : ' disabled') + '>Both</button></div>'
    + '</section>'
    + '<section class="panel"><h2>Values file</h2><p class="muted">All ' + EndpointAtlas.keys.length + ' keys, grouped by flow, with anything already entered filled in. Blank ones end at <code>sig=</code>.</p>'
    + '<div class="row"><button class="btn ghost" data-gen-values>Download</button><button class="btn ghost" data-copy-values>Copy</button></div></section>'
    + '<section class="panel"><h2>Redacted report</h2><p class="muted">Estate, findings and every key as JSON, with all signatures replaced by <code>***</code>. Safe to send to support.</p>'
    + '<div class="row"><button class="btn ghost" data-report>Download JSON</button><button class="btn ghost" data-report-copy>Copy</button>'
    + '<button class="btn ghost" data-csv>Download CSV</button><button class="btn ghost" data-print>Print / save as PDF</button></div></section>';
}

/* ---- Reference -------------------------------------------------------------------------- */

function referencePanel() {
  const a = EndpointAtlas;
  return '<section class="panel"><h2>Where these facts come from</h2><div class="tablewrap"><table><tbody>'
    + '<tr><th>Authority</th><td><code>' + esc((a.authority && a.authority.file) || '') + '</code></td></tr>'
    + '<tr><th>Status</th><td>' + esc((a.authority && a.authority.redistributionStatus) || '') + '</td></tr>'
    + '<tr><th>Contract keys</th><td>' + a.keys.length + ' — ' + a.totals.internalKeys + ' internal, ' + a.totals.portalKeys + ' portal</td></tr>'
    + '<tr><th>Workflow records</th><td>' + a.workflows.length + ', of which ' + a.totals.workflowsWithEndpoint + ' share an endpoint and ' + a.totals.workflowsBound + ' are in use</td></tr>'
    + '<tr><th>Built</th><td>' + esc(BUILD.at) + '</td></tr></tbody></table></div>'
    + '<p class="muted">' + esc((a.authority && a.authority.note) || '') + '</p></section>'
    + '<section class="panel"><h2>What this console can and cannot do</h2>'
    + '<h3>It can</h3><ul class="plain">'
    + ['Take all ' + a.keys.length + ' signatures and generate both <code>config.local.js</code> files, byte-compatible with <code>npm run setup</code>',
       'Check every key against the workflow the tenant register names for it',
       'Show all ' + a.workflows.length + ' tenant workflows, including the ones impersonating a contract key',
       'Apply the commissioning readiness gate',
       'Probe read-only endpoints, and write endpoints on explicit opt-in',
       'Diff two deployments',
       'Plan and track a rotation by flow',
       'Export configs, values, a redacted JSON report, CSV, and print'].map((x) => '<li>' + x + '</li>').join('')
    + '</ul><h3>It cannot, by design</h3><ul class="plain">'
    + ['<b>Store anything.</b> No localStorage, no cookie, no IndexedDB — what you type dies with the tab',
       '<b>Transmit anything.</b> Files you load are read in this page; the only network calls are the probes you ask for',
       '<b>Write to a server or a repository.</b> It hands you files; you place them',
       '<b>Invent a signature.</b> Only Power Automate can issue one'].map((x) => '<li>' + x + '</li>').join('')
    + '</ul></section>'
    + '<section class="panel"><h2>The same job from a checkout</h2><ol class="plain">'
    + ['<code>npm run reconcile</code>', '<code>npm run values:template ~/dgo-values.txt</code>',
       '<code>npm run values:sign -- ~/dgo-values.txt &lt;KEY&gt;</code>', '<code>npm run check:values -- ~/dgo-values.txt</code>',
       '<code>npm run setup -- --values ~/dgo-values.txt --force</code>', '<code>npm run commission</code>'].map((x) => '<li>' + x + '</li>').join('')
    + '</ol><p class="tiny">A signature is ' + SIGNATURE_LENGTH + ' characters and is a bearer credential. It belongs only in <code>config.local.js</code>, which is git-ignored — never in a ticket, an email, or a message.</p></section>';
}

/* ── probe ────────────────────────────────────────────────────────────────────────────── */

/**
 * The request a key actually receives, which is not the same request for every key.
 *
 * Twenty-three keys take a POST of a JSON envelope. Two — SCAN_INTAKE and portal UPLOAD —
 * take a PUT of raw document bytes with the filename, size and SHA-256 in headers; that is
 * the whole reason they exist, since base64-in-JSON is what imposed the 4 MB ceiling they
 * replaced. Neither has an `EndpointContracts` entry, by design.
 *
 * A single POST-a-JSON-body probe therefore did not merely mislabel those two, it mis-called
 * them: Power Automate refuses a POST to a PUT-only trigger before the flow runs, so both
 * reported as broken while being correctly wired. The verb comes from the atlas, which the
 * reconciler derives from the caller's own transport declaration, so this console and
 * `npm run verify:endpoints` send the same shape.
 */
async function probeRequest(t) {
  const method = (t.expected && t.expected.method) || (t.contract && t.contract.method) || 'POST';
  if (method === 'PUT') {
    const body = new TextEncoder().encode('__DGO_CONSOLE_PROBE__\n');
    /* The deposit flows read all three headers. The digest is computed rather than omitted or
       faked: a flow that verifies it would reject a probe carrying neither, and the point of
       the probe is to distinguish "wired wrongly" from "refused the payload". */
    const headers = {
      'content-type': 'application/octet-stream',
      'x-dgo-filename': '__DGO_CONSOLE_PROBE__.bin',
      'x-dgo-size': String(body.length),
    };
    const subtle = (globalThis.crypto || {}).subtle;
    if (subtle) {
      const digest = await subtle.digest('SHA-256', body);
      headers['x-dgo-sha256'] = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return { method, headers, body };
  }
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(t.contract && t.contract.action ? { action: t.contract.action } : {}),
  };
}

async function runProbe(onlyKey) {
  let targets = describeEstate({ resolve }).filter((r) => r.configured);
  if (onlyKey) targets = targets.filter((r) => r.key === onlyKey);
  else if (!view.includeWrites) targets = targets.filter((r) => r.contract && r.contract.readOnly === true);
  const rows = [];
  for (const t of targets) {
    const started = Date.now();
    const row = { key: t.key, status: null, ms: null, ok: false, reached: false, note: '', error: '' };
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 30000);
      const res = await fetch(resolve(t.key), Object.assign(await probeRequest(t), { signal: ctl.signal }));
      clearTimeout(timer);
      row.status = res.status; row.ms = Date.now() - started;
      const text = await res.text();
      try { const b = JSON.parse(text); row.reached = true; row.ok = res.ok;
        row.note = 'JSON · keys: ' + (Object.keys(b || {}).slice(0, 6).join(', ') || 'none'); }
      catch { row.note = 'non-JSON body — something other than Power Automate answered'; }
    } catch (e) {
      row.ms = Date.now() - started;
      row.error = e && e.name === 'AbortError' ? 'timed out' : 'blocked or unreachable';
      row.note = 'may be CORS from this page rather than the endpoint — not conclusive';
    }
    rows.push(row);
  }
  return { at: new Date().toISOString(), rows };
}

/* ── CSV ──────────────────────────────────────────────────────────────────────────────── */

const csvCell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
const csv = (headers, rows) => [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');

function estateCsv() {
  return csv(['key', 'surface', 'flow', 'expectedWorkflow', 'actualWorkflow', 'method', 'configured', 'signatureLength', 'status', 'sharesFlowWith'],
    describeEstate({ resolve }).map((r) => [r.key, r.surface, (r.expected && r.expected.flow) || '', (r.expected && r.expected.workflowId) || '',
      r.actualWorkflow || '', (r.expected && r.expected.method) || '', r.configured, r.signatureLength, r.status, r.sharesFlowWith.join(' ')]));
}

/* ── render ───────────────────────────────────────────────────────────────────────────── */

const TABS = [['overview', 'Overview'], ['commission', 'Commission'], ['endpoints', 'Endpoints'],
  ['estate', 'Flow estate'], ['findings', 'Findings'], ['health', 'Health'],
  ['rotation', 'Rotation'], ['compare', 'Compare'], ['export', 'Export'], ['reference', 'Reference']];

function panelFor(tab) {
  switch (tab) {
    case 'commission': return commissionPanel();
    case 'endpoints': return endpointsPanel();
    case 'estate': return estatePanel();
    case 'findings': return findingsPanel();
    case 'health': return healthPanel();
    case 'rotation': return rotationPanel();
    case 'compare': return comparePanel();
    case 'export': return exportPanel();
    case 'reference': return referencePanel();
    default: return overviewPanel();
  }
}

function render() {
  $('#app').innerHTML = summaryStrip()
    + '<nav class="tabs">' + TABS.map(([v, l]) => '<button data-tab="' + v + '" aria-selected="' + (view.tab === v) + '">' + l + '</button>').join('') + '</nav>'
    + panelFor(view.tab);
  if (location.hash.slice(1) !== view.tab) history.replaceState(null, '', '#' + view.tab);
}

/* ── events ───────────────────────────────────────────────────────────────────────────── */

document.addEventListener('click', async (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const el = t.closest('[data-tab],[data-surface],[data-status],[data-estate],[data-sort],[data-key],[data-wf],[data-close],'
    + '[data-pick],[data-pick-baseline],[data-paste-toggle],[data-paste-load],[data-unload],[data-probe],[data-probe-one],'
    + '[data-clear-probe],[data-gen-runtime],[data-gen-portal],[data-gen-both],[data-gen-values],[data-copy-values],'
    + '[data-report],[data-report-copy],[data-csv],[data-print],[data-clear-sigs],[data-clear-sig],[data-clear-baseline],'
    + '[data-compare-csv],[data-probe-csv],[data-rotation-csv],[data-rotation-reset]');
  if (!el) return;
  const a = (n) => el.getAttribute(n);

  if (a('data-tab') !== null) { view.tab = a('data-tab'); view.selected = null; view.wf = null; view.q = ''; return render(); }
  if (a('data-surface') !== null) { view.surface = a('data-surface'); return render(); }
  if (a('data-status') !== null) { view.status = a('data-status'); return render(); }
  if (a('data-estate') !== null) { view.estateFilter = a('data-estate'); return render(); }
  if (a('data-sort') !== null) { const k = a('data-sort'); view.sortDir = view.sortKey === k ? -view.sortDir : 1; view.sortKey = k; return render(); }
  if (a('data-close') !== null) { view.selected = null; view.wf = null; return render(); }
  if (a('data-wf') !== null) { view.wf = a('data-wf'); view.tab = 'estate'; render(); $('[data-detail]') && $('[data-detail]').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
  if (a('data-key') !== null) { view.selected = a('data-key'); render(); $('[data-detail]') && $('[data-detail]').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
  if (a('data-pick') !== null) { $('[data-file]').click(); return; }
  if (a('data-pick-baseline') !== null) { $('[data-file-baseline]').click(); return; }
  if (a('data-paste-toggle') !== null) { const p = $('[data-paste]'); p.hidden = !p.hidden; return; }
  if (a('data-paste-load') !== null) { load($('[data-paste-text]').value, 'pasted text'); return; }
  if (a('data-unload') !== null) { S = { urls: {}, sourceName: '', baseline: null, probe: null, rotated: S.rotated, busy: false }; view.selected = null; view.tab = 'overview'; toast('Cleared.'); return render(); }
  if (a('data-clear-baseline') !== null) { S.baseline = null; return render(); }

  if (a('data-clear-sigs') !== null) {
    if (!confirm('Clear every signature entered in this session?\n\nNothing on any server changes. Files you have already downloaded are unaffected.')) return;
    S.urls = {}; S.sourceName = ''; toast('All signatures cleared.'); return render();
  }
  if (a('data-clear-sig') !== null) { applySignature(a('data-clear-sig'), ''); return render(); }

  if (a('data-probe') !== null || a('data-probe-one') !== null) {
    const one = a('data-probe-one');
    if (!one && view.includeWrites) {
      const writes = describeEstate({ resolve }).filter((r) => r.configured && !(r.contract && r.contract.readOnly === true));
      if (writes.length && !confirm('Probe ' + writes.length + ' WRITE endpoint(s)?\n\n'
        + writes.map((r) => r.key).join(', ') + '\n\nThese create real records — correspondence, assignments, emails — in the live registry. Continue?')) return;
    }
    S.busy = true; render();
    try { const res = await runProbe(one); S.probe = one && S.probe ? { at: res.at, rows: S.probe.rows.filter((r) => r.key !== one).concat(res.rows) } : res; }
    finally { S.busy = false; render(); }
    return;
  }
  if (a('data-clear-probe') !== null) { S.probe = null; return render(); }

  if (a('data-gen-runtime') !== null || a('data-gen-both') !== null) {
    download('config.local.js', renderRuntimeConfig(S.urls), 'text/javascript');
    toast('config/config.local.js downloaded. It carries live signatures — never commit it.');
  }
  if (a('data-gen-portal') !== null || a('data-gen-both') !== null) {
    setTimeout(() => download('portal.config.local.js', renderPortalConfig(S.urls), 'text/javascript'), a('data-gen-both') !== null ? 400 : 0);
    if (a('data-gen-both') === null) toast('document-portal/config.local.js downloaded. Rename it to config.local.js.');
    else toast('Both files downloaded. Rename portal.config.local.js to config.local.js in document-portal/.');
  }
  if (a('data-gen-values') !== null) { download('dgo-values.txt', valuesFileText(S.urls)); return; }
  if (a('data-copy-values') !== null) { return copy(valuesFileText(S.urls), 'Values file'); }
  if (a('data-report') !== null) { download('dgo-endpoint-report.json', JSON.stringify(exportReport({ resolve }), null, 2), 'application/json'); return; }
  if (a('data-report-copy') !== null) { return copy(JSON.stringify(exportReport({ resolve }), null, 2), 'Redacted report'); }
  if (a('data-csv') !== null) { download('dgo-endpoints.csv', estateCsv(), 'text/csv'); return; }
  if (a('data-print') !== null) { window.print(); return; }
  if (a('data-probe-csv') !== null && S.probe) {
    download('dgo-probe.csv', csv(['key', 'status', 'ms', 'reached', 'note'], S.probe.rows.map((r) => [r.key, r.status || r.error, r.ms, r.reached, r.note])));
    return;
  }
  if (a('data-rotation-csv') !== null) {
    const seen = new Set(); const rows = [];
    for (const k of EndpointAtlas.keys) {
      if (seen.has(k.workflowId)) continue; seen.add(k.workflowId);
      const ks = EndpointAtlas.keys.filter((x) => x.workflowId === k.workflowId);
      rows.push([k.flow, k.workflowId, ks.map((x) => x.key).join(' '), ks.length, S.rotated[k.workflowId] ? 'yes' : 'no']);
    }
    download('dgo-rotation-plan.csv', csv(['flow', 'workflowId', 'keys', 'keyCount', 'rotated'], rows));
    return;
  }
  if (a('data-rotation-reset') !== null) { S.rotated = {}; return render(); }
  if (a('data-compare-csv') !== null && S.baseline) {
    download('dgo-compare.csv', csv(['key', 'verdict'], EndpointAtlas.keys.map((k) => {
      const x = S.urls[k.key] || '', y = S.baseline.urls[k.key] || '';
      return [k.key, !x && !y ? 'both empty' : !x ? 'only in baseline' : !y ? 'only in current' : x === y ? 'identical' : 'different'];
    })));
    return;
  }
});

/* Signature entry: applied on blur or Enter, not on every keystroke — re-rendering mid-paste
   would steal the caret, and a 43-character value arrives in one paste anyway. */
function commitSignature(input) {
  const wf = input.getAttribute('data-sig');
  const res = applySignature(wf, input.value);
  if (!res.ok) { input.classList.add('bad'); toast(res.why, 'bad'); return; }
  input.value = '';
  render();
  const next = $$('[data-sig]').find((i) => !i.closest('.issue').classList.contains('good'));
  if (next) next.focus();
}

document.addEventListener('keydown', (e) => {
  const sig = e.target.closest && e.target.closest('[data-sig]');
  if (sig && e.key === 'Enter') { e.preventDefault(); commitSignature(sig); }
  if (e.key === 'Escape' && (view.selected || view.wf)) { view.selected = null; view.wf = null; render(); }
});
document.addEventListener('blur', (e) => {
  const sig = e.target.closest && e.target.closest('[data-sig]');
  if (sig && sig.value.trim()) commitSignature(sig);
}, true);

document.addEventListener('input', (e) => {
  const q = e.target.closest('[data-q]');
  if (q) {
    view.q = q.value; const pos = q.selectionStart; render();
    const again = $('[data-q]'); if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    return;
  }
  const w = e.target.closest('[data-writes]');
  if (w) { view.includeWrites = w.checked; return; }
  const rot = e.target.closest('[data-rotated]');
  if (rot) { S.rotated[rot.getAttribute('data-rotated')] = rot.checked; render(); }
});

document.addEventListener('change', (e) => {
  const f = e.target.closest('[data-file]');
  if (f && f.files && f.files[0]) { const file = f.files[0]; file.text().then((t) => load(t, file.name)); return; }
  const b = e.target.closest('[data-file-baseline]');
  if (b && b.files && b.files[0]) { const file = b.files[0]; file.text().then((t) => load(t, file.name, true)); }
});

for (const [ev, fn] of [['dragover', (d, e) => { e.preventDefault(); d.classList.add('over'); }],
                        ['dragleave', (d) => d.classList.remove('over')]]) {
  document.addEventListener(ev, (e) => { const d = e.target.closest('[data-drop],[data-drop-baseline]'); if (d) fn(d, e); });
}
document.addEventListener('drop', (e) => {
  const d = e.target.closest('[data-drop],[data-drop-baseline]');
  if (!d) return;
  e.preventDefault(); d.classList.remove('over');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) file.text().then((t) => load(t, file.name, d.hasAttribute('data-drop-baseline')));
});

window.addEventListener('hashchange', () => {
  const t = location.hash.slice(1);
  if (TABS.some(([v]) => v === t) && t !== view.tab) { view.tab = t; render(); }
});

const initial = location.hash.slice(1);
if (TABS.some(([v]) => v === initial)) view.tab = initial;
render();
