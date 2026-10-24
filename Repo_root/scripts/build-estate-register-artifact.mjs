#!/usr/bin/env node
/**
 * Emit the interactive estate register — `docs/folio-Master-Flows-and-Endpoints/reference/estate-register.html`.
 *
 * WHY GENERATED RATHER THAN HAND-WRITTEN
 *
 * The page embeds the whole register, 1.7 MB of it, so that every list, every column, every flow and
 * every flow→list reference is in the page rather than a sample of them. That cannot be typed, and
 * it must not be abridged: the page is the browsable face of a register asked to be the primary
 * source, and a browsable face that quietly holds less than the register behind it is the partial
 * representation the register exists to prevent.
 *
 * WHAT THE PAGE HAS TO DO THAT A DOCUMENT CANNOT
 *
 * The estate's structure is a graph, not a list. A list is touched by flows; a flow touches lists;
 * both trace back to the sources that describe them. Reading that in a linear document means
 * scrolling between two places and holding the join in your head — which is how the GOV-06 identity
 * gap went unnoticed for so long. So the page navigates the graph in both directions and keeps a
 * history, and every record shows the provenance of every statement made about it.
 *
 *   npm run estateartifact
 *   npm run estateartifact -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandKitBlock, refreshLogos, refreshSubs } from './lib/brand-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/reference/estate-register.json');
const OUT = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/reference/estate-register.html');
const CHECK = process.argv.includes('--check');
const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

if (!fs.existsSync(REG)) fail('docs/folio-Master-Flows-and-Endpoints/reference/estate-register.json is missing. Run: npm run estateregister');
const R = JSON.parse(fs.readFileSync(REG, 'utf8'));

/* `</script>` inside a JSON string would end the block early and leave the rest of the register
   rendering as markup. Escaping `<` is the whole fix and costs nothing. */
/* Two escapes, both load-bearing. `</script>` inside a JSON string would end the block early and
   leave the rest of the register rendering as markup. U+2028 and U+2029 are valid in JSON strings
   and are LINE TERMINATORS in JavaScript source, so an unescaped one splits the statement that
   embeds the data — the regex on this very line was written with a literal U+2028 on the first
   attempt and the file would not parse. Built from an escaped string for that reason. */
const LINE_SEPARATORS = new RegExp('[\\u2028\\u2029]', 'g');
const embed = JSON.stringify(R)
  .replace(/</g, '\\u003c')
  .replace(LINE_SEPARATORS, (c) => '\\u' + c.charCodeAt(0).toString(16));

const t = R.totals;

/* The brand kit's theme switch: light, dark, and back to the reader's system setting. */
const THEME_TOGGLE = '<button class="bk-btn bk-btn--on-brand bk-btn--icon" type="button" data-bk-theme-toggle aria-label="Switch theme"><svg class="bk-i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg><svg class="bk-i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/></svg></button>';

const html = refreshSubs(refreshLogos(`<!doctype html>
<html lang="en" data-platform="dgo-ops">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Estate Register — NITDA Folio</title>
${brandKitBlock()}
<style>
:root{
  /* Every value is a design-system name, from the brand kit block above (npm run brand:sync), so
     light, dark and high contrast come from the tokens and the page states no colour of its own.
     The five evidence bases keep five distinct hues: observed is success, a flow definition is
     info, a client read is the routed status, a specification is warning, a seed is neutral. */
  --ink:var(--dgo-color-fg-default); --ink-2:color-mix(in srgb,var(--dgo-color-fg-default) 78%,var(--dgo-color-fg-muted)); --muted:var(--dgo-color-fg-muted); --faint:var(--dgo-color-fg-subtle);
  --paper:var(--dgo-color-surface-sunken); --surface:var(--dgo-color-surface-raised); --surface-2:var(--dgo-color-surface-muted);
  --line:var(--dgo-color-border-default); --line-2:var(--dgo-color-border-strong);
  --accent:var(--dgo-color-fg-brand); --accent-soft:var(--dgo-color-action-primary-soft); --accent-line:var(--dgo-color-border-brand);
  --on-accent:var(--dgo-color-fg-on-brand); --accent-fill:var(--dgo-color-action-primary);
  --observed:var(--dgo-color-success-subtle-fg); --observed-bg:var(--dgo-color-success-subtle-bg);
  --flowdef:var(--dgo-color-info-subtle-fg); --flowdef-bg:var(--dgo-color-info-subtle-bg);
  --client:var(--dgo-color-status-routed-fg); --client-bg:var(--dgo-color-status-routed-bg);
  --spec:var(--dgo-color-warning-subtle-fg); --spec-bg:var(--dgo-color-warning-subtle-bg);
  --seed:var(--dgo-color-status-archived-fg); --seed-bg:var(--dgo-color-status-archived-bg);
  --critical:var(--dgo-color-danger-subtle-fg); --critical-bg:var(--dgo-color-danger-subtle-bg); --critical-line:var(--dgo-color-danger-strong-bg);
  --sans:var(--dgo-family-sans); --cond:var(--dgo-family-display); --mono:var(--dgo-family-mono);
  --r:4px;
}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font:400 14px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
code,.mono{font-family:var(--mono);font-size:.92em;font-variant-ligatures:none}
h1,h2,h3{text-wrap:balance;margin:0}
a{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:2px}
.lbl{font-family:var(--cond);font-weight:700;text-transform:uppercase;letter-spacing:.07em;
  font-size:11px;color:var(--muted)}

/* ── shell: the brand header stays put; this column scrolls inside .bk-main ── */
.wrap{max-width:1500px;margin:0 auto;padding:0 16px;padding-block:0 40px}
.results{overscroll-behavior:contain}
.intro{padding:18px 0 4px}
.brand{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:baseline}
.brand h1{font-family:var(--cond);font-weight:700;font-size:23px;letter-spacing:-.01em}
.brand .sub{color:var(--muted);font-size:12.5px}
.warnbar{margin-top:10px;display:flex;gap:10px;align-items:flex-start;
  background:var(--spec-bg);border:1px solid var(--line-2);border-left:3px solid var(--spec);
  border-radius:var(--r);padding:9px 12px;font-size:12.5px;color:var(--ink-2)}
.warnbar b{color:var(--ink)}

/* ── summary strip ─────────────────────────────────────────────────────── */
.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:var(--r);
  margin:18px 0;overflow:hidden}
.cell{background:var(--surface);padding:11px 13px}
.cell .n{font-family:var(--cond);font-weight:700;font-size:25px;line-height:1.1;
  font-variant-numeric:tabular-nums}
.cell .k{margin-top:1px}
.cell .note{color:var(--faint);font-size:11.5px;margin-top:3px}
.cell.bound .n{font-size:19px;color:var(--accent)}

/* ── controls ──────────────────────────────────────────────────────────── */
.controls{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;margin-bottom:12px}
.search{display:flex;flex-direction:column;gap:4px}
.search input{width:100%;padding:8px 11px;border:1px solid var(--line-2);border-radius:var(--r);
  background:var(--surface);color:var(--ink);font:400 14px var(--mono)}
.tabs{display:flex;gap:1px;background:var(--line);border:1px solid var(--line);
  border-radius:var(--r);overflow:hidden;align-self:end}
.tabs button{border:0;background:var(--surface);color:var(--muted);font:600 12.5px var(--sans);
  padding:8px 15px;cursor:pointer}
.tabs button[aria-selected="true"]{background:var(--accent-fill);color:var(--on-accent)}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;align-items:center}
.chip{border:1px solid var(--line-2);background:var(--surface);color:var(--ink-2);
  border-radius:99px;padding:4px 11px;font:500 12px var(--sans);cursor:pointer;
  display:inline-flex;gap:6px;align-items:center}
.chip[aria-pressed="true"]{background:var(--accent-fill);border-color:var(--accent-fill);color:var(--on-accent)}
.chip .c{font-variant-numeric:tabular-nums;opacity:.75;font-size:11px}
.chip.crit[aria-pressed="true"]{background:var(--dgo-color-danger-strong-bg);border-color:var(--dgo-color-danger-strong-bg);color:var(--dgo-color-danger-strong-fg)}
.clear{background:none;border:0;color:var(--accent);font:500 12px var(--sans);cursor:pointer;
  text-decoration:underline;padding:4px}

/* ── panes ─────────────────────────────────────────────────────────────── */
.panes{display:grid;grid-template-columns:minmax(300px,420px) 1fr;gap:16px;align-items:start}
.panes > *{min-width:0}
@media (max-width:900px){.panes{grid-template-columns:1fr}}
/* A grid or flex child defaults to min-width:auto, so one unbroken GUID in a cell pushes the whole
   page wider than the phone. Measured at 400px before this block existed: the body scrolled
   sideways. Only tables, which have their own scroller, may exceed the gutter. */
.wrap,.strip,.cell,.controls,.search,.row,.pane,.detail,section.sec,.kv,.kv dd,.prov,.prov-item{min-width:0}
@media (max-width:560px){
  .controls{grid-template-columns:1fr}
  .tabs{align-self:stretch}
  .tabs button{flex:1}
  .kv{grid-template-columns:1fr;gap:1px 0}
  .kv dt{margin-top:7px}
  .strip{grid-template-columns:repeat(auto-fit,minmax(132px,1fr))}
  .dhead h2{font-size:18px}
}
.pane{background:var(--surface);border:1px solid var(--line);border-radius:var(--r)}
.pane-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;
  padding:9px 13px;border-bottom:1px solid var(--line);background:var(--surface-2)}
.results{max-height:min(70vh,760px);overflow-y:auto}
.row{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);
  background:none;cursor:pointer;padding:9px 13px;color:var(--ink);font:inherit}
.row:last-child{border-bottom:0}
.row:hover{background:var(--surface-2)}
.row[aria-current="true"]{background:var(--accent-soft);
  box-shadow:inset 3px 0 0 var(--accent)}
.row .t{font-weight:600;font-size:13.5px;overflow-wrap:anywhere}
.row .m{color:var(--muted);font-size:11.5px;margin-top:2px;overflow-wrap:anywhere}
.row .tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.empty{padding:26px 16px;text-align:center;color:var(--muted)}
.showall{display:inline-block;margin-top:10px;border:1px solid var(--line);border-radius:7px;
  background:var(--surface);color:var(--accent);font:600 12px var(--sans);padding:7px 13px;cursor:pointer}
.showall:hover{border-color:var(--accent)}
.showall:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* ── badges ────────────────────────────────────────────────────────────── */
.b{display:inline-flex;align-items:center;gap:4px;border-radius:3px;padding:1px 6px;
  font:600 10.5px var(--cond);text-transform:uppercase;letter-spacing:.05em;
  border:1px solid transparent;white-space:nowrap}
.b-observed{background:var(--observed-bg);color:var(--observed);border-color:var(--observed)}
.b-specified{background:var(--spec-bg);color:var(--spec);border-color:var(--spec)}
.b-derived{background:var(--accent-soft);color:var(--accent);border-color:var(--accent-line)}
.b-exported{background:var(--flowdef-bg);color:var(--flowdef);border-color:var(--flowdef)}
.b-superseded{background:var(--seed-bg);color:var(--seed);border-color:var(--line-2)}
.b-crit{background:var(--critical-bg);color:var(--critical);border-color:var(--critical)}
.b-guid{background:var(--surface-2);color:var(--muted);border-color:var(--line-2)}

/* ── detail ────────────────────────────────────────────────────────────── */
.detail{padding:0 0 4px}
.crumbs{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 13px;
  border-bottom:1px solid var(--line);background:var(--surface-2);font-size:12px}
.crumbs button{border:0;background:none;color:var(--accent);cursor:pointer;font:500 12px var(--sans);
  text-decoration:underline;padding:2px}
.crumbs .sep{color:var(--faint)}
.dhead{padding:14px 16px 10px;border-bottom:1px solid var(--line)}
.dhead h2{font-family:var(--cond);font-size:20px;font-weight:700;overflow-wrap:anywhere}
.dhead .ids{margin-top:7px;display:flex;flex-direction:column;gap:3px}
.dhead .ids div{font-family:var(--mono);font-size:12px;color:var(--ink-2);overflow-wrap:anywhere}
.dhead .ids span.k{font-family:var(--cond);font-weight:700;text-transform:uppercase;
  letter-spacing:.06em;font-size:10.5px;color:var(--muted);margin-right:7px}
.dhead .tags{margin-top:9px;display:flex;flex-wrap:wrap;gap:5px}
section.sec{padding:13px 16px;border-bottom:1px solid var(--line)}
section.sec:last-child{border-bottom:0}
section.sec > h3{font-family:var(--cond);font-size:13px;font-weight:700;text-transform:uppercase;
  letter-spacing:.06em;color:var(--muted);margin-bottom:9px}
.kv{display:grid;grid-template-columns:minmax(120px,190px) 1fr;gap:5px 14px;font-size:13px}
.kv dt{color:var(--muted)}
.kv dd{margin:0;overflow-wrap:anywhere}
.prov{display:flex;flex-direction:column;gap:8px}
.prov-item{border-left:2px solid var(--line-2);padding:1px 0 1px 11px}
.prov-item .src{font-family:var(--mono);font-size:11.5px;color:var(--ink-2)}
.prov-item .says{font-size:12.5px;color:var(--ink);margin-top:2px}
.tbl-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;width:100%;font-size:12.5px}
th,td{text-align:left;padding:5px 9px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-family:var(--cond);font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  font-size:10.5px;color:var(--muted);background:var(--surface-2);position:sticky;top:0}
td code{overflow-wrap:anywhere}
tbody tr:hover{background:var(--surface-2)}
.xlink{border:0;background:none;color:var(--accent);cursor:pointer;font:inherit;
  text-decoration:underline;padding:0;text-align:left;overflow-wrap:anywhere}
.conflict{background:var(--critical-bg);border:1px solid var(--critical-line);
  border-left:3px solid var(--critical);border-radius:var(--r);padding:9px 12px;font-size:12.5px}
.conflict + .conflict{margin-top:7px}
.conflict .about{font-family:var(--cond);font-weight:700;text-transform:uppercase;
  letter-spacing:.05em;font-size:11px;color:var(--critical)}
.conflict .vals{font-family:var(--mono);font-size:11.5px;margin:4px 0;overflow-wrap:anywhere}
.conflict .note{color:var(--ink-2)}
details.more{margin-top:8px}
details.more > summary{cursor:pointer;font:600 12px var(--sans);color:var(--accent)}
.bases{display:flex;flex-wrap:wrap;gap:5px}
footer.foot{margin-top:26px;padding-top:14px;border-top:1px solid var(--line);
  color:var(--muted);font-size:12px;display:flex;flex-wrap:wrap;gap:6px 18px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>

<script type="application/json" id="register">${embed}</script>

</head>
<body class="bk-app-body">
<a class="bk-skip" href="#bk-main">Skip to content</a>
<div class="bk-app">
<header class="bk-header">
<a class="bk-brand" href="#"><img class="bk-logo--on-dark" data-bk-logo="white" src="" alt="National Information Technology Development Agency" width="544" height="254"><img class="bk-logo--on-light" data-bk-logo="colour" src="" alt="National Information Technology Development Agency" width="572" height="260"><span class="bk-sub" data-bk-sub><!--/bk-sub--></span><span class="bk-brand__text"><span class="bk-brand__title">Estate Register</span><span class="bk-brand__sub">NITDA Folio · SharePoint lists &amp; Power Automate flows</span></span></a>
<span class="bk-header__spacer"></span>
<div class="bk-header__actions">${THEME_TOGGLE}</div>
</header>
<div class="bk-body">
<main class="bk-main" id="bk-main" tabindex="-1" data-bk-top>
<div class="wrap">
  <div class="intro">
    <div class="brand">
      <h1>Estate Register</h1>
      <span class="sub">SharePoint lists &amp; Power Automate flows · assembled from ${R.sources.length} declared sources · no tenant was contacted</span>
    </div>
    <div class="warnbar">
      <span aria-hidden="true">⚠</span>
      <span><b>A row is an identity, not a proven object.</b> The newest tenant observation is
      <b>${R.newestListObservation}</b> for lists and <b>${R.newestFlowObservation}</b> for flows.
      ${t.lists.specifiedNotObserved} list rows are specification only, and of
      ${t.fields.rows} column rows just <b>${t.fields.byEvidenceBasis['tenant-observation']}</b> were read from the tenant.
      Distinct flows lie between <b>${t.flows.distinctFlowsLowerBound}</b> and <b>${t.flows.distinctFlowsUpperBound}</b> — the two identifier
      spaces do not resolve (GOV-06), so the register never merges across them. Those rows cover the whole
      environment: of the <b>${t.flows.byEstateUse.inTheExportsOwnUnits.flowsInTheExport}</b> flows the
      2026-09-26 export read, <b>${t.flows.byEstateUse.inTheExportsOwnUnits.usedFlowsInTheExport}</b> are
      evidenced as used by this estate.</span>
    </div>
  </div>

  <div class="strip" id="strip"></div>

  <div class="controls">
    <label class="search">
      <span class="lbl">Search titles, GUIDs, workflow ids, column names, contract keys</span>
      <input id="q" type="search" placeholder="DGO_AuditLog · 3d591f5b · RegistryKey · OTP_VERIFY" autocomplete="off">
    </label>
    <div class="tabs" role="tablist" aria-label="Record type">
      <button role="tab" id="tab-lists" aria-selected="true" aria-controls="results">Lists</button>
      <button role="tab" id="tab-flows" aria-selected="false" aria-controls="results">Flows</button>
    </div>
  </div>

  <div class="filters" id="filters"></div>

  <div class="panes">
    <div class="pane">
      <div class="pane-h"><span class="lbl" id="resultCount">—</span><span class="lbl" id="resultOf"></span></div>
      <div class="results" id="results" role="tabpanel"></div>
    </div>
    <div class="pane detail" id="detail"></div>
  </div>

  <footer class="foot">
    <span>Generated by <code>scripts/build-estate-register-artifact.mjs</code> from <code>estate-register.json</code>.</span>
    <span>${t.lists.rows} list rows · ${t.fields.rows} column rows · ${t.flows.rows} flow rows · ${R.flows.reduce((n, f) => n + f.listsTouched.length, 0)} flow→list references.</span>
    <span>Every <code>sig=</code> is stripped at source; no credential is in this page.</span>
  </footer>
</div>
</main>
</div>
</div>

<script>
(function(){
  "use strict";
  var R = JSON.parse(document.getElementById('register').textContent);
  var lists = R.lists, flows = R.flows;
  var byListKey = {}, byFlowKey = {};
  lists.forEach(function(l){ byListKey[l.key] = l; });
  flows.forEach(function(f){ byFlowKey[f.key] = f; });

  /* A list is reachable from a flow reference by GUID or by title; build both indexes so the
     traversal works whichever way the flow addressed it. 33 titles name more than one list, so a
     title lookup can legitimately return several and the page shows all of them. */
  var listsByGuid = {}, listsByTitle = {};
  lists.forEach(function(l){
    if (l.listGuid) listsByGuid[l.listGuid] = l;
    l.titles.forEach(function(t){
      var k = String(t).toLowerCase();
      (listsByTitle[k] = listsByTitle[k] || []).push(l);
    });
  });

  var esc = function(s){ return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var mono = function(s){ return '<code>' + esc(s) + '</code>'; };
  var el = function(id){ return document.getElementById(id); };
  var yn = function(v){ return v === true ? 'yes' : v === false ? 'no' : '—'; };

  var BASIS_LABEL = R.howToReadIt.evidenceBasis || {};
  var BASIS_CLASS = {
    'tenant-observation':'b-observed','flow-definition':'b-exported','client-code':'b-derived',
    'specification':'b-specified','generated-seed':'b-superseded'
  };
  var KIND_CLASS = {observed:'b-observed',specified:'b-specified',derived:'b-derived',
    exported:'b-exported',superseded:'b-superseded'};

  /* ── state ───────────────────────────────────────────────────────────── */
  var state = { tab:'lists', q:'', sites:{}, kinds:{}, bases:{}, conflictsOnly:false,
                showAll:false, sel:null, history:[] };

  /* ── summary strip ───────────────────────────────────────────────────── */
  function strip(){
    var f = R.totals.fields.byEvidenceBasis;
    var cells = [
      ['Lists', R.totals.lists.rows, R.totals.lists.observedInTenantCapture + ' observed · ' + R.totals.lists.specifiedNotObserved + ' specification only'],
      ['Columns', R.totals.fields.rows, (f['tenant-observation']||0) + ' read from the tenant'],
      ['Flow rows', R.totals.flows.rows, R.totals.flows.definitionHeld + ' with a definition held'],
      ['Flow→list references', R.flows.reduce(function(n,x){return n+x.listsTouched.length;},0), R.totals.lists.touchedByAtLeastOneFlow + ' lists touched'],
      ['Conflicts', R.totals.lists.withConflicts + R.totals.flows.withConflicts, 'unresolved by design'],
      ['Sources', R.sources.length, R.totals.definitionFilesRead + ' definition files read']
    ];
    var h = cells.map(function(c){
      return '<div class="cell"><div class="n">' + c[1] + '</div><div class="k lbl">' + esc(c[0]) +
             '</div><div class="note">' + esc(c[2]) + '</div></div>';
    }).join('');
    h += '<div class="cell bound"><div class="n">' + R.totals.flows.distinctFlowsLowerBound + '–' +
         R.totals.flows.distinctFlowsUpperBound + '</div><div class="k lbl">Distinct flows</div>' +
         '<div class="note">bounds, not a count — the identifier spaces do not resolve</div></div>';
    el('strip').innerHTML = h;
  }

  /* ── filters ─────────────────────────────────────────────────────────── */
  function siteCounts(){
    var c = {};
    (state.tab === 'lists' ? lists : []).forEach(function(l){ if (l.site) c[l.site] = (c[l.site]||0)+1; });
    return c;
  }
  function kindCounts(){
    var c = {}, rows = state.tab === 'lists' ? lists : flows;
    rows.forEach(function(r){ (r.kinds||[]).forEach(function(k){ c[k] = (c[k]||0)+1; }); });
    return c;
  }
  function basisCounts(){
    var c = {};
    lists.forEach(function(l){ Object.keys(l.fieldsByEvidenceBasis||{}).forEach(function(b){
      c[b] = (c[b]||0) + l.fieldsByEvidenceBasis[b]; }); });
    return c;
  }
  function chip(group,key,label,count,cls){
    var on = group === 'conflicts' ? state.conflictsOnly : !!state[group][key];
    return '<button class="chip ' + (cls||'') + '" role="button" aria-pressed="' + on +
      '" data-group="' + esc(group) + '" data-key="' + esc(key) + '" type="button">' + esc(label) +
      (count != null ? '<span class="c">' + count + '</span>' : '') + '</button>';
  }
  function filters(){
    var h = '<span class="lbl">Filter</span>';
    var kc = kindCounts();
    Object.keys(kc).sort().forEach(function(k){ h += chip('kinds',k,k,kc[k]); });
    if (state.tab === 'lists') {
      var sc = siteCounts();
      Object.keys(sc).sort().forEach(function(s){ h += chip('sites',s,s,sc[s]); });
      var bc = basisCounts();
      Object.keys(bc).sort().forEach(function(b){ h += chip('bases',b,b + ' cols',bc[b]); });
    }
    h += chip('conflicts','on','Conflicts only',
      state.tab === 'lists' ? R.totals.lists.withConflicts : R.totals.flows.withConflicts,'crit');
    h += '<button class="clear" id="clear" type="button">Reset filters</button>';
    el('filters').innerHTML = h;
  }

  /* ── searching ───────────────────────────────────────────────────────── */
  function listHaystack(l){
    if (l._h) return l._h;
    var p = [l.titles.join(' '), l.listGuid, l.site, l.objectType, l.template,
      l.serverRelativeUrls.join(' '), (l.governance && l.governance.disposition) || ''];
    l.fields.forEach(function(f){ p.push(f.internalName, f.displayName); });
    l.touchedByFlows.forEach(function(x){ p.push(x.flow); });
    l._h = p.join(' ').toLowerCase();
    return l._h;
  }
  function flowHaystack(f){
    if (f._h) return f._h;
    var p = [f.names.join(' '), f.workflowId, f.flowGuid, f.contractKeys.join(' '), f.category,
      f.trigger, f.method, f.routingSegment, f.environment];
    f.definitionFiles.forEach(function(d){ p.push(d.path); });
    f.listsTouched.forEach(function(x){ p.push(x.listTitle, x.listGuid, x.action); });
    f._h = p.join(' ').toLowerCase();
    return f._h;
  }
  function filtered(){
    var rows = state.tab === 'lists' ? lists : flows;
    var q = state.q.trim().toLowerCase();
    var sites = Object.keys(state.sites).filter(function(k){return state.sites[k];});
    var kinds = Object.keys(state.kinds).filter(function(k){return state.kinds[k];});
    var bases = Object.keys(state.bases).filter(function(k){return state.bases[k];});
    return rows.filter(function(r){
      if (state.conflictsOnly && !r.conflicts.length) return false;
      if (kinds.length && !kinds.some(function(k){ return (r.kinds||[]).indexOf(k) >= 0; })) return false;
      if (state.tab === 'lists') {
        if (sites.length && sites.indexOf(r.site) < 0) return false;
        if (bases.length && !bases.some(function(b){ return (r.fieldsByEvidenceBasis||{})[b]; })) return false;
      }
      if (!q) return true;
      return (state.tab === 'lists' ? listHaystack(r) : flowHaystack(r)).indexOf(q) >= 0;
    });
  }

  /* ── result rows ─────────────────────────────────────────────────────── */
  function badge(cls,text){ return '<span class="b ' + cls + '">' + esc(text) + '</span>'; }
  function kindBadges(r){
    return (r.kinds||[]).map(function(k){ return badge(KIND_CLASS[k]||'b-guid',k); }).join('');
  }
  function renderResults(){
    var rows = filtered();
    el('resultCount').textContent = rows.length + ' ' + (state.tab === 'lists' ? 'list' : 'flow') + (rows.length === 1 ? '' : 's');
    el('resultOf').textContent = 'of ' + (state.tab === 'lists' ? lists.length : flows.length);
    if (!rows.length) { el('results').innerHTML = '<div class="empty">Nothing matches. Reset the filters or clear the search.</div>'; return; }
    /* The cap is a first-paint budget, not an editorial decision, so it is liftable. With 215 flow
       rows it never fired; at 889 it hides 289 of them behind a search box, and "narrow the search to
       see the rest" is a poor answer to a reader who wants to scroll the estate. */
    var cap = state.showAll ? rows.length : 600, shown = rows.slice(0, cap);
    var h = shown.map(function(r){
      var cur = state.sel && state.sel.key === r.key;
      if (state.tab === 'lists') {
        return '<button class="row" type="button" data-kind="list" data-key="' + esc(r.key) + '"' +
          (cur ? ' aria-current="true"' : '') + '>' +
          '<div class="t">' + esc(r.titles[0] || '(untitled)') + '</div>' +
          '<div class="m">' + esc(r.site || '—') + ' · ' +
            (r.listGuid ? '<code>' + esc(r.listGuid) + '</code>' : 'no GUID — site+title only') + '</div>' +
          '<div class="tags">' + kindBadges(r) +
            (r.observedInTenant ? '' : badge('b-specified','not observed')) +
            (r.listGuid ? '' : badge('b-guid','weak identity')) +
            (r.conflicts.length ? badge('b-crit', r.conflicts.length + ' conflict') : '') +
            (r.fieldCount ? badge('b-guid', r.fieldCount + ' cols') : '') +
            (r.touchedByFlows.length ? badge('b-exported', r.touchedByFlows.length + ' refs') : '') +
          '</div></button>';
      }
      return '<button class="row" type="button" data-kind="flow" data-key="' + esc(r.key) + '"' +
        (cur ? ' aria-current="true"' : '') + '>' +
        '<div class="t">' + esc(r.names[0] || '(unnamed)') + '</div>' +
        '<div class="m">' + (r.workflowId ? '<code>' + esc(r.workflowId) + '</code>'
          : r.flowGuid ? '<code>' + esc(r.flowGuid) + '</code>' : 'name only — no identifier') + '</div>' +
        '<div class="tags">' + kindBadges(r) +
          (r.workflowId || r.flowGuid ? '' : badge('b-guid','no identifier')) +
          (r.definitionHeld ? badge('b-exported','definition held') : '') +
          (r.conflicts.length ? badge('b-crit', r.conflicts.length + ' conflict') : '') +
          (r.listsTouchedCount ? badge('b-derived', r.listsTouchedCount + ' list refs') : '') +
          (r.contractKeys.length ? badge('b-observed', r.contractKeys.length + ' keys') : '') +
        '</div></button>';
    }).join('');
    if (rows.length > cap) {
      h += '<div class="empty">Showing the first ' + cap + ' of ' + rows.length +
           ' — a first-paint limit, not a filter. Nothing is excluded from the register itself.' +
           ' <button class="showall" type="button" id="showAll">Show all ' + rows.length + '</button></div>';
    } else if (state.showAll && rows.length > 600) {
      h += '<div class="empty">All ' + rows.length + ' rows are rendered.' +
           ' <button class="showall" type="button" id="showFewer">Show the first 600</button></div>';
    }
    el('results').innerHTML = h;
    var all = el('showAll'), fewer = el('showFewer');
    if (all) all.addEventListener('click', function(){ state.showAll = true; renderResults(); });
    if (fewer) fewer.addEventListener('click', function(){ state.showAll = false; renderResults();
      el('results').scrollTop = 0; });
  }

  /* ── detail ──────────────────────────────────────────────────────────── */
  function provenance(r){
    return '<div class="prov">' + r.statements.map(function(s){
      var extra = Object.keys(s).filter(function(k){
        return ['source','kind','says'].indexOf(k) < 0 && s[k] != null && s[k] !== '' &&
               !(Array.isArray(s[k]) && !s[k].length);
      });
      return '<div class="prov-item"><div class="src">' + esc(s.source) + ' ' +
        badge(KIND_CLASS[s.kind]||'b-guid', s.kind) + '</div>' +
        '<div class="says">' + esc(s.says) + '</div>' +
        (extra.length ? '<details class="more"><summary>Full record</summary><div class="tbl-scroll"><table><tbody>' +
          extra.map(function(k){ return '<tr><th>' + esc(k) + '</th><td>' +
            (typeof s[k] === 'object' ? mono(JSON.stringify(s[k])) : esc(s[k])) + '</td></tr>'; }).join('') +
          '</tbody></table></div></details>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function conflicts(r){
    if (!r.conflicts.length) return '';
    return '<section class="sec"><h3>Conflicts — ' + r.conflicts.length + ', unresolved by design</h3>' +
      r.conflicts.map(function(c){
        var vals = Array.isArray(c.values) ? c.values.map(function(v){ return esc(v); }).join(' · ')
          : Object.keys(c.values).map(function(k){ return esc(k) + ' → ' + esc(c.values[k]); }).join('<br>');
        return '<div class="conflict"><div class="about">' + esc(c.about) + '</div>' +
          '<div class="vals">' + vals + '</div><div class="note">' + esc(c.note) + '</div></div>';
      }).join('') + '</section>';
  }
  function xlink(kind,key,label){
    return '<button class="xlink" type="button" data-kind="' + kind + '" data-key="' + esc(key) + '">' + esc(label) + '</button>';
  }
  function crumbs(){
    if (!state.history.length) return '';
    var h = '<div class="crumbs"><span class="lbl">Trail</span>';
    state.history.slice(-6).forEach(function(x,i){
      if (i) h += '<span class="sep">›</span>';
      h += '<button type="button" data-kind="' + x.kind + '" data-key="' + esc(x.key) + '">' + esc(x.label) + '</button>';
    });
    h += '<span class="sep">›</span><span>' + esc(state.sel.label) + '</span></div>';
    return h;
  }
  function kv(pairs){
    return '<dl class="kv">' + pairs.filter(function(p){ return p; }).map(function(p){
      return '<dt>' + esc(p[0]) + '</dt><dd>' + p[1] + '</dd>';
    }).join('') + '</dl>';
  }

  function renderList(l){
    var h = crumbs();
    h += '<div class="dhead"><h2>' + esc(l.titles[0] || '(untitled)') + '</h2><div class="ids">' +
      '<div><span class="k">GUID</span>' + (l.listGuid ? esc(l.listGuid) : 'none — identified by site + title, a weaker claim') + '</div>' +
      '<div><span class="k">Site</span>' + esc(l.site || '—') + '</div>' +
      (l.serverRelativeUrls.length ? '<div><span class="k">Path</span>' + esc(l.serverRelativeUrls.join(', ')) + '</div>' : '') +
      '</div><div class="tags">' + kindBadges(l) +
      (l.observedInTenant ? badge('b-observed','observed ' + R.newestListObservation) : badge('b-specified','never observed')) +
      (l.governance ? badge(l.governance.disposition === 'RETIRE' ? 'b-crit' : 'b-derived', l.governance.disposition) : '') +
      '</div></div>';

    h += '<section class="sec"><h3>What is known</h3>' + kv([
      ['Type', l.objectType ? esc(l.objectType) + ' · ' + esc(l.template) : '—'],
      ['Items at capture', l.itemsAtCapture == null ? '—' : l.itemsAtCapture],
      ['Hidden', yn(l.hidden)],
      ['Adopted in capture', yn(l.adoptedInCapture)],
      ['Role in capture', esc(l.roleInCapture || '—')],
      ['Governance', l.governance ? esc(l.governance.disposition + (l.governance.reason ? ' — ' + l.governance.reason : '')) +
        (l.governance.supersededBy ? '<br>superseded by ' + mono(l.governance.supersededBy) : '') : '—'],
      ['Alternate titles', l.alternateTitles && l.alternateTitles.length ? esc(l.alternateTitles.slice(1).join(', ')) : '—'],
      ['Columns recorded', l.fieldCount + (l.fieldCount ? ' · ' + Object.keys(l.fieldsByEvidenceBasis).map(function(b){
        return '<span class="b ' + (BASIS_CLASS[b]||'b-guid') + '">' + esc(b) + ' ' + l.fieldsByEvidenceBasis[b] + '</span>';
      }).join(' ') : '')]
    ]) + '</section>';

    h += '<section class="sec"><h3>Provenance — what each source says</h3>' + provenance(l) + '</section>';

    if (l.fields.length) {
      h += '<section class="sec"><h3>Columns — all ' + l.fields.length + '</h3><div class="tbl-scroll"><table><thead><tr>' +
        '<th>Internal name</th><th>Display</th><th>Type</th><th>Req</th><th>Idx</th><th>Evidence basis</th><th>Source</th></tr></thead><tbody>' +
        l.fields.map(function(f){
          return '<tr><td>' + mono(f.internalName) + '</td><td>' + esc(f.displayName || '—') + '</td><td>' +
            esc(f.fieldType || '—') + '</td><td>' + esc(f.required == null ? '—' : f.required) + '</td><td>' +
            esc(f.indexed == null ? '—' : f.indexed) + '</td><td><span class="b ' + (BASIS_CLASS[f.evidenceBasis]||'b-guid') +
            '">' + esc(f.evidenceBasis) + '</span>' + (f.capturedState || f.evidenceState ?
              ' <span class="b b-guid">' + esc(f.capturedState || f.evidenceState) + '</span>' : '') +
            '</td><td>' + mono(f.source) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<details class="more"><summary>What each evidence basis means</summary><div class="bases" style="margin-top:8px;flex-direction:column;gap:6px">' +
        Object.keys(BASIS_LABEL).map(function(b){ return '<div><span class="b ' + (BASIS_CLASS[b]||'b-guid') + '">' +
          esc(b) + '</span> ' + esc(BASIS_LABEL[b]) + '</div>'; }).join('') + '</div></details></section>';
    }

    if (l.indexTargets.length) {
      h += '<section class="sec"><h3>Index targets — ' + l.indexTargets.length + '</h3><div class="tbl-scroll"><table><thead><tr>' +
        '<th>Column</th><th>Reason</th><th>Items at capture</th></tr></thead><tbody>' +
        l.indexTargets.map(function(i){ return '<tr><td>' + mono(i.internalName) + '</td><td>' + esc(i.reason) +
          '</td><td>' + esc(i.itemsAtCapture == null ? '—' : i.itemsAtCapture) + '</td></tr>'; }).join('') +
        '</tbody></table></div></section>';
    }

    if (l.touchedByFlows.length) {
      var seen = {};
      h += '<section class="sec"><h3>Flows that touch it — ' + l.touchedByFlows.length + ' reference(s)</h3><div class="tbl-scroll"><table><thead><tr>' +
        '<th>Flow</th><th>Action</th><th>Operation</th><th>Addressed by</th></tr></thead><tbody>' +
        l.touchedByFlows.map(function(x){
          var target = null;
          flows.forEach(function(f){ if (!target && f.names.indexOf(x.flow) >= 0) target = f; });
          var cell = target ? xlink('flow', target.key, x.flow) : esc(x.flow);
          seen[x.flow] = 1;
          return '<tr><td>' + cell + '</td><td>' + mono(x.action) + '</td><td>' + esc(x.operation) +
            '</td><td>' + esc(x.addressedBy) + (x.addressedBy === 'title' ?
              ' <span class="b b-specified">by title</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div></section>';
    } else {
      h += '<section class="sec"><h3>Flows that touch it</h3><p style="color:var(--muted);margin:0">' +
        'No flow definition in this branch references this list. That is a statement about the ' +
        R.totals.definitionFilesRead + ' definition files held here, not about the tenant.</p></section>';
    }

    h += conflicts(l);
    el('detail').innerHTML = h;
  }

  function renderFlow(f){
    var h = crumbs();
    h += '<div class="dhead"><h2>' + esc(f.names[0] || '(unnamed)') + '</h2><div class="ids">' +
      '<div><span class="k">Workflow id</span>' + (f.workflowId ? esc(f.workflowId) : 'none — 32-hex Logic Apps id not known here') + '</div>' +
      '<div><span class="k">Flow GUID</span>' + (f.flowGuid ? esc(f.flowGuid) : 'none — 36-char Power Automate GUID not known here') + '</div>' +
      (f.environment ? '<div><span class="k">Environment</span>' + esc(f.environment) + '</div>' : '') +
      '</div><div class="tags">' + kindBadges(f) +
      (f.definitionHeld ? badge('b-exported','definition held') : badge('b-guid','no definition held')) +
      (f.workflowId && f.flowGuid ? badge('b-observed','both identifiers') : badge('b-specified','one identifier space only')) +
      '</div></div>';

    h += '<section class="sec"><h3>What is known</h3>' + kv([
      ['Identity basis', esc(f.identity)],
      ['Contract keys', f.contractKeys.length ? f.contractKeys.map(mono).join(' ') : '—'],
      ['Aliases', f.aliases && f.aliases.length ? f.aliases.slice(1).map(esc).join(', ') : '—'],
      ['Category', esc(f.category || '—')],
      ['Trigger / method', esc((f.trigger || '—') + ' / ' + (f.method || '—'))],
      ['Routing segment', esc(f.routingSegment || '—')],
      ['Actions', f.actionCount == null ? '—' : f.actionCount],
      ['Endpoint shape', f.endpointShape ? mono(f.endpointShape) +
        '<br><span style="color:var(--muted);font-size:12px">Path only. Every <code>sig=</code> is removed at source — this page holds no credential.</span>' : '—'],
      ['Possibly the same flow as', f.candidateSameFlowAs.length ? f.candidateSameFlowAs.map(function(k){
        var o = byFlowKey[k]; return o ? xlink('flow', k, o.names[0] || k) : mono(k);
      }).join(' · ') + '<br><span style="color:var(--muted);font-size:12px">Shares a name. Not merged: GOV-06 proves the identifier spaces do not resolve.</span>' : '—']
    ]) + '</section>';

    h += '<section class="sec"><h3>Provenance — what each source says</h3>' + provenance(f) + '</section>';

    if (f.definitionFiles.length) {
      h += '<section class="sec"><h3>Definition files — ' + f.definitionFiles.length + '</h3><div class="tbl-scroll"><table><thead><tr>' +
        '<th>Path</th><th>Kind</th><th>Via</th></tr></thead><tbody>' +
        f.definitionFiles.map(function(d){ return '<tr><td>' + mono(d.path) + '</td><td><span class="b ' +
          (KIND_CLASS[d.kind]||'b-guid') + '">' + esc(d.kind) + '</span></td><td>' + mono(d.source) + '</td></tr>'; }).join('') +
        '</tbody></table></div></section>';
    }

    if (f.listsTouched.length) {
      h += '<section class="sec"><h3>SharePoint references — all ' + f.listsTouched.length + '</h3><div class="tbl-scroll"><table><thead><tr>' +
        '<th>Action</th><th>Operation</th><th>List</th><th>Addressed by</th><th>Dynamic</th></tr></thead><tbody>' +
        f.listsTouched.map(function(x){
          var target = x.listGuid ? listsByGuid[x.listGuid]
            : (x.listTitle && listsByTitle[String(x.listTitle).toLowerCase()] || [])[0];
          var label = x.listTitle || x.listGuid || '—';
          var cell = target ? xlink('list', target.key, label) : esc(label);
          var many = !x.listGuid && x.listTitle && (listsByTitle[String(x.listTitle).toLowerCase()]||[]).length > 1;
          return '<tr><td>' + mono(x.action) + '</td><td>' + esc(x.operation) + '</td><td>' + cell +
            (many ? ' <span class="b b-crit">title names ' + listsByTitle[String(x.listTitle).toLowerCase()].length + ' lists</span>' : '') +
            '</td><td>' + esc(x.addressedBy) + '</td><td>' + yn(x.dynamic) + '</td></tr>';
        }).join('') + '</tbody></table></div></section>';
    } else {
      h += '<section class="sec"><h3>SharePoint references</h3><p style="color:var(--muted);margin:0">' +
        'No SharePoint reference recorded. Either the flow touches no list, or no definition for it is held here.</p></section>';
    }

    h += conflicts(f);
    el('detail').innerHTML = h;
  }

  function placeholder(){
    el('detail').innerHTML = '<div class="dhead"><h2>Pick a record</h2>' +
      '<div class="ids"><div>Every row opens its full provenance: which source said what, and when.</div></div></div>' +
      '<section class="sec"><h3>How the two halves connect</h3><p style="margin:0 0 9px">' +
      'A list shows the flows that touch it; a flow shows the lists it touches. Both are clickable in ' +
      'both directions, and the trail at the top of each record lets you walk back.</p>' +
      '<p style="margin:0;color:var(--muted)">' + esc(R.howToReadIt.whatIsNotHere) + '</p></section>' +
      '<section class="sec"><h3>Known divergences</h3>' + R.knownDivergences.map(function(d){
        return '<div class="conflict"><div class="about">' + esc(d.id) + ' · ' + esc(d.about) + '</div>' +
          '<div class="note"><b>' + esc(d.statement) + '</b><br>' + esc(d.consequence) +
          '<br><span style="color:var(--muted)">Measured in <code>' + esc(d.measuredIn) + '</code></span></div></div>';
      }).join('') + '</section>';
  }

  function select(kind,key,push){
    var r = kind === 'list' ? byListKey[key] : byFlowKey[key];
    if (!r) return;
    var label = kind === 'list' ? (r.titles[0] || '(untitled)') : (r.names[0] || '(unnamed)');
    if (push && state.sel) state.history.push(state.sel);
    state.sel = { kind:kind, key:key, label:label };
    if (kind === 'list') renderList(r); else renderFlow(r);
    el('detail').scrollIntoView({ block:'nearest' });
    renderResults();
  }

  /* ── events ──────────────────────────────────────────────────────────── */
  el('q').addEventListener('input', function(e){ state.q = e.target.value; renderResults(); });
  el('tab-lists').addEventListener('click', function(){ setTab('lists'); });
  el('tab-flows').addEventListener('click', function(){ setTab('flows'); });
  function setTab(tab){
    state.tab = tab;
    el('tab-lists').setAttribute('aria-selected', String(tab === 'lists'));
    el('tab-flows').setAttribute('aria-selected', String(tab === 'flows'));
    state.sites = {}; state.bases = {}; state.kinds = {};
    filters(); renderResults();
  }
  el('filters').addEventListener('click', function(e){
    var b = e.target.closest('[data-group]');
    if (b) {
      var g = b.getAttribute('data-group'), k = b.getAttribute('data-key');
      if (g === 'conflicts') state.conflictsOnly = !state.conflictsOnly;
      else state[g][k] = !state[g][k];
      filters(); renderResults(); return;
    }
    if (e.target.id === 'clear') {
      state.sites = {}; state.kinds = {}; state.bases = {}; state.conflictsOnly = false;
      state.q = ''; el('q').value = '';
      filters(); renderResults();
    }
  });
  el('results').addEventListener('click', function(e){
    var b = e.target.closest('[data-kind][data-key]');
    if (b) select(b.getAttribute('data-kind'), b.getAttribute('data-key'), false);
  });
  el('detail').addEventListener('click', function(e){
    var b = e.target.closest('[data-kind][data-key]');
    if (!b) return;
    var kind = b.getAttribute('data-kind'), key = b.getAttribute('data-key');
    var inCrumbs = !!e.target.closest('.crumbs');
    if (inCrumbs) {
      var idx = -1;
      state.history.forEach(function(x,i){ if (x.kind === kind && x.key === key) idx = i; });
      if (idx >= 0) state.history = state.history.slice(0, idx);
      select(kind, key, false);
    } else {
      if (kind !== state.tab.slice(0,-1)) setTab(kind === 'list' ? 'lists' : 'flows');
      select(kind, key, true);
    }
  });
  /* Theme is the brand kit's: its header toggle persists the choice for every NITDA page. */
  strip(); filters(); renderResults(); placeholder();

  /* Open on the record that demonstrates what the page is FOR — the list the most flows touch —
     rather than the one with the most rows on paper. The first draft opened on the list with the
     most columns and that turned out to be a specification-only list that exists nowhere, so the
     first thing a reader saw was a table of things that do not exist. Prefer an observed list, and
     among those the one with the richest cross-navigation. */
  var opener = lists.slice().sort(function(a,b){
    if (a.observedInTenant !== b.observedInTenant) return a.observedInTenant ? -1 : 1;
    return (b.touchedByFlows.length - a.touchedByFlows.length) || (b.fieldCount - a.fieldCount);
  })[0];
  if (opener) select('list', opener.key, false);
})();
</script>
</body>
</html>
`));

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

console.log('\nEstate register artifact\n');
console.log(`  lists ${R.lists.length} · flows ${R.flows.length} · embedded register ${Math.round(embed.length / 1024)} KB`);
console.log(`  page  ${Math.round(html.length / 1024)} KB\n`);

if (CHECK) {
  if (html !== previous) fail('the estate register artifact is stale. Run: npm run estateartifact');
  console.log('  ✅ the artifact matches the register\n');
  process.exit(0);
}
fs.writeFileSync(OUT, html);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)}\n`);
