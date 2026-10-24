/**
 * Brand authority gate.
 *
 * `styles/dgo-design-system/` is the one master for colour, type and theme (see its README.md).
 * Before this gate, only the runtime and the portal were checked against it, so every other page
 * the repository ships — generated references, consoles, decks, email — picked a palette of its
 * own and passed the whole suite. This file makes the master enforceable:
 *
 *   1. Every live HTML output is classified. A page nobody has classified fails, so a new output
 *      has to decide how it takes the brand instead of silently inventing one.
 *   2. LINKED pages (the runtime, the portal) must load the design system's stylesheet.
 *   3. EMBEDDED pages (single files) must carry the tokens written in by
 *      `scripts/lib/brand-tokens.mjs` or the kit block written by `npm run brand:sync`, and no
 *      colour literal or stylesheet link outside them.
 *   3b. PACKAGED folders load their brand/ copy (brand.css first, then brand.js) and their own
 *      stylesheets name tokens only. `brand:sync --check`, which runs first in test:brand,
 *      proves each brand/ copy is current.
 *   4. The letterhead's core brand colours in config must equal the token values.
 *   4b. EMAIL pages state literal colours (mail clients need them), each one a palette value.
 *   5. PENDING pages are the known backlog: unbranded today, each with its reason. The list may
 *      only shrink — a pending page that already carries the tokens must be moved to EMBEDDED.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const TOKENS = 'styles/dgo-design-system/tokens';
const BLOCK_START = '── Brand tokens: copied from';
const BLOCK_END = '── End of brand tokens ──';

/** Pages that link the design system at runtime, and the stylesheet each must load. */
const LINKED = [
  { match: /^index\.html$/, sheet: 'styles/index.css', platform: 'dgo-ops' },
  { match: /^document-portal\/[^/]+\.html$/, sheet: 'ds/ds.css', platform: 'portal' },
];

/** Standalone pages built with the tokens written inside them. */
const EMBEDDED = [
  'docs/reference/PROVISIONING_ATLAS.html',
  'tools/admin-console.html',
  'tools/flow-workbench/index.html',
  'tools/flow-workbench/template.html',
  'tools/coordination-hub/index.html',
  'docs/architecture/architecture.html',
  'docs/architecture/components.html',
  'docs/forensic/dd2e909/visuals/index.html',
  'docs/folio-Master-Flows-and-Endpoints/contracts/DOCUMENT_PORTAL_FLOWS.html',
  'docs/folio-Master-Flows-and-Endpoints/contracts/flow-alignment-console.html',
  'docs/reference/presentations/dgo-automation-ladder.v3.html',
  'docs/reference/presentations/dgo-briefing-deck.html',
  'docs/folio-Master-Flows-and-Endpoints/reference/connector/CONNECTOR_MATRIX.html',
  'docs/folio-Master-Flows-and-Endpoints/reference/connector/CONNECTOR_DETAILS_MATRIX.html',
  'docs/reference/PLATFORM_REGISTER.html',
  'docs/folio-Master-Flows-and-Endpoints/reference/estate-register.html',
  'scripts/mailer-package/GO-LIVE.html',
];

/** Folders that ship as a unit with a synced brand/ copy (scripts/brand-sync.mjs PACKAGES). */
const PACKAGED = [
  { page: 'docs/visual/index.html', css: ['docs/visual/visual.css'] },
  { page: 'docs/visual/folio-brief.html', css: [] },
  { page: 'docs/folio-Master-Flows-and-Endpoints/provisioning/index.html', css: ['docs/folio-Master-Flows-and-Endpoints/provisioning/console.css'] },
  { page: 'mailer/index.html', css: ['mailer/css/mailer.css'] },
  { page: 'tools/admin-centre/static/index.html', css: ['tools/admin-centre/static/app.css'] },
  { page: 'tools/hub/index.html', css: ['tools/hub/hub.css'] },
];
const LITERAL = /#[0-9A-Fa-f]{3,8}\b|\brgba?\([^)]*\d[^)]*\)|\bhsla?\([^)]*\)/g;

/** Email. Mail clients ignore CSS variables, so colours are literal; every one must be a value
    of the brand palette (tokens.primitive.css). HTML entities such as &#183; are not colours. */
const EMAIL = [
  /^docs\/folio-Master-Flows-and-Endpoints\/deployment\/notification-instrument\/email-templates\/deploy\//,
  /^docs\/reference\/correspondence-email-templates\//,
  /^scripts\/lib\/folio-flows-report\.template\.html$/, // the live report flow's emailed interactive report
  /^docs\/folio-Master-Flows-and-Endpoints\/email-catalogue\/(?!NOKEY__Folio_Incoming_Correspondence_Scan_Processing_Flow__197527c8\/Send_an_email_V2\.html$)/, // the identification packages' e-mail templates (ITEM-68); one is PENDING below
];

/** Known unbranded outputs. Remove an entry when its page is brought onto the tokens. Empty:
    every live output is on the design system; keep the list so a regression has a place to be
    declared rather than hidden. */
const PENDING = [
  [/^docs\/reference\/presentations\/folio-journey\/index\.html$/,
    'Folio Journey v2 visual folio, committed as delivered; its tokens are folded into the design system by the deferred uplift (folio-journey/PLATFORM_UPLIFT_BACKLOG.md)'],
  [/^docs\/folio-Master-Flows-and-Endpoints\/email-catalogue\/NOKEY__Folio_Incoming_Correspondence_Scan_Processing_Flow__197527c8\/Send_an_email_V2\.html$/,
    'the "New E-Scan" mail carried verbatim from DGSO INCOMING AI PROCESSING into the scan rebuild (ITEM-80, release 6); recolouring changes the package, so it rides the next scan-flow release (CLAUDE.md: releases only for a tenant defect or an owner decision)'],
];

/** Outside the live estate: retired or imported material that predates the design system, and
    dated audit records, which are kept unedited and so cannot be brought onto the tokens. */
const OUT_OF_SCOPE = /^docs\/archive\/|^docs\/reference\/foundational\/|^docs\/audits\/PILOT_READINESS_REVIEW_2026-09-23\.html$/;

let passed = 0;
const failures = [];
const check = (ok, msg) => { if (ok) passed++; else failures.push(msg); };

const read = (f) => readFileSync(f, 'utf8');
const pages = execFileSync('git', ['ls-files', '*.html'], { encoding: 'utf8' })
  .trim().split('\n').filter((f) => f && !OUT_OF_SCOPE.test(f));

const primitive = read(`${TOKENS}/tokens.primitive.css`);
/** Every face named in the design system's family stacks: the only fonts a page may embed. */
const BRAND_FAMILIES = new Set([...primitive.matchAll(/--dgo-family-[\w-]+:\s*([^;]+);/g)]
  .flatMap((m) => m[1].split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, ''))));
const tokenValue = (name) => {
  const m = primitive.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`${TOKENS}/tokens.primitive.css no longer defines ${name}`);
  return m[1].toUpperCase();
};

/** Link forwarders at the site root: pages that exist only to pass an old notification link on
 *  to the Workspace (docs/deployment/PLATFORM_ACCESS_RUNBOOK.md). They render no brand because
 *  they render nothing; section 3d holds them to that. */
const FORWARDERS = ['acknowledge.html', 'index_Bulk.html', 'support.html'];

/* ── 1. Every output is classified, exactly once ─────────────────────── */
for (const page of pages) {
  const kinds = [
    LINKED.some((l) => l.match.test(page)) && 'linked',
    EMBEDDED.includes(page) && 'embedded',
    PACKAGED.some((k) => k.page === page) && 'packaged',
    EMAIL.some((re) => re.test(page)) && 'email',
    PENDING.some(([re]) => re.test(page)) && 'pending',
    FORWARDERS.includes(page) && 'forwarder',
  ].filter(Boolean);
  check(kinds.length === 1, kinds.length
    ? `${page} is classified more than once (${kinds.join(', ')})`
    : `${page} is not classified. Decide how it takes the brand (styles/dgo-design-system/README.md) and add it to tests/brand-authority.test.mjs`);
}
for (const e of EMBEDDED) check(pages.includes(e), `${e} is listed as EMBEDDED but is not a tracked file`);

/* ── 2. Linked pages load the design system ──────────────────────────── */
for (const page of pages) {
  const rule = LINKED.find((l) => l.match.test(page));
  if (!rule) continue;
  const sheets = [...read(page).matchAll(/<link[^>]+rel=["']?stylesheet[^>]*>/gi)]
    .map((m) => (m[0].match(/href=["']([^"']+)["']/) || [])[1]);
  check(sheets.includes(rule.sheet), `${page} does not load ${rule.sheet}`);
  const html = read(page).match(/<html\b[^>]*>/i)?.[0] || '';
  check(html.includes(`data-platform="${rule.platform}"`),
    `${page} does not select its platform binding: <html data-platform="${rule.platform}"> (tokens/tokens.platforms.css)`);
}

/* ── 3. Embedded pages carry the tokens and nothing of their own ─────── */
for (const page of EMBEDDED) {
  if (!pages.includes(page)) continue;
  const html = read(page);
  const a = html.indexOf(BLOCK_START);
  const b = html.indexOf(BLOCK_END);
  check(a >= 0 && b > a, `${page} does not carry the brand tokens; build it with scripts/lib/brand-tokens.mjs`);
  if (a < 0 || b < a) continue;
  const own = html.slice(0, a) + html.slice(b);
  /* Colour literals are looked for in CSS only: <style> bodies and style="" attributes. */
  const css = [...own.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
    .concat([...own.matchAll(/style="([^"]*)"/gi)].map((m) => m[1])).join('\n');
  const literals = [...new Set(css.match(LITERAL) || [])];
  check(!literals.length, `${page} paints colours of its own outside the brand tokens: ${literals.slice(0, 6).join(' ')}`);
  check(!/<link[^>]+stylesheet/i.test(html), `${page} links a stylesheet; a standalone page must carry its styles inline`);
  check(!/fonts\.(googleapis|gstatic)\.com|@import/.test(html), `${page} loads fonts or styles from elsewhere`);
  /* A standalone page may carry a font inside itself, but only a brand face (one named in the
     design system's family stacks) and only as data, so the file stays self-contained. */
  for (const face of html.match(/@font-face\s*\{[^}]*\}/g) || []) {
    const family = (face.match(/font-family:\s*['"]?([^;'"]+)/) || [])[1];
    check(BRAND_FAMILIES.has(family) && /src:\s*url\(\s*['"]?data:font\//.test(face),
      `${page} embeds the font "${family}", which is ${BRAND_FAMILIES.has(family) ? 'not carried as data:' : 'not a brand face'}`);
  }
}

/* ── 3b. Packaged folders load their brand/ copy and state no colour ───── */
for (const { page, css } of PACKAGED) {
  check(pages.includes(page), `${page} is listed as PACKAGED but is not a tracked file`);
  if (!pages.includes(page)) continue;
  const html = read(page);
  const sheets = [...html.matchAll(/<link[^>]+rel=["']?stylesheet[^>]*>/gi)].map((m) => (m[0].match(/href=["']([^"']+)["']/) || [])[1]);
  check(sheets[0] === 'brand/brand.css', `${page} must load brand/brand.css before any stylesheet of its own (loads: ${sheets.join(', ')})`);
  check(/<script[^>]+src=["']brand\/brand\.js["']/.test(html), `${page} does not load brand/brand.js`);
  check(!/fonts\.(googleapis|gstatic)\.com/.test(html), `${page} loads fonts from another site`);
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
    .concat([...html.matchAll(/style="([^"]*)"/gi)].map((m) => m[1])).join('\n');
  for (const [file, text] of [[page, inline], ...css.map((f) => [f, read(f)])]) {
    const found = [...new Set(text.replace(/\/\*[\s\S]*?\*\//g, '').match(LITERAL) || [])];
    check(!found.length, `${file} states colours of its own instead of naming tokens: ${found.slice(0, 6).join(' ')}`);
  }
}

/* ── 3d. Forwarders style nothing and forward only to the Workspace ─── */
for (const page of FORWARDERS) {
  check(pages.includes(page), `${page} is listed as a FORWARDER but is not a tracked file`);
  if (!pages.includes(page)) continue;
  const html = read(page);
  check(!/<style|style="|<link[^>]+stylesheet/i.test(html), `${page} is a forwarder and must carry no styles; a styled page takes the brand like any other`);
  check(/location\.replace\('\.\/index\.html'/.test(html), `${page} is a forwarder but does not forward to ./index.html`);
}

/* ── 3c. Email uses palette values only ───────────────────────────────── */
const PALETTE = new Set([...primitive.matchAll(/--dgo-[\w-]+:\s*(#[0-9A-Fa-f]{6})\b/g)].map((m) => m[1].toUpperCase()));
const hex6 = (h) => (h.length === 4 ? '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h).toUpperCase();
for (const page of pages.filter((p) => EMAIL.some((re) => re.test(p)))) {
  const off = [...new Set((read(page).match(/(?<![&\w])#[0-9A-Fa-f]{6}\b|(?<![&\w])#[0-9A-Fa-f]{3}\b(?![0-9A-Fa-f])/g) || [])
    .map(hex6).filter((h) => !PALETTE.has(h)))];
  check(!off.length, `${page} uses colours outside the brand palette: ${off.slice(0, 6).join(' ')}`);
}

/* ── 4. Letterhead core colours are the tokens' ───────────────────────── */
{
  const { CorrespondenceEmailTemplateConfig: cfg } = await import('../config/correspondence-email-templates.config.js');
  const brand = cfg?.brand;
  check(!!brand, 'config/correspondence-email-templates.config.js no longer exports a brand block');
  if (brand) {
    for (const [key, token] of [['deepGreen', '--dgo-green-700'], ['smartGreen', '--dgo-smart-400'], ['ink', '--dgo-ink-700']]) {
      check(String(brand[key]).toUpperCase() === tokenValue(token),
        `letterhead brand.${key} is ${brand[key]}, but ${token} is ${tokenValue(token)}`);
    }
    for (const [key, v] of Object.entries(brand).filter(([, v]) => /^#[0-9A-Fa-f]{3,6}$/.test(String(v)))) {
      check(PALETTE.has(hex6(v)), `letterhead brand.${key} is ${v}, which is not a brand palette value`);
    }
  }
}

/* ── 4b. Master brand everywhere; the sub-brand inside only (README, RX-01) ─────────────
   NITDA is on every surface. DGO Digital Ops, the endorsed internal sub-brand, sits beside it
   on internal surfaces, which also take its P2 platform variant (data-platform="dgo-ops"). What
   leaves the Agency (the public portal, public email, letters to other institutions) carries
   NITDA alone. */
{
  const MASTERS = 'styles/dgo-design-system/brand';
  const tracked = execFileSync('git', ['ls-files', MASTERS], { encoding: 'utf8' }).trim().split('\n');
  for (const f of ['nitda/nitda-logo-horizontal-colour.jpeg', 'nitda/nitda-logo-horizontal-whiteout.png',
    'nitda/nitda-logo-stacked-whiteout.png', 'nitda/nitda-symbol-infoweb.png',
    'nitda/nitda-lockup-digital-white.png', 'nitda/nitda-lockup-digital-colour.png',
    'dgo/dgo-mark.svg', 'dgo/dgo-mark-reverse.svg']) {
    check(tracked.includes(`${MASTERS}/${f}`), `brand master ${MASTERS}/${f} is missing`);
  }
  /* The DGO marks are geometry only: text drawn as SVG <text> depends on a face that may be
     absent, which is how the package's own marks clipped and rendered black on green. */
  for (const f of ['dgo/dgo-mark.svg', 'dgo/dgo-mark-reverse.svg']) {
    check(!/<text\b/.test(read(`${MASTERS}/${f}`)), `${MASTERS}/${f} draws text; the mark must be geometry only`);
  }

  const SUB = /DGO Digital Ops|Digital Ops|data-bk-sub|class="bk-sub|dgo-mark|DG<span[^>]*>O<\/span>|dgo-logo-(horizontal|whiteout|mark)|nitda-endorsed\.svg/;
  const EXTERNAL_CODE = execFileSync('git', ['ls-files', 'document-portal', 'config/correspondence-email-templates.config.js',
    'core/correspondence-email-service.js', 'mailer/js/letterhead.js', 'mailer/js/letterhead.generated.js'],
  { encoding: 'utf8' }).trim().split('\n').filter((f) => /\.(js|html|css|json)$/.test(f));
  const EXTERNAL_PAGES = pages.filter((p) => /^docs\/folio-Master-Flows-and-Endpoints\/deployment\/notification-instrument\/email-templates\/deploy\/nitda-dp-|^docs\/reference\/correspondence-email-templates\//.test(p));
  for (const f of [...EXTERNAL_CODE, ...EXTERNAL_PAGES]) {
    const hit = read(f).match(SUB);
    check(!hit, `${f} faces outside the Agency but carries the DGO sub-brand (${hit?.[0]}); external surfaces carry NITDA alone`);
  }

  /* Internal surfaces carry the lockup and select the DGO Digital Ops platform variant. The
     27 August briefing deck is a record and keeps its own rail text. */
  const RECORDS = new Set(['docs/reference/presentations/dgo-briefing-deck.html']);
  const INTERNAL = ['index.html', ...EMBEDDED, ...PACKAGED.map((k) => k.page)].filter((p) => pages.includes(p) && !RECORDS.has(p));
  for (const page of INTERNAL) {
    const html = read(page);
    check(/class="bk-sub/.test(html), `${page} is internal but does not carry the DGO Digital Ops lockup beside the NITDA logo`);
    check(/data-platform="dgo-ops"|'data-platform', ?'dgo-ops'|"data-platform", ?"dgo-ops"/.test(html),
      `${page} is internal but does not select the DGO Digital Ops platform variant (data-platform="dgo-ops")`);
  }
}

/* ── 5. The pending list only shrinks ─────────────────────────────────── */
for (const page of pages) {
  if (PENDING.some(([re]) => re.test(page)) && (read(page).includes(BLOCK_START) || /href="brand\/brand\.css"/.test(read(page)))) {
    failures.push(`${page} now carries the brand tokens; move it from PENDING to EMBEDDED`);
  }
}
for (const [re, why] of PENDING) {
  check(pages.some((p) => re.test(p)), `PENDING entry ${re} (${why}) matches no page; remove it`);
}

const pending = pages.filter((p) => PENDING.some(([re]) => re.test(p))).length;
if (failures.length) {
  console.error(`\n  ✖  Brand authority: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`     · ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`\n  ✅ Brand authority: ${passed} checks passed. ${pages.length} outputs classified; ${pages.length - pending} on the design system, ${pending} pending.\n`);
