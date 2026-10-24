'use strict';

/* NITDA Flow Operations Workbench
 *
 * CATALOG is injected ahead of this file by build.py. It carries only the flow
 * definitions that are HTTP-addressable: Request/PowerAppV2 triggers are excluded
 * at build time because they are invoked through the Power Platform connector
 * rather than by posting to a URL.
 *
 * Every count shown in the UI is derived from CATALOG. Nothing here is hardcoded
 * to a flow total, so the catalogue and the display cannot drift apart.
 */

const RELAY_ORIGIN = 'http://127.0.0.1:8765';
const RESULTS_KEY = 'nitda-flow-results-v3';
const PROFILES_KEY = 'nitda-endpoint-profiles-v3';
const MAX_RESULTS = 500;

let selected = 0;
let outcomes = load(RESULTS_KEY, []);
let profiles = migrateProfiles(load(PROFILES_KEY, {}), load('nitda-endpoint-profiles-v2', {}));
let relayReachable = false;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.warn('localStorage write failed', e); return false; }
}

/* Escapes for both text and quoted-attribute contexts. The attribute cases below
 * interpolate field names and descriptions that come from the flow definitions,
 * so quotes have to be escaped as well as angle brackets. */
function esc(x) {
  return String(x ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- flow identity ---------------------------------------------------
 * workflowId is NOT unique in the repository: several distinct flows share one
 * (for example three flows named "_References_Matrix-POST"). Endpoint profiles
 * are therefore keyed on workflowId plus the source file hash, so storing a URL
 * for one flow can never overwrite another's. */

function flowKey(flow) {
  return flow.workflowId + '::' + flow.sourceSha256;
}

function migrateProfiles(current, legacy) {
  const out = { ...current };
  let ambiguous = 0;
  for (const [oldKey, value] of Object.entries(legacy)) {
    if (oldKey.includes('::')) continue;
    const matches = CATALOG.flows.filter(f => f.workflowId === oldKey);
    if (matches.length === 1) {
      const key = flowKey(matches[0]);
      if (!(key in out)) out[key] = value;
    } else if (matches.length > 1) {
      ambiguous++;
    }
  }
  if (ambiguous) {
    console.warn(ambiguous + ' legacy endpoint profile(s) were not migrated: their ' +
      'workflowId maps to more than one flow, so the intended target is unknown.');
  }
  return out;
}

function currentFlow() { return CATALOG.flows[selected]; }
function currentTrigger() { return currentFlow().triggers[0] || {}; }

/* Power Automate treats a Request trigger with no declared method as accepting any
 * method. POST is the working default, but it is always shown as an assumption. */
function effectiveMethod(trigger) { return trigger.method || 'POST'; }

function triggerLabel(flow) {
  const t = flow.triggers[0] || {};
  if (t.kind === 'Http') return { cls: 'yes', text: 'HTTP TRIGGER' };
  if (t.type === 'Request') return { cls: 'alt', text: (t.kind || 'REQUEST').toUpperCase() + ' TRIGGER' };
  return { cls: 'no', text: 'EVENT TRIGGER' };
}

/* ---------- boot ---------------------------------------------------------- */

function init() {
  try {
    if (!Array.isArray(CATALOG.flows) || !CATALOG.flows.length) {
      throw new Error('flow catalog is empty');
    }
    if (CATALOG.flowCount !== CATALOG.flows.length) {
      throw new Error('flow catalog integrity failed: declared ' + CATALOG.flowCount +
        ', embedded ' + CATALOG.flows.length);
    }
    buildSearchIndex();
    renderDash();
    renderList();
    selectFlow(0);
    renderOutcomes();
    renderProfiles();
    $('#runtime').textContent = 'ACTIVE · ' + CATALOG.flows.length + ' SHAPES EMBEDDED';
    probeRelay();
  } catch (e) {
    $('#runtime').textContent = 'FAILED · ' + e.message;
    $('#runtime').style.background = '#a31229';
    console.error(e);
  }
}

/* The relay exists because Power Automate endpoints send no CORS headers, so a
 * direct browser send can never read the response. Prefer it when it is running. */
async function probeRelay() {
  try {
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), 1500);
    const r = await fetch(RELAY_ORIGIN + '/api/health', { signal: c.signal });
    clearTimeout(timer);
    relayReachable = r.ok;
  } catch { relayReachable = false; }
  if (relayReachable) $('#mode').value = 'relay';
  renderModeHint();
}

function renderModeHint() {
  const relay = $('#mode').value === 'relay';
  const el = $('#modeHint');
  if (relay) {
    el.className = relayReachable ? 'ok' : 'error';
    el.textContent = relayReachable
      ? 'Relay detected on ' + RELAY_ORIGIN + '. Responses will be readable.'
      : 'Relay not detected. Start it with "python3 local_agent.py" and open this page through ' + RELAY_ORIGIN + '.';
  } else {
    el.className = 'warn';
    el.textContent = 'Direct browser sends are blocked by CORS against Power Automate endpoints: ' +
      'the request may reach the flow, but the response cannot be read. Use the relay to see results.';
  }
}

/* ---------- dashboard ----------------------------------------------------- */

function renderDash() {
  const flows = CATALOG.flows;
  const byKind = {};
  for (const f of flows) {
    const k = (f.triggers[0] || {}).kind || 'other';
    byKind[k] = (byKind[k] || 0) + 1;
  }
  const metrics = [
    ['Flows', flows.length],
    ['HTTP triggers', byKind.Http || 0],
    ['Request fields', flows.reduce((n, f) => n + (f.triggers[0]?.fields.length || 0), 0)],
    ['Actions', flows.reduce((n, f) => n + (f.actionCount || 0), 0)],
    ['Mail actions', flows.reduce((n, f) => n + (f.mailActions?.length || 0), 0)]
  ];
  $('#metrics').innerHTML = metrics
    .map(([label, value]) => `<div class="card metric"><span class="small">${esc(label)}</span><b>${esc(value)}</b></div>`)
    .join('');
}

/* ---------- flow list ----------------------------------------------------- */

/* Built once. The previous build stringified every flow on every keystroke,
 * which meant scanning well over a megabyte of JSON per character typed. */
let searchIndex = [];

function buildSearchIndex() {
  searchIndex = CATALOG.flows.map(f => JSON.stringify(f).toLowerCase());
}

function renderList() {
  const q = ($('#q')?.value || '').trim().toLowerCase();
  const httpOnly = $('#only')?.checked;
  const rows = CATALOG.flows
    .map((f, i) => ({ f, i }))
    .filter(({ f, i }) => (!httpOnly || (f.triggers[0] || {}).kind === 'Http') &&
      (!q || searchIndex[i].includes(q)));
  $('#flowList').innerHTML = rows.map(({ f, i }) => {
    const badge = triggerLabel(f);
    const fields = f.triggers[0]?.fields.length || 0;
    return `<button class="flow ${i === selected ? 'sel' : ''}" onclick="selectFlow(${i})">` +
      `<b>${esc(f.name)}</b><br>` +
      `<span class="small">${esc(f.workflowId)}</span><br>` +
      `<span class="badge ${badge.cls}">${esc(badge.text)}</span> · ${fields} fields</button>`;
  }).join('') || '<div class="warn">No flow matches this search.</div>';
  $('#listCount').textContent = rows.length + ' of ' + CATALOG.flows.length + ' flows';
}

/* ---------- flow detail --------------------------------------------------- */

function selectFlow(i) {
  selected = i;
  renderList();
  const flow = currentFlow();
  const t = currentTrigger();
  const methodNote = t.method
    ? esc(t.method)
    : 'not declared &mdash; defaulting to POST';

  $('#flowTitle').textContent = flow.name;
  $('#meta').innerHTML =
    `<b>Workflow ID:</b> ${esc(flow.workflowId)}<br>` +
    `<b>Source:</b> ${esc(flow.sourcePath)}<br>` +
    `<b>Source SHA-256:</b> ${esc(flow.sourceSha256)}<br>` +
    `<b>Exported:</b> ${esc(flow.exportedAtUtc)}<br>` +
    `<b>Trigger:</b> ${esc(t.type)} / ${esc(t.kind)}<br>` +
    `<b>Method:</b> ${methodNote}<br>` +
    `<b>Authentication:</b> ${esc(t.authentication || 'not stated')}<br>` +
    `<b>Additional properties allowed:</b> ${esc(String(t.allowsAdditionalProperties))}<br>` +
    `<b>Required fields:</b> ${t.requiredFields?.length ? esc(t.requiredFields.join(', ')) : 'none declared'}<br>` +
    `<b>Connectors:</b> ${flow.connectors?.length ? esc(flow.connectors.join(', ')) : 'none'}`;

  $('#shapeTable').innerHTML = shapeRows(t.fields || []);
  $('#schema').textContent = JSON.stringify(t.schema || {}, null, 2);
  $('#responses').textContent = JSON.stringify(flow.responses, null, 2);
  $('#actions').innerHTML =
    '<tr><th>Name</th><th>Type</th><th>Operation</th><th>Path</th></tr>' +
    flow.actions.map(a =>
      `<tr><td>${esc(a.name)}</td><td>${esc(a.type)}</td><td>${esc(a.operationId || '')}</td><td>${esc(a.path)}</td></tr>`
    ).join('');

  $('#shapeForm').innerHTML = formRows(t.fields || []);
  $('#method').value = effectiveMethod(t);
  $('#selectedName').value = flow.name;
  $('#url').value = profiles[flowKey(flow)]?.url || '';

  /* Reset the composer when the flow changes. Carrying the previous flow's body
   * over meant it was validated against, and could be sent to, a different flow. */
  $('#headers').value = '{}';
  $('#requestBody').value = '{}';
  composeFromForm();

  const kind = t.kind;
  const note = $('#triggerNote');
  if (kind === 'Http') {
    note.classList.add('hidden');
  } else {
    note.classList.remove('hidden');
    note.textContent = 'This flow uses a ' + (t.type || 'non-HTTP') + ' / ' + (t.kind || 'n/a') +
      ' trigger rather than an HTTP request trigger. It is enabled here and will be sent exactly ' +
      'as composed; supply the authorized endpoint URL for it.';
  }
  $('#alignResult').textContent = 'No alignment report generated.';
  updateSendState();
}

function shapeRows(rows) {
  return '<tr><th>Path</th><th>Type</th><th>Required</th><th>Format / constraints</th><th>Description</th></tr>' +
    rows.map(r => {
      const constraints = [
        r.format,
        r.enum ? 'enum: ' + r.enum.join(', ') : '',
        r.minLength != null ? 'minLength ' + r.minLength : '',
        r.maxLength != null ? 'maxLength ' + r.maxLength : '',
        r.minimum != null ? 'minimum ' + r.minimum : '',
        r.maximum != null ? 'maximum ' + r.maximum : '',
        r.pattern ? 'pattern ' + r.pattern : ''
      ].filter(Boolean).join('; ');
      return `<tr><td><code>${esc(r.path)}</code></td>` +
        `<td>${esc(r.types.join(' | '))}</td>` +
        `<td class="${r.required ? 'required' : 'optional'}">${r.required ? 'REQUIRED' : 'optional'}</td>` +
        `<td>${esc(constraints)}</td><td>${esc(r.description)}</td></tr>`;
    }).join('');
}

/* The placeholder states the expected value; the line beneath states its meaning.
 * Both previously showed the description, so every field read twice. */
function valueHint(r) {
  if (r.enum) return r.enum.join(' | ');
  if (r.format) return r.format;
  const t = r.types.filter(x => x !== 'null');
  const base = (t.length ? t : r.types).join(' | ');
  return r.types.includes('object') || r.types.includes('array') ? base + ' (JSON)' : base;
}

function formRows(rows) {
  const top = rows.filter(r => r.path.split('.').length === 2);
  return top.map(r =>
    `<div class="shape"><label><code>${esc(r.name)}</code> ` +
    `<span class="${r.required ? 'required' : 'optional'}">${r.required ? 'required' : 'optional'}</span>` +
    `<input data-field="${esc(r.name)}" data-types="${esc(JSON.stringify(r.types))}" ` +
    `placeholder="${esc(valueHint(r))}" oninput="composeFromForm()"></label>` +
    (r.description ? `<div class="small">${esc(r.description)}</div>` : '') +
    `</div>`
  ).join('') || '<div class="warn">No top-level properties declared in this trigger schema.</div>';
}

/* ---------- composer ------------------------------------------------------ */

function parseVal(v, types) {
  if (!v.length) return undefined;
  if (types.includes('integer')) { const n = Number(v); return Number.isInteger(n) ? n : v; }
  if (types.includes('number')) { const n = Number(v); return Number.isFinite(n) ? n : v; }
  if (types.includes('boolean')) return v === 'true' ? true : v === 'false' ? false : v;
  if (types.includes('object') || types.includes('array')) {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

function composeFromForm() {
  const o = {};
  $$('#shapeForm [data-field]').forEach(el => {
    const v = parseVal(el.value, JSON.parse(el.dataset.types));
    if (v !== undefined) o[el.dataset.field] = v;
  });
  /* Assigning .value does not fire oninput, so this cannot loop with fillFormFromJson. */
  $('#requestBody').value = JSON.stringify(o, null, 2);
  validatePayload();
}

function fillFormFromJson() {
  let o;
  try { o = JSON.parse($('#requestBody').value || '{}'); }
  catch { validatePayload(); return; }
  $$('#shapeForm [data-field]').forEach(el => {
    const v = o[el.dataset.field];
    el.value = v === undefined ? '' : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
  });
  validatePayload();
}

/* ---------- validation ----------------------------------------------------
 * Walks type, enum, required, properties, items, min/max, length, pattern and
 * the email format. The trigger schemas in this repository are flat and use none
 * of anyOf/oneOf/allOf/$ref, so those keywords are intentionally not handled; a
 * schema using them would need this extended. */

function validateValue(v, s, path, errs) {
  const ts = Array.isArray(s.type) ? s.type : [s.type];
  if (v === null) {
    if (s.type && !ts.includes('null')) errs.push(path + ' must not be null');
    return;
  }
  let actual = Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
  if (actual === 'integer' && !ts.includes('integer') && ts.includes('number')) actual = 'number';
  if (s.type && !ts.includes(actual)) {
    errs.push(path + ' type ' + actual + ' not in ' + ts.join('|'));
  }
  if (typeof v === 'string') {
    if (s.minLength != null && v.length < s.minLength) errs.push(path + ' shorter than ' + s.minLength);
    if (s.maxLength != null && v.length > s.maxLength) errs.push(path + ' longer than ' + s.maxLength);
    if (s.format === 'email' && !/^\S+@\S+\.\S+$/.test(v)) errs.push(path + ' invalid email');
    if (s.pattern) {
      try { if (!new RegExp(s.pattern).test(v)) errs.push(path + ' pattern mismatch'); }
      catch { /* an unsupported pattern is not the operator's error */ }
    }
  }
  if (s.enum && !s.enum.includes(v)) errs.push(path + ' not in enum');
  if (typeof v === 'number') {
    if (s.minimum != null && v < s.minimum) errs.push(path + ' below minimum');
    if (s.maximum != null && v > s.maximum) errs.push(path + ' above maximum');
  }
  if (actual === 'object') {
    for (const k of s.required || []) if (!(k in v)) errs.push(path + '.' + k + ' required');
    for (const [k, val] of Object.entries(v)) {
      if (s.properties?.[k]) validateValue(val, s.properties[k], path + '.' + k, errs);
      else if (s.additionalProperties === false) errs.push(path + '.' + k + ' additional property not allowed');
    }
  }
  if (actual === 'array' && s.items) {
    for (let i = 0; i < v.length; i++) validateValue(v[i], s.items, path + '[' + i + ']', errs);
  }
}

function validatePayload() {
  const t = currentTrigger();
  const errs = [];
  let o;
  try { o = JSON.parse($('#requestBody').value || '{}'); }
  catch (e) { errs.push('Invalid JSON: ' + e.message); }
  if (o !== undefined) validateValue(o, t.schema || {}, '$', errs);

  const el = $('#validation');
  if (errs.length) {
    el.className = 'error';
    el.innerHTML = '<b>INVALID</b><br>' + errs.map(esc).join('<br>');
  } else {
    el.className = 'ok';
    const declared = (t.schema?.required || []).length;
    el.innerHTML = '<b>SHAPE OK</b><br><span class="small">Checked against the trigger schema in ' +
      esc(currentFlow().sourcePath) + '. ' +
      (declared ? declared + ' required field(s) declared. ' : 'This schema declares no required fields, ') +
      (t.allowsAdditionalProperties === false ? '' : 'and it accepts additional properties, ') +
      'so a passing result confirms the shape only &mdash; not business authority, tenant state, or that the ' +
      'values are correct.</span>';
  }
  updateSendState();
  return { valid: !errs.length, errors: errs, body: o };
}

function alignment() {
  const v = validatePayload();
  const flow = currentFlow();
  const t = currentTrigger();
  const report = {
    schema: 'nitda-request-alignment/v2',
    generatedAt: new Date().toISOString(),
    flowName: flow.name,
    workflowId: flow.workflowId,
    sourcePath: flow.sourcePath,
    sourceSha256: flow.sourceSha256,
    triggerType: t.type,
    triggerKind: t.kind,
    triggerMethod: t.method,
    methodAssumed: !t.method,
    authentication: t.authentication,
    requestSchema: t.schema,
    requestBody: v.body,
    aligned: v.valid,
    errors: v.errors
  };
  $('#alignResult').textContent = JSON.stringify(report, null, 2);
  return report;
}

/* ---------- endpoint profiles --------------------------------------------- */

const REDACT_RE = /sig|token|code|key|secret|password/i;

/* The redaction marker is written without brackets: URLSearchParams.toString()
 * percent-encodes them, which turned masked URLs into "sig=%5BREDACTED%5D". */
function mask(u) {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) {
      if (REDACT_RE.test(k)) x.searchParams.set(k, 'REDACTED');
    }
    return x.toString();
  } catch { return 'INVALID-URL'; }
}

function isHttps(u) {
  try { return new URL(u).protocol === 'https:'; } catch { return false; }
}

function updateSendState() {
  /* Every catalogued flow may be sent. The only gate is a usable HTTPS endpoint. */
  $('#sendBtn').disabled = !isHttps($('#url').value.trim());
}

function toggleUrl() {
  const el = $('#url');
  const hidden = el.type === 'password';
  el.type = hidden ? 'text' : 'password';
  $('#revealBtn').textContent = hidden ? 'Hide' : 'Reveal';
}

function saveProfile() {
  const flow = currentFlow();
  const u = $('#url').value.trim();
  if (!isHttps(u)) { alert('A valid HTTPS endpoint URL is required.'); return; }
  profiles[flowKey(flow)] = { url: u, flowName: flow.name, workflowId: flow.workflowId, savedAt: new Date().toISOString() };
  if (!save(PROFILES_KEY, profiles)) { alert('Browser storage is unavailable, so this URL was not stored.'); return; }
  renderProfiles();
  alert('Stored in this browser only. Exports redact signature, token, code, key, secret and password query parameters.');
}

function deleteProfile(key) {
  if (!confirm('Remove the stored endpoint for this flow?')) return;
  delete profiles[key];
  save(PROFILES_KEY, profiles);
  renderProfiles();
  if (profiles[flowKey(currentFlow())] === undefined) { $('#url').value = ''; updateSendState(); }
}

function renderProfiles() {
  const entries = Object.entries(profiles);
  $('#profiles').innerHTML =
    '<tr><th>Flow</th><th>Workflow ID</th><th>Endpoint (masked)</th><th>Saved</th><th></th></tr>' +
    (entries.length
      ? entries.map(([key, p]) =>
          `<tr><td>${esc(p.flowName)}</td><td>${esc(p.workflowId)}</td>` +
          `<td>${esc(mask(p.url))}</td><td>${esc(p.savedAt || '')}</td>` +
          `<td><button class="danger" onclick="deleteProfile('${esc(key)}')">Remove</button></td></tr>`
        ).join('')
      : '<tr><td colspan="5">No endpoints stored.</td></tr>');
}

/* ---------- sending ------------------------------------------------------- */

function readTimeout() {
  const n = Number($('#timeout').value);
  if (!Number.isFinite(n)) return 60;
  return Math.min(Math.max(Math.round(n), 1), 300);
}

async function sendRequest() {
  const v = validatePayload();
  if (!v.valid) { alert('Request shape is not aligned. Correct the validation errors first.'); return; }

  const u = $('#url').value.trim();
  if (!isHttps(u)) { alert('An authorized HTTPS endpoint URL is required.'); return; }

  let headers;
  try { headers = JSON.parse($('#headers').value || '{}'); }
  catch (e) { alert('Invalid headers JSON: ' + e.message); return; }
  if (headers === null || typeof headers !== 'object' || Array.isArray(headers)) {
    alert('Headers must be a JSON object.'); return;
  }

  const flow = currentFlow();
  const mode = $('#mode').value;
  const method = $('#method').value;
  const timeoutSeconds = readTimeout();
  const at = new Date().toISOString();
  const start = performance.now();
  const sendBtn = $('#sendBtn');
  let res;

  sendBtn.disabled = true;
  $('#result').textContent = 'Sending...';
  try {
    if (mode === 'relay') {
      const r = await fetch(RELAY_ORIGIN + '/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u, method, headers, body: v.body, timeoutSeconds })
      });
      if (!r.ok) throw new Error('Relay returned HTTP ' + r.status);
      res = await r.json();
    } else {
      /* The previous build ignored the timeout entirely in direct mode. */
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
      try {
        const r = await fetch(u, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify(v.body),
          signal: controller.signal
        });
        const txt = await r.text();
        let body;
        try { body = JSON.parse(txt); } catch { body = txt; }
        res = {
          ok: r.ok, status: r.status, statusText: r.statusText,
          headers: Object.fromEntries(r.headers.entries()), body,
          durationMs: Math.round(performance.now() - start)
        };
      } finally { clearTimeout(timer); }
    }
  } catch (e) {
    res = {
      ok: false,
      error: e.name === 'AbortError' ? 'Timed out after ' + timeoutSeconds + 's' : e.message,
      hint: mode === 'direct'
        ? 'Direct browser sends are subject to CORS. Use the relay to read responses.'
        : 'Check that local_agent.py is running on ' + RELAY_ORIGIN + '.',
      durationMs: Math.round(performance.now() - start)
    };
  }

  const record = {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
    at, flowName: flow.name, workflowId: flow.workflowId, sourceSha256: flow.sourceSha256,
    mode, method, methodAssumed: !currentTrigger().method, urlMasked: mask(u),
    requestAlignment: alignment(), response: res
  };
  outcomes.unshift(record);
  outcomes = outcomes.slice(0, MAX_RESULTS);
  save(RESULTS_KEY, outcomes);
  $('#result').textContent = JSON.stringify(res, null, 2);
  renderOutcomes();
  updateSendState();
}

/* ---------- outcomes ------------------------------------------------------ */

function renderOutcomes() {
  $('#history').innerHTML =
    '<tr><th>Time</th><th>Flow</th><th>Mode</th><th>Shape</th><th>Status</th><th>Duration</th><th></th></tr>' +
    (outcomes.length
      ? outcomes.map((h, i) =>
          `<tr><td>${esc(h.at)}</td><td>${esc(h.flowName)}</td><td>${esc(h.mode)}</td>` +
          `<td>${h.requestAlignment?.aligned ? 'Yes' : 'No'}</td>` +
          `<td>${esc(h.response?.status ?? (h.response?.ok ? 'OK' : 'ERROR'))}</td>` +
          `<td>${esc(h.response?.durationMs ?? '')}</td>` +
          `<td><button onclick="view(${i})">View</button></td></tr>`
        ).join('')
      : '<tr><td colspan="7">No requests sent.</td></tr>');
}

function view(i) { $('#historyDetail').textContent = JSON.stringify(outcomes[i], null, 2); }

function clearHistory() {
  if (!confirm('Clear all recorded outcomes?')) return;
  outcomes = [];
  save(RESULTS_KEY, outcomes);
  renderOutcomes();
  $('#historyDetail').textContent = '';
}

/* ---------- exports ------------------------------------------------------- */

function download(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* Matches ALL_FLOW_REQUEST_SHAPES.json exactly; both are nitda-all-request-shapes/v2. */
function shapesDocument() {
  return {
    schema: 'nitda-all-request-shapes/v2',
    generatedAt: new Date().toISOString(),
    sourceBoundary: CATALOG.sourceBoundary,
    excludedTriggerKinds: CATALOG.excludedTriggerKinds,
    flowCount: CATALOG.flows.length,
    flows: CATALOG.flows.map(flow => ({
      name: flow.name,
      workflowId: flow.workflowId,
      sourcePath: flow.sourcePath,
      sourceSha256: flow.sourceSha256,
      triggers: flow.triggers.map(t => ({
        name: t.name, type: t.type, kind: t.kind, method: t.method,
        authentication: t.authentication, schema: t.schema, fields: t.fields,
        requiredFields: t.requiredFields, allowsAdditionalProperties: t.allowsAdditionalProperties
      }))
    }))
  };
}

function exportHistory() {
  download('nitda-flow-outcomes.json',
    { schema: 'nitda-flow-outcomes/v3', exportedAt: new Date().toISOString(), results: outcomes });
}
function exportCatalog() { download('nitda-flow-catalog-with-request-shapes.json', CATALOG); }
function exportAlignment() { download('nitda-request-alignment.json', alignment()); }
function exportShapes() { download('nitda-all-flow-request-shapes.json', shapesDocument()); }
function exportProfiles() {
  download('nitda-endpoint-profiles-redacted.json', {
    schema: 'nitda-endpoint-profiles-redacted/v2',
    exportedAt: new Date().toISOString(),
    profiles: Object.fromEntries(Object.entries(profiles).map(([k, v]) => [k, { ...v, url: mask(v.url) }]))
  });
}

/* ---------- tabs ---------------------------------------------------------- */

function tab(id, el) {
  $$('.page').forEach(p => p.classList.add('hidden'));
  $('#' + id).classList.remove('hidden');
  $$('.tabs button').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

window.addEventListener('DOMContentLoaded', init);
