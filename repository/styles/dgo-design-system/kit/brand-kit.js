/* ============================================================================================
   NITDA brand kit — behaviour. No dependencies, no network, runs from file://.

   Delivered beside brand-kit.css (embedded or packaged; see that file's header). Everything is
   opt-in by markup, so a page gets exactly the behaviour its HTML asks for:

     .bk-app / .bk-header / .bk-main   header height measured; "scrolled" + reading progress
     [data-bk-nav-toggle]              opens the navigation drawer on narrow screens
     .bk-nav a[href^="#"]              highlights the section currently in view (scroll-spy)
     [data-bk-theme-toggle]            light ⇄ dark, remembered per browser
     [data-bk-copy="text"]             copies text; [data-bk-copy-target="#id"] copies an element
     [data-bk-edges]                   shadows on a scroll region's edges while more is hidden
     [data-bk-anchor]                  heading gains a link that copies its address
     [data-bk-reveal]                  fades in the first time it scrolls into view
     [data-bk-top]  (on .bk-main)      a back-to-top button once the reader has scrolled
     [data-bk-search]                  "/" focuses it

   And a small API on window.BrandKit: toast(), busy(), copy(), setTheme().
   ============================================================================================ */
(function () {
  'use strict';
  if (window.BrandKit) return;

  var doc = document, root = doc.documentElement;
  var THEME_KEY = 'bk.theme';
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ }
    return null;
  }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function on(el, ev, fn, opt) { el && el.addEventListener(ev, fn, opt || false); }

  /* ── Theme ──────────────────────────────────────────────────────────────────────────────── */
  var dark = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function resolved() {
    var t = root.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return dark && dark.matches ? 'dark' : 'light';
  }
  function setTheme(t, remember) {
    if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
    if (remember !== false) store(THEME_KEY, t === 'dark' || t === 'light' ? t : null);
    root.setAttribute('data-bk-resolved', resolved());
    $all('[data-bk-theme-toggle]').forEach(function (b) {
      var d = resolved() === 'dark';
      b.setAttribute('aria-pressed', String(d));
      b.setAttribute('aria-label', d ? 'Switch to light theme' : 'Switch to dark theme');
      b.title = b.getAttribute('aria-label');
    });
  }
  // A page that stamps its own theme keeps it unless the reader chose one here before.
  var saved = store(THEME_KEY);
  if (saved) setTheme(saved, false); else root.setAttribute('data-bk-resolved', resolved());
  if (dark && dark.addEventListener) dark.addEventListener('change', function () { root.setAttribute('data-bk-resolved', resolved()); });

  /* ── Toasts ─────────────────────────────────────────────────────────────────────────────── */
  var toastHost;
  function toast(message, opts) {
    opts = opts || {};
    if (!toastHost) {
      toastHost = doc.createElement('div');
      toastHost.className = 'bk-toasts';
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
      doc.body.appendChild(toastHost);
    }
    var t = doc.createElement('div');
    t.className = 'bk-toast' + (opts.tone ? ' bk-toast--' + opts.tone : '');
    t.textContent = message;
    toastHost.appendChild(t);
    while (toastHost.children.length > 3) toastHost.removeChild(toastHost.firstChild);
    setTimeout(function () {
      t.classList.add('is-leaving');
      setTimeout(function () { t.remove(); }, reduced ? 0 : 180);
    }, opts.duration || (opts.tone === 'bad' ? 5200 : 2600));
    return t;
  }

  /* ── Busy state: a control shows it is working, then how it went ───────────────────────── */
  function busy(el, work) {
    if (!el) return Promise.resolve(typeof work === 'function' ? work() : work);
    el.setAttribute('aria-busy', 'true');
    el.setAttribute('aria-disabled', 'true');
    var p;
    try { p = Promise.resolve(typeof work === 'function' ? work() : work); } catch (e) { p = Promise.reject(e); }
    return p.then(function (v) {
      el.removeAttribute('aria-busy'); el.removeAttribute('aria-disabled');
      el.setAttribute('data-done', ''); setTimeout(function () { el.removeAttribute('data-done'); }, 1200);
      return v;
    }, function (e) {
      el.removeAttribute('aria-busy'); el.removeAttribute('aria-disabled');
      toast((e && e.message) || 'That did not work. Try again.', { tone: 'bad' });
      throw e;
    });
  }

  /* ── Copy ───────────────────────────────────────────────────────────────────────────────── */
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = doc.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      doc.body.appendChild(ta); ta.select();
      try { doc.execCommand('copy') ? resolve() : reject(new Error('Copy is not available here')); }
      catch (e) { reject(e); } finally { ta.remove(); }
    });
  }
  on(doc, 'click', function (e) {
    var b = e.target.closest && e.target.closest('[data-bk-copy], [data-bk-copy-target]');
    if (!b) return;
    e.preventDefault();
    var text = b.getAttribute('data-bk-copy');
    var sel = b.getAttribute('data-bk-copy-target');
    if (sel) { var src = doc.querySelector(sel); text = src ? ('value' in src ? src.value : src.textContent) : ''; }
    copy(text || '').then(function () {
      var label = b.getAttribute('data-bk-copied') || 'Copied';
      toast(label);
      b.setAttribute('data-done', ''); setTimeout(function () { b.removeAttribute('data-done'); }, 1200);
    }, function () { toast('Copy was blocked by the browser. Select the text and copy it instead.', { tone: 'warn' }); });
  });

  /* ── Shell: header height, scrolled state, reading progress, back to top ────────────────── */
  function initShell() {
    $all('.bk-app').forEach(function (app) {
      var header = app.querySelector('.bk-header');
      var main = app.querySelector('.bk-main');
      if (header) {
        var setH = function () { app.style.setProperty('--bk-header-h', header.getBoundingClientRect().height + 'px'); root.style.setProperty('--bk-header-h', header.getBoundingClientRect().height + 'px'); };
        setH();
        if (window.ResizeObserver) new ResizeObserver(setH).observe(header); else on(window, 'resize', setH);
      }
      if (!main) return;
      if (main.hasAttribute('data-bk-top') && !main.querySelector('.bk-top')) {
        var top = doc.createElement('button');
        top.type = 'button'; top.className = 'bk-top'; top.setAttribute('aria-label', 'Back to top'); top.title = 'Back to top';
        top.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
        on(top, 'click', function () { main.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); main.focus({ preventScroll: true }); });
        main.appendChild(top);
      }
      var ticking = false;
      var update = function () {
        ticking = false;
        var max = main.scrollHeight - main.clientHeight;
        var y = main.scrollTop;
        app.toggleAttribute('data-scrolled', y > 4);
        main.toggleAttribute('data-scrolled', y > 480);
        app.style.setProperty('--bk-read', max > 0 ? Math.min(1, y / max).toFixed(4) : '0');
      };
      on(main, 'scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
      update();
    });
  }

  /* ── Navigation drawer (narrow screens) ─────────────────────────────────────────────────── */
  function initNav() {
    $all('[data-bk-nav-toggle]').forEach(function (btn) {
      var app = btn.closest('.bk-app') || doc.querySelector('.bk-app');
      if (!app) return;
      var nav = app.querySelector('.bk-nav');
      if (!nav) { btn.hidden = true; return; }
      if (!nav.id) nav.id = 'bk-nav';
      btn.setAttribute('aria-controls', nav.id);
      btn.setAttribute('aria-expanded', 'false');
      if (!app.querySelector('.bk-scrim')) { var s = doc.createElement('div'); s.className = 'bk-scrim'; app.appendChild(s); on(s, 'click', function () { close(); }); }
      var narrow = window.matchMedia('(max-width: 900px)');
      function open() {
        app.setAttribute('data-nav-open', ''); btn.setAttribute('aria-expanded', 'true');
        var first = nav.querySelector('a[aria-current], a, button'); if (first) setTimeout(function () { first.focus(); }, 60);
      }
      function close(returnFocus) {
        if (!app.hasAttribute('data-nav-open')) return;
        app.removeAttribute('data-nav-open'); btn.setAttribute('aria-expanded', 'false');
        if (returnFocus !== false) btn.focus();
      }
      on(btn, 'click', function () { app.hasAttribute('data-nav-open') ? close() : open(); });
      on(doc, 'keydown', function (e) { if (e.key === 'Escape') close(); });
      on(nav, 'click', function (e) { if (narrow.matches && e.target.closest('a')) close(false); });
      if (narrow.addEventListener) narrow.addEventListener('change', function () { if (!narrow.matches) close(false); });
    });
  }

  /* ── Scroll-spy: the navigation follows the reader ──────────────────────────────────────── */
  function initSpy() {
    if (!window.IntersectionObserver) return;
    $all('.bk-app').forEach(function (app) {
      var main = app.querySelector('.bk-main');
      var links = $all('.bk-nav a[href^="#"], [data-bk-spy] a[href^="#"]', app).filter(function (a) { return a.getAttribute('href').length > 1; });
      if (!main || !links.length) return;
      var byId = {};
      links.forEach(function (a) { byId[decodeURIComponent(a.getAttribute('href').slice(1))] = a; });
      var targets = Object.keys(byId).map(function (id) { return doc.getElementById(id); }).filter(Boolean);
      if (!targets.length) return;
      var visible = new Map();
      var mark = function () {
        var best = null;
        targets.forEach(function (t) { if (visible.get(t) && (!best || t.getBoundingClientRect().top < best.getBoundingClientRect().top)) best = t; });
        if (!best) return;
        links.forEach(function (a) { a.removeAttribute('aria-current'); });
        var link = byId[best.id]; link.setAttribute('aria-current', 'location');
        var nav = link.closest('.bk-nav');
        var bar = link.closest('[data-bk-spy]');
        if (bar && bar.scrollWidth > bar.clientWidth) {
          var br = bar.getBoundingClientRect(), kr = link.getBoundingClientRect();
          if (kr.left < br.left + 24 || kr.right > br.right - 24) bar.scrollTo({ left: bar.scrollLeft + (kr.left - br.left) - br.width / 3, behavior: reduced ? 'auto' : 'smooth' });
        }
        if (nav) {
          var lr = link.getBoundingClientRect(), nr = nav.getBoundingClientRect();
          if (lr.top < nr.top + 40 || lr.bottom > nr.bottom - 40) nav.scrollTo({ top: nav.scrollTop + (lr.top - nr.top) - nr.height / 3, behavior: reduced ? 'auto' : 'smooth' });
        }
      };
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { visible.set(en.target, en.isIntersecting); });
        mark();
      }, { root: main, rootMargin: '0px 0px -55% 0px', threshold: 0 });
      targets.forEach(function (t) { io.observe(t); });
    });
  }

  /* ── Scroll edges ───────────────────────────────────────────────────────────────────────── */
  function initEdges() {
    $all('[data-bk-edges]').forEach(function (el) {
      var set = function () {
        el.toggleAttribute('data-more-above', el.scrollTop > 2);
        el.toggleAttribute('data-more-below', el.scrollTop + el.clientHeight < el.scrollHeight - 2);
      };
      on(el, 'scroll', set, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(set).observe(el);
      set();
    });
  }

  /* ── Section anchors ────────────────────────────────────────────────────────────────────── */
  function initAnchors() {
    $all('[data-bk-anchor][id]').forEach(function (h) {
      if (h.querySelector('.bk-anchor')) return;
      var a = doc.createElement('a');
      a.className = 'bk-anchor'; a.href = '#' + h.id; a.textContent = '#';
      a.setAttribute('aria-label', 'Copy link to this section');
      on(a, 'click', function (e) {
        e.preventDefault();
        var url = location.href.split('#')[0] + '#' + h.id;
        try { history.replaceState(null, '', '#' + h.id); } catch (err) { /* file:// in some browsers */ }
        h.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        copy(url).then(function () { toast('Link to this section copied'); }, function () {});
      });
      h.appendChild(a);
    });
  }

  /* ── Reveal ─────────────────────────────────────────────────────────────────────────────── */
  function initReveal() {
    var els = $all('[data-bk-reveal]');
    if (!els.length) return;
    if (reduced || !window.IntersectionObserver) { els.forEach(function (e) { e.classList.add('is-in'); }); return; }
    var main = doc.querySelector('.bk-main');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { root: main && main.contains(els[0]) ? main : null, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ── Keyboard ───────────────────────────────────────────────────────────────────────────── */
  on(doc, 'keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
    var s = doc.querySelector('[data-bk-search]');
    if (s) { e.preventDefault(); s.focus(); if (s.select) s.select(); }
  });
  on(doc, 'click', function (e) {
    var b = e.target.closest && e.target.closest('[data-bk-theme-toggle]');
    if (!b) return;
    setTheme(resolved() === 'dark' ? 'light' : 'dark');
    toast(resolved() === 'dark' ? 'Dark theme' : 'Light theme');
  });

  function init() {
    setTheme(root.getAttribute('data-theme') || null, false);
    initShell(); initNav(); initSpy(); initEdges(); initAnchors(); initReveal();
  }
  if (doc.readyState === 'loading') on(doc, 'DOMContentLoaded', init); else init();

  /* refresh(): call after rendering new markup, to wire anchors, edges and reveals inside it.
     Listeners on document are bound once, above, so refreshing never doubles them. */
  function refresh() { initEdges(); initAnchors(); initReveal(); initSpy(); }
  window.BrandKit = { toast: toast, busy: busy, copy: copy, setTheme: setTheme, resolvedTheme: resolved, refresh: refresh };
})();
