/*
 * Why does the deployed platform have no endpoints?
 *
 * Paste into the console ON THE DEPLOYED PLATFORM. It reports whether config.local.js loaded,
 * how many keys it carries, how many are non-empty, and whether the host is serving an error
 * page in place of the file. It prints endpoint KEYS only — never a URL or a signature.
 *
 * The commonest causes, in order:
 *   1. config.local.js was never uploaded — the deployed build predates it.
 *   2. It was uploaded but the host 404s it, and returns an HTML error page. The browser then
 *      parses HTML as JavaScript, window.DGO_CONFIG is never set, and every key reads empty.
 *   3. index.html does not reference it.
 */
(async () => {
  const L = (s, c) => console.log(c ? `%c${s}` : s, c || '');
  L('DGO config diagnostic', 'font-weight:bold;font-size:14px');
  L(`origin: ${location.origin}`);
  L(`path  : ${location.pathname}`);

  const g = window.DGO_CONFIG;
  L(`\nwindow.DGO_CONFIG        : ${typeof g === 'undefined' ? 'UNDEFINED — config.local.js did not load' : typeof g}`);
  if (g) {
    const e = g.endpoints || {};
    const keys = Object.keys(e);
    const set = keys.filter((k) => String(e[k] || '').trim());
    L(`window.DGO_CONFIG.endpoints keys : ${keys.length}`);
    L(`  of those, NON-EMPTY            : ${set.length}`);
    if (set.length) L(`  non-empty keys: ${set.join(', ')}`);
    if (keys.length && !set.length) L('  every key is present but EMPTY — the config file loaded with no values', 'color:#a4262c');
  }

  L('\n--- script tags on this page ---');
  [...document.querySelectorAll('script[src]')].forEach((s) => L('  ' + s.getAttribute('src')));

  L('\n--- can the browser fetch the config files? ---');
  for (const p of ['config/config.local.js', 'config/config.example.js', 'config/endpoints.config.js', 'index.html']) {
    try {
      const r = await fetch(p, { cache: 'no-store' });
      const t = await r.text();
      const looksLikeHtml = /^\s*<(!doctype|html)/i.test(t);
      L(`  ${String(r.status).padEnd(4)} ${p.padEnd(30)} ${t.length} bytes${looksLikeHtml && !p.endsWith('.html') ? '  ← HTML, not JS: the host served an error page' : ''}`,
        r.ok && !(looksLikeHtml && !p.endsWith('.html')) ? 'color:#0b6b3a' : 'color:#a4262c');
    } catch (err) { L(`  ERR  ${p.padEnd(30)} ${err.message}`, 'color:#a4262c'); }
  }

  L('\n--- what 404d on this page load ---');
  const bad = performance.getEntriesByType('resource')
    .filter((r) => r.responseStatus >= 400 || (r.transferSize === 0 && r.decodedBodySize === 0 && r.duration > 0))
    .map((r) => r.name.replace(location.origin, ''));
  if (bad.length) bad.forEach((b) => L('  ' + b, 'color:#a4262c'));
  else L('  (the Resource Timing API reported none — read the Network tab instead)');
})();
