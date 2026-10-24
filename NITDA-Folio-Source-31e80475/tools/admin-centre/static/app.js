/* Folio Central Administration Centre — client.
 *
 * Dependency-free. Every value that reaches the DOM goes through esc() or textContent; the
 * bearer token lives in sessionStorage only and is removed on Lock, on idle timeout and on a 401.
 * Views are data-driven: nothing operational is embedded here. */
(function () {
  'use strict';

  var TOKEN_KEY = 'folio.admin.token';
  var ACTOR_KEY = 'folio.admin.actor';
  var REFRESH_MS = 30000;
  // Mirrors CREDENTIAL in server.py: refused before it leaves the browser, and again on arrival.
  var CREDENTIAL = /(?:[?&]sig=[A-Za-z0-9%_\-]{8,}|\/triggers\/manual\/paths\/invoke\?[^\s]*sig|sharedaccesssignature|\bbearer\s+[A-Za-z0-9._~+\/\-]{20,}|client[_-]?secret\s*[:=]|password\s*[:=]\s*\S|\bfc_[A-Za-z0-9_\-]{30,}|\bfac_[A-Za-z0-9_\-]{30,})/i;

  var S = { token: null, actor: '', session: null, summary: null, view: null, param: null, cache: {}, ui: {}, timer: null, idleAt: 0, idleWarned: false, failures: 0 };
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  function store(k, v) {
    try {
      if (v === undefined) return sessionStorage.getItem(k);
      if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v);
    } catch (e) { /* storage blocked: the session simply does not survive a reload */ }
    return null;
  }
  function toast(msg, tone) { if (window.BrandKit) window.BrandKit.toast(msg, { tone: tone }); }

  /* ── Encoding and formatting ───────────────────────────────────────────────────────── */
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"'`]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c];
    });
  }
  function tz() { return (S.session && S.session.system.timezone) || 'Africa/Lagos'; }
  function fmt(iso, withDate) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return esc(iso);
    try {
      return new Intl.DateTimeFormat('en-GB', withDate === false
        ? { timeZone: tz(), hour: '2-digit', minute: '2-digit', second: '2-digit' }
        : { timeZone: tz(), day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
    } catch (e) { return d.toISOString(); }
  }
  function ago(iso) {
    if (!iso) return 'never';
    var s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (isNaN(s)) return '';
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  }
  function time(iso) { return iso ? '<time datetime="' + esc(iso) + '" title="' + esc(iso) + ' (UTC)">' + esc(fmt(iso)) + '</time>' : '—'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  var TONES = {
    Healthy: 'ok', Degraded: 'warn', Stale: 'warn', Unavailable: 'bad', Unknown: '',
    Critical: 'bad', High: 'bad', Medium: 'warn', Low: 'info', Info: '',
    Open: 'bad', Acknowledged: 'warn', Resolved: 'ok', Investigating: 'warn', Mitigated: 'info', Closed: '',
    Submitted: 'warn', Approved: 'info', Rejected: 'bad', Implemented: 'info', Verified: 'ok', RolledBack: 'bad', Cancelled: '',
    Registered: 'info', Active: 'ok', Maintenance: 'warn', Retired: '', Commissioned: 'ok', Suspended: 'warn',
    Succeeded: 'ok', Failed: 'bad', Denied: 'bad'
  };
  function badge(v, label) {
    var t = TONES[v];
    return '<span class="bk-badge' + (t ? ' bk-badge--' + t : '') + '">' + esc(label || v || '—') + '</span>';
  }
  function state(s) { return '<span class="state"><span class="dot" data-s="' + esc(s) + '"></span> ' + esc(s) + '</span>'; }

  /* ── API ───────────────────────────────────────────────────────────────────────────── */
  function api(method, path, body) {
    var opts = { method: method, headers: { 'Authorization': 'Bearer ' + S.token, 'Accept': 'application/json' }, cache: 'no-store' };
    if (body !== undefined) {
      if (S.session && S.session.kind === 'bootstrap' && !body.actor) body.actor = S.actor;
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = { error: 'invalid response', message: t.slice(0, 200) }; }
        setLive(true);
        if (r.status === 401 && S.session) { lock('Your session is no longer valid (401 unauthorized). Unlock again with a current token.'); }
        if (!r.ok) {
          var err = new Error((data && data.message) || ('HTTP ' + r.status));
          err.status = r.status; err.code = data && data.error; err.correlationId = data && data.correlationId;
          throw err;
        }
        return data;
      });
    }, function (e) {
      setLive(false);
      var err = new Error('The Centre is not answering. Is the server running? (' + e.message + ')');
      err.status = 0;
      throw err;
    });
  }
  function can(perm) { return !!(S.session && S.session.permissions.indexOf(perm) >= 0); }

  function setLive(ok) {
    var el = $('#live');
    if (!el) return;
    S.failures = ok ? 0 : S.failures + 1;
    el.setAttribute('data-state', ok ? 'ok' : 'bad');
    $('#live-text').textContent = ok ? 'Live' : 'Offline';
    var b = $('#banner');
    if (!ok && S.failures >= 1) {
      b.textContent = 'Connection to the Centre was lost. Retrying every ' + (REFRESH_MS / 1000) + ' seconds; nothing you have not submitted is lost.';
      b.hidden = false;
    } else if (ok) { b.hidden = true; }
  }

  /* ── Lock / unlock ─────────────────────────────────────────────────────────────────── */
  function showLock(msg) {
    $('#app').hidden = true;
    $('#lock').hidden = false;
    var e = $('#unlock-error');
    if (msg) { e.textContent = msg; e.hidden = false; } else { e.hidden = true; }
    if (!$('#actor').value) $('#actor').value = S.actor || store(ACTOR_KEY) || '';
    setTimeout(function () { $('#token').focus(); }, 30);
  }
  function lock(msg) {
    S.token = null; S.session = null; S.cache = {};
    store(TOKEN_KEY, null);
    clearInterval(S.timer);
    closeDialogs();
    $('#view').textContent = '';
    showLock(msg);
  }

  function unlock(token, actor) {
    S.token = token;
    return api('GET', '/api/session').then(function (sess) {
      if (sess.kind === 'bootstrap') {
        if (!actor || !/^[A-Za-z0-9][A-Za-z0-9 ._@\-]{1,79}$/.test(actor)) {
          S.token = null;
          var e = new Error('Enter your accountable name (2–80 letters, digits, spaces, dots, dashes, @ or underscores). It is recorded on every change.');
          e.field = 'actor';
          throw e;
        }
        S.actor = actor;
      } else {
        S.actor = sess.name;
      }
      S.session = sess;
      store(TOKEN_KEY, token);
      store(ACTOR_KEY, S.actor);
      startApp();
    }, function (e) { S.token = null; throw e; });
  }

  function startApp() {
    $('#lock').hidden = true;
    $('#app').hidden = false;
    $('#token').value = '';
    var s = S.session;
    $('#whoami').innerHTML = '<b>' + esc(S.actor) + '</b><span>' + esc(s.roleLabel) + '</span>';
    /* The toolkit this copy came in (BUILD-ID.json beside server.py), so two copies of the Centre are never confused. */
    var b = s.system.build || {};
    $('#foot-system').textContent = s.system.name + ' ' + s.system.version + ' · ' + (b.version ? 'toolkit build v' + b.version + ' · ' + b.commit : (b.label || 'repository copy')) + ' · ' + s.system.bind + ' · times in ' + s.system.timezone;
    $$('[data-perm]').forEach(function (a) { a.hidden = !can(a.getAttribute('data-perm')); });
    if (window.BrandKit && window.BrandKit.refresh) window.BrandKit.refresh();
    touch();
    clearInterval(S.timer);
    S.timer = setInterval(tick, REFRESH_MS);
    refreshSummary().then(route);
  }

  /* ── Idle lock ─────────────────────────────────────────────────────────────────────── */
  function touch() { S.idleAt = Date.now(); S.idleWarned = false; }
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, touch, { passive: true }); });
  setInterval(function () {
    if (!S.token || !S.session) return;
    var limit = (S.session.system.sessionIdleMinutes || 15) * 60000;
    var idle = Date.now() - S.idleAt;
    if (idle > limit) { lock('Locked after ' + S.session.system.sessionIdleMinutes + ' minutes without activity.'); return; }
    if (idle > limit - 60000 && !S.idleWarned) { S.idleWarned = true; toast('The Centre will lock in one minute without activity.', 'warn'); }
  }, 5000);

  /* ── Periodic refresh ──────────────────────────────────────────────────────────────── */
  function tick() {
    if (!S.token) return;
    refreshSummary().then(function () {
      var v = VIEWS[S.view];
      var typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.id !== 'global-search';
      if (v && v.live && !anyDialogOpen() && !typing) render(true);
    }, function () { /* setLive already reported it */ });
  }
  function refreshSummary() {
    return api('GET', '/api/summary').then(function (s) {
      S.summary = s;
      var sev = s.openAlertsBySeverity || {};
      setCount('alerts', s.open.alerts, (sev.Critical || sev.High) ? 'bad' : 'warn');
      setCount('incidents', s.open.incidents, 'bad');
      setCount('changes', s.changesAwaitingDecision, 'warn');
      setCount('flows', s.flowsFailed, 'bad');
      $('#foot-updated').textContent = 'Updated ' + fmt(new Date().toISOString(), false);
      return s;
    });
  }
  function setCount(k, n, tone) {
    var el = $('[data-count="' + k + '"]');
    if (!el) return;
    el.textContent = n ? String(n) : '';
    el.setAttribute('data-tone', n ? tone : '');
    el.setAttribute('aria-label', n ? n + ' open' : '');
  }

  /* ── Routing ───────────────────────────────────────────────────────────────────────── */
  function route() {
    if (!S.session) return;
    var parts = (location.hash || '#/overview').replace(/^#\/?/, '').split('/');
    var v = VIEWS[parts[0]] ? parts[0] : 'overview';
    if (VIEWS[v].perm && !can(VIEWS[v].perm)) v = 'overview';
    var changed = v !== S.view;
    var param = parts.slice(1).join('/') || null;
    if (!changed && param && VIEWS[v].open && S.cache[v]) {  // same view, a record opened: no reload
      S.param = param;
      VIEWS[v].open(param);
      return;
    }
    S.view = v; S.param = param;
    $$('.bk-nav a[data-view]').forEach(function (a) {
      if (a.getAttribute('data-view') === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = VIEWS[v].title + ' · Central Administration Centre · Folio';
    render(false, changed);
  }
  window.addEventListener('hashchange', route);

  function render(quiet, changed) {
    var v = VIEWS[S.view];
    var host = $('#view');
    if (!quiet) host.innerHTML = '<div class="loading" aria-busy="true"><div class="bk-skeleton"></div><div class="bk-skeleton tall"></div><div class="bk-skeleton"></div><div class="bk-skeleton tall"></div></div>';
    var token = S.renderToken = {};
    return Promise.resolve(v.load ? v.load(S.param) : null).then(function (data) {
      if (token !== S.renderToken) return;
      S.cache[S.view] = data;
      draw();
      if (changed) { var m = $('#bk-main'); m.scrollTop = 0; }
      if (S.param && v.open && !quiet) v.open(S.param);
    }, function (e) {
      if (token !== S.renderToken || !S.token) return;
      host.innerHTML = '<div class="bk-callout bk-callout--bad"><b>This view could not load.</b> ' + esc(e.message) +
        ' <button class="bk-btn bk-btn--sm" type="button" data-action="reload">Try again</button></div>';
    });
  }
  function draw() {
    var v = VIEWS[S.view];
    var y = $('#bk-main').scrollTop;
    $('#view').innerHTML = v.draw(S.cache[S.view], ui(S.view));
    $('#bk-main').scrollTop = y;
    if (v.after) v.after(S.cache[S.view]);
  }
  function ui(view) { return S.ui[view] || (S.ui[view] = { filters: {}, sort: null }); }

  /* ── Building blocks ───────────────────────────────────────────────────────────────── */
  function head(eyebrow, title, lede, actions) {
    return '<div class="page-head"><div><p class="bk-eyebrow">' + esc(eyebrow) + '</p><h1>' + esc(title) + '</h1>' +
      (lede ? '<p>' + lede + '</p>' : '') + '</div><div class="page-actions">' + (actions || '') + '</div></div>';
  }
  function btn(label, action, attrs, cls) {
    return '<button type="button" class="bk-btn ' + (cls || '') + '" data-action="' + esc(action) + '"' + (attrs || '') + '>' + esc(label) + '</button>';
  }
  function permBtn(perm, label, action, attrs, cls) {
    if (can(perm)) return btn(label, action, attrs, cls);
    return '<button type="button" class="bk-btn ' + (cls || '') + '" disabled title="Your role (' + esc(S.session.roleLabel) + ') may not do this">' + esc(label) + '</button>';
  }
  function kpi(label, value, meta, href, tone) {
    return '<a class="bk-kpi" href="' + esc(href) + '"' + (tone ? ' data-tone="' + tone + '"' : '') + '><div class="bk-kpi__label">' + esc(label) +
      '</div><div class="bk-kpi__value">' + esc(value) + '</div>' + (meta ? '<div class="bk-kpi__meta">' + meta + '</div>' : '') + '</a>';
  }
  function empty(title, text) { return '<div class="bk-empty"><b>' + esc(title) + '</b><p>' + text + '</p></div>'; }

  /** A sortable table. cols: [{k, label, v(row) -> html, sort(row) -> value, cls}] */
  function table(view, cols, rows, opts) {
    opts = opts || {};
    var st = ui(view).sort;
    if (st) {
      var c = cols.filter(function (x) { return x.k === st.k; })[0];
      if (c) {
        var key = c.sort || function (r) { return r[c.k]; };
        rows = rows.slice().sort(function (a, b) {
          var x = key(a), y = key(b);
          if (x === y) return 0;
          if (x === null || x === undefined) return 1;
          if (y === null || y === undefined) return -1;
          return (x > y ? 1 : -1) * (st.dir === 'asc' ? 1 : -1);
        });
      }
    }
    if (!rows.length) return opts.empty || empty('No records', 'Nothing matches the current filters.');
    var h = '<div class="bk-table-wrap' + (opts.tall ? ' bk-table-wrap--tall' : '') + '" data-bk-edges><table class="bk-table"><thead><tr>';
    cols.forEach(function (c) {
      var sorted = st && st.k === c.k ? (st.dir === 'asc' ? 'ascending' : 'descending') : null;
      h += '<th scope="col"' + (c.nosort ? '' : ' data-sort="' + esc(c.k) + '" data-view="' + esc(view) + '" tabindex="0"') + (sorted ? ' aria-sort="' + sorted + '"' : '') +
        (c.cls ? ' class="' + c.cls + '"' : '') + '>' + esc(c.label) + '</th>';
    });
    h += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var open = opts.open ? opts.open(r) : null;
      h += '<tr' + (open ? ' data-open="' + esc(open) + '" tabindex="0"' : '') + '>';
      cols.forEach(function (c) { h += '<td' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + (c.v ? c.v(r) : esc(r[c.k])) + '</td>'; });
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  function chips(view, key, options, counts) {
    var cur = ui(view).filters[key] || '';
    var h = '<div class="bk-chips" role="group" aria-label="Filter by ' + esc(key) + '">';
    [''].concat(options).forEach(function (o) {
      h += '<button type="button" class="bk-chip" data-action="filter" data-view="' + esc(view) + '" data-key="' + esc(key) + '" data-value="' + esc(o) +
        '" aria-pressed="' + (cur === o) + '">' + esc(o || 'All') + (counts && counts[o || '*'] !== undefined ? ' <span class="bk-chip__count">' + counts[o || '*'] + '</span>' : '') + '</button>';
    });
    return h + '</div>';
  }
  function searchBox(view, placeholder) {
    return '<input class="bk-input grow" type="search" data-filter-q="' + esc(view) + '" placeholder="' + esc(placeholder) + '" value="' + esc(ui(view).filters.q || '') + '" aria-label="' + esc(placeholder) + '">';
  }
  function select(view, key, label, options) {
    var cur = ui(view).filters[key] || '';
    return '<label class="sr-only" for="f-' + esc(view + key) + '">' + esc(label) + '</label><select class="bk-select" id="f-' + esc(view + key) + '" data-filter-select="' + esc(view) + '" data-key="' + esc(key) + '">' +
      '<option value="">' + esc(label) + ': all</option>' + options.map(function (o) {
        var v = typeof o === 'string' ? o : o.v, l = typeof o === 'string' ? o : o.l;
        return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>';
      }).join('') + '</select>';
  }
  function applyFilters(view, rows, textKeys) {
    var f = ui(view).filters;
    return rows.filter(function (r) {
      for (var k in f) {
        if (!f[k] || k === 'q') continue;
        if (String(r[k]) !== f[k]) return false;
      }
      if (f.q) {
        var q = f.q.toLowerCase();
        return textKeys.some(function (k) { return String(r[k] === null || r[k] === undefined ? '' : r[k]).toLowerCase().indexOf(q) >= 0; });
      }
      return true;
    });
  }
  function countBy(rows, key) {
    var c = { '*': rows.length };
    rows.forEach(function (r) { c[r[key]] = (c[r[key]] || 0) + 1; });
    return c;
  }
  function spark(series) {
    if (!series || !series.length) return '<svg class="spark" viewBox="0 0 96 36" aria-hidden="true"><line class="base" x1="0" y1="35" x2="96" y2="35"/></svg>';
    var n = 48, w = 96 / n, max = Math.max.apply(null, series.map(function (p) { return p.ms || 0; }).concat([50]));
    var out = '<svg class="spark" viewBox="0 0 96 36" preserveAspectRatio="none" role="img" aria-label="Latency and state of the last ' + series.length + ' observations">';
    series.slice(-n).forEach(function (p, i) {
      var h = p.s === 'Unavailable' ? 34 : Math.max(3, Math.round(((p.ms || 0) / max) * 32));
      out += '<rect class="bar" data-s="' + esc(p.s) + '" x="' + (i * w + 0.3).toFixed(2) + '" y="' + (35 - h) + '" width="' + (w - 0.6).toFixed(2) + '" height="' + h + '"><title>' + esc(p.s + ' · ' + (p.ms === null ? '—' : p.ms + ' ms') + ' · ' + fmt(p.t)) + '</title></rect>';
    });
    return out + '<line class="base" x1="0" y1="35.5" x2="96" y2="35.5"/></svg>';
  }

  /* ── Dialog forms ──────────────────────────────────────────────────────────────────── */
  function anyDialogOpen() { return $('#dlg').open || $('#sheet').open; }
  function closeDialogs() { ['#dlg', '#sheet'].forEach(function (s) { var d = $(s); if (d.open) d.close(); }); }

  /**
   * form({title, intro, fields:[{name,label,type,required,options,value,help,max,min,rows}], submit, tone, run(values) -> Promise})
   * Validates on the client (required, length, credential guard), shows server errors inline,
   * keeps the dialog open on failure and resolves with run()'s result on success.
   */
  function form(o) {
    var d = $('#dlg');
    $('#dlg-title').textContent = o.title;
    var body = (o.intro ? '<div class="bk-callout' + (o.introTone ? ' bk-callout--' + o.introTone : '') + '">' + o.intro + '</div>' : '');
    var groups = [];
    o.fields.forEach(function (f) {
      var id = 'fld-' + f.name;
      var req = f.required ? '<span class="req" aria-hidden="true">*</span>' : '';
      var ctl;
      var val = f.value === undefined || f.value === null ? '' : f.value;
      if (f.type === 'select') {
        ctl = '<select class="bk-select" id="' + id + '" name="' + esc(f.name) + '"' + (f.required ? ' required' : '') + '>' +
          (f.placeholder ? '<option value="">' + esc(f.placeholder) + '</option>' : '') +
          f.options.map(function (op) {
            var v = typeof op === 'string' ? op : op.v, l = typeof op === 'string' ? op : op.l;
            return '<option value="' + esc(v) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';
          }).join('') + '</select>';
      } else if (f.type === 'textarea') {
        ctl = '<textarea class="bk-textarea" id="' + id + '" name="' + esc(f.name) + '" rows="' + (f.rows || 3) + '" maxlength="' + (f.max || 2000) + '"' + (f.required ? ' required' : '') + '>' + esc(val) + '</textarea>';
      } else {
        ctl = '<input class="bk-input" id="' + id + '" name="' + esc(f.name) + '" type="' + (f.type || 'text') + '" value="' + esc(val) + '"' +
          (f.max ? ' maxlength="' + f.max + '"' : '') + (f.required ? ' required' : '') + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + ' autocomplete="off">';
      }
      var html = '<div class="bk-field"><label for="' + id + '">' + esc(f.label) + req + '</label>' + ctl +
        (f.help ? '<p class="hint">' + f.help + '</p>' : '') + '<p class="field-error" id="' + id + '-err" hidden></p>' +
        (f.type === 'textarea' ? '<span class="counter" data-counter="' + id + '"></span>' : '') + '</div>';
      if (f.half) { groups.push(html); if (groups.length === 2) { body += '<div class="two">' + groups.join('') + '</div>'; groups = []; } }
      else { if (groups.length) { body += '<div class="two">' + groups.join('') + '</div>'; groups = []; } body += html; }
    });
    if (groups.length) body += '<div class="two">' + groups.join('') + '</div>';
    $('#dlg-body').innerHTML = body;
    $('#dlg-error').hidden = true;
    $('#dlg-foot').innerHTML = '<button type="button" class="bk-btn bk-btn--ghost" data-close>Cancel</button>' +
      '<button type="submit" class="bk-btn ' + (o.tone === 'danger' ? 'bk-btn--danger' : 'bk-btn--primary') + '" id="dlg-submit">' + esc(o.submit || 'Save') + '</button>';
    $$('textarea', d).forEach(function (t) {
      var c = $('[data-counter="' + t.id + '"]');
      var upd = function () { c.textContent = t.value.length + ' / ' + t.maxLength; };
      t.addEventListener('input', upd); upd();
    });
    return new Promise(function (resolve) {
      var f = $('#dlg-form');
      f.onsubmit = function (ev) {
        ev.preventDefault();
        var values = {}, bad = false;
        o.fields.forEach(function (fd) {
          var el = f.elements[fd.name];
          var v = el.value.trim();
          var err = '';
          if (fd.required && !v) err = fd.label + ' is required.';
          else if (fd.min && v && v.length < fd.min) err = fd.label + ' needs at least ' + fd.min + ' characters.';
          else if (v && CREDENTIAL.test(v)) err = 'This looks like a signed URL, token or password. Never place credentials in the Centre.';
          else if (fd.validate) err = fd.validate(v) || '';
          var e = $('#' + el.id + '-err');
          e.textContent = err; e.hidden = !err;
          el.setAttribute('aria-invalid', err ? 'true' : 'false');
          el.setAttribute('aria-describedby', err ? el.id + '-err' : '');
          if (err && !bad) { el.focus(); bad = true; }
          values[fd.name] = fd.type === 'number' && v !== '' ? Number(v) : v;
        });
        if (bad) return;
        var sb = $('#dlg-submit');
        sb.setAttribute('aria-busy', 'true'); sb.disabled = true;
        Promise.resolve(o.run(values)).then(function (res) {
          sb.removeAttribute('aria-busy'); sb.disabled = false;
          d.close();
          resolve(res);
        }, function (e) {
          sb.removeAttribute('aria-busy'); sb.disabled = false;
          var box = $('#dlg-error');
          box.textContent = e.message + (e.correlationId ? ' (ref ' + e.correlationId.slice(0, 8) + ')' : '');
          box.hidden = false;
        });
      };
      d.showModal();
      var first = $('input, select, textarea', $('#dlg-body'));
      if (first) first.focus();
    });
  }
  function confirmDo(title, text, submit, run, tone) {
    return form({ title: title, intro: text, introTone: tone === 'danger' ? 'warn' : '', fields: [
      { name: 'reason', label: 'Reason', type: 'textarea', required: true, min: 5, help: 'Recorded in the audit chain. State the operational reason.' }
    ], submit: submit, tone: tone, run: run });
  }
  function reveal(title, intro, secret) {
    var d = $('#dlg');
    $('#dlg-title').textContent = title;
    $('#dlg-body').innerHTML = '<div class="bk-callout bk-callout--warn">' + intro + '</div><div class="secret"><code id="secret-val">' + esc(secret) +
      '</code><button type="button" class="bk-btn bk-btn--sm" data-bk-copy-target="#secret-val">Copy</button></div>' +
      '<p class="hint">This is the only time it is shown. Deliver it through an approved channel; never by email, chat, ticket or screenshot.</p>';
    $('#dlg-error').hidden = true;
    $('#dlg-foot').innerHTML = '<button type="button" class="bk-btn bk-btn--primary" data-close>I have stored it</button>';
    $('#dlg-form').onsubmit = function (e) { e.preventDefault(); };
    d.showModal();
  }
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-close]');
    if (c) { var d = c.closest('dialog'); if (d) d.close(); }
  });
  $('#sheet').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $('#sheet').addEventListener('close', function () {
    // Only drop the record from the address if the address still names it: closing a sheet must
    // never pull the reader back from a view they have already navigated to.
    if (S.param && location.hash === '#/' + S.view + '/' + S.param) history.replaceState(null, '', '#/' + S.view);
    S.param = null;
  });

  function done(msg) {
    toast(msg, 'ok');
    return refreshSummary().then(function () { return render(true); }, function () {});
  }

  /* ── Record sheet (alerts, incidents, changes) ─────────────────────────────────────── */
  var KIND = { alerts: 'alert', incidents: 'incident', changes: 'change' };
  function openRecord(table, id) {
    var d = $('#sheet');
    $('#sheet-title').textContent = KIND[table].charAt(0).toUpperCase() + KIND[table].slice(1) + ' #' + id;
    $('#sheet-body').innerHTML = '<div class="loading"><div class="bk-skeleton"></div><div class="bk-skeleton tall"></div></div>';
    if (!d.open) d.showModal();
    if (location.hash !== '#/' + table + '/' + id) history.replaceState(null, '', '#/' + table + '/' + id);
    S.param = String(id);
    return api('GET', '/api/' + table + '/' + id).then(function (r) { $('#sheet-body').innerHTML = recordBody(table, r); },
      function (e) { $('#sheet-body').innerHTML = '<div class="bk-callout bk-callout--bad">' + esc(e.message) + '</div>'; });
  }
  function recordBody(table, r) {
    var flow = S.session.enums.flows[table];
    var facts = [];
    if (table === 'alerts') facts = [['Severity', badge(r.severity)], ['State', badge(r.state)], ['Asset', esc(r.asset)], ['Owner', esc(r.owner)], ['Source', esc(r.source)], ['Raised by', esc(r.created_by || '—')], ['Raised', time(r.created_at)], ['Resolved', time(r.resolved_at)], ['Correlation', '<span class="hash">' + esc(r.correlation_id || '—') + '</span>']];
    if (table === 'incidents') facts = [['Severity', badge(r.severity)], ['State', badge(r.state)], ['Owner', esc(r.owner)], ['Opened by', esc(r.created_by || '—')], ['Opened', time(r.created_at)], ['Resolved', time(r.resolved_at)], ['From alert', r.alert ? '<a href="#/alerts/' + r.alert.id + '">#' + r.alert.id + ' ' + esc(r.alert.asset) + '</a> ' + badge(r.alert.state) : '—']];
    if (table === 'changes') facts = [['Type', esc(r.change_type)], ['State', badge(r.state)], ['Target', esc(r.target)], ['Risk', badge(r.risk === 'High' ? 'High' : r.risk === 'Low' ? 'Low' : 'Medium', r.risk)], ['Maker', esc(r.maker)], ['Checker', esc(r.checker)], ['Scheduled', esc(r.scheduled_for || '—')], ['Decided', r.decided_by ? esc(r.decided_by) + ' · ' + time(r.decided_at) : '—'], ['Implemented', time(r.implemented_at)]];
    var h = '<div><div class="flow" aria-label="Lifecycle">' + Object.keys(flow).map(function (s) {
      return '<span' + (s === r.state ? ' aria-current="step"' : '') + '>' + esc(s) + '</span>';
    }).join('<i>›</i>') + '</div></div>';
    if (table === 'incidents') h += '<div><h3 class="card-title">' + esc(r.title) + '</h3><p class="muted">' + esc(r.description) + '</p></div>';
    if (table === 'alerts') h += '<p>' + esc(r.message) + '</p>';
    if (table === 'changes') h += '<div><p><b>Reason.</b> ' + esc(r.reason) + '</p>' + (r.rollback_plan ? '<p><b>Rollback plan.</b> ' + esc(r.rollback_plan) + '</p>' : '') + '</div>';
    h += '<dl class="facts">' + facts.map(function (f) { return '<dt>' + f[0] + '</dt><dd>' + f[1] + '</dd>'; }).join('') + '</dl>';
    // Actions
    var acts = '';
    r.transitions.forEach(function (to) {
      var perm = table === 'alerts' ? 'alert.update' : table === 'incidents' ? 'incident.update'
        : (to === 'Approved' || to === 'Rejected') ? 'change.decide' : to === 'Cancelled' ? 'change.create' : 'change.progress';
      var ok = can(perm), why = '';
      if (table === 'changes' && (to === 'Approved' || to === 'Rejected')) {
        if (S.actor.toLowerCase() === r.maker.toLowerCase()) { ok = false; why = 'The maker may not decide their own change'; }
        else if (S.actor.toLowerCase() !== r.checker.toLowerCase()) { ok = false; why = 'Only the named checker (' + r.checker + ') may decide'; }
      }
      if (table === 'changes' && to === 'Cancelled' && S.session.role !== 'super_admin' && S.actor.toLowerCase() !== r.maker.toLowerCase()) { ok = false; why = 'Only the maker may withdraw'; }
      var label = { Acknowledged: 'Acknowledge', Resolved: 'Resolve', Open: 'Reopen', Investigating: r.state === 'Open' ? 'Start investigating' : 'Reopen investigation', Mitigated: 'Mark mitigated', Closed: 'Close', Approved: 'Approve', Rejected: 'Reject', Implemented: 'Mark implemented', Verified: 'Verify', RolledBack: 'Record rollback', Cancelled: 'Withdraw' }[to] || to;
      var cls = (to === 'Rejected' || to === 'RolledBack' || to === 'Cancelled') ? 'bk-btn--danger' : (to === 'Approved' || to === 'Verified' || to === 'Resolved') ? 'bk-btn--primary' : '';
      acts += ok ? btn(label, 'transition', ' data-table="' + table + '" data-id="' + r.id + '" data-to="' + to + '"', cls)
        : '<button type="button" class="bk-btn ' + cls + '" disabled title="' + esc(why || 'Your role may not do this') + '">' + esc(label) + '</button>';
    });
    if (table !== 'changes' && r.state !== 'Closed') acts += permBtn(table === 'alerts' ? 'alert.update' : 'incident.update', 'Reassign', 'assign', ' data-table="' + table + '" data-id="' + r.id + '" data-owner="' + esc(r.owner) + '"', 'bk-btn--ghost');
    if (table === 'alerts' && r.state !== 'Resolved') acts += permBtn('incident.create', 'Escalate to incident', 'escalate', ' data-id="' + r.id + '"', 'bk-btn--ghost');
    acts += permBtn('note.create', 'Add note', 'note', ' data-table="' + table + '" data-id="' + r.id + '"', 'bk-btn--ghost');
    h += '<div class="actions">' + acts + '</div>';
    if (table === 'alerts' && r.incidents && r.incidents.length) {
      h += '<div><h3 class="card-title">Escalations</h3><ul class="list">' + r.incidents.map(function (i) { return '<li><a href="#/incidents/' + i.id + '">#' + i.id + ' ' + esc(i.title) + '</a> ' + badge(i.state) + '</li>'; }).join('') + '</ul></div>';
    }
    // Timeline: notes and audit events together, oldest first
    var items = r.notes.map(function (n) { return { t: n.created_at, kind: 'note', who: n.actor, what: n.kind, body: n.note }; })
      .concat(r.audit.map(function (a) { return { t: a.created_at, kind: 'audit', who: a.actor, what: a.action + ' · ' + a.result, body: 'Audit ' + a.event_hash.slice(0, 16) + '… · ' + a.reason }; }))
      .sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : a.kind === 'note' ? -1 : 1; });
    h += '<div><h3 class="card-title">Timeline</h3><ol class="timeline">' + items.map(function (i) {
      return '<li data-kind="' + i.kind + '"><div class="meta">' + time(i.t) + ' · ' + esc(i.who) + ' · ' + esc(i.what) + '</div><div class="body">' + esc(i.body) + '</div></li>';
    }).join('') + '</ol></div>';
    return h;
  }

  /* ── Views ─────────────────────────────────────────────────────────────────────────── */
  var VIEWS = {};

  VIEWS.overview = {
    title: 'Overview', live: true,
    load: function () { return Promise.all([api('GET', '/api/summary'), api('GET', '/api/checklist'), api('GET', '/api/changes?state=Submitted')]); },
    draw: function (d) {
      var s = d[0], cl = d[1], pending = d[2].items;
      var sev = s.openAlertsBySeverity || {};
      var roll = s.healthRollup || {};
      var bad = s.platformHealth.filter(function (p) { return p.state !== 'Healthy'; });
      var mine = pending.filter(function (c) { return c.checker.toLowerCase() === S.actor.toLowerCase(); });
      var daily = cl.items.filter(function (i) { return i.cadence === 'daily'; });
      var passed = daily.filter(function (i) { return i.pass; }).length;
      var h = head('Monitor', 'Portfolio overview', 'Live position across the six governed platforms and their ' + s.endpoints + ' endpoint records. Inventory is not health: a platform is Healthy only when a current observation says so.',
        permBtn('probe.run', 'Probe all platforms', 'probe-all', '', 'bk-btn--primary') + btn('Refresh', 'reload'));
      h += '<div class="bk-kpis">' +
        kpi('Platforms', s.platforms, plural(bad.length, 'needs', 'need') + ' attention', '#/portfolio', bad.length ? 'warn' : 'ok') +
        kpi('Endpoints', s.endpoints, Object.keys(s.endpointsByScope).map(function (k) { return s.endpointsByScope[k] + ' ' + k; }).join(' · '), '#/estate') +
        kpi('Open alerts', s.open.alerts, (sev.Critical || 0) + ' critical · ' + (sev.High || 0) + ' high', '#/alerts', (sev.Critical || sev.High) ? 'bad' : s.open.alerts ? 'warn' : 'ok') +
        kpi('Incidents in progress', s.open.incidents, s.incidents + ' recorded in total', '#/incidents', s.open.incidents ? 'bad' : 'ok') +
        kpi('Changes awaiting decision', s.changesAwaitingDecision, mine.length ? mine.length + ' waiting on you' : s.open.changes + ' open in total', '#/changes', s.changesAwaitingDecision ? 'warn' : 'ok') +
        kpi('Audit events', s.audit, s.auditHead ? 'head ' + esc(s.auditHead.event_hash.slice(0, 10)) + '… · ' + esc(ago(s.auditHead.created_at)) : '', '#/audit') +
        '</div>';
      h += '<div class="section"><h2>Platform health <small>' + (s.monitor.enabled ? 'monitor every ' + s.monitor.intervalSeconds + ' s · last ' + esc(ago(s.monitor.lastRun)) : 'background monitor disabled — probe on demand') + '</small></h2><div class="strip">' +
        s.platformHealth.map(function (p) {
          return '<a href="#/portfolio"><span class="dot" data-s="' + esc(p.state) + '"></span><span><b>' + esc(p.name) + '</b><small>' + esc(p.state) + (p.latencyMs !== null ? ' · ' + p.latencyMs + ' ms' : '') + ' · ' + esc(ago(p.checkedAt)) + '</small></span></a>';
        }).join('') + '</div>' +
        '<p class="hint">Health across all assets: ' + ['Healthy', 'Degraded', 'Stale', 'Unavailable', 'Unknown'].map(function (k) { return (roll[k] || 0) + ' ' + k.toLowerCase(); }).join(' · ') + '. Endpoint health is Unknown until a Vault verification or an ingested observation exists.</p></div>';
      // Needs attention
      var att = [];
      bad.forEach(function (p) { att.push('<li><span class="dot" data-s="' + esc(p.state) + '"></span><span class="what"><b>' + esc(p.name) + '</b> — ' + esc(p.message) + '</span><a class="when" href="#/health">Health ›</a></li>'); });
      if (s.flowOwner && s.flowOwner.state !== 'signed-in') att.push('<li>' + badge('Medium', 'Flows') + '<span class="what">The flow owner is not connected: flow state and run history are not being read.</span><a class="when" href="#/flows">Connect ›</a></li>');
      mine.forEach(function (c) { att.push('<li>' + badge('Submitted') + '<span class="what">Change #' + c.id + ' <b>' + esc(c.target) + '</b> awaits your decision</span><a class="when" href="#/changes/' + c.id + '">Decide ›</a></li>'); });
      cl.items.filter(function (i) { return !i.pass && i.cadence === 'weekly'; }).forEach(function (i) { att.push('<li>' + badge('Medium', 'Weekly') + '<span class="what">' + esc(i.check) + ' — ' + esc(i.detail) + '</span><a class="when" href="#/operations">Operations ›</a></li>'); });
      h += '<div class="section grid-2"><div class="bk-card"><h2 class="card-title">Needs attention</h2>' + (att.length ? '<ul class="list">' + att.join('') + '</ul>' : empty('Nothing needs attention', 'Every platform has a current healthy observation and nothing awaits you.')) + '</div>';
      h += '<div class="bk-card"><h2 class="card-title">Daily checklist</h2><div class="meter" role="meter" aria-valuemin="0" aria-valuemax="' + daily.length + '" aria-valuenow="' + passed + '" aria-label="Daily checks passing"><span data-width="' + Math.round(100 * passed / daily.length) + '"></span></div><p class="hint">' + passed + ' of ' + daily.length + ' daily checks pass, computed live.</p><ul class="list">' +
        daily.map(function (i) { return '<li class="check" data-pass="' + i.pass + '"><span class="check__mark" aria-hidden="true">' + (i.pass ? '✓' : '!') + '</span><span class="what"><b>' + esc(i.check) + '</b><br><span class="faint">' + esc(i.detail) + '</span></span></li>'; }).join('') + '</ul></div></div>';
      h += '<div class="section bk-card"><h2 class="card-title">Recent activity</h2><ul class="list">' + s.recentAudit.map(function (a) {
        return '<li>' + badge(a.result) + '<span class="what"><b>' + esc(a.action) + '</b> · ' + esc(a.target) + ' · <span class="faint">' + esc(a.actor) + '</span></span><span class="when">' + time(a.created_at) + '</span></li>';
      }).join('') + '</ul><p><a href="#/audit">Full audit trail ›</a></p></div>';
      return h;
    },
    after: function () { $$('[data-width]').forEach(function (e) { e.style.width = e.getAttribute('data-width') + '%'; }); }
  };

  /* A page the Centre hosts as a section: framed in a sandbox, so it cannot reach the Centre's session. */
  function sectionView(eyebrow, title, lede, src) {
    return head(eyebrow, title, lede, '<a class="bk-btn bk-btn--ghost" href="' + esc(src) + '" target="_blank" rel="noopener noreferrer">Open in a new tab ↗</a>') +
      '<iframe class="section-frame" src="' + esc(src) + '" title="' + esc(title) + '" referrerpolicy="no-referrer" ' +
      'sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"></iframe>';
  }
  VIEWS.console = {
    title: 'Estate Console', live: false,
    draw: function () {
      return sectionView('Reference', 'Estate Console', 'The estate as the registers describe it: every endpoint and flow, the commissioning and rotation procedures, and the check of a deployed configuration file. A file you load here is read in this page only and never sent to the Centre.', '/sections/estate-console');
    }
  };
  VIEWS.packages = {
    title: 'Flow packages', live: false,
    draw: function () {
      return sectionView('Reference', 'Flow packages', 'Every flow package in the repository, read action by action: trigger, connections, variables, SharePoint operations and responses, as the packages carry them.', '/sections/provisioning/');
    }
  };

  /* Test a flow: a read-only flow, through the Vault, under the operator's own Folio sign-in. */
  var TEST = { email: '', codeSent: false, result: null };
  VIEWS.test = {
    title: 'Test a flow', live: false,
    load: function () { return api('GET', '/api/test'); },
    draw: function (d) {
      var h = head('Operate', 'Test a flow', 'Call one of the read-only Folio flows and read its reply, as the Workspace would call it. It goes through the Vault by alias, so no signed address reaches this page, and it runs under your own Folio sign-in. Only flows that read are offered: nothing here can write a record or send mail. Every test is recorded in the audit trail; the reply is shown here and not stored.');
      if (!d.vaultConfigured) h += '<div class="bk-callout bk-callout--warn"><b>The Vault is not configured for calls.</b> Start the Centre with the Administrator Toolkit, or set <code>FOLIO_VAULT_TOKEN_FILE</code>, and register the flows in the Vault.</div>';
      h += '<section class="bk-card section"><h2 class="card-title">1. Sign in to Folio</h2>';
      if (d.signedIn) {
        h += '<p>Signed in as <b>' + esc(d.email) + '</b> until ' + time(d.expiresAt) + '.</p><div class="actions">' + btn('Sign out', 'test-sign-out', '', 'bk-btn--ghost') + '</div>';
      } else {
        h += '<p>The flows refuse a call without a Folio sign-in. Folio e-mails a code to your work address, exactly as the Workspace does.</p>' +
          '<div class="actions"><label class="bk-field"><span>Work e-mail</span><input class="bk-input" id="test-email" type="email" autocomplete="email" value="' + esc(TEST.email) + '"></label>' +
          permBtn('flow.test', 'E-mail me a code', 'test-code', '', TEST.codeSent ? '' : 'bk-btn--primary') + '</div>' +
          (TEST.codeSent ? '<div class="actions"><label class="bk-field"><span>Code</span><input class="bk-input" id="test-code" inputmode="numeric" autocomplete="one-time-code"></label>' +
            permBtn('flow.test', 'Sign in', 'test-verify', '', 'bk-btn--primary') + '</div>' : '');
      }
      h += '</section><section class="bk-card section"><h2 class="card-title">2. Call a flow</h2><div class="test-form">' +
        '<label class="bk-field"><span>Flow</span><select class="bk-input" id="test-key">' + d.testable.map(function (t) {
          return '<option value="' + esc(t.key) + '">' + esc(t.key) + ' · ' + esc(t.alias) + '</option>'; }).join('') + '</select></label>' +
        '<label class="bk-field"><span>Payload (JSON object)</span><textarea class="bk-input mono" id="test-payload" rows="5">{}</textarea></label>' +
        '<label class="bk-field"><span>Reason</span><input class="bk-input" id="test-reason" maxlength="1000" placeholder="Why this test"></label>' +
        '<div class="actions">' + permBtn('flow.test', 'Call the flow', 'test-run', d.signedIn ? '' : ' disabled', 'bk-btn--primary') + '</div></div>' +
        '<p class="hint">FETCH_ALL returns the whole registry view (several megabytes) and is the flow every Workspace load uses: call it sparingly. One test every 10 seconds.</p></section>';
      if (TEST.result) {
        var r = TEST.result;
        h += '<section class="bk-card section"><h2 class="card-title">Reply from ' + esc(r.key) + '</h2><p>' + badge(r.status >= 200 && r.status < 300 ? 'Healthy' : 'Unavailable', 'HTTP ' + r.status) +
          ' in ' + esc(r.durationMs) + ' ms' + (r.truncated ? ' · <b>cut at 256 KB</b>' : '') + ' · correlation <span class="hash">' + esc(r.correlationId) + '</span></p>' +
          '<pre class="test-reply">' + esc(JSON.stringify(r.reply, null, 2)) + '</pre></section>';
      }
      return h;
    }
  };

  VIEWS.portfolio = {
    title: 'Portfolio', live: true,
    load: function () { return Promise.all([api('GET', '/api/platforms'), api('GET', '/api/health/status')]); },
    draw: function (d) {
      var hs = {}; d[1].assets.forEach(function (a) { if (a.assetType === 'platform') hs[a.assetId] = a; });
      var h = head('Monitor', 'Portfolio', 'The front door to the six governed platforms: where each one runs, what the monitor last saw there, and a way in to each.',
        permBtn('probe.run', 'Probe all', 'probe-all', '', 'bk-btn--primary'));
      h += '<div class="grid-3">' + d[0].items.map(function (p) {
        var a = hs[p.id] || {};
        var url = a.hosted ? '#/console' : a.local === false && a.published ? a.published : 'http://127.0.0.1:' + p.port + (p.probe_path === '/api/health' ? '/' : p.probe_path);
        var where = a.replacedBy ? 'Replaced in this Centre by <a href="' + esc(a.replacedBy[0]) + '">' + esc(a.replacedBy[1]) + '</a>' : a.hosted ? 'Hosted by this Centre, under <a href="#/console">Estate Console</a>' : a.local === false && a.published ? 'Published at <a href="' + esc(a.published) + '" target="_blank" rel="noopener noreferrer">' + esc(a.published) + '</a>' : '<code>127.0.0.1:' + esc(p.port) + '</code>';
        return '<article class="bk-card pcard" aria-labelledby="p-' + esc(p.id) + '"><div class="pcard__top"><div><h2 class="pcard__name" id="p-' + esc(p.id) + '">' + esc(p.name) + '</h2><div class="pcard__type">' + esc(p.type) + '</div></div>' + state(a.state || 'Unknown') + '</div>' +
          spark(a.series) +
          '<dl class="facts"><dt>Inventory</dt><dd>' + badge(p.status) + '</dd><dt>Entry point</dt><dd><code>' + esc(p.entry_point) + '</code></dd><dt>Runs at</dt><dd>' + where + '</dd>' +
          '<dt>Start</dt><dd><code>npm run start:' + esc(p.launcher_id) + '</code></dd><dt>Owner</dt><dd>' + esc(p.owner) + '</dd>' +
          '<dt>Last seen</dt><dd>' + (a.checkedAt ? esc(ago(a.checkedAt)) + ' · ' + esc(a.message) : 'No observation yet') + '</dd>' +
          '<dt>24 h</dt><dd>' + (a.uptime24h === null || a.uptime24h === undefined ? '—' : esc(a.uptime24h) + '% healthy · p50 ' + esc(a.p50Ms) + ' ms · p95 ' + esc(a.p95Ms) + ' ms') + '</dd></dl>' +
          '<div class="pcard__actions">' + permBtn('probe.run', 'Probe now', 'probe', ' data-id="' + esc(p.id) + '"', 'bk-btn--sm') +
          (a.replacedBy ? '<a class="bk-btn bk-btn--sm bk-btn--ghost" href="' + esc(a.replacedBy[0]) + '">Open ' + esc(a.replacedBy[1]) + '</a>' : a.hosted ? '<a class="bk-btn bk-btn--sm bk-btn--ghost" href="#/console">Open</a>' : '<a class="bk-btn bk-btn--sm bk-btn--ghost" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open ↗</a>') +
          '<a class="bk-btn bk-btn--sm bk-btn--ghost" href="#/estate" data-action="estate-for" data-id="' + esc(p.id) + '">Endpoints</a>' +
          permBtn('inventory.update', 'Set status', 'platform-status', ' data-id="' + esc(p.id) + '" data-status="' + esc(p.status) + '" data-owner="' + esc(p.owner) + '"', 'bk-btn--sm bk-btn--ghost') +
          permBtn('alert.create', 'Raise alert', 'new-alert', ' data-asset="platform:' + esc(p.id) + '" data-owner="' + esc(p.owner) + '"', 'bk-btn--sm bk-btn--ghost') + '</div></article>';
      }).join('') + '</div>';
      h += '<p class="hint section">Status Maintenance or Retired suppresses monitor alerts for that platform. Probes call the loopback port only; a platform served by <code>npm run start:all</code> identifies itself, so a port held by the wrong platform reads Degraded.</p>';
      return h;
    }
  };

  VIEWS.health = {
    title: 'Health', live: true,
    load: function () { return Promise.all([api('GET', '/api/health/status'), api('GET', '/api/health?limit=200')]); },
    draw: function (d, u) {
      var st = d[0], log = d[1];
      var assets = applyFilters('health', st.assets, ['assetId', 'name', 'message']);
      var h = head('Monitor', 'Health', 'Latest effective state per asset. No observation reads <b>Unknown</b>; an observation older than ' + Math.round(st.staleAfterSeconds / 60) + ' minutes reads <b>Stale</b>. Neither is ever shown as Healthy.',
        permBtn('probe.run', 'Probe all platforms', 'probe-all', '', 'bk-btn--primary') + permBtn('health.ingest', 'Record observation', 'ingest'));
      h += '<div class="toolbar">' + chips('health', 'state', ['Healthy', 'Degraded', 'Stale', 'Unavailable', 'Unknown'], countBy(st.assets, 'state')) + '</div>';
      h += '<div class="toolbar">' + select('health', 'assetType', 'Asset type', ['platform', 'endpoint']) + searchBox('health', 'Filter assets…') + '<span class="count">' + plural(assets.length, 'asset') + '</span></div>';
      h += table('health', [
        { k: 'state', label: 'State', v: function (a) { return state(a.state); } },
        { k: 'name', label: 'Asset', v: function (a) { return '<b>' + esc(a.name) + '</b><br><span class="faint mono">' + esc(a.assetType + ':' + a.assetId) + '</span>'; } },
        { k: 'checkedAt', label: 'Last observation', v: function (a) { return a.checkedAt ? time(a.checkedAt) + '<br><span class="faint">' + esc(a.source) + '</span>' : '—'; } },
        { k: 'latencyMs', label: 'Latency', cls: 'num', v: function (a) { return a.latencyMs === null ? '—' : esc(a.latencyMs) + ' ms'; } },
        { k: 'uptime24h', label: '24 h healthy', cls: 'num', v: function (a) { return a.uptime24h === null ? '—' : esc(a.uptime24h) + '%'; } },
        { k: 'series', label: 'Trend', nosort: true, v: function (a) { return spark(a.series); } },
        { k: 'message', label: 'Detail', cls: 'wrap', v: function (a) { return esc(a.message); } }
      ], assets, { tall: true });
      h += '<div class="section"><h2>Observation log <small>latest ' + log.items.length + ' of ' + log.total + '</small></h2>' + table('healthlog', [
        { k: 'checked_at', label: 'Checked', v: function (r) { return time(r.checked_at); } },
        { k: 'asset_id', label: 'Asset', v: function (r) { return '<span class="mono">' + esc(r.asset_type + ':' + r.asset_id) + '</span>'; } },
        { k: 'state', label: 'State', v: function (r) { return state(r.state); } },
        { k: 'latency_ms', label: 'Latency', cls: 'num', v: function (r) { return r.latency_ms === null ? '—' : esc(r.latency_ms) + ' ms'; } },
        { k: 'source', label: 'Source' },
        { k: 'message', label: 'Message', cls: 'wrap' }
      ], log.items, { tall: true, empty: empty('No observations yet', 'Nothing has been probed or ingested. Health is <b>Unknown</b>, not healthy. Select <b>Probe all platforms</b> to take the first reading.') }) + '</div>';
      return h;
    }
  };

  function recordsView(table, title, lede, cols, text, newAction, newPerm, newLabel, filterKeys) {
    return {
      title: title, live: true,
      load: function () { return api('GET', '/api/' + table + '?limit=500'); },
      open: function (id) { openRecord(table, id); },
      draw: function (d) {
        var rows = applyFilters(table, d.items, text);
        var h = head('Operate', title, lede, permBtn(newPerm, newLabel, newAction, '', 'bk-btn--primary') + (can('evidence.export') ? '<a class="bk-btn" href="#" data-action="csv" data-table="' + table + '">Export CSV</a>' : ''));
        h += '<div class="toolbar">' + chips(table, 'state', Object.keys(S.session.enums.flows[table]), countBy(d.items, 'state')) + '</div>';
        h += '<div class="toolbar">' + filterKeys.map(function (f) { return select(table, f[0], f[1], f[2]); }).join('') + searchBox(table, 'Search ' + title.toLowerCase() + '…') + '<span class="count">' + rows.length + ' of ' + d.total + '</span></div>';
        h += table === 'alerts' || table === 'incidents' || table === 'changes' ? tableFor(table, cols, rows, d.total) : '';
        return h;
      }
    };
  }
  function tableFor(t, cols, rows, total) {
    return table(t, cols, rows, { tall: true, open: function (r) { return t + '/' + r.id; },
      empty: total ? empty('No matching records', 'Clear a filter to see more.') : empty('No records yet', 'An empty register is not evidence that everything is healthy — check Health for current observations.') });
  }

  VIEWS.alerts = recordsView('alerts', 'Alerts', 'Operational signals raised by people or by the health monitor. The monitor raises one alert when a platform goes bad and resolves it when the platform recovers.', [
    { k: 'id', label: '#', cls: 'num' },
    { k: 'severity', label: 'Severity', v: function (r) { return badge(r.severity); }, sort: function (r) { return ['Critical', 'High', 'Medium', 'Low', 'Info'].indexOf(r.severity); } },
    { k: 'state', label: 'State', v: function (r) { return badge(r.state); } },
    { k: 'asset', label: 'Asset', v: function (r) { return '<b>' + esc(r.asset) + '</b><br><span class="faint">' + esc(r.message.slice(0, 140)) + '</span>'; }, cls: 'wrap' },
    { k: 'owner', label: 'Owner' },
    { k: 'source', label: 'Source' },
    { k: 'updated_at', label: 'Updated', v: function (r) { return time(r.updated_at); } }
  ], ['asset', 'message', 'owner', 'id'], 'new-alert', 'alert.create', 'New alert', [['severity', 'Severity', ['Critical', 'High', 'Medium', 'Low', 'Info']], ['source', 'Source', ['manual', 'monitor']]]);

  VIEWS.incidents = recordsView('incidents', 'Incidents', 'Coordinated investigations. Resolving and closing an incident each require a note stating what was done.', [
    { k: 'id', label: '#', cls: 'num' },
    { k: 'severity', label: 'Severity', v: function (r) { return badge(r.severity); }, sort: function (r) { return ['Critical', 'High', 'Medium', 'Low', 'Info'].indexOf(r.severity); } },
    { k: 'state', label: 'State', v: function (r) { return badge(r.state); } },
    { k: 'title', label: 'Title', cls: 'wrap', v: function (r) { return '<b>' + esc(r.title) + '</b>' + (r.alert_id ? '<br><span class="faint">from alert #' + esc(r.alert_id) + '</span>' : ''); } },
    { k: 'owner', label: 'Owner' },
    { k: 'created_at', label: 'Opened', v: function (r) { return time(r.created_at); } },
    { k: 'updated_at', label: 'Updated', v: function (r) { return time(r.updated_at); } }
  ], ['title', 'description', 'owner', 'id'], 'new-incident', 'incident.create', 'New incident', [['severity', 'Severity', ['Critical', 'High', 'Medium', 'Low', 'Info']]]);

  VIEWS.changes = recordsView('changes', 'Changes', 'Controlled changes under maker–checker: the checker must be a different accountable identity, and only the named checker may approve or reject.', [
    { k: 'id', label: '#', cls: 'num' },
    { k: 'state', label: 'State', v: function (r) { return badge(r.state); } },
    { k: 'change_type', label: 'Type' },
    { k: 'target', label: 'Target', cls: 'wrap', v: function (r) { return '<b>' + esc(r.target) + '</b><br><span class="faint">' + esc(r.reason.slice(0, 140)) + '</span>'; } },
    { k: 'risk', label: 'Risk', v: function (r) { return badge(r.risk === 'High' ? 'High' : r.risk === 'Low' ? 'Low' : 'Medium', r.risk); } },
    { k: 'maker', label: 'Maker' },
    { k: 'checker', label: 'Checker', v: function (r) { return esc(r.checker) + (r.state === 'Submitted' && r.checker.toLowerCase() === S.actor.toLowerCase() ? ' ' + badge('Submitted', 'you') : ''); } },
    { k: 'updated_at', label: 'Updated', v: function (r) { return time(r.updated_at); } }
  ], ['change_type', 'target', 'reason', 'maker', 'checker', 'id'], 'new-change', 'change.create', 'Submit change', [['risk', 'Risk', ['Low', 'Medium', 'High']]]);

  /* The configuration check (estate-check.js): a loaded file lives in this variable only, for this tab, never in storage. */
  var CHECK = { urls: null, name: '', baseline: null, baseName: '' };
  var CHECK_TONE = { ok: 'Healthy', unconfigured: 'Unknown', 'wrong-flow': 'Unavailable', 'no-signature': 'Unavailable', 'bad-signature': 'Unavailable',
    'not-https': 'Unavailable', placeholder: 'Degraded' };
  function checkPanel() {
    var ec = window.FolioEstateCheck;
    var h = '<section class="bk-card section config-check" aria-labelledby="check-title"><h2 class="card-title" id="check-title">Check a deployed configuration</h2>' +
      '<p>Load a deployed <code>config.local.js</code> (the Workspace\'s or the Portal\'s) or a values file. The check is the Estate Console\'s own: each key configured, signed, and calling the workflow the register names. ' +
      'The file is read in this page and held in its memory only: it is never sent to the Centre, saved, or shown with its signatures.</p>' +
      '<div class="actions">' + btn(CHECK.urls ? 'Load another file' : 'Load a file', 'check-load', '', 'bk-btn--primary') +
      (CHECK.urls ? btn('Compare with another file', 'check-baseline', '', '') + btn('Export redacted report', 'check-report', '', 'bk-btn--ghost') + btn('Clear', 'check-clear', '', 'bk-btn--ghost') : '') +
      '<input type="file" id="check-file" data-check-file="current" hidden accept=".js,.txt,.env,text/plain,text/javascript">' +
      '<input type="file" id="check-file-baseline" data-check-file="baseline" hidden accept=".js,.txt,.env,text/plain,text/javascript"></div>';
    if (!ec) return h + '<p class="hint">The check is loading.</p></section>';
    if (!CHECK.urls) return h + '</section>';
    var r = ec.check(CHECK.urls), sm = r.summary;
    h += '<p class="hint">Checked <b>' + esc(CHECK.name) + '</b>.</p><div class="bk-kpis">' +
      kpi('Keys configured', sm.configured + ' / ' + sm.keys, sm.internal + ' Workspace · ' + sm.portal + ' Portal', '#/estate', sm.configured < sm.keys ? 'warn' : 'ok') +
      kpi('Signed', sm.signed, 'a 43-character signature', '#/estate', sm.signed < sm.configured ? 'bad' : 'ok') +
      kpi('Healthy', sm.healthy, 'configured, signed, right workflow', '#/estate', sm.healthy < sm.configured ? 'bad' : 'ok') +
      kpi('Findings', sm.errors + sm.warnings, sm.errors + ' errors · ' + sm.warnings + ' warnings', '#/estate', sm.errors ? 'bad' : sm.warnings ? 'warn' : 'ok') + '</div>';
    if (r.findings.length) h += '<ul class="list section">' + r.findings.map(function (f) {
      return '<li><span>' + badge(f.severity === 'error' ? 'Unavailable' : f.severity === 'warn' ? 'Degraded' : 'Info', f.severity) + '</span><span class="what">' + esc(f.title) + '</span></li>';
    }).join('') + '</ul>';
    h += table('check', [
      { k: 'key', label: 'Key', v: function (k) { return '<b class="mono">' + esc(k.key) + '</b><br><span class="faint">' + esc(k.surface) + '</span>'; } },
      { k: 'status', label: 'Check', v: function (k) { return badge(CHECK_TONE[k.status] || 'Degraded', k.status === 'ok' ? 'healthy' : k.status); } },
      { k: 'target', label: 'Address (redacted)', cls: 'wrap', v: function (k) { return k.configured ? '<code class="tiny">' + esc(k.target) + '</code>' : '<span class="faint">not configured</span>'; } },
      { k: 'actualWorkflow', label: 'Workflow', v: function (k) { return k.actualWorkflow ? '<span class="hash">' + esc(k.actualWorkflow.slice(0, 8)) + '…</span>' + (k.expected && k.expected.workflowId && k.actualWorkflow !== k.expected.workflowId ? ' ' + badge('Unavailable', 'not the register\'s') : '') : '—'; } },
      { k: 'signatureLength', label: 'Signature', cls: 'num', v: function (k) { return k.signatureLength === null ? '—' : esc(k.signatureLength) + ' chars'; } },
      { k: 'problems', label: 'What to do', cls: 'wrap', v: function (k) { return k.problems.length ? esc(k.problems.map(function (p) { return p.text; }).join(' ')) : '<span class="faint">nothing</span>'; } }
    ], r.keys, {});
    if (CHECK.baseline) {
      var cmp = ec.compare(CHECK.urls, CHECK.baseline);
      h += '<h3 class="card-title section">Compared with ' + esc(CHECK.baseName) + '</h3>' + table('check-compare', [
        { k: 'key', label: 'Key', v: function (c) { return '<b class="mono">' + esc(c.key) + '</b>'; } },
        { k: 'verdict', label: 'Difference', v: function (c) { return badge(c.verdict === 'different workflow' ? 'Unavailable' : c.verdict === 'identical' ? 'Healthy' : c.verdict === 'both empty' ? 'Info' : 'Degraded', c.verdict); } },
        { k: 'workflowCurrent', label: 'Workflow now', v: function (c) { return c.workflowCurrent ? '<span class="hash">' + esc(c.workflowCurrent.slice(0, 8)) + '…</span>' : '—'; } },
        { k: 'workflowBaseline', label: 'Workflow before', v: function (c) { return c.workflowBaseline ? '<span class="hash">' + esc(c.workflowBaseline.slice(0, 8)) + '…</span>' : '—'; } },
        { k: 'sigCurrent', label: 'Signature length', cls: 'num', v: function (c) { return (c.sigCurrent === null ? '—' : c.sigCurrent) + ' vs ' + (c.sigBaseline === null ? '—' : c.sigBaseline); } }
      ], cmp, {});
    }
    return h + '</section>';
  }
  window.addEventListener('folio-estate-check-ready', function () { if (S.view === 'estate' && S.cache.estate) draw(); });

  VIEWS.estate = {
    title: 'Flow & Endpoint Estate', live: false,
    load: function () { return Promise.all([api('GET', '/api/endpoints'), api('GET', '/api/health/status')]); },
    draw: function (d) {
      var hs = {}; d[1].assets.forEach(function (a) { if (a.assetType === 'endpoint') hs[a.assetId] = a; });
      var all = d[0].items.map(function (e) { var a = hs[e.scope + ':' + e.endpoint_key]; e.health = a ? a.state : 'Unknown'; return e; });
      var rows = applyFilters('estate', all, ['endpoint_key', 'flow_name', 'workflow_id', 'route', 'vault_alias']);
      var noWf = all.filter(function (e) { return !e.workflow_id && e.state !== 'Retired'; });
      var noFlow = all.filter(function (e) { return !e.flow_id && e.state !== 'Retired'; });
      var drift = all.filter(function (e) { return e.identity_verified === 0; });
      var notStarted = all.filter(function (e) { return e.flow_id && e.tenant_state && e.tenant_state !== 'Started'; });
      var shared = all.filter(function (e) { return e.shares_flow_with; });
      var disagree = all.filter(function (e) { return e.register_method && e.register_method !== e.method; });
      var h = head('Govern', 'Flow & endpoint estate', 'Every endpoint the portfolio calls, provisioned from <code>docs/folio-Master-Flows-and-Endpoints/registers/endpoint-workflow-ids.json</code> and <code>mailer/flows/flows.catalogue.json</code>. <b>Registered</b> is inventory, not health. Signed trigger URLs are never held here.',
        permBtn('inventory.update', 'Reconcile with registers', 'reconcile') + '<a class="bk-btn" href="#" data-action="estate-csv">Export view (CSV)</a>');
      h += '<div class="grid-3">' +
        '<div class="bk-callout' + (noFlow.length || drift.length ? ' bk-callout--warn' : ' bk-callout--ok') + '"><b>' + plural(all.length - noFlow.length, 'endpoint') + ' tied to one tenant flow.</b> ' +
          (noFlow.length ? plural(noFlow.length, 'key') + ' have several candidate flows (' + esc(noFlow.map(function (e) { return e.endpoint_key; }).join(', ')) + '); Flows › Sync settles them from each flow\'s live trigger. ' : '') +
          (drift.length ? '<b>' + plural(drift.length, 'identity') + ' drifted from the register:</b> ' + esc(drift.map(function (e) { return e.endpoint_key; }).join(', ')) + '. ' : '') +
          (noWf.length ? plural(noWf.length, 'trigger workflow ID') + ' not yet read (' + esc(noWf.map(function (e) { return e.endpoint_key; }).join(', ')) + '); they are read live from the flow owner\'s trigger.' : '') + '</div>' +
        '<div class="bk-callout' + (notStarted.length ? ' bk-callout--bad' : ' bk-callout--ok') + '"><b>' + (notStarted.length ? plural(notStarted.length, 'flow') + ' not Started.' : 'Every tied flow is Started.') + '</b> ' +
          (notStarted.length ? esc(notStarted.map(function (e) { return e.endpoint_key + ' (' + e.tenant_state + ')'; }).join(', ')) + '.' : 'As the flow owner last listed them — see Flows for the live state and run history.') + '</div>' +
        '<div class="bk-callout"><b>' + plural(shared.length, 'key') + ' share a flow.</b> One workflow answers several keys; retiring it affects them all.</div>' +
        '<div class="bk-callout' + (disagree.length ? ' bk-callout--warn' : '') + '"><b>' + plural(disagree.length, 'method disagreement') + '.</b> ' + (disagree.length ? esc(disagree.map(function (e) { return e.endpoint_key + ' sends ' + e.method + ', register says ' + e.register_method; }).join('; ')) + '.' : 'The register and the callers agree.') + '</div></div>';
      h += checkPanel();
      h += '<div class="toolbar section">' + chips('estate', 'scope', ['internal', 'portal', 'mailer'], countBy(all, 'scope')) + '</div>';
      h += '<div class="toolbar">' + select('estate', 'state', 'State', S.session.enums.endpointStates) + select('estate', 'method', 'Method', ['POST', 'PUT', 'GET']) + select('estate', 'health', 'Health', ['Healthy', 'Degraded', 'Stale', 'Unavailable', 'Unknown']) +
        searchBox('estate', 'Key, flow, workflow ID, route or alias…') + '<span class="count">' + rows.length + ' of ' + all.length + '</span></div>';
      S.estateRows = rows;
      h += table('estate', [
        { k: 'scope', label: 'Scope', v: function (e) { return badge('Info', e.scope); } },
        { k: 'endpoint_key', label: 'Key', v: function (e) { return '<b class="mono">' + esc(e.endpoint_key) + '</b>'; } },
        { k: 'flow_name', label: 'Flow', cls: 'wrap', v: function (e) { return esc(e.flow_name) + (e.shares_flow_with ? '<br><span class="faint">shared with ' + esc(e.shares_flow_with.replace(/,/g, ', ')) + '</span>' : ''); } },
        { k: 'flow_id', label: 'Tenant flow', v: function (e) { return e.flow_id ? '<span class="hash">' + esc(e.flow_id.slice(0, 8)) + '…</span> ' + (e.identity_verified === 1 ? badge('Healthy', 'verified') : e.identity_verified === 0 ? badge('Unavailable', 'drift') : '') : badge('Degraded', e.flow_candidates ? 'ambiguous' : 'unknown'); } },
        { k: 'tenant_state', label: 'Deployed', v: function (e) { return e.tenant_state ? badge(e.tenant_state === 'Started' ? 'Active' : 'Suspended', e.tenant_state) + '<br><span class="faint">' + esc(e.tenant_observed_at || '') + '</span>' : '—'; } },
        { k: 'method', label: 'Method' },
        { k: 'state', label: 'State', v: function (e) { return badge(e.state); } },
        { k: 'health', label: 'Health', v: function (e) { return state(e.health); } }
      ], rows, { tall: true, open: function (e) { return 'estate/' + e.id; } });
      return h;
    },
    open: function (id) { openEndpoint(Number(id)); }
  };
  function openEndpoint(id) {
    var e = (S.cache.estate ? S.cache.estate[0].items : []).filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    var d = $('#sheet');
    $('#sheet-title').textContent = e.scope + ' · ' + e.endpoint_key;
    var f = [['Flow', esc(e.flow_name)],
      ['Tenant flow ID', e.flow_id ? '<span class="hash">' + esc(e.flow_id) + '</span> <span class="faint">(' + esc(e.flow_id_source || '') + ')</span>' : 'Candidates: ' + esc((e.flow_candidates || 'none').replace(/,/g, ', '))],
      ['Identity', e.identity_verified === 1 ? badge('Healthy', 'verified live') : e.identity_verified === 0 ? badge('Unavailable', 'drifted from the register') : 'not yet verified live'],
      ['Deployed state', e.tenant_state ? badge(e.tenant_state === 'Started' ? 'Active' : 'Suspended', e.tenant_state) + ' <span class="faint">as of ' + esc(e.tenant_observed_at || '—') + '</span>' : '—'],
      ['Trigger workflow ID', e.workflow_id ? '<span class="hash">' + esc(e.workflow_id) + '</span>' : 'Read live when the flow owner syncs'],
      ['Method', esc(e.method) + (e.register_method && e.register_method !== e.method ? ' <span class="faint">(register annotates ' + esc(e.register_method) + ')</span>' : '')],
      ['Route', e.route ? '<code>' + esc(e.route) + '</code>' : '—'], ['Routing segment', esc(e.routing_segment || '—')], ['Platform', esc(e.platform_id)],
      ['Inventory state', badge(e.state)], ['Health', state(e.health)], ['Shares flow with', esc(e.shares_flow_with || '—')], ['Operations', esc(e.operations || '—')],
      ['Vault alias', '<code>' + esc(e.vault_alias || '—') + '</code>'], ['Updated', time(e.updated_at)]];
    $('#sheet-body').innerHTML = '<dl class="facts">' + f.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('') + '</dl>' +
      '<div class="actions">' + permBtn('inventory.update', 'Change state', 'endpoint-state', ' data-id="' + e.id + '" data-state="' + esc(e.state) + '" data-alias="' + esc(e.vault_alias || '') + '"') +
      permBtn('vault.verify', 'Verify through Vault', 'vault-verify', ' data-alias="' + esc(e.vault_alias || '') + '"', 'bk-btn--ghost') +
      permBtn('health.ingest', 'Record observation', 'ingest', ' data-asset="endpoint:' + esc(e.scope + ':' + e.endpoint_key) + '"', 'bk-btn--ghost') +
      (e.flow_id ? '<a class="bk-btn bk-btn--ghost" href="#/flows/' + esc(e.flow_id) + '">Runs &amp; actions</a>' : '') +
      permBtn('change.create', 'Propose change', 'new-change', ' data-target="' + esc(e.scope + ':' + e.endpoint_key + ' (' + e.flow_name + ')') + '"', 'bk-btn--ghost') + '</div>' +
      '<p class="hint">The trigger URL for this endpoint carries its signature and is a credential. It is pasted at commissioning time into the platform configuration or held by Folio Vault as an alias — never here.</p>';
    if (!d.open) d.showModal();
    history.replaceState(null, '', '#/estate/' + id);
    S.param = String(id);
  }

  VIEWS.flows = {
    title: 'Flows', live: true,
    load: function () { return refreshSummary().then(function () { return api('GET', '/api/flows'); }); },
    open: function (id) { openFlow(id); },
    draw: function (d) {
      var o = d.owner, fl = d.flows;
      var failed = fl.filter(function (f) { return f.lastRun && f.lastRun.status === 'Failed'; });
      var stopped = fl.filter(function (f) { return f.stateMismatch; });
      var cat = d.catalogue || { flows: 0, withoutEndpoint: 0 };
      var runs = fl.reduce(function (a, f) { return a + f.runs24h; }, 0), ok = fl.reduce(function (a, f) { return a + f.succeeded24h; }, 0);
      var h = head('Monitor', 'Flows', 'Every Folio flow, seen as its owner sees it: the flows behind every governed endpoint, and the scheduled, event-driven and governance flows the flow catalogue names. Live state against the state each should be in, run history, failures, and the owner\'s own actions — turn on or off, resubmit, cancel. Signed in as the flow owner through Microsoft\'s public sign-in apps; no tenant administrator and no admin API is involved.',
        (o.state === 'signed-in' ? permBtn('tenant.sync', 'Sync now', 'flow-sync', '', 'bk-btn--primary') : ''));
      h += '<div class="bk-card owner">' + ownerPanel(o) + '</div>';
      h += '<div class="section bk-kpis">' +
        kpi('Folio flows', fl.length, cat.withoutEndpoint + ' without an endpoint · ' + plural(d.unresolved.length, 'key') + ' awaiting identity', '#/flows', d.unresolved.length ? 'warn' : 'ok') +
        kpi('In expected state', fl.length - stopped.length, stopped.length ? stopped.length + ' not as expected' : 'all as expected', '#/flows', stopped.length ? 'bad' : 'ok') +
        kpi('Newest run failed', failed.length, failed.length ? esc(failed.map(function (f) { return f.name; }).slice(0, 2).join(', ')) : 'none', '#/flows', failed.length ? 'bad' : 'ok') +
        kpi('Runs in 24 h', runs, runs ? Math.round(100 * ok / runs) + '% succeeded' : 'no runs read yet', '#/flows', runs && ok < runs ? 'warn' : '') + '</div>';
      if (d.unresolved.length) h += '<div class="section bk-callout bk-callout--warn"><b>' + plural(d.unresolved.length, 'endpoint') + ' with several candidate flows.</b> ' +
        esc(d.unresolved.map(function (u) { return u.endpoint + ' (' + u.candidates.length + ')'; }).join(', ')) + '. A sync compares each candidate\'s live trigger workflow with the register and keeps the one that matches.</div>';
      h += '<div class="section toolbar">' + chips('flows', 'health', ['Failed', 'Succeeded', 'No runs']) + searchBox('flows', 'Flow, endpoint or flow ID…') + '</div>';
      var rows = fl.map(function (f) { f.health = f.lastRun ? (f.lastRun.status === 'Failed' ? 'Failed' : f.lastRun.status === 'Succeeded' ? 'Succeeded' : f.lastRun.status) : 'No runs'; f.eps = f.endpoints.join(' ') + ' ' + (f.group || ''); return f; });
      rows = applyFilters('flows', rows, ['name', 'eps', 'flowId']);
      h += table('flows', [
        { k: 'name', label: 'Flow', cls: 'wrap', v: function (f) { return '<b>' + esc(f.name) + '</b><br><span class="faint">' + esc(f.endpoints.length ? f.endpoints.join(', ') : (f.group || '') + (f.trigger ? ' · ' + f.trigger : '')) + '</span>'; } },
        { k: 'state', label: 'State', v: function (f) {
          if (!f.state) return '—';
          if (f.stateMismatch) return badge('Unavailable', f.state + ', expected ' + f.expectedState);
          return f.state === 'Started' ? badge('Active', f.state) : badge('Info', f.state + ' by design');
        } },
        { k: 'verified', label: 'Identity', v: function (f) { return f.verified === 1 ? badge('Healthy', 'verified') : f.verified === 0 ? badge('Unavailable', 'drift') : badge('Info', f.identity || 'recorded'); } },
        { k: 'health', label: 'Newest run', v: function (f) { return f.lastRun ? badge(f.lastRun.status === 'Succeeded' ? 'Healthy' : f.lastRun.status === 'Failed' ? 'Unavailable' : 'Degraded', f.lastRun.status) + '<br><span class="faint">' + esc(ago(f.lastRun.start_time)) + '</span>' : '<span class="faint">none read</span>'; } },
        { k: 'runs24h', label: '24 h', cls: 'num', v: function (f) { return f.runs24h ? f.succeeded24h + ' / ' + f.runs24h : '—'; } },
        { k: 'avgMs24h', label: 'Avg', cls: 'num', v: function (f) { return f.avgMs24h === null ? '—' : esc(f.avgMs24h) + ' ms'; } }
      ], rows, { tall: true, open: function (f) { return 'flows/' + f.flowId; } });
      return h;
    },
    after: function (d) { if (d && d.owner.state === 'pending') pollOwner(); }
  };
  function ownerPanel(o) {
    if (o.state === 'signed-in') {
      var r = o.lastSyncResult;
      return '<h2 class="card-title">Connected as flow owner</h2><dl class="facts"><dt>Account</dt><dd><b>' + esc(o.user.email || o.user.name) + '</b></dd>' +
        '<dt>Sign-in app</dt><dd>' + esc(o.client) + '</dd><dt>Environment</dt><dd><code>' + esc(o.environment) + '</code></dd>' +
        '<dt>Since</dt><dd>' + time(o.signedInAt) + '</dd><dt>Last sync</dt><dd>' + (o.lastSync ? time(o.lastSync) : 'running…') + '</dd>' +
        (r ? '<dt>Result</dt><dd>' + (r.ok ? esc(r.flowsListed + ' flows listed · ' + r.identitiesResolved + ' identities resolved · ' + r.identitiesVerified + ' verified · ' + r.runsRead + ' runs read') +
          (r.identityDrift && r.identityDrift.length ? ' · <b>drift: ' + esc(r.identityDrift.join(', ')) + '</b>' : '') +
          (r.governedMissing && r.governedMissing.length ? ' · <b>not visible to this account: ' + r.governedMissing.length + '</b>' : '') : '<span class="muted">' + esc(r.error) + '</span>') + '</dd>' : '') +
        '</dl><div class="actions">' + permBtn('tenant.connect', 'Sign out', 'owner-sign-out', '', 'bk-btn--ghost') + '</div>' +
        '<p class="hint">The session lives in the Centre\'s memory only — never on disk, in the database or in a log. A restart needs a new sign-in. While connected, run history syncs every ' + esc(S.session.system.runHistoryIntervalSeconds || 900) + ' s.</p>';
    }
    if (o.state === 'pending' && o.device) {
      return '<h2 class="card-title">Sign in as the flow owner</h2><p>Open <a href="' + esc(o.device.verificationUri) + '" target="_blank" rel="noopener noreferrer">' + esc(o.device.verificationUri) +
        '</a> on any device and enter</p><p class="devcode" aria-live="polite"><span id="devcode">' + esc(o.device.userCode) + '</span> <button type="button" class="bk-btn bk-btn--sm" data-bk-copy-target="#devcode">Copy</button></p>' +
        '<p class="hint">Sign in with the account that owns the flows. Microsoft names the app "' + esc(o.device.app) + '". The code expires ' + esc(fmt(o.device.expiresAt)) + '. This page updates by itself.</p>' +
        '<div class="actions">' + permBtn('tenant.connect', 'Cancel', 'owner-sign-out', '', 'bk-btn--ghost') + '</div>';
    }
    return '<h2 class="card-title">Not connected</h2><p>Connect as the account that owns the flows to read their live state and run history, and to turn them on or off, resubmit or cancel runs. It uses a device code and Microsoft\'s public sign-in apps: no app registration, no admin consent, no secret, and only the flow owner\'s own user-scoped paths.</p>' +
      (o.state === 'error' || o.state === 'expired' ? '<div class="bk-callout bk-callout--bad">' + esc(o.error) + '</div>' : '') +
      '<div class="actions">' + permBtn('tenant.connect', 'Connect as flow owner', 'owner-sign-in', '', 'bk-btn--primary') + '</div>';
  }
  function pollOwner() {
    clearTimeout(S.ownerTimer);
    S.ownerTimer = setTimeout(function () {
      if (S.view !== 'flows' || !S.token) return;
      api('GET', '/api/tenant').then(function (o) {
        if (o.state === 'pending') return pollOwner();
        if (o.state === 'signed-in') toast('Connected as ' + (o.user.email || 'the flow owner') + '. Reading flows and runs…', 'ok');
        render(true);
        if (o.state === 'signed-in') setTimeout(function () { if (S.view === 'flows') render(true); }, 4000);
      }, function () { pollOwner(); });
    }, 3000);
  }
  function openFlow(id) {
    var f = (S.cache.flows ? S.cache.flows.flows : []).filter(function (x) { return x.flowId === id; })[0];
    var d = $('#sheet');
    $('#sheet-title').textContent = f ? f.name : 'Flow ' + id;
    $('#sheet-body').innerHTML = '<div class="loading"><div class="bk-skeleton"></div><div class="bk-skeleton tall"></div></div>';
    if (!d.open) d.showModal();
    if (location.hash !== '#/flows/' + id) history.replaceState(null, '', '#/flows/' + id);
    S.param = id;
    var signed = S.cache.flows && S.cache.flows.owner.state === 'signed-in';
    return api('GET', '/api/flows/' + id + '/runs').then(function (r) {
      var h = '<dl class="facts"><dt>Tenant flow ID</dt><dd><span class="hash">' + esc(id) + '</span></dd>' + (f ? '<dt>State</dt><dd>' + (f.state ? (f.stateMismatch ? badge('Unavailable', f.state + ', expected ' + f.expectedState) : badge(f.state === 'Started' ? 'Active' : 'Info', f.state)) : '—') + '</dd>' +
        (f.group ? '<dt>Group</dt><dd>' + esc(f.group) + '</dd><dt>Starts on</dt><dd>' + esc(f.trigger || '—') + '</dd>' : '') +
        (f.endpoints.length ? '<dt>Endpoints</dt><dd>' + esc(f.endpoints.join(', ')) + '</dd><dt>Trigger workflow</dt><dd>' + (f.triggerWorkflowId ? '<span class="hash">' + esc(f.triggerWorkflowId) + '</span>' : 'read on sync') + '</dd>' : '') +
        '<dt>Modified</dt><dd>' + esc(f.modified || '—') + '</dd><dt>24 h</dt><dd>' + (f.runs24h ? f.succeeded24h + ' of ' + f.runs24h + ' runs succeeded' : 'no runs read') + '</dd>' : '') + '</dl>';
      h += '<div class="actions">' + (signed ? (f && f.state === 'Started' ? permBtn('flow.operate', 'Turn off', 'flow-toggle', ' data-id="' + esc(id) + '" data-op="turn-off"', 'bk-btn--danger') : permBtn('flow.operate', 'Turn on', 'flow-toggle', ' data-id="' + esc(id) + '" data-op="turn-on"', 'bk-btn--primary')) +
        btn('Refresh runs', 'flow-refresh', ' data-id="' + esc(id) + '"', 'bk-btn--ghost') : '<span class="faint">Connect as the flow owner to act on this flow.</span>') +
        '<a class="bk-btn bk-btn--ghost" href="https://make.powerautomate.com/environments/' + esc(S.session.system.environmentId) + '/flows/' + esc(id) + '/details" target="_blank" rel="noopener noreferrer">Open in Power Automate ↗</a></div>';
      h += '<div><h3 class="card-title">Run history</h3>' + (r.items.length ? '<ul class="list runs">' + r.items.map(function (x) {
        return '<li><span>' + badge(x.status === 'Succeeded' ? 'Healthy' : x.status === 'Failed' ? 'Unavailable' : x.status === 'Running' ? 'Info' : 'Degraded', x.status) + '</span><span class="what">' + time(x.start_time) +
          (x.duration_ms !== null ? ' · ' + esc(x.duration_ms) + ' ms' : '') + (x.error_code ? '<br><span class="faint">' + esc(x.error_code + (x.error_message ? ': ' + x.error_message : '')) + '</span>' : '') +
          '<br><span class="hash">' + esc(x.run_id) + '</span><div class="run-steps" id="steps-' + esc(x.run_id) + '"></div></span><span class="when">' +
          (signed ? btn('Steps', 'run-steps', ' data-id="' + esc(id) + '" data-run="' + esc(x.run_id) + '"', 'bk-btn--sm bk-btn--ghost') +
            (x.status === 'Failed' || x.status === 'Cancelled' ? ' ' + permBtn('flow.operate', 'Resubmit', 'run-resubmit', ' data-id="' + esc(id) + '" data-run="' + esc(x.run_id) + '"', 'bk-btn--sm') : '') +
            (x.status === 'Running' ? ' ' + permBtn('flow.operate', 'Cancel', 'run-cancel', ' data-id="' + esc(id) + '" data-run="' + esc(x.run_id) + '"', 'bk-btn--sm bk-btn--danger') : '') : '') + '</span></li>';
      }).join('') + '</ul>' : empty('No runs read yet', signed ? 'Select Refresh runs.' : 'Connect as the flow owner and sync to read this flow\'s run history.')) + '</div>';
      $('#sheet-body').innerHTML = h;
    }, function (e) { $('#sheet-body').innerHTML = '<div class="bk-callout bk-callout--bad">' + esc(e.message) + '</div>'; });
  }

  VIEWS.configuration = {
    title: 'Configuration', live: false,
    load: function () { return api('GET', '/api/configurations'); },
    draw: function (d) {
      var h = head('Govern', 'Configuration', 'Runtime values and their versions. <b>Runtime</b> settings change here with a reason and take effect at once; <b>restart-bound</b> settings change only through a controlled change and a restart.');
      h += table('configuration', [
        { k: 'key', label: 'Key', v: function (c) { return '<b class="mono">' + esc(c.key) + '</b><br><span class="faint">' + esc(c.description) + '</span>'; } },
        { k: 'value', label: 'Value', cls: 'wrap', v: function (c) { return '<code>' + esc(JSON.stringify(c.value)) + '</code>'; } },
        { k: 'scope', label: 'Scope', v: function (c) { return badge(c.scope === 'runtime' ? 'Active' : c.scope === 'tenant-boundary' ? 'Registered' : 'Retired', c.scope); } },
        { k: 'version', label: 'Version', cls: 'num' },
        { k: 'updated_at', label: 'Updated', v: function (c) { return time(c.updated_at) + '<br><span class="faint">' + esc(c.updated_by) + '</span>'; } },
        { k: 'act', label: '', nosort: true, v: function (c) {
          return (c.mutable ? permBtn('config.update', 'Edit', 'config-edit', ' data-key="' + esc(c.key) + '"', 'bk-btn--sm') : '<span class="faint">' + esc(c.constraint) + '</span>') +
            (c.version > 1 ? ' ' + btn('History', 'config-history', ' data-key="' + esc(c.key) + '"', 'bk-btn--sm bk-btn--ghost') : '');
        } }
      ], d.items);
      h += '<div class="section bk-callout"><b>Microsoft 365 and Power Platform boundary.</b> The environment <code>' + esc(S.session.system.environmentId) + '</code> and SharePoint connection <code>' + esc(S.session.system.sharePointConnectionId) +
        '</code> identify the tenant. The Centre works there only as the flow owner (Flows): state, run history, turn on/off, resubmit, cancel. Nothing that needs tenant administration is used — no admin API, no admin consent, no app registration.</div>';
      return h;
    }
  };

  VIEWS.audit = {
    title: 'Audit & Evidence', live: true,
    load: function () {
      var u = ui('audit'), f = u.filters;
      var q = '?limit=100&offset=' + (u.offset || 0) + (f.q ? '&q=' + encodeURIComponent(f.q) : '') + (f.result ? '&result=' + encodeURIComponent(f.result) : '') + (f.actor ? '&actor=' + encodeURIComponent(f.actor) : '');
      return api('GET', '/api/audit' + q);
    },
    draw: function (d) {
      var u = ui('audit');
      var h = head('Govern', 'Audit & evidence', 'Every privileged action, hash-chained with SHA-256 from GENESIS. Rows are never edited or deleted.',
        btn('Verify chain', 'verify-chain', '', 'bk-btn--primary') + (can('evidence.export') ? btn('Export evidence bundle', 'export-bundle') + '<a class="bk-btn" href="#" data-action="csv" data-table="audit">Export CSV</a>' : ''));
      h += '<div id="chain-result"></div>';
      h += '<div class="toolbar">' + chips('audit', 'result', ['Succeeded', 'Failed', 'Denied']) + '</div>';
      h += '<div class="toolbar"><input class="bk-input grow" type="search" data-server-q="audit" placeholder="Search actor, action, target, reason or correlation ID… (Enter)" value="' + esc(u.filters.q || '') + '" aria-label="Search the audit trail"><span class="count">' + d.total + ' events</span></div>';
      h += table('audit', [
        { k: 'id', label: '#', cls: 'num' },
        { k: 'created_at', label: 'When', v: function (a) { return time(a.created_at); } },
        { k: 'actor', label: 'Actor' },
        { k: 'action', label: 'Action', v: function (a) { return '<b>' + esc(a.action) + '</b>'; } },
        { k: 'target', label: 'Target', cls: 'wrap', v: function (a) { var m = /^(alert|incident|change):(\d+)$/.exec(a.target); return m ? '<a href="#/' + m[1] + 's/' + m[2] + '">' + esc(a.target) + '</a>' : esc(a.target); } },
        { k: 'result', label: 'Result', v: function (a) { return badge(a.result); } },
        { k: 'reason', label: 'Reason', cls: 'wrap' },
        { k: 'event_hash', label: 'Hash', v: function (a) { return '<span class="hash" title="previous ' + esc(a.previous_hash) + '">' + esc(a.event_hash.slice(0, 12)) + '…</span><br><span class="faint mono">' + esc(a.correlation_id.slice(0, 8)) + '</span>'; } }
      ], d.items, { tall: true });
      var off = u.offset || 0;
      h += '<div class="pager">' + (off > 0 ? btn('‹ Newer', 'page', ' data-dir="-1"', 'bk-btn--sm') : '') + '<span>' + (off + 1) + '–' + Math.min(off + d.items.length, d.total) + ' of ' + d.total + '</span>' + (off + d.items.length < d.total ? btn('Older ›', 'page', ' data-dir="1"', 'bk-btn--sm') : '') + '</div>';
      return h;
    }
  };

  VIEWS.vault = {
    title: 'Vault', live: false,
    load: function () { return api('GET', '/api/vault'); },
    draw: function (v) {
      var inV = v.reconciliation.filter(function (e) { return e.inVault; }).length;
      var h = head('Govern', 'Folio Vault', 'Vault holds each signed flow URL as an alias and never returns it. The Centre asks Vault to <b>verify</b> an alias — a non-destructive identity check — and records the result as endpoint health.',
        btn('Refresh', 'reload'));
      h += '<div class="bk-kpis">' +
        kpi('Vault', v.reachable ? 'Reachable' : 'Unreachable', esc(v.url), '#/vault', v.reachable ? 'ok' : 'bad') +
        kpi('Admin credential', v.tokenConfigured ? 'Configured' : 'Not configured', v.tokenConfigured ? 'held by the Centre process, never stored' : 'set FOLIO_VAULT_ADMIN_TOKEN or FOLIO_VAULT_TOKEN_FILE', '#/vault', v.tokenConfigured ? 'ok' : 'warn') +
        kpi('Aliases in Vault', v.flows.length, v.unmapped.length + ' not mapped to an endpoint', '#/vault') +
        kpi('Endpoints mapped', inV + ' / ' + v.reconciliation.length, 'endpoint aliases Vault holds', '#/vault', inV ? '' : 'warn') + '</div>';
      if (v.error) h += '<div class="section bk-callout bk-callout--warn">' + esc(v.error) + ' <span class="faint">Start it with <code>npm run start:capsule</code>.</span></div>';
      h += '<div class="section"><h2>Endpoint aliases</h2>' + table('vault', [
        { k: 'scope', label: 'Scope' },
        { k: 'endpoint_key', label: 'Key', v: function (e) { return '<b class="mono">' + esc(e.endpoint_key) + '</b>'; } },
        { k: 'vault_alias', label: 'Alias', v: function (e) { return '<code>' + esc(e.vault_alias) + '</code>'; } },
        { k: 'inVault', label: 'In Vault', v: function (e) { return e.inVault ? badge(e.enabled ? 'Active' : 'Suspended', e.enabled ? 'enabled' : 'disabled') : badge('Unknown', 'absent'); } },
        { k: 'verifiedAt', label: 'Vault verified', v: function (e) { return time(e.verifiedAt); } },
        { k: 'act', label: '', nosort: true, v: function (e) { return e.inVault ? permBtn('vault.verify', 'Verify', 'vault-verify', ' data-alias="' + esc(e.vault_alias) + '"', 'bk-btn--sm') : ''; } }
      ], v.reconciliation, { tall: true }) + '</div>';
      if (v.unmapped.length) h += '<div class="section bk-callout bk-callout--warn"><b>Aliases no endpoint maps to:</b> ' + esc(v.unmapped.join(', ')) + '. Set the endpoint\'s Vault alias from the Estate view, or retire the alias in Vault.</div>';
      return h;
    }
  };

  VIEWS.access = {
    title: 'Access', live: false, perm: 'access.manage',
    load: function () { return api('GET', '/api/operators'); },
    draw: function (d) {
      var h = head('Administer', 'Access', 'Operators hold named, role-scoped tokens, so maker and checker are separate identities and every action is attributed. The bootstrap token in <code>config/admin.token</code> is the super administrator.',
        btn('Issue operator token', 'new-operator', '', 'bk-btn--primary') + btn('Rotate bootstrap token', 'rotate-bootstrap', '', 'bk-btn--danger'));
      h += table('access', [
        { k: 'name', label: 'Operator', v: function (o) { return '<b>' + esc(o.name) + '</b>'; } },
        { k: 'role', label: 'Role', v: function (o) { var r = S.session.enums.roles.filter(function (x) { return x.id === o.role; })[0]; return esc(r ? r.label : o.role); } },
        { k: 'enabled', label: 'Status', v: function (o) { return o.enabled ? badge('Active') : badge('Suspended', 'Disabled'); } },
        { k: 'last_seen_at', label: 'Last seen', v: function (o) { return o.last_seen_at ? esc(ago(o.last_seen_at)) : 'never'; } },
        { k: 'created_at', label: 'Issued', v: function (o) { return time(o.created_at) + '<br><span class="faint">by ' + esc(o.created_by) + '</span>'; } },
        { k: 'act', label: '', nosort: true, v: function (o) {
          return btn('Rotate', 'operator', ' data-id="' + o.id + '" data-op="rotate" data-name="' + esc(o.name) + '"', 'bk-btn--sm') + ' ' +
            btn(o.enabled ? 'Disable' : 'Enable', 'operator', ' data-id="' + o.id + '" data-op="' + (o.enabled ? 'disable' : 'enable') + '" data-name="' + esc(o.name) + '"', 'bk-btn--sm ' + (o.enabled ? 'bk-btn--danger' : ''));
        } }
      ], d.items, { empty: empty('No operators yet', 'Everyone is using the bootstrap token. Issue named tokens so maker and checker are distinct identities.') });
      h += '<div class="section"><h2>Roles</h2><div class="bk-table-wrap"><table class="bk-table"><thead><tr><th>Role</th><th>May</th></tr></thead><tbody>' +
        d.roles.map(function (r) { return '<tr><td><b>' + esc(r.label) + '</b></td><td class="wrap">' + esc(r.permissions.join(', ')) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
      return h;
    }
  };

  VIEWS.operations = {
    title: 'Operations', live: true,
    load: function () { return Promise.all([api('GET', '/api/checklist'), api('GET', '/api/metrics'), api('GET', '/api/backups')]); },
    draw: function (d) {
      var cl = d[0], m = d[1], b = d[2];
      var h = head('Administer', 'Operations', 'The daily and weekly control checklists, computed live, with the maintenance actions that satisfy them.',
        permBtn('backup.create', 'Back up now', 'backup', '', 'bk-btn--primary') + permBtn('retention.run', 'Apply retention', 'retention') + (can('evidence.export') ? btn('Export evidence bundle', 'export-bundle') : ''));
      ['daily', 'weekly'].forEach(function (c) {
        var items = cl.items.filter(function (i) { return i.cadence === c; });
        h += '<div class="section bk-card"><h2 class="card-title">' + (c === 'daily' ? 'Daily' : 'Weekly') + ' checklist <small class="faint">' + items.filter(function (i) { return i.pass; }).length + ' / ' + items.length + ' pass</small></h2><ul class="list">' +
          items.map(function (i) { return '<li class="check" data-pass="' + i.pass + '"><span class="check__mark" aria-hidden="true">' + (i.pass ? '✓' : '!') + '</span><span class="what"><b>' + esc(i.check) + '</b><br><span class="faint">' + esc(i.detail) + '</span></span><span class="when">' + (i.pass ? 'Pass' : 'Attention') + '</span></li>'; }).join('') + '</ul></div>';
      });
      h += '<div class="section grid-2"><div class="bk-card"><h2 class="card-title">Runtime</h2><dl class="facts">' +
        [['Up', Math.floor(m.uptimeSeconds / 3600) + ' h ' + Math.floor(m.uptimeSeconds % 3600 / 60) + ' min (since ' + fmt(m.startedAt) + ')'], ['Requests', m.requests], ['Mutations', m.mutations],
          ['Refused tokens', m.authFailures], ['Forbidden by role', m.forbidden], ['Rate-limited', m.rateLimited], ['Database', Math.round(m.databaseBytes / 1024) + ' KB (+' + Math.round(m.walBytes / 1024) + ' KB WAL)'],
          ['Schema', 'v' + m.schemaVersion], ['Python', m.python], ['Monitor', m.monitor.enabled ? 'every ' + m.monitor.intervalSeconds + ' s · ' + m.monitor.cycles + ' cycles · next ' + (m.monitor.nextRun ? fmt(m.monitor.nextRun, false) : '—') : 'disabled']]
          .map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl></div>';
      h += '<div class="bk-card"><h2 class="card-title">Backups <small class="faint">' + esc(b.directory) + '</small></h2>' + (b.items.length ? '<ul class="list">' + b.items.slice(0, 10).map(function (x) {
        return '<li><span class="what"><b class="mono">' + esc(x.file) + '</b><br><span class="faint">' + Math.round(x.bytes / 1024) + ' KB · ' + esc(x.mode) + ' · sha256 ' + esc(x.sha256.slice(0, 16)) + '…</span></span><span class="when">' + esc(ago(x.createdAt)) + '</span></li>';
      }).join('') + '</ul>' : empty('No backups yet', 'Back up at least weekly. Restore is offline by design: stop the server, copy the file back, run <code>scripts/verify.py</code>.')) + '</div></div>';
      return h;
    }
  };

  VIEWS.help = {
    title: 'Guide', live: false,
    draw: function () {
      var r = S.session.roleLabel;
      return head('Administer', 'Operating guide', 'How each role uses the Centre. You are signed in as <b>' + esc(r) + '</b>.') +
        '<div class="grid-2 guide">' +
        '<div class="bk-card"><h3>Super administrator</h3><ol><li>After every start, confirm 6 platforms and the endpoint count on the Overview.</li><li>Issue named operator tokens under Access; keep the bootstrap token for administration only.</li><li>Change runtime settings under Configuration with a reason; restart-bound settings need a controlled change.</li><li>Back up weekly and run <code>python3 scripts/verify.py</code> after maintenance.</li></ol></div>' +
        '<div class="bk-card"><h3>Operations controller</h3><ol><li>Open Health; treat Unknown and Stale as not healthy.</li><li>Probe on demand; the monitor raises an alert when a platform goes bad and resolves it on recovery.</li><li>Watch Flows: a failed newest run raises an alert and the next success resolves it; open Steps to see which action failed.</li><li>Raise an alert with asset, severity, owner and reason for anything the monitor cannot see.</li><li>Escalate to an incident when impact needs coordination.</li></ol></div>' +
        '<div class="bk-card"><h3>Incident manager</h3><ol><li>Open the triggering alert and select Escalate to incident.</li><li>Move the incident through Investigating and Mitigated, adding notes as you go.</li><li>Resolve with a note stating what was done; close once verified.</li><li>Use a stable correlation ID for related API calls.</li></ol></div>' +
        '<div class="bk-card"><h3>Change manager</h3><ol><li>Submit a change naming a different accountable checker, with risk and rollback plan.</li><li>The named checker approves or rejects; the maker cannot.</li><li>Mark implemented only after the real-world action; verify with evidence or record the rollback.</li></ol></div>' +
        '<div class="bk-card"><h3>Auditor</h3><ol><li>Open Audit &amp; Evidence and select Verify chain.</li><li>Every alert, incident and change links to its audit events from its timeline.</li><li>Export the evidence bundle and retain it for the configured retention period (Configuration › retentionDays).</li><li>Confirm no credentials appear in reasons or records — the Centre refuses them on entry.</li></ol></div>' +
        '<div class="bk-card"><h3>Platform administrator</h3><ol><li>Use the Estate view; filter by scope, state or health.</li><li>Reconcile with registers after a register changes; retired keys are marked Retired, never deleted.</li><li>Flows › Connect as flow owner (device code, no administrator); sync to settle identities and read runs.</li><li>Turn flows off and on around planned work; resubmit a failed run once fixed; cancel a stuck one.</li><li>Verify endpoints through Vault; the signed URL never leaves Vault.</li><li>Set platform status to Maintenance before planned work to suppress monitor alerts.</li></ol></div>' +
        '<div class="bk-card"><h3>Viewer and executive</h3><ul><li>Overview shows estate size, risk and what needs attention.</li><li>A zero alert count is not proof of health unless current observations exist.</li></ul></div>' +
        '<div class="bk-card"><h3>Messages you may see</h3><ul><li><b>unauthorized</b> — the token is missing or wrong; re-read it locally.</li><li><b>reason required</b> — every change needs an accountable reason.</li><li><b>credential-like content refused</b> — remove the URL, token or password.</li><li><b>only the named checker may decide</b> — maker–checker in force.</li><li><b>transition not allowed</b> — the record is in a state that cannot move there.</li><li><b>forbidden</b> — your role may not do this.</li></ul></div>' +
        '<div class="bk-card"><h3>Keyboard</h3><div class="kbd-list"><span class="bk-kbd">/</span><span>Search records</span><span class="bk-kbd">g</span><span>then o, p, h, f, a, i, c, e, u — go to a view</span><span class="bk-kbd">r</span><span>Refresh the view</span><span class="bk-kbd">Esc</span><span>Close a dialog or sheet</span></div></div>' +
        '<div class="bk-card"><h3>Never</h3><ul><li>Expose the Centre beyond loopback without an approved hosting design.</li><li>Share a token by email, chat, ticket or screenshot.</li><li>Edit audit rows or the database while the server runs.</li><li>Treat inventory registration as evidence of live health.</li></ul></div>' +
        '</div>';
    }
  };

  /* ── Actions ───────────────────────────────────────────────────────────────────────── */
  var ACTIONS = {
    reload: function () { refreshSummary().then(function () { render(false); }, function () { render(false); }); },
    filter: function (el) {
      var u = ui(el.getAttribute('data-view'));
      u.filters[el.getAttribute('data-key')] = el.getAttribute('data-value');
      u.touched = true; u.offset = 0;
      if (el.getAttribute('data-view') === 'audit') render(true); else draw();
    },
    page: function (el) { var u = ui('audit'); u.offset = Math.max(0, (u.offset || 0) + Number(el.getAttribute('data-dir')) * 100); render(true); },
    'probe-all': function (el) {
      return busy(el, api('POST', '/api/probe', { reason: 'On-demand probe of every platform from the Centre' }).then(function (r) {
        var ok = r.results.filter(function (x) { return x.state === 'Healthy'; }).length;
        return done('Probed ' + r.results.length + ' platforms: ' + ok + ' healthy.');
      }));
    },
    probe: function (el) {
      var id = el.getAttribute('data-id');
      return busy(el, api('POST', '/api/probe/' + id, { reason: 'On-demand probe of ' + id }).then(function (r) { return done(id + ': ' + r.results[0].state + ' — ' + r.results[0].message); }));
    },
    'new-alert': function (el) {
      var assets = [];
      (S.cache.portfolio ? S.cache.portfolio[0].items : []).forEach(function (p) { assets.push('platform:' + p.id); });
      return form({ title: 'New alert', fields: [
        { name: 'severity', label: 'Severity', type: 'select', required: true, options: S.session.enums.severities, value: 'High', half: true },
        { name: 'owner', label: 'Owner', required: true, max: 120, value: el.getAttribute('data-owner') || '', placeholder: 'e.g. platform-administrator', half: true },
        { name: 'asset', label: 'Affected asset', required: true, max: 200, value: el.getAttribute('data-asset') || '', placeholder: 'e.g. platform:portal or Folio Workspace endpoint estate' },
        { name: 'message', label: 'What is wrong', type: 'textarea', required: true, max: 2000 },
        { name: 'reason', label: 'Reason for raising', type: 'textarea', required: true, min: 5, max: 1000, help: 'The operational evidence. Recorded in the audit chain.' }
      ], submit: 'Raise alert', run: function (v) { return api('POST', '/api/alerts', v).then(function (r) { done('Alert #' + r.id + ' raised.'); location.hash = '#/alerts/' + r.id; }); } });
    },
    'new-incident': function (el, alert) {
      return form({ title: alert ? 'Escalate alert #' + alert.id + ' to an incident' : 'New incident', fields: [
        { name: 'severity', label: 'Severity', type: 'select', required: true, options: S.session.enums.severities, value: alert ? alert.severity : 'High', half: true },
        { name: 'owner', label: 'Owner', required: true, max: 120, value: alert ? alert.owner : '', half: true },
        { name: 'title', label: 'Title', required: true, max: 200, value: alert ? alert.asset + ': ' + alert.message.slice(0, 120) : '' },
        { name: 'description', label: 'Impact and scope', type: 'textarea', required: true, max: 4000, rows: 4 },
        { name: 'reason', label: 'Reason for opening', type: 'textarea', required: true, min: 5, max: 1000 }
      ], submit: 'Open incident', run: function (v) {
        if (alert) v.alertId = alert.id;
        return api('POST', '/api/incidents', v).then(function (r) { done('Incident #' + r.id + ' opened.'); location.hash = '#/incidents/' + r.id; });
      } });
    },
    escalate: function (el) {
      return api('GET', '/api/alerts/' + el.getAttribute('data-id')).then(function (a) { $('#sheet').close(); ACTIONS['new-incident'](el, a); });
    },
    'new-change': function (el) {
      var roles = S.session.enums.roles;
      return form({ title: 'Submit a controlled change', intro: 'You are the <b>maker</b> (' + esc(S.actor) + '). Name a different accountable identity as checker; only they can approve.', fields: [
        { name: 'changeType', label: 'Change type', required: true, max: 120, placeholder: 'e.g. Operational activation, Token rotation, Flow re-point', half: true },
        { name: 'risk', label: 'Risk', type: 'select', options: ['Low', 'Medium', 'High'], value: 'Medium', half: true },
        { name: 'target', label: 'Target', required: true, max: 300, value: el.getAttribute('data-target') || '' },
        { name: 'checker', label: 'Checker', required: true, max: 80, placeholder: 'e.g. change-manager', validate: function (v) { return v.toLowerCase() === S.actor.toLowerCase() ? 'The checker must be someone other than you.' : ''; }, half: true },
        { name: 'scheduledFor', label: 'Scheduled for', type: 'date', half: true },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, min: 5, max: 1000 },
        { name: 'rollbackPlan', label: 'Rollback plan', type: 'textarea', max: 2000 }
      ], submit: 'Submit change', run: function (v) {
        if (!v.scheduledFor) delete v.scheduledFor;
        return api('POST', '/api/changes', v).then(function (r) { done('Change #' + r.id + ' submitted to ' + v.checker + '.'); location.hash = '#/changes/' + r.id; });
      } });
    },
    transition: function (el) {
      var t = el.getAttribute('data-table'), id = el.getAttribute('data-id'), to = el.getAttribute('data-to');
      var needNote = S.session.enums.noteRequired.indexOf(t + ':' + to) >= 0;
      var danger = /Rejected|RolledBack|Cancelled/.test(to);
      return form({ title: KIND[t].charAt(0).toUpperCase() + KIND[t].slice(1) + ' #' + id + ' → ' + to, fields: [
        { name: 'note', label: needNote ? (to === 'Verified' ? 'Verification evidence' : to === 'RolledBack' ? 'What was rolled back' : to === 'Rejected' ? 'Why it is rejected' : 'Resolution') : 'Note (optional)', type: 'textarea', required: needNote, max: 4000 },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, min: 5, max: 1000 }
      ], submit: 'Move to ' + to, tone: danger ? 'danger' : '', run: function (v) {
        v.to = to;
        return api('POST', '/api/' + t + '/' + id + '/transition', v).then(function () { toast(KIND[t] + ' #' + id + ' is now ' + to + '.', 'ok'); refreshSummary(); render(true); return openRecord(t, id); });
      } });
    },
    assign: function (el) {
      var t = el.getAttribute('data-table'), id = el.getAttribute('data-id');
      return form({ title: 'Reassign ' + KIND[t] + ' #' + id, fields: [
        { name: 'owner', label: 'New owner', required: true, max: 120, value: el.getAttribute('data-owner') },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, min: 5 }
      ], submit: 'Reassign', run: function (v) { return api('POST', '/api/' + t + '/' + id + '/assign', v).then(function () { toast('Reassigned to ' + v.owner + '.', 'ok'); render(true); return openRecord(t, id); }); } });
    },
    note: function (el) {
      var t = el.getAttribute('data-table'), id = el.getAttribute('data-id');
      return form({ title: 'Add a note to ' + KIND[t] + ' #' + id, fields: [{ name: 'note', label: 'Note', type: 'textarea', required: true, max: 4000, rows: 5 }],
        submit: 'Add note', run: function (v) { return api('POST', '/api/' + t + '/' + id + '/notes', v).then(function () { toast('Note added.', 'ok'); return openRecord(t, id); }); } });
    },
    'platform-status': function (el) {
      var id = el.getAttribute('data-id');
      return form({ title: 'Set status of ' + id, fields: [
        { name: 'status', label: 'Inventory status', type: 'select', options: S.session.enums.platformStates, value: el.getAttribute('data-status'), help: 'Maintenance and Retired suppress monitor alerts.' },
        { name: 'owner', label: 'Owner', max: 120, value: el.getAttribute('data-owner') },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, min: 5 }
      ], submit: 'Save', run: function (v) { return api('POST', '/api/platforms/' + id + '/status', v).then(function () { done(id + ' is now ' + v.status + '.'); }); } });
    },
    'estate-for': function (el) { var u = ui('estate'); u.filters = { scope: { workspace: 'internal', portal: 'portal', mailer: 'mailer' }[el.getAttribute('data-id')] || '' }; },
    'endpoint-state': function (el) {
      var id = el.getAttribute('data-id');
      return form({ title: 'Endpoint state', fields: [
        { name: 'state', label: 'State', type: 'select', options: S.session.enums.endpointStates, value: el.getAttribute('data-state') },
        { name: 'vaultAlias', label: 'Vault alias', max: 120, value: el.getAttribute('data-alias'), help: 'Lower-case words joined by dots or dashes.' },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, min: 5 }
      ], submit: 'Save', run: function (v) { return api('POST', '/api/endpoints/' + id + '/state', v).then(function () { $('#sheet').close(); done('Endpoint updated.'); }); } });
    },
    reconcile: function () {
      return confirmDo('Reconcile the estate with the registers', 'Re-reads the endpoint registers in the repository. New keys are added, changed workflow IDs and routes are updated, and keys no longer listed are marked <b>Retired</b> — never deleted.', 'Reconcile', function (v) {
        return api('POST', '/api/estate/reconcile', v).then(function (r) { done('Reconciled: ' + r.added.length + ' added, ' + r.updated.length + ' updated, ' + r.retired.length + ' retired.'); });
      });
    },
    ingest: function (el) {
      var a = el.getAttribute('data-asset') || '';
      return form({ title: 'Record a health observation', intro: 'For evidence the monitor cannot gather itself — a flow-run result, a tenant check, a manual test.', fields: [
        { name: 'assetType', label: 'Asset type', type: 'select', options: ['platform', 'endpoint', 'service'], value: a.split(':')[0] || 'endpoint', half: true },
        { name: 'state', label: 'State', type: 'select', options: S.session.enums.healthStates, value: 'Healthy', half: true },
        { name: 'assetId', label: 'Asset ID', required: true, value: a.split(':').slice(1).join(':'), help: 'A platform id (e.g. portal) or an endpoint as scope:KEY (e.g. portal:SUBMISSION).' },
        { name: 'latencyMs', label: 'Latency (ms)', type: 'number' },
        { name: 'message', label: 'What was observed', type: 'textarea', required: true },
        { name: 'reason', label: 'Source of the evidence', type: 'textarea', required: true, min: 5 }
      ], submit: 'Record', run: function (v) { if (v.latencyMs === '') delete v.latencyMs; return api('POST', '/api/health', v).then(function () { done('Observation recorded.'); }); } });
    },
    'vault-verify': function (el) {
      var alias = el.getAttribute('data-alias');
      return confirmDo('Verify ' + alias + ' through Vault', 'Vault calls the flow with its non-destructive <code>verify</code> operation and checks the identity it answers with. The signed URL stays inside Vault.', 'Verify', function (v) {
        v.alias = alias;
        return api('POST', '/api/vault/verify', v).then(function (r) { toast(r.message, r.verified ? 'ok' : 'bad'); render(true); });
      });
    },
    'config-edit': function (el) {
      var k = el.getAttribute('data-key');
      var c = S.cache.configuration.items.filter(function (x) { return x.key === k; })[0];
      var bool = typeof c.value === 'boolean';
      return form({ title: 'Edit ' + k, intro: esc(c.description) + '. Allowed: ' + esc(c.constraint) + '.', fields: [
        bool ? { name: 'value', label: 'Value', type: 'select', options: ['true', 'false'], value: String(c.value) } : { name: 'value', label: 'Value', required: true, value: c.value, type: typeof c.value === 'number' ? 'number' : 'text' },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, min: 5 }
      ], submit: 'Save version ' + (c.version + 1), run: function (v) {
        if (bool) v.value = v.value === 'true';
        return api('PUT', '/api/configurations/' + k, v).then(function (r) {
          if (k === 'sessionIdleMinutes' || k === 'timezone') S.session.system[k] = r.value;
          done(k + ' is now ' + JSON.stringify(r.value) + ' (version ' + r.version + ').');
        });
      } });
    },
    'config-history': function (el) {
      var k = el.getAttribute('data-key');
      return api('GET', '/api/configurations/' + k + '/history').then(function (h) {
        var d = $('#sheet');
        $('#sheet-title').textContent = k + ' history';
        $('#sheet-body').innerHTML = '<ol class="timeline">' + h.items.map(function (x) { return '<li><div class="meta">' + time(x.changed_at) + ' · ' + esc(x.actor) + ' · version ' + x.version + '</div><div class="body"><code>' + esc(x.value) + '</code> — ' + esc(x.reason) + '</div></li>'; }).join('') + '</ol>';
        d.showModal();
      });
    },
    'verify-chain': function (el) {
      return busy(el, api('GET', '/api/audit/verify').then(function (r) {
        $('#chain-result').innerHTML = r.valid
          ? '<div class="bk-callout bk-callout--ok"><b>The chain verifies.</b> ' + r.events + ' events recompute from GENESIS; head <span class="hash">' + esc(r.head) + '</span>.</div>'
          : '<div class="bk-callout bk-callout--bad"><b>The chain is broken at event #' + esc(r.mismatchAt) + '.</b> ' + esc(r.problem) + '. Preserve the database and raise an incident.</div>';
      }));
    },
    'export-bundle': function (el) { return busy(el, download('/api/export' + (S.session.kind === 'bootstrap' ? '?actor=' + encodeURIComponent(S.actor) : ''), 'folio-admin-evidence.json').then(function () { toast('Evidence bundle exported and recorded in the audit chain.', 'ok'); })); },
    csv: function (el) { return download('/api/export/' + el.getAttribute('data-table') + '.csv', 'folio-admin-' + el.getAttribute('data-table') + '.csv'); },
    'test-code': function () {
      TEST.email = $('#test-email').value.trim();
      return api('POST', '/api/test/sign-in', { actor: S.actor, reason: 'Folio sign-in for a flow test', email: TEST.email }).then(function (r) {
        if (!r.sent) throw new Error(r.reason || 'The code could not be sent.');
        TEST.codeSent = true; toast('A code was e-mailed to ' + TEST.email + '.', 'ok'); draw();
      });
    },
    'test-verify': function () {
      return api('POST', '/api/test/verify', { actor: S.actor, reason: 'Folio sign-in for a flow test', email: TEST.email, code: $('#test-code').value.trim() }).then(function (d) {
        TEST.codeSent = false; S.cache.test = d; toast('Signed in to Folio as ' + d.email + '.', 'ok'); draw();
      });
    },
    'test-sign-out': function () {
      return api('POST', '/api/test/sign-out', { actor: S.actor, reason: 'Folio sign-out after a flow test' }).then(function (d) { S.cache.test = d; TEST.result = null; draw(); });
    },
    'test-run': function () {
      var payload;
      try { payload = JSON.parse($('#test-payload').value || '{}'); } catch (e) { throw new Error('The payload is not valid JSON.'); }
      return api('POST', '/api/test/run', { actor: S.actor, reason: $('#test-reason').value.trim(), key: $('#test-key').value, payload: payload }).then(function (r) {
        TEST.result = r; draw();
      });
    },
    'check-load': function () { $('#check-file').click(); },
    'check-baseline': function () { $('#check-file-baseline').click(); },
    'check-clear': function () { CHECK = { urls: null, name: '', baseline: null, baseName: '' }; draw(); },
    'check-report': function () {
      save(new Blob([JSON.stringify(window.FolioEstateCheck.report(CHECK.urls), null, 2) + '\n'], { type: 'application/json' }), 'folio-configuration-report.json');
      toast('The report is redacted: it carries no signature.', 'ok');
    },
    'estate-csv': function () {
      var rows = S.estateRows || [];
      var cols = ['scope', 'endpoint_key', 'flow_name', 'workflow_id', 'method', 'route', 'platform_id', 'state', 'health', 'vault_alias', 'updated_at'];
      var cell = function (v) { v = v === null || v === undefined ? '' : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      save(new Blob([cols.join(',') + '\n' + rows.map(function (r) { return cols.map(function (c) { return cell(r[c]); }).join(','); }).join('\n') + '\n'], { type: 'text/csv' }), 'folio-estate-view.csv');
    },
    'new-operator': function () {
      return form({ title: 'Issue an operator token', fields: [
        { name: 'name', label: 'Accountable name', required: true, max: 80, placeholder: 'e.g. change-manager or a.bello' },
        { name: 'role', label: 'Role', type: 'select', options: S.session.enums.roles.filter(function (r) { return r.id !== 'super_admin'; }).map(function (r) { return { v: r.id, l: r.label }; }), value: 'viewer' },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, min: 5 }
      ], submit: 'Issue token', run: function (v) { return api('POST', '/api/operators', v).then(function (r) { render(true); setTimeout(function () { reveal('Token for ' + r.name, 'Hand this token to <b>' + esc(r.name) + '</b> only. The Centre keeps its SHA-256 digest, not the token.', r.token); }, 50); }); } });
    },
    operator: function (el) {
      var op = el.getAttribute('data-op'), id = el.getAttribute('data-id'), name = el.getAttribute('data-name');
      return confirmDo({ rotate: 'Rotate', disable: 'Disable', enable: 'Enable' }[op] + ' ' + name, op === 'rotate' ? 'Issues a new token and invalidates the current one immediately.' : op === 'disable' ? 'Every request with this operator\'s token will be refused.' : 'The operator\'s current token works again.',
        { rotate: 'Rotate token', disable: 'Disable', enable: 'Enable' }[op], function (v) {
          return api('POST', '/api/operators/' + id + '/' + op, v).then(function (r) { render(true); if (r.token) setTimeout(function () { reveal('New token for ' + name, 'The previous token no longer works.', r.token); }, 50); else toast(name + ' ' + op + 'd.', 'ok'); });
        }, op === 'enable' ? '' : 'danger');
    },
    'rotate-bootstrap': function () {
      return confirmDo('Rotate the bootstrap token', 'Writes a new token to <code>config/admin.token</code> (mode 0600) and refuses the old one at once — including in this tab. Record the rotation as a controlled change.', 'Rotate now', function (v) {
        return api('POST', '/api/access/rotate-bootstrap', v).then(function (r) { S.token = r.token; store(TOKEN_KEY, r.token); setTimeout(function () { reveal('New bootstrap token', 'The old token is refused from now on. This tab has switched to the new one.', r.token); }, 50); });
      }, 'danger');
    },
    'owner-sign-in': function (el) {
      return confirmDo('Connect as the flow owner', 'The Centre asks Microsoft for a device code. You then sign in on any device with the account that owns the flows. Nothing is registered in the tenant and no administrator consent is involved.', 'Get a sign-in code', function (v) {
        return api('POST', '/api/tenant/sign-in', v).then(function (o) { if (o.state === 'error') throw new Error(o.error); render(true); });
      });
    },
    'owner-sign-out': function () {
      return confirmDo('Disconnect the flow owner', 'The Centre forgets the flow owner\'s session. Run history already read is kept.', 'Disconnect', function (v) {
        return api('POST', '/api/tenant/sign-out', v).then(function () { done('Disconnected.'); });
      });
    },
    'flow-sync': function (el) {
      return busy(el, api('POST', '/api/tenant/sync', { reason: 'On-demand flow sync from the Centre' }).then(function (r) {
        return done('Synced: ' + r.flowsListed + ' flows listed, ' + r.identitiesResolved + ' identities resolved, ' + r.runsRead + ' runs read' + (r.identityDrift.length ? ', ' + r.identityDrift.length + ' drifted' : '') + '.');
      }));
    },
    'flow-refresh': function (el) {
      var id = el.getAttribute('data-id');
      return busy(el, api('GET', '/api/flows/' + id + '/runs?live=1').then(function () { return api('GET', '/api/flows').then(function (d) { S.cache.flows = d; draw(); return openFlow(id); }); }));
    },
    'flow-toggle': function (el) {
      var id = el.getAttribute('data-id'), op = el.getAttribute('data-op');
      return confirmDo(op === 'turn-off' ? 'Turn this flow off' : 'Turn this flow on', op === 'turn-off' ? 'Every endpoint this flow backs stops answering until it is turned on again.' : 'The flow starts accepting requests again.',
        op === 'turn-off' ? 'Turn off' : 'Turn on', function (v) {
          return api('POST', '/api/flows/' + id + '/' + op, v).then(function (r) { toast('The flow is now ' + r.state + '.', 'ok'); return api('GET', '/api/flows').then(function (d) { S.cache.flows = d; draw(); return openFlow(id); }); });
        }, op === 'turn-off' ? 'danger' : '');
    },
    'run-steps': function (el) {
      var id = el.getAttribute('data-id'), run = el.getAttribute('data-run'), host = $('#steps-' + run);
      return busy(el, api('GET', '/api/flows/' + id + '/runs/' + run).then(function (r) {
        host.innerHTML = '<ol class="timeline">' + r.actions.map(function (a) {
          return '<li><div class="meta">' + badge(a.status === 'Succeeded' ? 'Healthy' : a.status === 'Failed' ? 'Unavailable' : a.status === 'Skipped' ? 'Info' : 'Degraded', a.status) + ' ' + esc(a.name) + ' · ' + esc(fmt(a.startTime, false)) + '</div>' +
            (a.error ? '<div class="body">' + esc((a.errorCode ? a.errorCode + ': ' : '') + a.error) + '</div>' : '') + '</li>';
        }).join('') + '</ol>';
      }));
    },
    'run-resubmit': function (el) {
      var id = el.getAttribute('data-id'), run = el.getAttribute('data-run');
      return form({ title: 'Resubmit run', intro: 'Resubmitting replays the <b>original request</b> through the flow. For a flow that writes or sends, that can write or send again. Type RESUBMIT to confirm.', introTone: 'warn', fields: [
        { name: 'confirm', label: 'Confirmation', required: true, placeholder: 'RESUBMIT', validate: function (v) { return v === 'RESUBMIT' ? '' : 'Type RESUBMIT exactly.'; } },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, min: 5 }
      ], submit: 'Resubmit', tone: 'danger', run: function (v) {
        return api('POST', '/api/flows/' + id + '/runs/' + run + '/resubmit', v).then(function () { toast('Resubmitted. A new run will appear on the next refresh.', 'ok'); return openFlow(id); });
      } });
    },
    'run-cancel': function (el) {
      var id = el.getAttribute('data-id'), run = el.getAttribute('data-run');
      return confirmDo('Cancel this run', 'The running instance stops where it is; steps already done are not undone.', 'Cancel run', function (v) {
        return api('POST', '/api/flows/' + id + '/runs/' + run + '/cancel', v).then(function () { toast('Run cancelled.', 'ok'); return openFlow(id); });
      }, 'danger');
    },
    backup: function (el) {
      return confirmDo('Back up the database', 'A consistent online copy of the database is written to the backups directory with mode 0600.', 'Back up', function (v) {
        return api('POST', '/api/backups', v).then(function (r) { done('Backup ' + r.file + ' written (' + Math.round(r.bytes / 1024) + ' KB).'); });
      });
    },
    retention: function () {
      return confirmDo('Apply the retention policy', 'Removes health observations older than the configured retention period. Alerts, incidents, changes and audit events are never pruned.', 'Apply retention', function (v) {
        return api('POST', '/api/retention/run', v).then(function (r) { done('Retention applied: ' + r.removed + ' observations removed.'); });
      });
    }
  };
  function busy(el, p) { return window.BrandKit ? window.BrandKit.busy(el, p) : p; }
  function save(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function download(path, name) {
    return fetch(path, { headers: { 'Authorization': 'Bearer ' + S.token }, cache: 'no-store' }).then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || 'Export failed'); });
      var cd = r.headers.get('Content-Disposition') || '';
      var m = /filename="([^"]+)"/.exec(cd);
      return r.blob().then(function (b) { save(b, m ? m[1] : name); });
    }).catch(function (e) { toast(e.message, 'bad'); throw e; });
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (el && !el.disabled) {
      var a = ACTIONS[el.getAttribute('data-action')];
      if (a) {
        if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
        var p = a(el);
        if (p && p.catch) p.catch(function (err) { if (err && err.message) toast(err.message, 'bad'); });
      }
      return;
    }
    var th = e.target.closest('th[data-sort]');
    if (th) { sortBy(th); return; }
    var tr = e.target.closest('tr[data-open]');
    if (tr && !e.target.closest('a, button')) { location.hash = '#/' + tr.getAttribute('data-open'); }
  });
  function sortBy(th) {
    var u = ui(th.getAttribute('data-view')), k = th.getAttribute('data-sort');
    u.sort = u.sort && u.sort.k === k && u.sort.dir === 'asc' ? { k: k, dir: 'desc' } : { k: k, dir: 'asc' };
    draw();
  }
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t.matches && t.matches('th[data-sort]')) { e.preventDefault(); sortBy(t); return; }
    if (e.key === 'Enter' && t.matches && t.matches('tr[data-open]')) { location.hash = '#/' + t.getAttribute('data-open'); return; }
    if (e.key === 'Enter' && t.matches && t.matches('[data-server-q]')) { var u = ui(t.getAttribute('data-server-q')); u.filters.q = t.value.trim(); u.offset = 0; render(true); return; }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.matches('[data-filter-q]')) {
      var v = t.getAttribute('data-filter-q');
      ui(v).filters.q = t.value;
      clearTimeout(S.qTimer);
      S.qTimer = setTimeout(function () {
        draw();
        var el = $('[data-filter-q="' + v + '"]');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }, 180);
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('[data-filter-select]')) { ui(t.getAttribute('data-filter-select')).filters[t.getAttribute('data-key')] = t.value; draw(); }
    if (t.matches('[data-check-file]') && t.files && t.files[0] && window.FolioEstateCheck) {
      var file = t.files[0], which = t.getAttribute('data-check-file');
      file.text().then(function (text) {
        var got = window.FolioEstateCheck.read(text);
        var n = Object.keys(got.urls).filter(function (k) { return got.urls[k]; }).length;
        if (!n) { toast('No endpoint values found in ' + file.name + '.', 'bad'); return; }
        if (which === 'baseline') { CHECK.baseline = got.urls; CHECK.baseName = file.name + ' (' + got.kind + ')'; }
        else { CHECK.urls = got.urls; CHECK.name = file.name + ' (' + got.kind + ')'; }
        toast(n + ' value(s) read from ' + file.name + '. Nothing was sent to the Centre.', 'ok');
        draw();
      });
      t.value = '';
    }
  });

  /* ── Global search ─────────────────────────────────────────────────────────────────── */
  (function () {
    var box = $('#global-search'), out = $('#search-results'), timer, sel = -1;
    var HREF = { platform: function () { return '#/portfolio'; }, endpoint: function (r) { return '#/estate/' + r.id; }, alert: function (r) { return '#/alerts/' + r.id; },
      incident: function (r) { return '#/incidents/' + r.id; }, change: function (r) { return '#/changes/' + r.id; }, configuration: function () { return '#/configuration'; } };
    function close() { out.hidden = true; box.setAttribute('aria-expanded', 'false'); sel = -1; }
    box.addEventListener('input', function () {
      clearTimeout(timer);
      var q = box.value.trim();
      if (q.length < 2) { close(); return; }
      timer = setTimeout(function () {
        api('GET', '/api/search?q=' + encodeURIComponent(q)).then(function (r) {
          out.innerHTML = r.results.length ? r.results.map(function (x, i) {
            return '<a role="option" id="sr-' + i + '" href="' + esc(HREF[x.kind](x)) + '"><span class="kind">' + esc(x.kind) + '</span><span><b>' + esc(x.title) + '</b><br><span class="faint">' + esc(x.detail) + '</span></span></a>';
          }).join('') : '<div class="empty">Nothing matches “' + esc(q) + '”.</div>';
          out.hidden = false; box.setAttribute('aria-expanded', 'true'); sel = -1;
        }, function () {});
      }, 200);
    });
    box.addEventListener('keydown', function (e) {
      var items = $$('a', out);
      if (e.key === 'Escape') { close(); box.blur(); return; }
      if (!items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(function (a, i) { a.setAttribute('aria-selected', i === sel ? 'true' : 'false'); });
        box.setAttribute('aria-activedescendant', items[sel].id);
      }
      if (e.key === 'Enter') { e.preventDefault(); location.hash = (items[sel] || items[0]).getAttribute('href'); close(); box.value = ''; box.blur(); }
    });
    out.addEventListener('click', function () { close(); box.value = ''; });
    document.addEventListener('click', function (e) { if (!e.target.closest('.header-search')) close(); });
  })();

  /* ── Keyboard navigation: g then a letter ──────────────────────────────────────────── */
  (function () {
    var pending = false, t;
    var MAP = { f: 'flows', o: 'overview', p: 'portfolio', h: 'health', a: 'alerts', i: 'incidents', c: 'changes', e: 'estate', u: 'audit', v: 'vault', s: 'configuration', x: 'operations' };
    document.addEventListener('keydown', function (e) {
      if (!S.session || e.ctrlKey || e.metaKey || e.altKey || anyDialogOpen()) return;
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (pending && MAP[e.key]) { location.hash = '#/' + MAP[e.key]; pending = false; return; }
      pending = e.key === 'g';
      clearTimeout(t); t = setTimeout(function () { pending = false; }, 1200);
      if (e.key === 'r') ACTIONS.reload();
      if (e.key === '?') location.hash = '#/help';
    });
  })();

  /* ── Boot ──────────────────────────────────────────────────────────────────────────── */
  $('#token-show').addEventListener('click', function () {
    var i = $('#token'), show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    this.textContent = show ? 'Hide' : 'Show';
    this.setAttribute('aria-pressed', String(show));
  });
  $('#unlock-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = $('#token').value.trim(), a = $('#actor').value.trim(), b = $('#unlock');
    var err = $('#unlock-error');
    if (!t) { err.textContent = 'Paste the access token.'; err.hidden = false; $('#token').focus(); return; }
    err.hidden = true;
    b.setAttribute('aria-busy', 'true'); b.disabled = true;
    unlock(t, a).catch(function (e2) {
      err.textContent = e2.status === 401 ? 'That token was refused (401 unauthorized). Re-read it locally from config/admin.token, or ask a super administrator for an operator token.' :
        e2.status === 429 ? 'Too many refused attempts from this host. Wait five minutes.' : e2.message;
      err.hidden = false;
      (e2.field === 'actor' ? $('#actor') : $('#token')).focus();
    }).then(function () { b.removeAttribute('aria-busy'); b.disabled = false; });
  });
  $('#lock-btn').addEventListener('click', function () { lock('Locked. The token has been removed from this tab.'); });

  var saved = store(TOKEN_KEY);
  S.actor = store(ACTOR_KEY) || '';
  /* Opened by the launcher (scripts/folio-admin.mjs) at #launch=<code>: the code is taken out of the address at once,
     traded once for the token, and the Centre unlocks with no paste. */
  var launch = /^#launch=([A-Za-z0-9_-]{20,128})$/.exec(location.hash);
  if (launch) {
    history.replaceState(null, '', location.pathname + '#/overview');
    fetch('/api/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: launch[1] }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || 'The sign-in link was refused.'); return j; }); })
      .then(function (j) { return unlock(j.token, j.actor || S.actor); })
      .catch(function (e) { if (saved) unlock(saved, S.actor).catch(function () { showLock(e.message); }); else showLock(e.message); });
  } else if (saved) unlock(saved, S.actor).catch(function () { showLock('Your previous session has ended. Unlock again.'); });
  else showLock();
})();
