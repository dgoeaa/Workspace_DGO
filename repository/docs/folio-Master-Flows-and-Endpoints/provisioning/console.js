/* Provisioning console — behaviour.
 *
 * Authored, not generated. The two data files beside this one are written by
 * scripts/build-provisioning-console.mjs from scripts/lib/provisioning-model.mjs — the same
 * model the markdown reference renders. This file adds no fact to them; everything it shows
 * comes out of the data, and where the data says a thing is not declared, so does the page.
 *
 * WHAT IT IS FOR
 * The markdown reference is complete and linear: an index of two flat tables, and 131 pages
 * running to 8,097 lines. Everything below exists to make a 195,000-line reference something
 * you can move through — search across every flow at once, filter to the set you mean, jump to
 * a section or to one action out of 252, and link someone straight to it.
 *
 * No framework, no build step, no network. It is opened from file:// as often as from a server.
 */
(function () {
  'use strict';

  var INDEX = (window.DGO_PROVISIONING_INDEX || { meta: { totals: {} }, index: [] });
  var ROWS = INDEX.index;
  var META = INDEX.meta;
  var DETAIL = null;                       /* tier two, once it lands */
  var detailWaiters = [];

  /* In the single-file export there is no sibling markdown to link to. The reference is still
     worth naming — it is where the diffable record lives — so it is rendered as the path
     rather than as a link that goes nowhere. */
  var STANDALONE = !!window.DGO_PROVISIONING_STANDALONE;

  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* ── tier two ───────────────────────────────────────────────────────────────────────
     Injected as a script tag rather than fetched: fetch() is blocked on file://, and this
     folder is meant to be copyable. Injected AFTER first paint rather than in the head,
     because 5.9 MB parsed before the first render is the difference between a reference that
     feels instant and one that does not. */
  function loadDetail() {
    /* Already here? Then this is the single-file export — `npm run provisioningconsole -- --standalone`
       inlines both data tiers into one HTML file you can mail to a reviewer, and there is no
       sibling to fetch. Nothing else changes: the same code renders it. */
    if (window.DGO_PROVISIONING_DETAIL) {
      DETAIL = window.DGO_PROVISIONING_DETAIL;
      var ready = detailWaiters; detailWaiters = [];
      ready.forEach(function (fn) { fn(); });
      return;
    }
    var s = document.createElement('script');
    s.src = 'provisioning-detail.js';
    s.onload = function () {
      DETAIL = window.DGO_PROVISIONING_DETAIL || {};
      var waiting = detailWaiters; detailWaiters = [];
      waiting.forEach(function (fn) { fn(); });
    };
    s.onerror = function () {
      DETAIL = {};
      var waiting = detailWaiters; detailWaiters = [];
      waiting.forEach(function (fn) { fn(); });
    };
    document.body.appendChild(s);
  }
  function whenDetail(fn) { if (DETAIL) fn(); else detailWaiters.push(fn); }

  /* ── state ──────────────────────────────────────────────────────────────────────────── */

  var state = { q: '', filters: {}, sort: 'name', id: null };

  var FILTERS = [
    { id: 'deployed',  label: 'Deployed',      test: function (r) { return r.deployed; } },
    { id: 'notlive',   label: 'Not deployed',  test: function (r) { return !r.deployed; } },
    { id: 'internal',  label: 'Internal',      test: function (r) { return r.estate === 'Internal platform'; } },
    { id: 'portal',    label: 'Portal',        test: function (r) { return r.estate === 'Document portal'; } },
    { id: 'keyed',     label: 'Serves a key',  test: function (r) { return r.contractKeys.length > 0; } },
    { id: 'noauth',    label: 'No auth stated', test: function (r) { return r.deployed && !r.auth; } },
    { id: 'responds',  label: 'Returns a response', test: function (r) { return r.responseCount > 0; } }
  ];

  /* Filters within a group are OR, across groups AND — the way a person reads them. Picking
     "Internal" and "Portal" means both estates, not the empty set a plain AND would give. */
  var GROUPS = { deployed: 'live', notlive: 'live', internal: 'estate', portal: 'estate' };

  function matches(r) {
    var byGroup = {};
    FILTERS.forEach(function (f) {
      if (!state.filters[f.id]) return;
      var g = GROUPS[f.id] || f.id;
      byGroup[g] = byGroup[g] || [];
      byGroup[g].push(f.test(r));
    });
    for (var g in byGroup) {
      if (byGroup[g].indexOf(true) === -1) return false;
    }
    if (state.q) {
      var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < terms.length; i++) {
        if (r.q.indexOf(terms[i]) === -1) return false;
      }
    }
    return true;
  }

  function sorted(list) {
    var by = state.sort;
    return list.slice().sort(function (a, b) {
      if (by === 'actions') return b.actionCount - a.actionCount || a.name.localeCompare(b.name);
      if (by === 'estate') return a.estate.localeCompare(b.estate) || a.name.localeCompare(b.name);
      if (by === 'method') return String(a.method || '~').localeCompare(String(b.method || '~')) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }

  /* ── the list ───────────────────────────────────────────────────────────────────────── */

  function highlight(text, q) {
    var frag = document.createDocumentFragment();
    if (!q) { frag.appendChild(document.createTextNode(text)); return frag; }
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    var lower = text.toLowerCase();
    var marks = [];
    terms.forEach(function (t) {
      var from = 0, at;
      while ((at = lower.indexOf(t, from)) !== -1) { marks.push([at, at + t.length]); from = at + t.length; }
    });
    if (!marks.length) { frag.appendChild(document.createTextNode(text)); return frag; }
    marks.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [marks[0]];
    marks.slice(1).forEach(function (m) {
      var last = merged[merged.length - 1];
      if (m[0] <= last[1]) last[1] = Math.max(last[1], m[1]); else merged.push(m);
    });
    var cur = 0;
    merged.forEach(function (m) {
      if (m[0] > cur) frag.appendChild(document.createTextNode(text.slice(cur, m[0])));
      frag.appendChild(el('mark', null, text.slice(m[0], m[1])));
      cur = m[1];
    });
    if (cur < text.length) frag.appendChild(document.createTextNode(text.slice(cur)));
    return frag;
  }

  function renderFilters() {
    var box = $('filters');
    box.textContent = '';
    FILTERS.forEach(function (f) {
      var n = ROWS.filter(f.test).length;
      var b = el('button', 'chip');
      b.type = 'button';
      b.setAttribute('aria-pressed', state.filters[f.id] ? 'true' : 'false');
      b.appendChild(document.createTextNode(f.label));
      b.appendChild(el('span', 'n', String(n)));
      b.onclick = function () {
        state.filters[f.id] = !state.filters[f.id];
        renderFilters(); renderList();
      };
      box.appendChild(b);
    });
  }

  function renderList() {
    var list = $('list');
    var shown = sorted(ROWS.filter(matches));
    list.textContent = '';

    $('resultcount').textContent = shown.length === ROWS.length
      ? ROWS.length + ' packages'
      : shown.length + ' of ' + ROWS.length;

    if (!shown.length) {
      var e = el('div', 'empty');
      e.appendChild(el('b', null, 'Nothing matches'));
      e.appendChild(el('div', null, 'Try fewer words, or clear the filters.'));
      list.appendChild(e);
      return;
    }

    var lastGroup = null;
    shown.forEach(function (r) {
      var g = r.deployed ? 'Deployed — the provisioned state' : 'Other packages — not the deployed state';
      if (g !== lastGroup && state.sort !== 'actions' && state.sort !== 'method') {
        list.appendChild(el('div', 'group', g));
        lastGroup = g;
      }
      var b = el('button', 'item');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.dataset.id = r.id;
      b.setAttribute('aria-current', r.id === state.id ? 'true' : 'false');

      var nm = el('span', 'nm');
      nm.appendChild(highlight(r.name, state.q));
      b.appendChild(nm);

      var sub = el('span', 'sub');
      sub.appendChild(el('span', 'tag ' + (r.deployed ? 'live' : 'notlive'), r.deployed ? 'live' : r.family));
      if (r.estate === 'Document portal') sub.appendChild(el('span', 'tag portal', 'portal'));
      if (r.method) sub.appendChild(el('span', 'tag mono', r.method));
      if (r.deployed && !r.auth) sub.appendChild(el('span', 'tag warn', 'auth not stated'));
      sub.appendChild(el('span', null, r.actionCount + ' actions'));
      if (r.contractKeys.length) {
        var keys = el('span', 'tag keys', r.contractKeys.join(' \u00b7 '));
        keys.title = 'Serves ' + r.contractKeys.join(', ');
        sub.appendChild(keys);
      }
      b.appendChild(sub);

      b.onclick = function () { go(r.id); };
      list.appendChild(b);
    });
  }

  /* ── rendering helpers ──────────────────────────────────────────────────────────────── */

  var NOT_DECLARED = '\u2014';

  function cellNode(c, emptyText) {
    var td = el('td', 'v');
    if (c === null || c === undefined || c === '') td.appendChild(el('em', 'nothing', emptyText || 'not declared'));
    else if (typeof c === 'object' && c.code !== undefined) td.appendChild(el('code', null, String(c.code)));
    else if (typeof c === 'object' && c.em !== undefined) td.appendChild(el('em', 'nothing', String(c.em)));
    else td.appendChild(document.createTextNode(String(c)));
    return td;
  }

  function kvTable(rows) {
    var wrap = el('div', 'tablewrap');
    var t = el('table');
    var head = el('thead'); var hr = el('tr');
    ['Field', 'As provisioned'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    head.appendChild(hr); t.appendChild(head);
    var body = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', 'k', r[0]));
      tr.appendChild(cellNode(r[2] === 'code' && r[1] != null && r[1] !== '' ? { code: r[1] } : r[1]));
      body.appendChild(tr);
    });
    t.appendChild(body); wrap.appendChild(t);
    return wrap;
  }

  function gridTable(headers, rows) {
    var wrap = el('div', 'tablewrap');
    var t = el('table');
    var head = el('thead'); var hr = el('tr');
    headers.forEach(function (h) { hr.appendChild(el('th', null, h)); });
    head.appendChild(hr); t.appendChild(head);
    var body = el('tbody');
    rows.forEach(function (cells) {
      var tr = el('tr');
      cells.forEach(function (c) { tr.appendChild(cellNode(c, NOT_DECLARED)); });
      body.appendChild(tr);
    });
    t.appendChild(body); wrap.appendChild(t);
    return wrap;
  }

  /* JSON, syntax-coloured, in a box that scrolls on its own. A configured input is routinely
     a 300-character expression; in the markdown that value set a table column's width and
     moved the whole document sideways. */
  function jsonBlock(value, label) {
    var box = el('div', 'json');
    var bar = el('div', 'jsonbar');
    bar.appendChild(el('span', 'grow', label || 'inputs, verbatim'));
    var copy = el('button', 'iconbtn');
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.onclick = function () { copyText(JSON.stringify(value, null, 2)); };
    bar.appendChild(copy);
    box.appendChild(bar);

    var pre = el('pre');
    pre.appendChild(colourJson(value));
    box.appendChild(pre);

    /* Long values are clipped, never truncated: everything is present and the reader decides.
       A value cut short in a provisioning record is a value nobody can rely on. */
    var text = JSON.stringify(value, null, 2) || '';
    var lines = text.split('\n').length;
    if (lines > 18) {
      box.classList.add('clipped');
      var more = el('button', 'more');
      more.type = 'button';
      more.textContent = 'Show all ' + lines + ' lines';
      more.onclick = function () { box.classList.remove('clipped'); more.remove(); };
      box.appendChild(more);
    }
    return box;
  }

  function colourJson(value) {
    var frag = document.createDocumentFragment();
    var text = JSON.stringify(value, null, 2);
    if (text === undefined) { frag.appendChild(el('span', 'x', 'undefined')); return frag; }
    var re = /("(\\.|[^"\\])*"\s*:)|("(\\.|[^"\\])*")|(\b-?\d+(\.\d+)?([eE][+-]?\d+)?\b)|\b(true|false|null)\b/g;
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var cls = m[1] ? 'k' : m[3] ? 's' : m[5] ? 'n' : 'b';
      frag.appendChild(el('span', cls, m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  function copyText(t) {
    var done = function () { toast('Copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t, done); });
    } else fallbackCopy(t, done);
  }
  function fallbackCopy(t, done) {
    var ta = el('textarea');
    ta.value = t;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* nothing to offer */ }
    ta.remove();
  }
  var toastTimer;
  function toast(msg) {
    var old = document.querySelector('.toast'); if (old) old.remove();
    var t = el('div', 'toast', msg);
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 1600);
  }

  function section(num, title, id) {
    var s = el('section', 'sec');
    s.id = id;
    var h = el('h2');
    if (num) h.appendChild(el('span', 'num', num + '.'));
    h.appendChild(document.createTextNode(title));
    var a = el('button', 'anchor');
    a.type = 'button';
    a.textContent = 'Link';
    a.title = 'Copy a link to this section';
    a.onclick = function () {
      copyText(location.href.split('#')[0] + '#/' + state.id + '/' + id);
      history.replaceState(null, '', '#/' + state.id + '/' + id);
    };
    h.appendChild(a);
    s.appendChild(h);
    return s;
  }

  /* ── the home view ──────────────────────────────────────────────────────────────────── */

  function renderHome() {
    var c = $('content');
    c.textContent = '';
    var h = el('div', 'home');

    h.appendChild(el('h1', null, 'Every flow and every endpoint, as configured'));
    h.appendChild(el('p', 'lede', SEL.complete
      ? 'The configuration of ' + (META.totals.packages || 0) + ' packages across both platforms, read out of '
        + 'the packages in this repository and shown as they carry it. Search on the left, or pick a flow to see '
        + 'its trigger, its responses, its connections and the configured input of every action.'
      : 'A selected export: ' + (META.totals.packages || 0) + ' of the estate\u2019s ' + SEL.estateTotal
        + ' packages, chosen by ' + (SEL.terms || []).join(', ') + '. Everything shown is read out of the '
        + 'packages in this repository and shown as they carry it \u2014 the same detail as the full '
        + 'reference, for these flows only.'));

    var grid = el('div', 'grid');
    [
      [META.totals.deployedFlows, 'deployed flows'],
      [META.totals.actions, 'actions documented'],
      [META.totals.responses, 'Response actions'],
      [META.totals.internalContractKeys, 'internal contract keys'],
      [META.totals.withRequestSchema + ' / ' + META.totals.deployedFlows, 'declare a request schema'],
      [META.totals.withoutTriggerAuth, 'carry no trigger auth']
    ].forEach(function (p) {
      var card = el('div', 'card');
      card.appendChild(el('div', 'big', String(p[0])));
      card.appendChild(el('div', 'lbl', p[1]));
      grid.appendChild(card);
    });
    h.appendChild(grid);

    h.appendChild(el('h2', null, 'Finding things'));
    var ul = el('ul');
    [
      /* "the twelve flows" is a fact about the whole estate and false in a narrowed export.
         The claim is scoped to whatever this file actually holds. */
      ['Search matches more than the name.', ' A contract key, an action name, a connection, or the '
        + 'SharePoint list a call targets — the list GUIDs are resolved, so searching for a list by name '
        + 'finds the flows here that write to it' + (SEL.complete ? ' (DGO_UserDirectory finds twelve)' : '')
        + '. The markdown cannot: the string is not in it.'],
      ['Filters combine the way you read them.', ' Picking two estates means both, not neither.'],
      ['Every section and every action has a link.', ' Use the Link button on a heading to copy one; it reopens on that exact action.'],
      ['The markdown is still there.', ' Each flow links to its page, which is the diffable record and what a git history shows.']
    ].forEach(function (p) {
      var li = el('li');
      li.appendChild(el('b', null, p[0]));
      li.appendChild(document.createTextNode(p[1]));
      ul.appendChild(li);
    });
    h.appendChild(ul);

    h.appendChild(el('h2', null, 'Keyboard'));
    var kb = el('ul');
    [['/', 'search'], ['\u2191 \u2193', 'move through the list'], ['Enter', 'open'],
     ['Esc', 'clear the search, or go back to the list'], ['t', 'theme']].forEach(function (p) {
      var li = el('li');
      li.appendChild(el('span', 'kbd', p[0]));
      li.appendChild(document.createTextNode(' \u2014 ' + p[1]));
      kb.appendChild(li);
    });
    h.appendChild(kb);

    var src = el('p', 'note');
    src.appendChild(document.createTextNode('Generated by '));
    src.appendChild(el('code', null, META.generatedBy || ''));
    src.appendChild(document.createTextNode(' from '));
    src.appendChild(el('code', null, META.model || ''));
    src.appendChild(document.createTextNode(' \u2014 the same model the markdown reference renders'));
    if (STANDALONE) {
      src.appendChild(document.createTextNode(', at '));
      src.appendChild(el('code', null, 'docs/folio-Master-Flows-and-Endpoints/provisioning/'));
      src.appendChild(document.createTextNode(' in the repository.'));
    } else {
      src.appendChild(document.createTextNode('. '));
      var a = el('a', null, 'Open the markdown index');
      a.href = 'README.md';
      src.appendChild(a);
      src.appendChild(document.createTextNode('.'));
    }
    h.appendChild(src);

    c.appendChild(h);
    $('outline').textContent = '';
    document.title = 'DGO — Provisioning console';
  }

  /* ── the flow view ──────────────────────────────────────────────────────────────────── */

  function renderFlow(id) {
    var row = ROWS.filter(function (r) { return r.id === id; })[0];
    var c = $('content');
    c.textContent = '';
    if (!row) { renderHome(); return; }

    document.title = row.name + ' — Provisioning console';

    var back = el('button', 'backbtn');
    back.type = 'button';
    back.textContent = '\u2039  All flows';
    back.onclick = function () { document.body.dataset.view = 'list'; $('q').focus(); };
    c.appendChild(back);

    var head = el('div', 'flowhead');
    var eyebrow = el('div', 'eyebrow');
    eyebrow.appendChild(el('span', 'tag ' + (row.deployed ? 'live' : 'notlive'),
      row.deployed ? 'deployed export — the live tenant' : row.family));
    eyebrow.appendChild(el('span', 'tag ' + (row.estate === 'Document portal' ? 'portal' : ''), row.estate));
    if (row.contractKeys.length) eyebrow.appendChild(el('span', 'tag', 'serves ' + row.contractKeys.join(', ')));
    head.appendChild(eyebrow);
    head.appendChild(el('h1', null, row.name));

    var srcline = el('div', 'sourceline');
    srcline.appendChild(document.createTextNode(row.deployed
      ? 'Every value below is read from the deployed export and printed as that package carries it: '
      : 'This is not the deployed state. Read from '));
    srcline.appendChild(el('code', null, row.file));
    srcline.appendChild(document.createTextNode('. '));
    if (STANDALONE) {
      srcline.appendChild(document.createTextNode('Recorded as '));
      srcline.appendChild(el('code', null, row.page));
      srcline.appendChild(document.createTextNode('.'));
    } else {
      var mdlink = el('a', null, 'Markdown page');
      mdlink.href = row.page.replace('docs/folio-Master-Flows-and-Endpoints/provisioning/', '');
      srcline.appendChild(mdlink);
    }
    head.appendChild(srcline);

    var facts = el('dl', 'facts');
    [
      ['Trigger', row.triggerType || NOT_DECLARED],
      ['Method', row.method || 'not declared'],
      ['Auth', row.auth || 'not declared'],
      ['Actions', row.actionCount],
      ['Responses', row.responseCount]
    ].forEach(function (p) {
      var d = el('div', 'fact');
      d.appendChild(el('dt', null, p[0]));
      d.appendChild(el('dd', typeof p[1] === 'number' ? null : 'sm', String(p[1])));
      facts.appendChild(d);
    });
    head.appendChild(facts);
    c.appendChild(head);

    var body = el('div');
    c.appendChild(body);

    var pending = el('div', 'loading');
    pending.appendChild(el('span', 'spin'));
    pending.appendChild(el('span', null, 'Reading the configured values\u2026'));
    body.appendChild(pending);

    whenDetail(function () {
      if (state.id !== id) return;                /* the reader moved on while it loaded */
      body.textContent = '';
      var d = DETAIL[id];
      if (!d) {
        body.appendChild(el('p', 'nothing', 'The detail for this package is not in the data file.'));
        return;
      }
      renderSections(body, d);
      buildOutline(d);
      applyPendingHash();
    });
  }

  function renderSections(body, d) {
    var s;

    /* 1 — identity */
    s = section(1, 'Identity', 'identity');
    s.appendChild(kvTable([
      ['Display name', d.identity.displayName, 'code'],
      ['Internal name', d.identity.internalName, 'code'],
      ['Workflow id', d.identity.workflowId, 'code'],
      ['Environment', d.identity.environmentName, 'code'],
      ['Full resource id', d.identity.fullResourceId, 'code'],
      ['Estate', d.identity.estate + ' \u2014 ' + d.identity.estateBasis],
      ['Package family', d.identity.family],
      ['Contract keys', d.identity.contractKeys.length ? d.identity.contractKeys.join(', ') : null],
      ['Portal endpoint', d.identity.portalEndpoint],
      ['Exported at (UTC)', d.identity.exportedAtUtc, 'code'],
      ['Exported by', d.identity.exportedBy],
      ['Source package', d.identity.file, 'code']
    ]));
    body.appendChild(s);

    /* 2 — envelope */
    s = section(2, 'Definition envelope', 'envelope');
    s.appendChild(kvTable([
      ['$schema', d.envelope.schemaUri, 'code'],
      ['contentVersion', d.envelope.contentVersion, 'code'],
      ['description', d.envelope.description],
      ['Actions', d.envelope.actionCount]
    ]));
    if (d.envelope.outputs && Object.keys(d.envelope.outputs).length) {
      s.appendChild(jsonBlock(d.envelope.outputs, 'outputs, verbatim'));
    }
    body.appendChild(s);

    /* 3 — parameters */
    s = section(3, 'Definition parameters', 'parameters');
    var params = d.parameters || {};
    var pk = Object.keys(params);
    if (pk.length) {
      s.appendChild(gridTable(['Parameter', 'Type', 'Default value'], pk.map(function (k) {
        var p = params[k] || {};
        return [{ code: k }, p.type || null, p.defaultValue !== undefined ? JSON.stringify(p.defaultValue) : null];
      })));
    } else s.appendChild(el('p', 'nothing', 'This definition declares no parameters.'));
    body.appendChild(s);

    /* 4 — connections */
    s = section(4, 'Connections and references', 'connections');
    if (d.connections.length) {
      s.appendChild(el('p', 'note', 'What each action is bound to, read from its inputs.host.'));
      s.appendChild(gridTable(['Connection', 'API id', 'Operations used'], d.connections.map(function (c) {
        return [
          { code: c.connectionName || NOT_DECLARED },
          { code: c.apiId || NOT_DECLARED },
          c.operations.map(function (o) { return o.op + '\u00d7' + o.n; }).join(', ')
        ];
      })));
    } else s.appendChild(el('p', 'nothing', 'No action in this package is bound to a connection.'));
    body.appendChild(s);

    /* 5 — trigger */
    s = section(5, 'Trigger — the endpoint this flow exposes', 'trigger');
    if (d.trigger) {
      s.appendChild(kvTable([
        ['Name', d.trigger.name, 'code'],
        ['Type', d.trigger.type, 'code'],
        ['Kind', d.trigger.kind, 'code'],
        ['Method', d.trigger.method, 'code'],
        ['Relative path', d.trigger.relativePath, 'code'],
        ['Authentication', d.trigger.triggerAuthenticationType]
      ]));
      if (d.trigger.schema) s.appendChild(jsonBlock(d.trigger.schema, 'Request schema, as provisioned'));
      if (d.trigger.headers) s.appendChild(jsonBlock(d.trigger.headers, 'headers, verbatim'));
      if (d.trigger.queries) s.appendChild(jsonBlock(d.trigger.queries, 'queries, verbatim'));
    } else s.appendChild(el('p', 'nothing', 'This package carries no trigger — a clipboard scope is a fragment of a flow.'));
    body.appendChild(s);

    /* 6 — responses */
    var responses = d.actions.filter(function (a) { return a.type === 'Response'; });
    s = section(6, 'Responses returned to the caller', 'responses');
    if (responses.length) {
      responses.forEach(function (a) {
        var h = el('h3');
        h.appendChild(el('code', null, a.path));
        h.style.marginTop = 'var(--s-4)';
        s.appendChild(h);
        var i = a.inputs || {};
        s.appendChild(kvTable([
          ['Status code', i.statusCode, 'code'],
          ['Headers', i.headers ? JSON.stringify(i.headers) : null],
          ['Runs after', a.runAfter.length ? a.runAfter.map(function (e) { return e.after + ' (' + e.statuses.join('/') + ')'; }).join(', ') : 'first in its scope']
        ]));
        if (i.body !== undefined) s.appendChild(jsonBlock(i.body, 'body, verbatim'));
      });
    } else s.appendChild(el('p', 'nothing', 'This package returns no Response.'));
    body.appendChild(s);

    /* 7 — termination */
    var terms = d.actions.filter(function (a) { return a.type === 'Terminate'; });
    s = section(7, 'Termination', 'termination');
    if (terms.length) {
      s.appendChild(gridTable(['Action', 'Status', 'Code', 'Message'], terms.map(function (a) {
        var i = a.inputs || {};
        return [{ code: a.path }, i.runStatus, i.runError && i.runError.code, i.runError && i.runError.message];
      })));
    } else s.appendChild(el('p', 'nothing', 'No Terminate action.'));
    body.appendChild(s);

    /* 8 — error handling */
    var catches = d.actions.filter(function (a) { return a.isCatch; });
    var retries = d.actions.filter(function (a) { return a.runtimeConfiguration; });
    s = section(8, 'Error handling and run-time configuration', 'errors');
    if (catches.length) {
      s.appendChild(el('p', 'note', 'Actions configured to run on a failure rather than a success.'));
      s.appendChild(gridTable(['Action', 'Runs after'], catches.map(function (a) {
        return [{ code: a.path }, a.runAfter.map(function (e) { return e.after + ' (' + e.statuses.join('/') + ')'; }).join(', ')];
      })));
    } else s.appendChild(el('p', 'nothing', 'No action runs on failure.'));
    if (retries.length) {
      var rh = el('h3', null, 'Run-time configuration');
      rh.style.marginTop = 'var(--s-4)';
      s.appendChild(rh);
      s.appendChild(gridTable(['Action', 'Configuration'], retries.map(function (a) {
        return [{ code: a.path }, JSON.stringify(a.runtimeConfiguration)];
      })));
    }
    body.appendChild(s);

    /* 9 — variables */
    var inits = d.actions.filter(function (a) { return a.type === 'InitializeVariable'; });
    s = section(9, 'Variables', 'variables');
    if (inits.length) {
      var rows = [];
      inits.forEach(function (a) {
        ((a.inputs && a.inputs.variables) || []).forEach(function (v) {
          rows.push([
            { code: v.name }, v.type,
            /* The markdown's own wording. A variable with no initial value is a fact about the
               flow, not a field the export failed to declare. */
            v.value === undefined ? { em: 'no initial value' } : JSON.stringify(v.value),
            { code: a.path }
          ]);
        });
      });
      s.appendChild(gridTable(['Variable', 'Type', 'Initial value', 'Initialised by'], rows));
    } else s.appendChild(el('p', 'nothing', 'This package initialises no variables.'));
    body.appendChild(s);

    /* 10 — SharePoint. The rows are computed in the generator, where the tenant list index
       lives, so `table` arrives with the list it names rather than as a bare GUID. */
    s = section(10, 'SharePoint operations', 'sharepoint');
    if (d.sharepoint.length) {
      s.appendChild(el('p', 'note', 'One row per connector call. table is shown as configured; the resolved column names the list that GUID belongs to, and says so when the index does not carry it.'));
      s.appendChild(gridTable(
        ['Action', 'Operation', 'Connection', 'Site', 'table (list)', 'Resolves to'],
        d.sharepoint.map(function (r) {
          return [
            { code: r.path }, r.operationId, { code: r.connection || NOT_DECLARED },
            r.dataset, { code: r.table || NOT_DECLARED },
            r.resolved || { em: 'not in the list index' }
          ];
        })
      ));
    } else s.appendChild(el('p', 'nothing', 'This package performs no SharePoint operation.'));
    body.appendChild(s);

    /* 11 — outbound HTTP, webhooks included. */
    s = section(11, 'Outbound HTTP calls', 'http');
    if (d.http.length) {
      d.http.forEach(function (h) {
        var hd = el('h3');
        hd.appendChild(el('code', null, h.path));
        hd.style.marginTop = 'var(--s-4)';
        s.appendChild(hd);
        s.appendChild(kvTable([
          ['method', h.method, 'code'],
          ['uri', h.uri, 'code'],
          ['authentication', h.authentication ? JSON.stringify(h.authentication) : null],
          ['retryPolicy', h.retryPolicy ? JSON.stringify(h.retryPolicy) : null]
        ]));
        if (h.headers) s.appendChild(jsonBlock(h.headers, 'headers, verbatim'));
        if (h.queries) s.appendChild(jsonBlock(h.queries, 'queries, verbatim'));
        if (h.body !== undefined) s.appendChild(jsonBlock(h.body, 'body, verbatim'));
      });
    } else s.appendChild(el('p', 'nothing', 'This package makes no raw HTTP call.'));
    body.appendChild(s);

    /* 12 — dependency register */
    s = section(12, 'Action dependency register', 'dependencies');
    s.appendChild(el('p', 'note', 'What each action waits for, and on what outcome.'));
    s.appendChild(gridTable(['Action', 'Type', 'Runs after'], d.actions.map(function (a) {
      return [
        { code: a.path }, a.type,
        a.runAfter.length ? a.runAfter.map(function (e) { return e.after + ' (' + e.statuses.join('/') + ')'; }).join(', ') : 'first in its scope'
      ];
    })));
    body.appendChild(s);

    /* 13 — the action register.
       This is the section that could not be navigated at all: one block per action, up to 252
       of them, with nothing between the reader and a scrollbar. Collapsed by default, filtered
       in place, and each one addressable. */
    s = section(13, 'Configured values, action by action', 'actions');
    s.appendChild(el('p', 'note', 'The configured input of every action, verbatim. An action with no inputs — a Scope, an If, a Foreach — is shown by its control expression instead.'));

    var bar = el('div', 'actionbar');
    var filter = el('input');
    filter.type = 'search';
    filter.placeholder = 'Filter ' + d.actions.length + ' actions by name, type or connector\u2026';
    filter.setAttribute('aria-label', 'Filter actions');
    bar.appendChild(filter);
    var count = el('span', 'n');
    bar.appendChild(count);
    var expand = el('button', 'iconbtn');
    expand.type = 'button';
    expand.textContent = 'Expand all';
    bar.appendChild(expand);
    s.appendChild(bar);

    var holder = el('div');
    s.appendChild(holder);
    body.appendChild(s);

    var nodes = d.actions.map(function (a) { return actionNode(a); });
    nodes.forEach(function (n) { holder.appendChild(n); });
    count.textContent = d.actions.length + ' actions';

    var allOpen = false;
    expand.onclick = function () {
      allOpen = !allOpen;
      expand.textContent = allOpen ? 'Collapse all' : 'Expand all';
      nodes.forEach(function (n) { if (!n.hidden) n.open = allOpen; });
    };

    filter.oninput = function () {
      var q = filter.value.trim().toLowerCase();
      var shown = 0;
      nodes.forEach(function (n) {
        var hit = !q || n.dataset.q.indexOf(q) !== -1;
        n.hidden = !hit;
        if (hit) shown++;
        n.classList.toggle('hit', !!q && hit);
      });
      count.textContent = q ? shown + ' of ' + d.actions.length : d.actions.length + ' actions';
    };
  }

  function actionNode(a) {
    var det = el('details', 'action');
    det.id = 'action-' + cssEscape(a.path);
    det.dataset.depth = String(a.depth);
    det.dataset.q = (a.path + ' ' + a.type + ' '
      + (a.connector ? (a.connector.connectionName || '') + ' ' + (a.connector.operationId || '') : '')).toLowerCase();

    var sum = el('summary');
    var path = el('span', 'path');
    var parts = a.path.split('/');
    if (parts.length > 1) path.appendChild(el('span', 'scope', parts.slice(0, -1).join('/') + '/'));
    path.appendChild(document.createTextNode(parts[parts.length - 1]));
    sum.appendChild(path);
    sum.appendChild(el('span', 'tag', a.type));
    if (a.isCatch) sum.appendChild(el('span', 'tag warn', 'on failure'));
    det.appendChild(sum);

    /* The body is built the first time it is opened. Building 252 of them up front is the
       difference between a page that appears and a page that hangs. */
    var built = false;
    det.addEventListener('toggle', function () {
      if (!det.open || built) return;
      built = true;
      var b = el('div', 'body');
      b.appendChild(kvTable([
        ['Type', a.type, 'code'],
        ['Kind', a.kind, 'code'],
        ['Description', a.description],
        ['Runs after', a.runAfter.length ? a.runAfter.map(function (e) { return e.after + ' (' + e.statuses.join('/') + ')'; }).join(', ') : 'first in its scope'],
        ['Connector', a.connector ? (a.connector.connectionName || a.connector.apiId) : null, 'code'],
        ['Operation', a.connector ? a.connector.operationId : null, 'code'],
        ['Operation options', a.operationOptions, 'code']
      ]));
      if (a.inputs !== undefined) b.appendChild(jsonBlock(a.inputs, 'inputs, verbatim'));
      else b.appendChild(el('p', 'nothing', 'This action declares no inputs.'));
      if (a.expression !== undefined) b.appendChild(jsonBlock(a.expression, 'expression, verbatim'));
      if (a.foreach !== undefined) b.appendChild(jsonBlock(a.foreach, 'foreach, verbatim'));
      if (a.runtimeConfiguration) b.appendChild(jsonBlock(a.runtimeConfiguration, 'runtimeConfiguration, verbatim'));
      if (a.trackedProperties) b.appendChild(jsonBlock(a.trackedProperties, 'trackedProperties, verbatim'));
      det.appendChild(b);
    });
    return det;
  }

  function cssEscape(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, '_'); }

  /* ── outline ────────────────────────────────────────────────────────────────────────── */

  var SECTIONS = [
    ['identity', 'Identity'], ['envelope', 'Definition envelope'], ['parameters', 'Parameters'],
    ['connections', 'Connections'], ['trigger', 'Trigger'], ['responses', 'Responses'],
    ['termination', 'Termination'], ['errors', 'Error handling'], ['variables', 'Variables'],
    ['sharepoint', 'SharePoint operations'], ['http', 'Outbound HTTP'],
    ['dependencies', 'Dependency register'], ['actions', 'Configured values']
  ];

  function buildOutline(d) {
    var o = $('outline');
    o.textContent = '';
    o.appendChild(el('h2', null, 'Sections'));
    var ol = el('ol');
    SECTIONS.forEach(function (p, i) {
      var li = el('li');
      var a = el('a');
      a.href = '#/' + state.id + '/' + p[0];
      a.appendChild(el('span', 'num', String(i + 1)));
      a.appendChild(document.createTextNode(p[1]));
      a.onclick = function (ev) { ev.preventDefault(); jumpTo(p[0]); closeOutlineOnNarrow(); };
      li.appendChild(a);
      ol.appendChild(li);
    });
    o.appendChild(ol);

    o.appendChild(el('h2', null, 'Actions (' + d.actions.length + ')'));
    var list = el('ol');
    d.actions.forEach(function (a) {
      var li = el('li');
      var link = el('a');
      link.href = '#/' + state.id + '/actions';
      link.title = a.path;
      link.textContent = a.path.split('/').pop();
      link.onclick = function (ev) { ev.preventDefault(); openAction(a.path); closeOutlineOnNarrow(); };
      li.appendChild(link);
      list.appendChild(li);
    });
    o.appendChild(list);
    spy();
  }

  /* `instant` is for ARRIVING, not for moving. Following a link into §13 of a 252-action flow
     lands 24,000px down the page; smooth-scrolling that is a slow ride through content the
     reader did not ask to see, and it is still going when they start reading. Clicks inside
     the page keep the smooth scroll, because there the motion is what says "you moved". */
  /* 'instant', not 'auto'. Per the spec `behavior: 'auto'` means "whatever CSS says", and CSS
     here says `scroll-behavior: smooth` on .main — so 'auto' animated the 24,000px arrival it
     was written to prevent. 'instant' is the value that actually jumps. */
  function behaviour(instant) { return instant || prefersReduced() ? 'instant' : 'smooth'; }

  function jumpTo(id, instant) {
    var n = document.getElementById(id);
    if (!n) return;
    n.scrollIntoView({ block: 'start', behavior: behaviour(instant) });
    history.replaceState(null, '', '#/' + state.id + '/' + id);
  }
  function openAction(path, instant) {
    var n = document.getElementById('action-' + cssEscape(path));
    if (!n) return;
    n.open = true;
    n.scrollIntoView({ block: 'center', behavior: behaviour(instant) });
    history.replaceState(null, '', '#/' + state.id + '/actions/' + encodeURIComponent(path));
  }
  function prefersReduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* Which section the reader is actually in. Cheap, throttled to animation frames, and it is
     what turns a 4,000-line page from "somewhere" into "section 9". */
  var spyQueued = false;
  function spy() {
    if (spyQueued) return;
    spyQueued = true;
    requestAnimationFrame(function () {
      spyQueued = false;
      var best = null, bestTop = -Infinity;
      SECTIONS.forEach(function (p) {
        var n = document.getElementById(p[0]);
        if (!n) return;
        var top = n.getBoundingClientRect().top - 80;
        if (top <= 0 && top > bestTop) { bestTop = top; best = p[0]; }
      });
      var links = $('outline').querySelectorAll('ol a');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href') || '';
        links[i].setAttribute('aria-current',
          best && href === '#/' + state.id + '/' + best ? 'true' : 'false');
      }
    });
  }

  function closeOutlineOnNarrow() {
    if (window.innerWidth <= 1200) {
      $('outline').classList.remove('open');
      $('outlinebtn').setAttribute('aria-expanded', 'false');
    }
  }

  /* ── routing ────────────────────────────────────────────────────────────────────────── */

  var pendingHash = null;

  function go(id, replace) {
    state.id = id;
    if (id) {
      document.body.dataset.view = 'detail';
      if ((location.hash || '').indexOf('#/' + id) !== 0) {
        if (replace) history.replaceState(null, '', '#/' + id);
        else location.hash = '#/' + id;
      }
      /* Reset BEFORE rendering, never after. Once the detail tier is loaded, whenDetail() runs
         synchronously — so renderFlow() reaches applyPendingHash() and scrolls to the linked
         section before this line runs, and resetting afterwards threw that away. Cold loads hid
         it: there the detail is still in flight, so the reset happened first and the scroll won.
         Following a section link from the outline of one flow to another is the case that broke. */
      $('main').scrollTop = 0;
      renderFlow(id);
    } else {
      document.body.dataset.view = 'list';
      renderHome();
    }
    renderList();
  }

  function applyPendingHash() {
    if (!pendingHash) return;
    var h = pendingHash; pendingHash = null;
    if (h.action) openAction(h.action, true);
    else if (h.section) jumpTo(h.section, true);
  }

  /* `#/<dir>/<slug>[/<section>[/<action>]]`. The directory is part of the address because the
     slug alone is not unique — see idOf() in build-provisioning-console.mjs. */
  function readHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (!h) return { id: null };
    var parts = h.split('/');
    if (parts.length < 2) return { id: null };
    return {
      id: decodeURIComponent(parts[0]) + '/' + decodeURIComponent(parts[1]),
      section: parts[2] ? decodeURIComponent(parts[2]) : null,
      action: parts[3] ? decodeURIComponent(parts.slice(3).join('/')) : null
    };
  }

  function route() {
    var h = readHash();
    if (!h.id) { state.id = null; go(null); return; }
    pendingHash = { section: h.section, action: h.action };
    if (state.id !== h.id) go(h.id, true);
    else applyPendingHash();
  }

  /* ── wiring ─────────────────────────────────────────────────────────────────────────── */

  /* The data says what it is. Everything the page claims about scope comes from here, so a
     narrowed export cannot describe itself as the estate. */
  var SEL = META.selection || { complete: true, terms: [] };

  function announceScope() {
    if (SEL.complete) return;
    document.body.setAttribute('data-partial', '');
    var n = $('partial');
    n.textContent = '';
    n.appendChild(el('b', null, 'Partial export'));
    n.appendChild(document.createTextNode('\u2014 ' + (META.totals.packages || 0)
      + ' of ' + (SEL.estateTotal || '?') + ' packages in the estate. Selected by '));
    (SEL.terms || []).forEach(function (t, i) {
      if (i) n.appendChild(document.createTextNode(', '));
      n.appendChild(el('code', null, t));
    });
    n.appendChild(document.createTextNode('. The rest of the estate is not in this file.'));
  }

  function init() {
    /* The brand mark is upstream's; the "of N" is this branch's — a narrowed export has to
       say so everywhere it states a count, including here. Both, not either. */
    $('brandsub').textContent = 'NITDA Folio \u00b7 ' + (META.totals.packages || 0) + ' packages'
      + (SEL.complete ? '' : ' of ' + SEL.estateTotal);
    announceScope();
    [[META.totals.deployedFlows, 'deployed'], [META.totals.actions, 'actions'],
     [META.totals.internalContractKeys, 'internal keys']].forEach(function (p) {
      var s = el('span');
      s.appendChild(el('b', null, String(p[0])));
      s.appendChild(document.createTextNode(' ' + p[1]));
      $('counts').appendChild(s);
    });

    renderFilters();
    renderList();

    var q = $('q');
    var debounce;
    q.addEventListener('input', function () {
      $('qclear').hidden = !q.value;
      clearTimeout(debounce);
      debounce = setTimeout(function () { state.q = q.value.trim(); renderList(); }, 90);
    });
    $('qclear').onclick = function () { q.value = ''; state.q = ''; $('qclear').hidden = true; renderList(); q.focus(); };
    $('sort').onchange = function () { state.sort = $('sort').value; renderList(); };

    $('themebtn').onclick = function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var next = cur === 'dark' ? 'light' : cur === 'light' ? null : 'dark';
      if (next) document.documentElement.setAttribute('data-theme', next);
      else document.documentElement.removeAttribute('data-theme');
      try {
        if (next) localStorage.setItem('dgo.provisioning.theme', next);
        else localStorage.removeItem('dgo.provisioning.theme');
      } catch (e) { /* private mode — it still applies for this session */ }
      toast(next ? next.charAt(0).toUpperCase() + next.slice(1) : 'Following the system');
    };

    $('outlinebtn').onclick = function () {
      var open = $('outline').classList.toggle('open');
      $('outlinebtn').setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    $('main').addEventListener('scroll', spy, { passive: true });

    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (e.key === '/' && !typing) { e.preventDefault(); document.body.dataset.view = 'list'; q.focus(); q.select(); return; }
      if (e.key === 't' && !typing) { $('themebtn').click(); return; }
      if (e.key === 'Escape') {
        if (typing && q.value) { $('qclear').click(); return; }
        if (document.body.dataset.view === 'detail' && window.innerWidth <= 900) { document.body.dataset.view = 'list'; return; }
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (typing ? document.activeElement === q : true)) {
        var items = [].slice.call($('list').querySelectorAll('.item'));
        if (!items.length) return;
        e.preventDefault();
        var cur = items.indexOf(document.activeElement);
        var next = e.key === 'ArrowDown'
          ? (cur < 0 ? 0 : Math.min(cur + 1, items.length - 1))
          : (cur < 0 ? items.length - 1 : Math.max(cur - 1, 0));
        items[next].focus();
      }
    });

    window.addEventListener('hashchange', route);
    route();
    loadDetail();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
