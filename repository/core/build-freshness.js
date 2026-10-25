/* 2026-10-22: a browser ran the Workspace from code cached two builds earlier: it started without its data, and a staff
   notice went out in the pre-2026-10-21 design. A release page names its build's asset token
   (scripts/lib/asset-stamp.mjs); when BUILD-ID.json, fetched uncached, names a different one, the page is an old copy.
   It is replaced once by the same address with ?folio-build=<token>, an address no browser has cached, whose code
   addresses carry the new token. Checked first thing at boot, before sign-in draws anything. Once per token, so it
   cannot loop; a development copy has neither the meta nor the file and is left alone. */
export const TOKEN_META = 'folio-asset-token';

export function staleReload(id, { doc = document, loc = location, store = sessionStorage } = {}) {
  try {
    const token = id?.assetToken, page = doc.querySelector(`meta[name="${TOKEN_META}"]`)?.content;
    if (!token || !page || token === page) return false;
    const key = `folio-asset-reload:${token}`;
    if (store.getItem(key)) return false;
    store.setItem(key, '1');
    const u = new URL(loc.href); u.searchParams.set('folio-build', token); loc.replace(u.toString());
    return true;
  } catch { return false; /* without session storage the old page keeps running; the next visit loads the new one */ }
}

export function checkBuildFreshness() {
  if (typeof document === 'undefined' || !document.querySelector(`meta[name="${TOKEN_META}"]`)) return Promise.resolve(false);
  return fetch('BUILD-ID.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((id) => staleReload(id)).catch(() => false);
}
