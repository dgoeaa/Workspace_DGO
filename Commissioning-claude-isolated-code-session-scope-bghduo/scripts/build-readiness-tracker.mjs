#!/usr/bin/env node
/**
 * Seed the production-readiness tracker page from the register.
 *
 * WHY A GENERATOR, NOT A HAND-WRITTEN PAGE
 * The tracker and `docs/deployment/PRODUCTION_READINESS_REGISTER.json` must not disagree, and the
 * only way to guarantee that is to derive one from the other. A hand-maintained page drifts on
 * the first item that changes, and drifts silently, because nothing compares them.
 *
 * WHAT THIS DOES AND DOES NOT OWN
 * It SEEDS a tracker. Once published, the page keeps its own state — viewers change status,
 * owner, priority, progress and dates, and the page republishes itself with those edits embedded.
 * From that moment the published artifact is the live record and this script is not. Re-running
 * it produces a fresh page seeded from the register again; publishing that over a tracker people
 * have been updating would discard their work. So: run this to create the tracker, or to rebuild
 * it deliberately after the register changes materially — not as a routine step.
 *
 * Usage:
 *   node scripts/build-readiness-tracker.mjs [outfile]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { byteCompare } from './lib/stable-sort.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const reg = JSON.parse(readFileSync(`${ROOT}/docs/deployment/PRODUCTION_READINESS_REGISTER.json`, 'utf8'));
const out = process.argv[2] || `${ROOT}/readiness-tracker.html`;

/* The page's mutable state. Everything a viewer may change starts from the register's value, so
   an untouched tracker reads exactly as the register does. `progress` and `notes` have no
   register equivalent and start empty — they are the tracker's own fields. */
const state = {
  seededFrom: reg.compiledAgainstCommit,
  seededUtc: reg.compiledUtc,
  repository: reg.repository,
  branch: reg.branch,
  lastUpdated: null,
  items: reg.items.map((it) => ({
    id: it.id,
    title: it.title,
    category: it.category,
    description: it.description,
    status: it.status,
    owner: it.owner,
    priority: it.category === 'BLOCKING' ? 'P1'
      : it.category === 'MANUAL_GATE' || it.category === 'DEBT' ? 'P3' : 'P2',
    progress: 0,
    targetDate: it.targetDate,
    targetDateStatus: it.targetDateStatus,
    whyOpen: it.whyOpen,
    dependencies: it.dependencies || [],
    constraints: it.constraints || [],
    risks: it.risks || [],
    decisions: it.decisions || [],
    requirements: it.requirements || [],
    steps: it.steps || [],
    resolutionCriteria: it.resolutionCriteria,
    validation: it.validation,
    evidence: it.evidence || [],
    sourceRegister: it.sourceRegister,
    evidenceConflict: it.evidenceConflict || null,
    completionEvidence: '',
    notes: '',
    stepsDone: [],
  })),
  accepted: reg.acceptedNotToBeReopened,
  declaredGaps: reg.declaredGaps,
  statusVocabulary: reg.statusVocabulary,
};

const css = `
:root{
  --paper:#F4F6F2;--surface:#FFF;--surface-2:#EAEEE7;--ink:#14201A;--ink-2:#45534C;--ink-3:#74817A;
  --rule:#D7DCD3;--rule-soft:#E6EAE2;--accent:#0F5D42;--accent-soft:#E0EBE4;
  --p1:#9E2E1B;--p1-soft:#F6E3DE;--p2:#8E5C0C;--p2-soft:#F6EBD7;--p3:#3D5A73;--p3-soft:#E2E9EF;
  --done:#0F5D42;--done-soft:#E0EBE4;
  --shadow:0 1px 2px rgba(20,32,26,.05),0 8px 24px -18px rgba(20,32,26,.35);
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --paper:#0D1310;--surface:#151D18;--surface-2:#1D2721;--ink:#E5EAE4;--ink-2:#A9B5AC;--ink-3:#7E8B83;
  --rule:#2A352E;--rule-soft:#212B25;--accent:#63C89A;--accent-soft:#163025;
  --p1:#EC8570;--p1-soft:#351914;--p2:#DCA855;--p2-soft:#2E2310;--p3:#8FB2CE;--p3-soft:#182530;
  --done:#63C89A;--done-soft:#163025;--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px -18px rgba(0,0,0,.8);
}}
:root[data-theme="dark"]{
  --paper:#0D1310;--surface:#151D18;--surface-2:#1D2721;--ink:#E5EAE4;--ink-2:#A9B5AC;--ink-3:#7E8B83;
  --rule:#2A352E;--rule-soft:#212B25;--accent:#63C89A;--accent-soft:#163025;
  --p1:#EC8570;--p1-soft:#351914;--p2:#DCA855;--p2-soft:#2E2310;--p3:#8FB2CE;--p3-soft:#182530;
  --done:#63C89A;--done-soft:#163025;--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px -18px rgba(0,0,0,.8);
}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);
  font-family:"Public Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:1240px;margin:0 auto;padding:0 24px 90px}
header.mast{padding:44px 0 22px;border-bottom:2px solid var(--ink)}
.eyebrow{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink-3);margin:0 0 14px}
h1{font-family:"Newsreader",Georgia,serif;font-weight:500;font-size:clamp(1.9rem,4.6vw,2.7rem);
  line-height:1.1;letter-spacing:-.015em;margin:0 0 12px;text-wrap:balance}
.dek{font-family:"Newsreader",Georgia,serif;font-size:1.05rem;color:var(--ink-2);max-width:66ch;margin:0 0 18px}
.prov{display:flex;flex-wrap:wrap;gap:5px 22px;font-family:"JetBrains Mono",monospace;font-size:11px;color:var(--ink-3)}
.prov b{color:var(--ink-2);font-weight:500}
.savebar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:16px 0 0;
  font-family:"JetBrains Mono",monospace;font-size:11.5px;color:var(--ink-3)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--ink-3);display:inline-block}
.dot.live{background:var(--done)}.dot.ro{background:var(--p2)}
button{font:inherit;cursor:pointer;border:1px solid var(--rule);background:var(--surface);
  color:var(--ink);border-radius:3px;padding:6px 12px;font-size:13px}
button:hover{border-color:var(--accent)}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button.primary{background:var(--accent);color:var(--paper);border-color:var(--accent);font-weight:600}
button.primary:disabled{opacity:.45;cursor:not-allowed}
nav.tabs{display:flex;gap:2px;margin:26px 0 0;border-bottom:1px solid var(--rule);flex-wrap:wrap}
nav.tabs button{border:0;border-bottom:2px solid transparent;background:none;border-radius:0;
  padding:10px 16px;color:var(--ink-3);font-weight:600;font-size:13.5px}
nav.tabs button[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--accent)}
section{padding-top:26px}
h2.sec{font-family:"Newsreader",Georgia,serif;font-weight:600;font-size:1.4rem;margin:0 0 6px}
.note{color:var(--ink-2);max-width:76ch;margin:0 0 20px;font-size:14px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:0;
  border:1px solid var(--rule);border-radius:3px;overflow:hidden;background:var(--surface);margin:0 0 22px}
.kpi{padding:14px 16px;border-right:1px solid var(--rule)}
.kpi:last-child{border-right:0}
.kpi .n{font-family:"JetBrains Mono",monospace;font-variant-numeric:tabular-nums;font-size:1.55rem;
  font-weight:700;line-height:1;display:block;margin-bottom:6px}
.kpi .k{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.bar{height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden;min-width:70px}
.bar i{display:block;height:100%;background:var(--accent)}
.card{background:var(--surface);border:1px solid var(--rule);border-left:4px solid var(--rule);
  border-radius:3px;margin:0 0 10px;box-shadow:var(--shadow)}
.card.p1{border-left-color:var(--p1)}.card.p2{border-left-color:var(--p2)}.card.p3{border-left-color:var(--p3)}
.card.done{border-left-color:var(--done);opacity:.72}
.card > .head{display:flex;gap:12px;align-items:flex-start;padding:13px 16px;cursor:pointer}
.card > .head:hover{background:var(--surface-2)}
.card .idc{font-family:"JetBrains Mono",monospace;font-size:11.5px;font-weight:700;color:var(--ink-3);
  white-space:nowrap;padding-top:2px;min-width:82px}
.card .ttl{flex:1;font-weight:600;font-size:14.5px;line-height:1.4}
.card .meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.pill{font-family:"JetBrains Mono",monospace;font-size:9.5px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;padding:3px 7px;border-radius:2px;white-space:nowrap}
.pill.p1{background:var(--p1-soft);color:var(--p1)}
.pill.p2{background:var(--p2-soft);color:var(--p2)}
.pill.p3{background:var(--p3-soft);color:var(--p3)}
.pill.st{background:var(--surface-2);color:var(--ink-2)}
.pill.ok{background:var(--done-soft);color:var(--done)}
.body{display:none;padding:0 16px 18px;border-top:1px solid var(--rule-soft)}
.card.open .body{display:block}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;margin:16px 0 0}
.fld{margin:0 0 14px}
.fld > label{display:block;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;
  color:var(--ink-3);font-weight:700;margin:0 0 5px}
.fld p{margin:0;font-size:14px;color:var(--ink-2)}
.fld ul{margin:0;padding-left:18px;font-size:14px;color:var(--ink-2)}
.fld li{margin:0 0 4px}
.fld code, .note code, .fld p code{font-family:"JetBrains Mono",monospace;font-size:.86em;
  background:var(--surface-2);padding:.1em .36em;border-radius:2px}
select,input[type="text"],input[type="date"],textarea{font:inherit;font-size:13.5px;
  background:var(--surface);color:var(--ink);border:1px solid var(--rule);border-radius:3px;
  padding:6px 8px;width:100%;max-width:100%}
textarea{min-height:64px;resize:vertical}
select:focus,input:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:var(--accent)}
.steps{list-style:none;padding:0;margin:0}
.steps li{display:flex;gap:9px;align-items:flex-start;padding:5px 0;font-size:13.5px;color:var(--ink-2)}
.steps input{width:auto;margin-top:3px;flex:none}
.steps li.done{color:var(--ink-3);text-decoration:line-through}
table{width:100%;border-collapse:collapse;min-width:820px}
.scroll{overflow-x:auto;border:1px solid var(--rule);border-radius:3px;background:var(--surface)}
thead th{text-align:left;font-size:10px;letter-spacing:.09em;text-transform:uppercase;font-weight:700;
  color:var(--ink-3);padding:10px 12px;border-bottom:1px solid var(--rule);background:var(--surface-2);white-space:nowrap}
tbody td{padding:10px 12px;border-bottom:1px solid var(--rule-soft);font-size:13.5px;vertical-align:top}
tbody tr:last-child td{border-bottom:0}
td.mono{font-family:"JetBrains Mono",monospace;font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px;align-items:center}
.filters select,.filters input{width:auto;min-width:130px}
.gap{background:var(--p2-soft);border:1px solid var(--p2);border-radius:3px;padding:14px 16px;margin:0 0 12px}
.gap b{color:var(--p2)}
.gap p{margin:6px 0 0;font-size:13.5px;color:var(--ink-2)}
.ev{font-family:"JetBrains Mono",monospace;font-size:11.5px;color:var(--ink-2);
  border-left:2px solid var(--rule);padding:3px 0 3px 10px;margin:0 0 6px}
.ev b{color:var(--accent);font-weight:500}
footer{margin-top:52px;padding-top:20px;border-top:2px solid var(--ink);color:var(--ink-3);font-size:12.5px;max-width:80ch}
[hidden]{display:none!important}
`;

const body = `
<header class="mast">
  <p class="eyebrow">Production readiness · live tracker</p>
  <h1>Production Readiness Tracker</h1>
  <p class="dek">Every requirement standing between this estate and its intended production state.
    Seeded from the repository's register and editable in place — status, owner, priority, progress,
    dates and completion evidence are saved back into this page for every viewer.</p>
  <div class="prov">
    <span><b>Repository</b> <span data-f="repository"></span></span>
    <span><b>Branch</b> <span data-f="branch"></span></span>
    <span><b>Seeded from</b> <span data-f="seededFrom"></span></span>
    <span><b>Last updated</b> <span data-f="lastUpdated"></span></span>
  </div>
  <div class="savebar">
    <span class="dot" id="dot"></span><span id="mode">connecting…</span>
    <button class="primary" id="save" disabled>Save changes</button>
    <span id="dirty"></span>
  </div>
</header>

<nav class="tabs" role="tablist">
  <button role="tab" data-tab="dash" aria-selected="true">Dashboard</button>
  <button role="tab" data-tab="check" aria-selected="false">Action checklist</button>
  <button role="tab" data-tab="reg" aria-selected="false">Requirements register</button>
  <button role="tab" data-tab="gaps" aria-selected="false">Declared gaps &amp; accepted</button>
</nav>

<section id="tab-dash"></section>
<section id="tab-check" hidden></section>
<section id="tab-reg" hidden></section>
<section id="tab-gaps" hidden></section>

<footer>
  <p><b>What this page is.</b> Deliverables 2 and 3 — the action checklist and the tracking
  mechanism — over deliverable 1, the requirements register at
  <code>docs/deployment/PRODUCTION_READINESS_REGISTER.json</code>. The register is verified by
  <code>npm run test:readiness</code>, which checks that every file it cites exists, every command
  it names is a real npm script, no item carries a date that was not actually established, and
  every open item in <code>OPEN_ITEMS.md</code> is represented.</p>
  <p><b>What it is not.</b> Nothing here has been validated against the live tenant. Every seeded
  status is a statement about the repository at the seed commit. Edits made in this page are the
  viewers' own and are not checked by anything.</p>
</footer>
`;

const script = String.raw`
(function () {
  /* Capture the pristine document before anything renders into it, so a republish carries the
     page's own source rather than a serialization of its mutated DOM. This runs first, while
     every view container is still empty. */
  var SHELL = '<!doctype html>\n' + document.documentElement.outerHTML;
  var STATE_RE = /<script id="tracker-state" type="application\/json">[\s\S]*?<\/script>/;

  var S = JSON.parse(document.getElementById('tracker-state').textContent);
  var dirty = false, api = null;

  var STATUSES = Object.keys(S.statusVocabulary).concat(['IN_PROGRESS', 'DONE']);
  var PRIOS = ['P1', 'P2', 'P3'];

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var byId = function (id) { return S.items.filter(function (i) { return i.id === id; })[0]; };
  var isDone = function (i) { return i.status === 'DONE'; };

  function markDirty() {
    dirty = true;
    document.getElementById('dirty').textContent = 'unsaved changes';
    var b = document.getElementById('save');
    if (api) b.disabled = false;
  }

  /* ---------- rendering ---------- */
  function renderHead() {
    ['repository', 'branch', 'seededFrom'].forEach(function (f) {
      var el = document.querySelector('[data-f="' + f + '"]');
      if (el) el.textContent = S[f];
    });
    var lu = document.querySelector('[data-f="lastUpdated"]');
    if (lu) lu.textContent = S.lastUpdated || 'never — as seeded';
  }

  function kpi(n, k, cls) {
    return '<div class="kpi"><span class="n"' + (cls ? ' style="color:var(--' + cls + ')"' : '') +
      '>' + n + '</span><span class="k">' + esc(k) + '</span></div>';
  }

  function renderDash() {
    var t = S.items.length;
    var done = S.items.filter(isDone).length;
    var p1 = S.items.filter(function (i) { return i.priority === 'P1' && !isDone(i); }).length;
    var blocked = S.items.filter(function (i) { return i.status === 'BLOCKED' && !isDone(i); }).length;
    var dec = S.items.filter(function (i) { return i.status === 'DECISION_REQUIRED' && !isDone(i); }).length;
    var dated = S.items.filter(function (i) { return i.targetDate; }).length;
    var today = new Date().toISOString().slice(0, 10);
    var overdue = S.items.filter(function (i) { return i.targetDate && i.targetDate < today && !isDone(i); });
    var avg = t ? Math.round(S.items.reduce(function (a, i) { return a + (isDone(i) ? 100 : i.progress); }, 0) / t) : 0;

    var owners = {}, cats = {}, statuses = {};
    S.items.forEach(function (i) {
      owners[i.owner] = (owners[i.owner] || 0) + 1;
      cats[i.category] = (cats[i.category] || 0) + 1;
      statuses[i.status] = (statuses[i.status] || 0) + 1;
    });

    var h = '<h2 class="sec">Where this stands</h2>';
    h += '<p class="note">Counts are live over the items below. ' +
      'Overdue is computed from target dates; <b>' + dated + ' of ' + t + ' items carry one</b>, ' +
      'because no target date is established anywhere in the estate — see Declared gaps.</p>';
    h += '<div class="kpis">' +
      kpi(t, 'Items') + kpi(done, 'Complete', 'done') + kpi(p1, 'P1 outstanding', 'p1') +
      kpi(blocked, 'Blocked', 'p1') + kpi(dec, 'Awaiting decision', 'p2') +
      kpi(overdue.length, 'Overdue', 'p1') + kpi(avg + '%', 'Mean progress') + '</div>';

    h += '<div class="grid2">';
    h += '<div><div class="fld"><label>By owner</label>' + barList(owners) + '</div></div>';
    h += '<div><div class="fld"><label>By category</label>' + barList(cats) + '</div></div>';
    h += '<div><div class="fld"><label>By status</label>' + barList(statuses) + '</div></div>';
    h += '</div>';

    /* Dependency map — only edges between items in this register. */
    var edges = [];
    S.items.forEach(function (i) {
      (i.dependencies || []).forEach(function (d) {
        var m = String(d).match(/^((?:ITEM|CFG|MANUAL|G)-[A-Z0-9]+)/);
        if (m && byId(m[1])) edges.push([i.id, m[1]]);
      });
    });
    h += '<h2 class="sec" style="margin-top:30px">Dependencies</h2>';
    h += '<p class="note">' + edges.length + ' edge(s) between items in this register. An item is ' +
      'listed under everything it waits on, so a row with many entries is a row that cannot start.</p>';
    h += '<div class="scroll"><table><thead><tr><th>Item</th><th>Waits on</th><th>Status of blocker</th></tr></thead><tbody>';
    if (!edges.length) h += '<tr><td colspan="3">No inter-item dependencies recorded.</td></tr>';
    edges.forEach(function (e) {
      var b = byId(e[1]);
      h += '<tr><td class="mono">' + esc(e[0]) + '</td><td class="mono">' + esc(e[1]) + '</td>' +
        '<td><span class="pill ' + (isDone(b) ? 'ok' : 'st') + '">' + esc(b.status) + '</span> ' +
        esc(b.title) + '</td></tr>';
    });
    h += '</tbody></table></div>';

    /* Open decisions and risks, surfaced rather than buried in item detail. */
    var decs = [];
    S.items.forEach(function (i) { (i.decisions || []).forEach(function (d) { decs.push([i.id, i.owner, d]); }); });
    h += '<h2 class="sec" style="margin-top:30px">Outstanding decisions</h2>';
    h += '<p class="note">' + decs.length + ' decision(s) recorded across the register. Each needs a person, not more analysis.</p>';
    h += '<div class="scroll"><table><thead><tr><th>Item</th><th>Owner</th><th>Decision</th></tr></thead><tbody>';
    if (!decs.length) h += '<tr><td colspan="3">None recorded.</td></tr>';
    decs.forEach(function (d) {
      h += '<tr><td class="mono">' + esc(d[0]) + '</td><td>' + esc(d[1]) + '</td><td>' + esc(d[2]) + '</td></tr>';
    });
    h += '</tbody></table></div>';

    var risks = [];
    S.items.forEach(function (i) { (i.risks || []).forEach(function (r) { risks.push([i.id, i.priority, r]); }); });
    h += '<h2 class="sec" style="margin-top:30px">Risks</h2>';
    h += '<div class="scroll"><table><thead><tr><th>Item</th><th>Priority</th><th>Risk</th></tr></thead><tbody>';
    if (!risks.length) h += '<tr><td colspan="3">None recorded.</td></tr>';
    risks.forEach(function (r) {
      h += '<tr><td class="mono">' + esc(r[0]) + '</td><td><span class="pill ' + r[1].toLowerCase() + '">' +
        r[1] + '</span></td><td>' + esc(r[2]) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    document.getElementById('tab-dash').innerHTML = h;
  }

  function barList(obj) {
    var max = Math.max.apply(null, Object.keys(obj).map(function (k) { return obj[k]; }).concat([1]));
    return '<div class="scroll" style="border:0"><table style="min-width:0"><tbody>' +
      Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; }).map(function (k) {
        return '<tr><td style="white-space:nowrap">' + esc(k) + '</td>' +
          '<td class="mono" style="width:1%">' + obj[k] + '</td>' +
          '<td style="width:60%"><span class="bar"><i style="width:' +
          Math.round(obj[k] / max * 100) + '%"></i></span></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderChecklist() {
    var f = window.__filters || { cat: '', owner: '', status: '', q: '' };
    var owners = [], cats = [];
    S.items.forEach(function (i) {
      if (owners.indexOf(i.owner) < 0) owners.push(i.owner);
      if (cats.indexOf(i.category) < 0) cats.push(i.category);
    });
    var opt = function (list, sel) {
      return '<option value="">All</option>' + list.map(function (v) {
        return '<option' + (v === sel ? ' selected' : '') + '>' + esc(v) + '</option>';
      }).join('');
    };
    var h = '<h2 class="sec">Action checklist</h2>';
    h += '<p class="note">Every pending, open, unresolved and blocked item. Open a row to edit its ' +
      'status, owner, priority, progress, target date and completion evidence, and to tick off its ' +
      'steps. Changes are held until you press <b>Save changes</b>, which publishes them to every viewer.</p>';
    h += '<div class="filters">' +
      '<select id="f-cat">' + opt(cats, f.cat) + '</select>' +
      '<select id="f-owner">' + opt(owners, f.owner) + '</select>' +
      '<select id="f-status">' + opt(STATUSES, f.status) + '</select>' +
      '<input type="text" id="f-q" placeholder="search title or id" value="' + esc(f.q) + '">' +
      '<button id="f-clear">Clear</button></div>';

    var shown = S.items.filter(function (i) {
      if (f.cat && i.category !== f.cat) return false;
      if (f.owner && i.owner !== f.owner) return false;
      if (f.status && i.status !== f.status) return false;
      if (f.q && (i.id + ' ' + i.title).toLowerCase().indexOf(f.q.toLowerCase()) < 0) return false;
      return true;
    });
    var order = { P1: 0, P2: 1, P3: 2 };
    shown.sort(function (a, b) {
      if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
      return order[a.priority] -byteCompare( order[b.priority] || a.id, b.id);
    });
    h += '<p class="note">' + shown.length + ' of ' + S.items.length + ' shown.</p>';
    h += shown.map(card).join('');
    document.getElementById('tab-check').innerHTML = h;
    wireFilters();
  }

  function card(i) {
    var open = (window.__open || {})[i.id];
    var pct = isDone(i) ? 100 : i.progress;
    var h = '<div class="card ' + i.priority.toLowerCase() + (isDone(i) ? ' done' : '') +
      (open ? ' open' : '') + '" data-id="' + i.id + '">';
    h += '<div class="head" data-toggle="' + i.id + '">' +
      '<span class="idc">' + esc(i.id) + '</span>' +
      '<span class="ttl">' + esc(i.title) + '</span>' +
      '<span class="meta">' +
      '<span class="pill ' + i.priority.toLowerCase() + '">' + i.priority + '</span>' +
      '<span class="pill ' + (isDone(i) ? 'ok' : 'st') + '">' + esc(i.status) + '</span>' +
      '<span class="bar" title="' + pct + '%"><i style="width:' + pct + '%"></i></span>' +
      '</span></div>';

    h += '<div class="body">';
    h += '<div class="fld"><label>1 · Description</label><p>' + esc(i.description) + '</p></div>';
    h += '<div class="grid2">';
    h += '<div>';
    h += fldSelect(i, 'status', '2 · Status', STATUSES);
    h += fldText(i, 'owner', '8 · Owner / accountable party');
    h += fldSelect(i, 'priority', 'Priority', PRIOS);
    h += '<div class="fld"><label>Progress — ' + pct + '%</label>' +
      '<input type="range" min="0" max="100" step="5" value="' + i.progress +
      '" data-edit="progress" data-id="' + i.id + '" style="width:100%"></div>';
    h += '<div class="fld"><label>10 · Target date</label>' +
      '<input type="date" value="' + esc(i.targetDate || '') + '" data-edit="targetDate" data-id="' + i.id + '">' +
      '<p style="margin-top:5px;font-size:12.5px">' +
      (i.targetDate ? 'Set in this tracker.' : 'None established in the estate — setting one here records it as this tracker\'s, not the register\'s.') +
      '</p></div>';
    h += '</div><div>';
    h += '<div class="fld"><label>4 · Why it remains open</label><p>' + esc(i.whyOpen) + '</p></div>';
    h += list('5 · Dependencies', i.dependencies);
    h += list('5 · Constraints', i.constraints);
    h += list('5 · Risks', i.risks);
    h += list('5 · Decisions required', i.decisions);
    h += '</div></div>';

    h += list('6 · Requirements for resolution', i.requirements);
    h += '<div class="fld"><label>7 · Steps to execute</label><ul class="steps">' +
      (i.steps || []).map(function (s, n) {
        var done = (i.stepsDone || []).indexOf(n) >= 0;
        return '<li class="' + (done ? 'done' : '') + '"><input type="checkbox" ' +
          (done ? 'checked ' : '') + 'data-step="' + n + '" data-id="' + i.id + '"><span>' + esc(s) + '</span></li>';
      }).join('') + '</ul></div>';

    h += '<div class="fld"><label>9 · Resolution criteria</label><p>' + esc(i.resolutionCriteria) + '</p></div>';
    h += '<div class="fld"><label>11 · Validation method</label><p>' + esc(i.validation) + '</p></div>';
    h += '<div class="fld"><label>3 · Evidence for the reported status</label>' +
      (i.evidence || []).map(function (e) {
        return '<div class="ev"><b>' + esc(e.type) + '</b> ' + esc(e.ref) + '<br>' + esc(e.states) + '</div>';
      }).join('') +
      (i.evidenceConflict ? '<div class="gap"><b>Conflicting evidence</b><p>' + esc(i.evidenceConflict) + '</p></div>' : '') +
      '<p style="margin-top:6px;font-size:12.5px;color:var(--ink-3)">Source: ' + esc(i.sourceRegister) + '</p></div>';

    h += '<div class="fld"><label>Completion evidence — recorded when done</label>' +
      '<textarea data-edit="completionEvidence" data-id="' + i.id + '" placeholder="Command output, screenshot reference, tenant record, approval reference…">' +
      esc(i.completionEvidence) + '</textarea></div>';
    h += '<div class="fld"><label>Notes</label><textarea data-edit="notes" data-id="' + i.id + '">' +
      esc(i.notes) + '</textarea></div>';
    h += '</div></div>';
    return h;
  }

  function fldSelect(i, key, label, opts) {
    return '<div class="fld"><label>' + esc(label) + '</label><select data-edit="' + key +
      '" data-id="' + i.id + '">' + opts.map(function (o) {
        return '<option' + (o === i[key] ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') + '</select></div>';
  }
  function fldText(i, key, label) {
    return '<div class="fld"><label>' + esc(label) + '</label><input type="text" value="' +
      esc(i[key]) + '" data-edit="' + key + '" data-id="' + i.id + '"></div>';
  }
  function list(label, arr) {
    if (!arr || !arr.length) return '<div class="fld"><label>' + esc(label) +
      '</label><p style="color:var(--ink-3)">None recorded.</p></div>';
    return '<div class="fld"><label>' + esc(label) + '</label><ul>' +
      arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
  }

  function renderRegister() {
    var h = '<h2 class="sec">Requirements register</h2>';
    h += '<p class="note">The full register, read-only here. Every field is reproduced from ' +
      '<code>docs/deployment/PRODUCTION_READINESS_REGISTER.json</code>, which ' +
      '<code>npm run test:readiness</code> verifies.</p>';
    h += '<div class="scroll"><table><thead><tr><th>Item</th><th>Category</th><th>Status</th>' +
      '<th>Owner</th><th>Why open</th><th>Resolution criteria</th><th>Validation</th><th>Target</th></tr></thead><tbody>';
    S.items.forEach(function (i) {
      h += '<tr><td class="mono">' + esc(i.id) + '<br><span style="color:var(--ink-3)">' + esc(i.priority) + '</span></td>' +
        '<td>' + esc(i.category) + '</td>' +
        '<td><span class="pill ' + (isDone(i) ? 'ok' : 'st') + '">' + esc(i.status) + '</span></td>' +
        '<td>' + esc(i.owner) + '</td><td>' + esc(i.whyOpen) + '</td>' +
        '<td>' + esc(i.resolutionCriteria) + '</td><td>' + esc(i.validation) + '</td>' +
        '<td class="mono">' + esc(i.targetDate || 'none') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    document.getElementById('tab-reg').innerHTML = h;
  }

  function renderGaps() {
    var h = '<h2 class="sec">Declared gaps</h2>';
    h += '<p class="note">Information that is missing, unavailable or unverified, recorded as such ' +
      'rather than estimated.</p>';
    S.declaredGaps.forEach(function (g) {
      h += '<div class="gap"><b>' + esc(g.gap) + '</b>' +
        '<p><b>Evidence:</b> ' + esc(g.evidence) + '</p>' +
        '<p><b>Consequence:</b> ' + esc(g.consequence) + '</p>' +
        '<p><b>Who can close it:</b> ' + esc(g.whoCanClose) + '</p></div>';
    });
    h += '<h2 class="sec" style="margin-top:30px">Accepted — not to be re-opened</h2>';
    h += '<div class="scroll"><table><thead><tr><th>Id</th><th>Statement</th><th>Reason</th><th>Guarded by</th></tr></thead><tbody>';
    S.accepted.forEach(function (a) {
      h += '<tr><td class="mono">' + esc(a.id) + '</td><td>' + esc(a.statement) + '</td>' +
        '<td>' + esc(a.reason) + '</td><td class="mono">' + esc(a.guardedBy || '—') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    document.getElementById('tab-gaps').innerHTML = h;
  }

  /* ---------- interaction ---------- */
  function wireFilters() {
    var f = window.__filters || { cat: '', owner: '', status: '', q: '' };
    var set = function (k, v) { f[k] = v; window.__filters = f; renderChecklist(); };
    var c = document.getElementById('f-cat'); if (c) c.onchange = function () { set('cat', this.value); };
    var o = document.getElementById('f-owner'); if (o) o.onchange = function () { set('owner', this.value); };
    var s = document.getElementById('f-status'); if (s) s.onchange = function () { set('status', this.value); };
    var q = document.getElementById('f-q');
    if (q) q.oninput = function () { f.q = this.value; window.__filters = f; clearTimeout(window.__qt);
      window.__qt = setTimeout(renderChecklist, 220); };
    var cl = document.getElementById('f-clear');
    if (cl) cl.onclick = function () { window.__filters = { cat: '', owner: '', status: '', q: '' }; renderChecklist(); };
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-toggle]');
    if (t) {
      window.__open = window.__open || {};
      var id = t.getAttribute('data-toggle');
      window.__open[id] = !window.__open[id];
      t.parentNode.classList.toggle('open');
      return;
    }
    var tab = e.target.closest('[data-tab]');
    if (tab) {
      document.querySelectorAll('[data-tab]').forEach(function (b) {
        b.setAttribute('aria-selected', String(b === tab));
      });
      ['dash', 'check', 'reg', 'gaps'].forEach(function (n) {
        document.getElementById('tab-' + n).hidden = (n !== tab.getAttribute('data-tab'));
      });
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.hasAttribute && el.hasAttribute('data-step')) {
      var it = byId(el.getAttribute('data-id'));
      var n = Number(el.getAttribute('data-step'));
      it.stepsDone = it.stepsDone || [];
      var at = it.stepsDone.indexOf(n);
      if (el.checked && at < 0) it.stepsDone.push(n);
      if (!el.checked && at >= 0) it.stepsDone.splice(at, 1);
      el.closest('li').classList.toggle('done', el.checked);
      /* Progress follows the steps unless a viewer has moved it by hand past what steps imply. */
      var auto = it.steps.length ? Math.round(it.stepsDone.length / it.steps.length * 100) : it.progress;
      if (auto > it.progress) it.progress = auto;
      markDirty();
      return;
    }
    if (el.hasAttribute && el.hasAttribute('data-edit')) {
      var item = byId(el.getAttribute('data-id'));
      var key = el.getAttribute('data-edit');
      item[key] = el.type === 'range' ? Number(el.value) : (el.value || (key === 'targetDate' ? null : ''));
      if (key === 'status' && el.value === 'DONE') item.progress = 100;
      markDirty();
      if (key === 'status' || key === 'priority' || key === 'progress') renderChecklist();
      renderDash();
    }
  });
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.type === 'range' && el.hasAttribute('data-edit')) {
      byId(el.getAttribute('data-id')).progress = Number(el.value);
      var lbl = el.parentNode.querySelector('label');
      if (lbl) lbl.textContent = 'Progress — ' + el.value + '%';
      markDirty();
    }
  });

  /* ---------- persistence ---------- */
  function serialize() {
    S.lastUpdated = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    var block = '<script id="tracker-state" type="application/json">' +
      JSON.stringify(S).replace(/</g, '\\u003c') + '<\/script>';
    return SHELL.replace(STATE_RE, block);
  }

  document.getElementById('save').onclick = function () {
    if (!api) return;
    var b = this;
    b.disabled = true; b.textContent = 'Saving…';
    api.publish(serialize()).then(function () {
      dirty = false;
      document.getElementById('dirty').textContent = 'saved';
      b.textContent = 'Save changes';
    }).catch(function (err) {
      b.textContent = 'Save changes';
      b.disabled = false;
      var code = err && err.code ? err.code : 'error';
      document.getElementById('dirty').textContent =
        code === 'conflict' ? 'someone else saved first — this view will reload to their version'
          : (code === 'not_granted' || code === 'not_writer') ? 'you have read-only access'
          : 'could not save (' + code + ')';
    });
  };

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  renderHead(); renderDash(); renderChecklist(); renderRegister(); renderGaps();

  if (window.claude && window.claude.use) {
    window.claude.use('artifact').then(function (a) {
      api = a;
      var dot = document.getElementById('dot'), mode = document.getElementById('mode');
      if (a) {
        dot.className = 'dot live';
        mode.textContent = 'live — changes save for every viewer';
        if (dirty) document.getElementById('save').disabled = false;
      } else {
        dot.className = 'dot ro';
        mode.textContent = 'read-only in this view — edits will not save';
      }
    }).catch(function () {
      document.getElementById('dot').className = 'dot ro';
      document.getElementById('mode').textContent = 'read-only in this view — edits will not save';
    });
  } else {
    document.getElementById('dot').className = 'dot ro';
    document.getElementById('mode').textContent = 'read-only in this view — edits will not save';
  }
})();
`;

const html = `<title>Production Readiness Tracker</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap">
<style>${css}</style>
<script id="tracker-state" type="application/json">${JSON.stringify(state).replace(/</g, '\\u003c')}</script>
<div class="wrap">${body}</div>
<script>${script}</script>
`;

writeFileSync(out, html);
console.log(`wrote ${out}  (${(html.length / 1024).toFixed(0)} KB)`);
console.log(`  ${state.items.length} item(s) seeded from register ${reg.registerVersion} at commit ${reg.compiledAgainstCommit}`);
console.log('  Publishing this over a tracker people have edited would discard their edits — see the header comment.');
