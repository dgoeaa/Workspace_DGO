#!/usr/bin/env node
/**
 * Keep every copy of the brand in step with styles/dgo-design-system/.
 *
 *   npm run brand:sync           rewrite every packaged brand/ folder and every embedded block
 *   npm run brand:sync -- --check  change nothing; fail if any copy differs from the source
 *
 * PACKAGES are folders that ship as a unit and load brand/brand.css + brand/brand.js by a
 * relative link, so a copy of the folder anywhere still carries the brand.
 *
 * EMBEDDED pages are single files. Each carries a fenced block
 * (<!-- brand:kit:start --> … <!-- brand:kit:end -->) that this script regenerates in place;
 * everything outside the fence is the page's own and is never touched.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, packageFiles, refreshBlock, refreshLogos, refreshSubs, KIT_START } from './lib/brand-kit.mjs';

const CHECK = process.argv.includes('--check');

/** Folders that ship as one package. Their own CSS may use only --dgo-* / --bk-* names. */
export const PACKAGES = [
  'docs/visual',
  'docs/folio-Master-Flows-and-Endpoints/provisioning',
  'mailer',
  'tools/admin-centre/static',
  'tools/hub',
];

const drift = [];
let written = 0;

function put(rel, content) {
  const abs = join(ROOT, rel);
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const prev = existsSync(abs) ? readFileSync(abs) : null;
  if (prev && prev.equals(next)) return;
  if (CHECK) { drift.push(rel); return; }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, next);
  written++;
}

for (const pkg of PACKAGES) {
  /* A packaged page's lockup slots are refreshed in place, like an embedded page's. */
  for (const f of readdirSync(join(ROOT, pkg)).filter((f) => f.endsWith('.html'))) {
    const rel = `${pkg}/${f}`;
    const html = readFileSync(join(ROOT, rel), 'utf8');
    if (html.includes('data-bk-sub')) put(rel, refreshSubs(html));
  }
  const files = packageFiles();
  const expected = new Set(files.map(([name]) => name));
  for (const [name, content] of files) put(`${pkg}/brand/${name}`, content);
  const dir = join(ROOT, pkg, 'brand');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) if (!expected.has(f)) drift.push(`${pkg}/brand/${f} (not produced by the kit; remove it)`);
  }
}

const tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '*.html'], { cwd: ROOT, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);
const embedded = [];
let slotted = 0;
for (const rel of tracked) {
  const html = readFileSync(join(ROOT, rel), 'utf8');
  if (html.includes(KIT_START)) {
    embedded.push(rel);
    put(rel, refreshSubs(refreshLogos(refreshBlock(html))));
  } else if (html.includes('data-bk-sub')) {
    /* A page that links the design system (the runtime) still carries the DGO lockup markup,
       in a <template> its script clones; keep that copy current too. */
    slotted++;
    put(rel, refreshSubs(html));
  }
}

if (CHECK) {
  if (drift.length) {
    console.error(`\n  ✖  ${drift.length} brand cop${drift.length === 1 ? 'y has' : 'ies have'} drifted from styles/dgo-design-system/:`);
    for (const d of drift) console.error(`     · ${d}`);
    console.error('     Run: npm run brand:sync\n');
    process.exit(1);
  }
  console.log(`\n  ✅ Brand copies match the source: ${PACKAGES.length} packages, ${embedded.length} embedded pages.\n`);
} else {
  console.log(`\n  ✅ brand:sync — ${written} file(s) updated across ${PACKAGES.length} packages and ${embedded.length} embedded pages.\n`);
}
