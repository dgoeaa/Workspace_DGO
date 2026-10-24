// Build the published mailer as ONE self-contained file, mailer.html: the stylesheet inlined,
// every JavaScript module embedded and wired together with an import map, and the deployment's
// configuration (the seven flow addresses; no key) embedded. Publishing is then a single upload
// into the folder that holds the platform's index.html, and nothing can be left half-copied.
//
//   bundleMailer(webDir, { endpoints, version }) -> the HTML text
//
// How the modules are embedded: each relative import ("./store.js", "../ui.js") is rewritten to
// a bare name ("dgo/js/store.js"), and a <script type="importmap"> maps every name to a data:
// URL holding that module. The Content-Security-Policy allows exactly that: data: scripts, plus
// the one inline import map by its SHA-256 hash. No 'unsafe-inline' script is allowed.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const posix = (p) => p.split(path.sep).join('/');
const dataUrl = (type, text) => `data:${type};base64,${Buffer.from(text, 'utf8').toString('base64')}`;
const MEDIA = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

/* The design system's files (brand/, written by `npm run brand:sync`): each image as a data: URL,
   by the path the page and the modules use for it ("brand/<file>"). */
function brandImages(webDir) {
  const dir = path.join(webDir, 'brand');
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const type = MEDIA[path.extname(f).toLowerCase()];
    if (type) out[`brand/${f}`] = `data:${type};base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}`;
  }
  return out;
}
const withImages = (text, images) => text.replace(/(["'(])(brand\/[A-Za-z0-9._-]+)(["')])/g, (m, a, ref, b) => (images[ref] ? `${a}${images[ref]}${b}` : m));
const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"\s]+)\2/g;

function modulesOf(webDir) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.name.endsWith('.js')) out.push(abs);
    }
  };
  walk(path.join(webDir, 'js'));
  return out.sort();
}

/** The name a module is known by in the import map: "dgo/" + its path under web/. */
const nameOf = (webDir, abs) => `dgo/${posix(path.relative(webDir, abs))}`;

export function bundleMailer(webDir, { endpoints = null, version = '', flows = '' } = {}) {
  let html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
  const need = (marker) => { if (!html.includes(marker)) throw new Error(`index.html no longer contains ${marker}; update bundle.mjs`); };

  const images = brandImages(webDir);

  /* 1. Modules. */
  const imports = {};
  for (const abs of modulesOf(webDir)) {
    const src = fs.readFileSync(abs, 'utf8').replace(IMPORT_RE, (m, lead, q, spec) => {
      const target = path.resolve(path.dirname(abs), spec);
      if (!fs.existsSync(target)) throw new Error(`${posix(path.relative(webDir, abs))} imports ${spec}, which does not exist`);
      return `${lead}${q}${nameOf(webDir, target)}${q}`;
    });
    imports[nameOf(webDir, abs)] = dataUrl('text/javascript', withImages(src, images));
  }
  const importMap = JSON.stringify({ imports });
  const hash = crypto.createHash('sha256').update(importMap, 'utf8').digest('base64');

  /* 2. Configuration, as classic scripts that run before the modules. */
  const config = [
    fs.readFileSync(path.join(webDir, 'config.js'), 'utf8'),
    endpoints ? `window.DGO_MAILER_CONFIG_LOCAL = ${JSON.stringify({ endpoints })};` : '',
    `window.DGO_MAILER_VERSION = ${JSON.stringify(version)};`,
    /* The fingerprint of the flows setup installed, so a later refresh can tell whether they match. */
    flows ? `window.DGO_MAILER_FLOWS = ${JSON.stringify(flows)};` : '',
    'window.DGO_MAILER_PUBLISHED = true;',
  ].join('\n');

  /* 3. Assemble. */
  const css = fs.readFileSync(path.join(webDir, 'css', 'mailer.css'), 'utf8');
  if (css.includes('</style')) throw new Error('mailer.css contains "</style"');
  need("script-src 'self';");
  /* Every insertion uses a replacer function: a replacement STRING would treat $&, $', $` and $1
     in the inserted text (CSS, scripts) as patterns and corrupt the page. */
  html = html.replace("script-src 'self';", () => `script-src 'self' data: 'sha256-${hash}';`);
  need('<link rel="stylesheet" href="css/mailer.css">');
  html = html.replace('<link rel="stylesheet" href="css/mailer.css">', () => `<style>\n${css}\n</style>`);
  const cfgStart = html.indexOf('<script src="config.js"></script>');
  const cfgEnd = html.indexOf('<script src="config.local.js"></script>');
  if (cfgStart < 0 || cfgEnd < cfgStart) throw new Error('index.html no longer loads config.js then config.local.js; update bundle.mjs');
  html = `${html.slice(0, cfgStart)}<script src="${dataUrl('text/javascript', config)}"></script>${html.slice(cfgEnd + '<script src="config.local.js"></script>'.length)}`;
  /* The design system: its stylesheet inlined, its script embedded, its images as data: URLs. */
  if (html.includes('brand/')) {
    const brandCss = fs.readFileSync(path.join(webDir, 'brand', 'brand.css'), 'utf8');
    if (brandCss.includes('</style')) throw new Error('brand/brand.css contains "</style"');
    need('<link rel="stylesheet" href="brand/brand.css">');
    html = html.replace('<link rel="stylesheet" href="brand/brand.css">', () => `<style>\n${withImages(brandCss, images)}\n</style>`);
    need('<script src="brand/brand.js"></script>');
    html = html.replace('<script src="brand/brand.js"></script>', () => `<script src="${dataUrl('text/javascript', withImages(fs.readFileSync(path.join(webDir, 'brand', 'brand.js'), 'utf8'), images))}"></script>`);
    html = withImages(html, images);
    const left = html.match(/["'(]brand\/[^"')]+/);
    if (left) throw new Error(`index.html still refers to ${left[0].slice(1)}, which the bundle does not hold; update bundle.mjs`);
  }
  need('<script type="module" src="js/app.js"></script>');
  html = html.replace('<script type="module" src="js/app.js"></script>',
    () => `<script type="importmap">${importMap}</script>\n  <script type="module" src="${dataUrl('text/javascript', 'import "dgo/js/app.js";')}"></script>`);
  return html;
}
