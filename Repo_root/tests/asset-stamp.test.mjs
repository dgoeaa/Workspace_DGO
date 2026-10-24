/* Every Workspace build loads its own code (scripts/lib/asset-stamp.mjs, 2026-10-22). Run over the real Workspace files:
   nothing relative is left unstamped, every import of a module gets the same address, and nothing else changes.
   tests/asset-stamp.spec.js boots the stamped copy in a browser. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampJs, stampCss, stampHtml, stampTree, assetToken, TOKEN_META } from '../scripts/lib/asset-stamp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = ['index.html', 'acknowledge.html', 'index_Bulk.html', 'support.html', 'assets', 'config', 'core', 'modules', 'shared', 'styles'];
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`  ✅ ${name}`); } catch (e) { fail++; console.log(`  ❌ ${name}\n       ${e.message}`); } };
const walk = (d, b = d, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, b, o) : o.push(path.relative(b, p).split(path.sep).join('/')); } return o; };

console.log('\nAsset stamping (every build loads its own code)\n');

t('every form of relative import is versioned; bare, absolute and already-versioned addresses are left alone', () => {
  /* The samples name no real file: '~/' stands for './' and '~~/' for '../', so the repository's reference check
     (tests/references.test.mjs) does not read them as links. */
  const src = [
    "import { a } from '~/a.js';",
    "import {\n  b,\n} from '~~/config/b.config.js';",
    "export * from \"~/c.js\";",
    "import '~/side.js';",
    "const m = () => import('~~/modules/home.js');",
    "import x from 'https://cdn.example/x.js';",
    "import y from '/core/y.js';",
    "import z from '~/z.js?v=old';",
    "const s = 'from ~/not-an-import.js';",
  ].join('\n').replace(/~~\//g, '../').replace(/~\//g, './');
  const out = stampJs(src, 'T');
  for (const s of ["'./a.js?v=T'", "'../config/b.config.js?v=T'", '"./c.js?v=T"', "'./side.js?v=T'", "'../modules/home.js?v=T'"]) assert.ok(out.includes(s), s);
  for (const s of ["'https://cdn.example/x.js'", "'/core/y.js'", "'./z.js?v=old'", "'from ./not-an-import.js'"]) assert.ok(out.includes(s), s);
});

t('a page versions its local scripts and stylesheets and names the token; a stylesheet versions its @imports', () => {
  const html = stampHtml('<html><head><link rel="stylesheet" href="styles/index.css"><script src="config/config.local.js"></script><script type="module" src="core/boot.js"></script><script src="https://x.example/a.js"></script></head></html>', 'T');
  assert.ok(html.includes('href="styles/index.css?v=T"') && html.includes('src="config/config.local.js?v=T"') && html.includes('src="core/boot.js?v=T"'));
  assert.ok(html.includes('src="https://x.example/a.js"') && html.includes(`<meta name="${TOKEN_META}" content="T">`));
  assert.ok(stampCss('@import url("dgo-design-system/a.css") layer(tokens);', 'T').includes('url("dgo-design-system/a.css?v=T")'));
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgo-stamp-'));
for (const f of SITE) fs.cpSync(path.join(ROOT, f), path.join(tmp, f), { recursive: true });
const before = Object.fromEntries(walk(tmp).map((f) => [f, fs.readFileSync(path.join(tmp, f))]));
const token = assetToken(tmp);
const { changed } = stampTree(tmp, { token });

t('the real Workspace: no relative import, script or stylesheet address is left without the token', () => {
  const left = [];
  for (const f of walk(tmp)) {
    const s = fs.readFileSync(path.join(tmp, f), 'utf8');
    if (/\.m?js$/.test(f)) for (const m of s.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)(['"])(\.{1,2}\/[^'"\n]+?\.m?js)(\?[^'"]*)?\1/gm)) { if (m[3] !== `?v=${token}`) left.push(`${f}: ${m[2]}${m[3] || ''}`); }
    if (/\.html$/.test(f)) for (const m of s.matchAll(/(?:src|href)="((?!https?:|\/\/|#|data:|mailto:)[^"]+\.(?:m?js|css))(\?[^"]*)?"/g)) { if (m[2] !== `?v=${token}`) left.push(`${f}: ${m[1]}${m[2] || ''}`); }
  }
  assert.deepEqual(left.slice(0, 10), []);
  assert.ok(changed > 100, `only ${changed} files changed`);
});

t('the real Workspace: index.html names the token, and only addresses changed', () => {
  assert.ok(fs.readFileSync(path.join(tmp, 'index.html'), 'utf8').includes(`<meta name="${TOKEN_META}" content="${token}">`));
  for (const f of walk(tmp)) {
    const a = before[f].toString('utf8'), b = fs.readFileSync(path.join(tmp, f), 'utf8');
    if (a === b) continue;
    const undo = b.split(`?v=${token}`).join('').replace(new RegExp(`\\n\\s*<meta name="${TOKEN_META}" content="${token}">`), '');
    assert.equal(undo, a, `${f} changed beyond its addresses`);
  }
});

t('the token follows the content: the same tree gives the same token, a changed file a new one', () => {
  const again = fs.mkdtempSync(path.join(os.tmpdir(), 'dgo-stamp-'));
  for (const f of SITE) fs.cpSync(path.join(ROOT, f), path.join(again, f), { recursive: true });
  assert.equal(assetToken(again), token);
  fs.appendFileSync(path.join(again, 'core', 'boot.js'), '\n');
  assert.notEqual(assetToken(again), token);
  fs.rmSync(again, { recursive: true, force: true });
});

fs.rmSync(tmp, { recursive: true, force: true });

/* The Portal: its pages, stylesheets and service worker. sw.js is stamped as config:rebuild leaves it after the packager has
   written its endpoint digest into BUILD. */
const portal = fs.mkdtempSync(path.join(os.tmpdir(), 'dgo-stamp-portal-'));
fs.cpSync(path.join(ROOT, 'document-portal'), portal, { recursive: true });
fs.writeFileSync(path.join(portal, 'sw.js'), fs.readFileSync(path.join(portal, 'sw.js'), 'utf8').replace("const BUILD = 'dev';", "const BUILD = 'endpointdigest';"));
const ptoken = assetToken(portal);
stampTree(portal, { token: ptoken });
const sw = fs.readFileSync(path.join(portal, 'sw.js'), 'utf8');
const shell = new Set([...(/const SHELL = \[([\s\S]*?)\];/.exec(sw) || ['', ''])[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));

t('the Portal: the service worker cache follows the token, so every build opens a new cache', () => {
  assert.ok(sw.includes(`const BUILD = 'endpointdigest-${ptoken}';`));
  const code = [...shell].filter((s) => /\.(m?js|css)(\?|$)/.test(s));
  assert.ok(code.length > 10 && code.every((s) => s.endsWith(`?v=${ptoken}`)), code.filter((s) => !s.endsWith(`?v=${ptoken}`)).join(' '));
});

t('the Portal: every code address a page or stylesheet requests is the very entry the offline shell holds', () => {
  const miss = [];
  const listed = new Set([...shell].map((s) => s.split('?')[0]));
  const check = (fromFile, ref) => {
    const at = path.posix.normalize(path.posix.join(path.posix.dirname(`./${fromFile}`), ref.split('?')[0]));
    const key = at.startsWith('.') ? at : `./${at}`;
    if (!listed.has(key)) return;
    if (!shell.has(`${key}?${ref.split('?')[1] || ''}`)) miss.push(`${fromFile} → ${ref}`);
  };
  for (const f of walk(portal)) {
    const s = fs.readFileSync(path.join(portal, f), 'utf8');
    if (f.endsWith('.html')) {
      assert.ok(s.includes(`<meta name="${TOKEN_META}" content="${ptoken}">`), `${f} names no token`);
      for (const m of s.matchAll(/(?:src|href)="((?!https?:|\/\/|#|data:|mailto:)[^"]+\.(?:m?js|css)(?:\?[^"]*)?)"/g)) check(f, m[1]);
    }
    if (f.endsWith('.css')) for (const m of s.matchAll(/@import\s+url\(\s*["']?([^"')]+\.css(?:\?[^"')]*)?)["']?\s*\)/g)) check(f, m[1]);
  }
  assert.deepEqual(miss, []);
});
fs.rmSync(portal, { recursive: true, force: true });

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
