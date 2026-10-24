/**
 * Every Workspace and Portal build loads its own code, whatever the host or a service worker caches (2026-10-22, ITEM-93).
 *
 * The site's .htaccess asks the host to revalidate code on every load (2026-10-09), but after the uploads of 2026-10-22
 * a browser still ran JavaScript from two builds before: the Workspace started without its data, and a staff notice went
 * out in the pre-2026-10-21 design. Whether the host ignores the file or the upload drops it, the fix cannot depend on
 * the host. So config:rebuild gives every code address a token taken from the tree's own content:
 *
 *   - index.html and the site's other pages: each local script and stylesheet address gets ?v=<token>, and the page
 *     names the token in <meta name="folio-asset-token">;
 *   - every JavaScript file: each relative import (static, re-export, side-effect and literal dynamic import) gets the
 *     same ?v=<token>. Every import of a module is rewritten alike, so a module is never loaded under two addresses
 *     (which would run it twice and split shared state such as the State store);
 *   - every stylesheet: each relative @import gets ?v=<token>.
 *
 * The token is the tree's code fingerprint and config digest before stamping, so the same code and config give the
 * same token in every build and a change to either gives a new one. BUILD-ID.json carries it as assetToken; the shell
 * compares it with the page's meta and reloads once when an old page is still being shown (shared/shell.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fingerprint } from './package-identity.mjs';

export const TOKEN_META = 'folio-asset-token';
const versioned = (spec, token) => (/[?#]/.test(spec) ? spec : `${spec}?v=${token}`);
const local = (spec) => /^\.{1,2}\//.test(spec) || (!/^[a-z][a-z0-9+.-]*:|^\/\/|^\/|^#|^data:/i.test(spec) && /\.(m?js|css)$/i.test(spec));

/** The token for a tree: its code and config, hashed. */
export function assetToken(tree) {
  const f = fingerprint(tree);
  return crypto.createHash('sha256').update(`${f.codeFingerprint}\0${f.configDigest}`).digest('hex').slice(0, 12);
}

/** One JavaScript source with every relative module address versioned. */
export function stampJs(src, token) {
  return src
    .replace(/(\bfrom\s*)(['"])(\.{1,2}\/[^'"\n]+?\.m?js)\2/g, (_, a, q, s) => `${a}${q}${versioned(s, token)}${q}`)
    .replace(/(\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"\n]+?\.m?js)\2(\s*\))/g, (_, a, q, s, z) => `${a}${q}${versioned(s, token)}${q}${z}`)
    .replace(/(^|[;\n]\s*)(import\s*)(['"])(\.{1,2}\/[^'"\n]+?\.m?js)\3/g, (_, p, a, q, s) => `${p}${a}${q}${versioned(s, token)}${q}`);
}

/** One stylesheet with every relative @import versioned. */
export function stampCss(src, token) {
  return src.replace(/(@import\s+url\(\s*)(['"]?)([^'")]+?\.css)\2(\s*\))/g, (m, a, q, s, z) => (local(s) ? `${a}${q}${versioned(s, token)}${q}${z}` : m))
    .replace(/(@import\s+)(['"])([^'"]+?\.css)\2/g, (m, a, q, s) => (local(s) ? `${a}${q}${versioned(s, token)}${q}` : m));
}

/** The Portal's service worker (document-portal/sw.js). Its cache name carried only a digest of the endpoint set, so a
    code change with the same addresses kept returning visitors on the cached code; the cache name now carries the token
    too, so every build opens a new cache and the old one is deleted on activation. Its precache list names the same
    versioned addresses the pages and stylesheets request, so the offline shell still holds what a page asks for. */
export function stampServiceWorker(src, token) {
  if (!/^const BUILD = '[^']*';/m.test(src)) throw new Error("sw.js has no `const BUILD = '...'` line to carry the asset token");
  const out = src.replace(/^const BUILD = '([^']*)';/m, (_, b) => `const BUILD = '${b}-${token}';`);
  const m = /const SHELL = \[([\s\S]*?)\];/.exec(out);
  if (!m) throw new Error('sw.js has no SHELL list to version');
  const list = m[1].replace(/(['"])(\.\/[^'"]+?\.(?:m?js|css))\1/g, (_, q, s) => `${q}${versioned(s, token)}${q}`);
  return out.replace(m[1], list);
}

/** One page with its local scripts and stylesheets versioned and the token named in a meta element. */
export function stampHtml(src, token) {
  let out = src.replace(/(<script\b[^>]*\bsrc=)(["'])([^"']+)\2/gi, (m, a, q, s) => (local(s) ? `${a}${q}${versioned(s, token)}${q}` : m))
    .replace(/(<link\b[^>]*\bhref=)(["'])([^"']+\.css)\2/gi, (m, a, q, s) => (local(s) ? `${a}${q}${versioned(s, token)}${q}` : m));
  if (!out.includes(`name="${TOKEN_META}"`)) out = out.replace(/<head([^>]*)>/i, `<head$1>\n  <meta name="${TOKEN_META}" content="${token}">`);
  return out;
}

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

/** Stamp a whole site tree in place; returns the token and how many files changed. `skip` names files to leave as they
    are: mailer.html is one self-contained page, published by its own package, whose digest BUILD-ID.json carries. */
export function stampTree(tree, { token = assetToken(tree), skip = ['mailer.html'] } = {}) {
  let changed = 0;
  for (const f of walk(tree)) {
    if (skip.includes(f)) continue;
    const ext = path.extname(f).toLowerCase();
    const fn = f === 'sw.js' ? stampServiceWorker
      : ext === '.js' || ext === '.mjs' ? stampJs : ext === '.css' ? stampCss : ext === '.html' || ext === '.htm' ? stampHtml : null;
    if (!fn) continue;
    const p = path.join(tree, f);
    const before = fs.readFileSync(p, 'utf8');
    const after = fn(before, token);
    if (after !== before) { fs.writeFileSync(p, after); changed++; }
  }
  return { token, changed };
}
