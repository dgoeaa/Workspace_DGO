/**
 * The design system's tokens, as text a generator can write into a standalone page.
 *
 * WHY THIS EXISTS
 *
 * The generated reference pages open on their own — from a download, a memory stick, a
 * locked-down tenant machine — so they cannot link `styles/dgo-design-system/`. Until now each
 * generator answered that by inventing a palette of its own, which is why they drifted off-brand.
 * This module is the other answer: it reads the token files at BUILD time and returns their text,
 * and the generator writes that text inside the page's own <style>. The finished file carries the
 * brand values themselves. It references nothing outside itself, and every `var()` in it resolves
 * against a declaration in the same file.
 *
 * WHAT IS INCLUDED
 *
 *   primitive, semantic  the brand palette and the intent-named tokens built on it
 *   theme-light          the default binding, on :root
 *   theme-dark           written TWICE: once behind the system dark preference (guarded against
 *                        an explicit light choice) and once behind the explicit [data-theme="dark"]
 *                        stamp. The design system itself only honours the stamp, because the
 *                        runtime always sets one; a standalone page has to resolve the unstamped
 *                        system default too.
 *
 * The token files must stay free of url(), @import and @font-face. If one ever gains a reference
 * to another file, a copied page would silently lose it, so this module refuses to build rather
 * than emit a page that is only portable on the machine that built it.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DIR = 'styles/dgo-design-system/tokens';

const read = (name) => readFileSync(join(ROOT, DIR, name), 'utf8');

const DARK_STAMP = '[data-theme="dark"]';

function assertSelfContained(name, css) {
  const found = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/url\(|@import|@font-face/);
  if (found) {
    throw new Error(`${DIR}/${name} contains ${found[0]} — a page built from it would not be self-contained`);
  }
}

/** The declarations inside the single `[data-theme="dark"] { … }` block. */
function darkDeclarations() {
  const css = read('tokens.theme-dark.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const at = css.indexOf(DARK_STAMP);
  const open = css.indexOf('{', at);
  const close = css.lastIndexOf('}');
  if (at < 0 || open < 0 || close < open || css.slice(close + 1).trim()) {
    throw new Error(`${DIR}/tokens.theme-dark.css is no longer a single ${DARK_STAMP} block; update scripts/lib/brand-tokens.mjs`);
  }
  return css.slice(open + 1, close).trim();
}

/** The brand tokens as CSS text, ready to write inside a standalone page's <style>. */
export function brandTokensCss() {
  const files = ['tokens.primitive.css', 'tokens.semantic.css', 'tokens.theme-light.css', 'tokens.theme-dark.css', 'tokens.platforms.css'];
  for (const f of files) assertSelfContained(f, read(f));
  const dark = darkDeclarations();
  return [
    `/* ── Brand tokens: copied from ${DIR}/ at build time by scripts/lib/brand-tokens.mjs.`,
    `   Edit the design system and rebuild; do not edit these values here. ── */`,
    read('tokens.primitive.css').trim(),
    read('tokens.semantic.css').trim(),
    read('tokens.theme-light.css').trim(),
    `@media (prefers-color-scheme: dark){\n:root:not([data-theme="light"]){\n${dark}\n}\n}`,
    `:root${DARK_STAMP}{\n${dark}\n}`,
    /* Tier 3 platform bindings: <html data-platform="…"> picks the variant. */
    read('tokens.platforms.css').trim(),
    `/* ── End of brand tokens ── */`,
  ].join('\n\n');
}
