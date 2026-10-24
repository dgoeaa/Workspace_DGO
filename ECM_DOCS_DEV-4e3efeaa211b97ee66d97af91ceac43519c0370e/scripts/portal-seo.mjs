#!/usr/bin/env node
/**
 * Make the portal indexable by absolutising sitemap.xml and robots.txt.
 *
 *   node scripts/portal-seo.mjs --origin https://portal.example.gov.ng
 *   node scripts/portal-seo.mjs --check
 *
 * WHY THIS IS A SCRIPT AND NOT A HAND EDIT
 * The sitemaps.org 0.9 protocol requires every <loc> to be absolute, and a relative Sitemap:
 * directive in robots.txt is ignored outright — so both files as shipped are rejected and the
 * public portal is not indexable. Both carry that requirement in a comment at the point of use,
 * which is right, and which nobody has yet acted on.
 *
 * IT WILL NOT GUESS THE ORIGIN. The register is explicit that this repository does not hold the
 * deployed origin and must not invent one, so --origin is required and is validated: an absolute
 * http(s) URL, a host, no path, no trailing slash, no query. The one value this needs is the one
 * value only the running platform can give (ITEM-8), and inventing it here would produce a file
 * that looks finished and indexes nothing.
 *
 * Idempotent: absolutising an already-absolute file changes nothing, and --check reports whether
 * the deploy-time step has been done without touching either file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? '' : (process.argv[i + 1] || ''); };
const CHECK = process.argv.includes('--check');
const root = new URL('../', import.meta.url);
const P = (p) => fileURLToPath(new URL(p, root));
const SITEMAP = P('document-portal/sitemap.xml');
const ROBOTS = P('document-portal/robots.txt');

const readAll = () => ({ sitemap: readFileSync(SITEMAP, 'utf8'), robots: readFileSync(ROBOTS, 'utf8') });
const relLoc = /<loc>(\/[^<]*)<\/loc>/g;
const relSitemapLine = /^(Sitemap:\s*)(\/.*)$/m;

if (CHECK) {
  const { sitemap, robots } = readAll();
  const strip = (x) => x.replace(/<!--[\s\S]*?-->/g, '');
  const locs = [...strip(sitemap).matchAll(relLoc)].map((m) => m[1]);
  const rob = robots.replace(/^#.*$/gm, '').match(relSitemapLine);
  const done = locs.length === 0 && !rob;

  /* A second staleness, which the first version of this check could not see because it strips
     comments before looking. While the <loc>s were relative the comment correctly told a reader
     to prefix them by hand. Once they are absolute that instruction is not merely spent, it is
     harmful: following it yields https://host/https://host/index.html. So when the file is
     absolute, its own prose must no longer ask anyone to make it so. */
  const STALE = /prefix each <loc>|Replace this with the deployed origin|is REJECTED by search engines|paths below are relative/i;
  const stale = [['sitemap.xml', sitemap], ['robots.txt', robots]]
    .filter(([, text]) => STALE.test(text)).map(([n]) => n);
  if (!done) {
    console.log(`❌ portal SEO: ${locs.length} relative <loc>${locs.length === 1 ? '' : 's'} in sitemap.xml` +
                `${rob ? ', and robots.txt Sitemap: is relative' : ''} — search engines reject both`);
    console.log('   node scripts/portal-seo.mjs --origin <the deployed origin>');
    process.exit(1);
  }
  if (stale.length) {
    console.log(`❌ portal SEO: ${stale.join(' and ')} still instruct a reader to prefix URLs that are ` +
                'already absolute — following that comment produces https://host/https://host/…');
    process.exit(1);
  }
  console.log('✅ portal SEO: sitemap.xml and robots.txt are absolute, and say so');
  process.exit(0);
}

const origin = arg('--origin').trim();
if (!origin) {
  console.error('--origin is required. This repository does not hold the deployed origin and will not invent one:');
  console.error('open the platform, press F12, run `location.origin`, and pass exactly what it prints.');
  process.exit(2);
}
let u;
try { u = new URL(origin); } catch { console.error(`not a URL: ${origin}`); process.exit(2); }
if (!/^https?:$/.test(u.protocol)) { console.error(`origin must be http(s): ${origin}`); process.exit(2); }
if (u.pathname !== '/' || u.search || u.hash) { console.error(`origin must be scheme and host only, no path or query: ${origin}`); process.exit(2); }
if (origin.endsWith('/')) { console.error(`drop the trailing slash: ${origin.slice(0, -1)}`); process.exit(2); }
if (u.protocol === 'http:') console.log(`⚠ ${origin} is http, so every indexed URL is unencrypted.`);

/* The shipped comment demonstrates the fix with a <loc>https://YOUR-DEPLOYED-ORIGIN/…</loc>
   example. Rewriting the document must not rewrite the instructions, and verifying it must not
   read them: strip comments first, both times. The first version of this script verified across
   them and reported its own success as a failure. */
const decomment = (x) => x.replace(/<!--[\s\S]*?-->/g, '');
const { sitemap, robots } = readAll();
const outSitemap = sitemap.replace(/<!--[\s\S]*?-->|<loc>(\/[^<]*)<\/loc>/g,
  (m, p) => (p === undefined ? m : `<loc>${origin}${p}</loc>`));
const outRobots = robots.replace(relSitemapLine, (_, k, p) => `${k}${origin}${p}`);
const changed = (outSitemap !== sitemap ? 1 : 0) + (outRobots !== robots ? 1 : 0);
if (outSitemap !== sitemap) writeFileSync(SITEMAP, outSitemap);
if (outRobots !== robots) writeFileSync(ROBOTS, outRobots);

const locs = [...decomment(outSitemap).matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
const bad = locs.filter((l) => !l.startsWith(origin + '/'));
if (bad.length) { console.error(`✗ still not absolute: ${bad.join(', ')}`); process.exit(1); }
if (/^Sitemap:\s*\//m.test(outRobots.replace(/^#.*$/gm, ''))) { console.error('✗ robots.txt Sitemap: is still relative'); process.exit(1); }
console.log(changed ? `✅ ${locs.length} <loc> and the robots.txt Sitemap: directive now absolute against ${origin}` : `✅ already absolute against ${origin} — nothing to change`);
