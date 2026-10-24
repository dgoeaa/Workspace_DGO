#!/usr/bin/env node
/**
 * Every reference in the tracked tree resolves to something that exists.
 *
 * `npm run test:links` crawls both applications with a browser-shaped link checker. It
 * needs a running server, and it checks rendered pages — never the documentation, which is
 * where the broken references actually were: an audit citing a tree that was retired, a
 * README pointing at a script that was renamed, a deployment procedure linking a file that
 * moved. (That crawl was `continue-on-error` in CI while it still reached external hosts.
 * It no longer reaches any — every off-origin fetch is gone from both trees and the one
 * outbound link is skipped by name — so it is a blocking job now too. This one is still
 * the only check that reads `docs/`.)
 *
 * This is the blocking half. No server, no network, no dependencies: it reads the tracked
 * files and resolves every relative reference on disk. It is deterministic, runs in under a
 * second offline, and it fails the build.
 *
 * The two checks are complementary and neither replaces the other. This one cannot tell you
 * a CDN went away; the crawler cannot tell you a markdown link in `docs/` is dangling.
 *
 * Run: node tests/references.test.mjs
 */

import fs from 'node:fs';
import { trackedFiles as askGit } from '../scripts/lib/tracked-files.mjs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The harvest is excluded, and only the harvest.
 *
 * `docs/reference/foundational/` is raw material kept for evidence — vendor HTML exports,
 * canvas dumps, SPA snapshots — full of references to hosts, files and trees that were
 * never part of this repository. Checking it would report hundreds of dangling references
 * that are correct, because a verbatim record of something else is supposed to point at
 * something else. `docs/README.md` classifies it as *Harvest: untrusted, prefer the
 * contract over the sample*, and this exclusion follows that classification rather than
 * inventing a new one.
 */
const EXCLUDED = ['docs/reference/foundational/'];

/** Markdown link and image targets. */
const MD_LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
/** HTML src/href, and CSS url() and @import. */
const HTML_REF = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
const CSS_URL = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.\-]*:/;

/** Is this a reference to a file in this repository? */
function isLocal(ref) {
  if (!ref) return false;
  if (HAS_SCHEME.test(ref)) return false;   // http:, mailto:, tel:, data:
  if (ref.startsWith('//')) return false;   // protocol-relative
  if (ref.startsWith('#')) return false;    // same-document anchor
  if (ref.startsWith('{{') || ref.includes('${')) return false; // templated at runtime
  /* Power Automate binds with `@{...}`, which is the same case as the two above and was simply
     a syntax this rule had not met. The email templates under
     docs/deployment/notification-instrument/email-templates/deploy/ carry it in href and src —
     `@{coalesce(outputs(...))}` is a value the flow substitutes at send time, not a path on
     disk. Reported as 113 broken references on import. Narrow by construction: a ref must
     actually contain the binding delimiter, so an ordinary broken relative link is untouched. */
  if (ref.includes('@{')) return false;     // Power Automate binding, substituted at send time
  return true;
}

function trackedFiles() {
  /* Via the shared reader, which refuses an empty answer. This suite printed
     "✅ … (0 across 0 tracked files)" when git answered for a different repository. */
  return askGit({ root: ROOT, what: 'files to check references in' })
    .filter(f => !EXCLUDED.some(p => f.startsWith(p)));
}

/**
 * Resolve a reference the way the thing that reads it would.
 *
 * Markdown and CSS resolve relative to the file. An HTML `src="/x"` resolves to the site
 * root, which for the portal is `document-portal/` and for the runtime is the repository
 * root — so a root-relative reference is checked against both, and counts as resolved if
 * either exists. Getting that wrong in the strict direction would report the portal's own
 * absolute paths as broken.
 */
function candidates(fromFile, ref) {
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean) return [];
  if (clean.startsWith('/')) {
    const rel = clean.slice(1);
    return [rel, path.join('document-portal', rel)];
  }
  const relativeToFile = path.normalize(path.join(path.dirname(fromFile), clean));

  /* A dynamic import inside a Playwright spec runs in the PAGE, not in Node: it is written
     `import('./core/state.js')` inside `page.evaluate()` and the browser resolves it
     against the served document, which is the site root. Resolving those against
     `tests/` reported 28 of them broken while every one loads correctly. The site root is
     therefore a second candidate for a browser-evaluated file. */
  if (/\.spec\.js$/.test(fromFile)) {
    return [relativeToFile, path.normalize(clean), path.join('document-portal', path.normalize(clean))];
  }
  return [relativeToFile];
}

let passed = 0;
const failures = [];
const t = (label, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${label}`); }
  catch (e) { failures.push(label); console.log(`  ❌ ${label}\n       ${e.message}`); }
};

console.log('\nReference integrity');

const files = trackedFiles();
const broken = [];
let checked = 0;

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  if (!['.md', '.html', '.css', '.js', '.mjs'].includes(ext)) continue;

  let text;
  try { text = fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch { continue; }

  /* Comments are stripped from code before extraction. A path named in a comment is prose
     about a reference, not a reference — and this file proved it: the paragraph explaining
     how `import('./core/state.js')` resolves inside `page.evaluate()` was itself matched,
     so the gate reported its own documentation as a broken link. Left unfixed, the standing
     incentive is to stop explaining things in comments, which is the wrong lesson entirely.

     Markdown is not stripped: a link inside an HTML comment in a document is still a link a
     reader can find by viewing source, and a dangling one is still worth reporting. */
  if (/\.(js|mjs|css)$/i.test(file)) {
    text = text.replace(/\/\*[\s\S]*?\*\//g, '');
    if (!/\.css$/i.test(file)) text = text.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  }

  /* A `<script type="application/json">` block in an HTML page is data the page reads at
     runtime, not markup a browser resolves. `docs/deployment/readiness-tracker.html` proved
     it: its seeded state quotes the commissioning warning "55 signed trigger URL(s) are
     committed", and `URL(s)` matched CSS_URL — reporting a sentence of English prose as a
     broken reference to a file named `s`. Stripping the block follows the same rule as
     stripping comments above: prose about a reference is not a reference. Markup outside
     the block is still checked, and a genuine `href` inside a JSON string was never
     resolvable by a browser in the first place. */
  if (ext === '.html') {
    text = text.replace(/<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>[\s\S]*?<\/script>/gi, '');
  }

  const refs = [];
  if (ext === '.md') {
    for (const m of text.matchAll(MD_LINK)) refs.push(m[1]);
  } else if (ext === '.html') {
    for (const m of text.matchAll(HTML_REF)) refs.push(m[1]);
    /* CSS `url()` never occurs inside a `<script>` body, and the WHATWG `URL` API does:
       `tools/flow-workbench/index.html` calls `new URL(u)`, `URL.createObjectURL(blob)` and
       `URL.revokeObjectURL(url)`, and CSS_URL — case-insensitive by necessity, since CSS is —
       read all four as references to files named `u`, `blob` and `url`. This is the same
       defect the JSON-block strip above exists for, one block type further out: the pattern
       is right for CSS and wrong everywhere else, so it runs over the markup with script
       bodies removed. HTML_REF still sees the whole document, so `<script src>` is unaffected. */
    const markup = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    for (const m of markup.matchAll(CSS_URL)) refs.push(m[1]);
  } else if (ext === '.css') {
    for (const m of text.matchAll(CSS_URL)) refs.push(m[1]);
    for (const m of text.matchAll(/@import\s+["']([^"']+)["']/g)) refs.push(m[1]);
  } else {
    /* JS: only explicitly-relative module specifiers. `tests/check-imports.mjs` already
       walks the runtime graph from its entry points; this catches the modules that graph
       never reaches, such as a script importing a helper that was renamed. */
    for (const m of text.matchAll(/\bfrom\s*['"](\.[^'"\n]+)['"]/g)) refs.push(m[1]);
    for (const m of text.matchAll(/\bimport\s*\(\s*['"](\.[^'"\n]+)['"]\s*\)/g)) refs.push(m[1]);
  }

  for (const ref of refs) {
    if (!isLocal(ref)) continue;
    /* The deploy-time endpoint configuration is absent by design in a clone — its tag
       carries onerror="void 0" and `npm run package` provisions it into a delivered
       package. A miss here is the intended state, not a broken reference. */
    if (/config\.local\.js$/.test(ref)) continue;
    checked++;
    const options = candidates(file, ref);
    if (!options.some(c => c && !c.startsWith('..') && fs.existsSync(path.join(ROOT, c)))) {
      broken.push({ file, ref });
    }
  }
}

/* ARCHIVED MATERIAL IS SCANNED, NOT EXEMPTED, AND ITS BREAKAGE IS PINNED AT ZERO.
   docs/archive/ held faithful copies of repositories being retired, whose internal links
   reflected the state they were retired in — repairing one would have falsified the record, so
   the tree was scanned like everything else and its breakage pinned at the 16 it arrived with.
   That tree is no longer carried, so the honest pin is now zero.
   The guard stays rather than being deleted, because the reason for it has not changed: adding
   an archive to EXCLUDED would make it, in that guard's own words, "a place broken references
   can hide". If archived material is ever imported again it will be scanned on arrival, and any
   breakage it brings raises this number and fails here rather than passing unnoticed. */
const ARCHIVE = 'docs/archive/';
const ARCHIVE_KNOWN_BROKEN = 0;
const liveBroken = broken.filter(b => !b.file.startsWith(ARCHIVE));
const archiveBroken = broken.filter(b => b.file.startsWith(ARCHIVE));

t(`every relative reference outside the archive resolves on disk (${checked} across ${files.length} tracked files)`, () => {
  if (liveBroken.length) {
    const detail = liveBroken.slice(0, 20).map(b => `${b.file} → ${b.ref}`).join('\n       ');
    throw new Error(`${liveBroken.length} broken:\n       ${detail}` +
      (liveBroken.length > 20 ? `\n       … and ${liveBroken.length - 20} more` : ''));
  }
});

t(`archived material carries exactly the breakage it arrived with (${ARCHIVE_KNOWN_BROKEN})`, () => {
  if (archiveBroken.length !== ARCHIVE_KNOWN_BROKEN) {
    const detail = archiveBroken.slice(0, 10).map(b => `${b.file} → ${b.ref}`).join('\n       ');
    throw new Error(`archive broken references are ${archiveBroken.length}, pinned at ${ARCHIVE_KNOWN_BROKEN}.\n` +
      `       If an import added breakage, fix the import rather than the number.\n       ${detail}`);
  }
});

/* A guard on the guard. If the extraction silently stopped matching — a regex edited, an
   extension dropped — this suite would pass by checking nothing, which is the failure mode
   it exists to prevent elsewhere. */
t('the checker is actually reading references', () => {
  if (checked < 200) throw new Error(`only ${checked} references extracted; the matchers have stopped matching`);
});

t('the harvest is excluded deliberately, and it is the only exclusion', () => {
  if (EXCLUDED.length !== 1 || EXCLUDED[0] !== 'docs/reference/foundational/') {
    throw new Error(`exclusions have grown to: ${EXCLUDED.join(', ')} — each one is a place broken references can hide`);
  }
});

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
