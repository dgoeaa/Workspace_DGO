#!/usr/bin/env node
// Compile the IP_SEND_EMAIL body fragments of the e-mail template package into the module the Workspace sends from.
//
//   node scripts/build-email-fragments.mjs           write config/email-fragments.generated.js and email-documents.generated.js
//   node scripts/build-email-fragments.mjs --check   exit 1 if what is committed differs
//
// SOURCE
//
// docs/folio-Master-Flows-and-Endpoints/email-templates/01-Templates/fragments/<ID>.fragment.html, one per design and
// variant (the production package of 2026-10-20). Each starts with a comment naming its carrier fields:
// payload.email.hero, payload.email.footerNote, subject and preheader. The fragment is the body only; the
// IP_SEND_EMAIL frame draws the masthead, hero and footer around it (finding F1, the double frame).
//
// WHAT THIS CHANGES, AND WHY
//
// The package files are previews: a list is drawn as four identical sample rows, a bar as a fixed 50% and the
// report's insight line as fixed text. Each of those becomes a binding the sender fills:
//   - a run of identical rows that carry {{row.*}} becomes one row between <!--each:rows--> and <!--/each:rows-->
//     (<!--each:bars--> for a bar chart, whose bar width becomes {{row.pct}});
//   - the folio-empty-state comment becomes the row a sender prints when its list is empty;
//   - the Management report's fixed insight sentence becomes {{insight}}.
// The frame adds "Dear Sir/Madam," unless "dear " or "hello" is in the first 600 characters of the body. A
// Correspondence Desk letter opens with its reference and date, and a held staff notice with the commissioning
// banner, so their greeting falls later; every fragment therefore opens with a comment naming its greeting.
//
// The output is checked by tests/email-fragments.test.mjs.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { documentBody } from '../core/email-fragment-service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'docs/folio-Master-Flows-and-Endpoints/email-templates/01-Templates/fragments';
const SCHEMES = 'docs/folio-Master-Flows-and-Endpoints/email-templates/02-Design-System/hero-schemes.json';
const DOCS = 'docs/folio-Master-Flows-and-Endpoints/email-templates/01-Templates/email';
const OUT = 'config/email-fragments.generated.js';
const OUT_DOCS = 'config/email-documents.generated.js';
/* The designs whose complete document a sender needs as well as the fragment: the Correspondence Desk previews its
   letters in it, and the Mailer sends it through DGO_MAIL_SEND (letterhead rows TR-094 to TR-099). */
const WITH_DOCUMENT = /^CL-/;
/* The Mailer's starter letters (TR-091 to TR-093): the package's complete documents, for the mailer's merge engine.
   The optional message becomes {{Message?}}, so one starter covers the package's --no-message variant too, and the
   sender's e-mail and telephone line becomes {{SenderContact?}} (whichever of the two Settings holds). */
const OUT_SEEDS = 'mailer/js/seed-letters.generated.js';
const SEEDS = ['ML-Cover-Letter', 'ML-Follow-Up', 'ML-Invitation'];
/* Designs the package delivers only as a complete document, whose sender goes through IP_SEND_EMAIL all the same (the
   Workspace's support request, decision of 2026-10-21 on F5): the fragment is the document's body row, the hero its
   chip, headline and lead, the footer note its footer's first line. Their body opens with no greeting, so the frame
   adds its own. */
const DERIVED = ['WS-Support-Request'];
/* The body row of a complete document, and the row of a CL fragment that holds Reference and Date (the package of
   2026-10-21). The document carries those two in its docket band instead, so the build marks the row with
   <!--folio-docket--> and the document's {{html}} takes documentBody() of the fragment (core/email-fragment-service.js). */
const BODY_ROW = '<tr><td class="px" style="padding:26px 28px 28px">';
const DOCKET_ROW = '<tr><td style=""><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed">';
const GREETING_ROW = '<tr><td style="padding-top:14px"><p style="margin:8px 0 0 0;';
const same = (h) => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?tbody>/g, '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
  .replace(/^<table[^>]*>/, '').replace(/<\/table>$/, '');
function markDocket(id, html) {
  const a = html.indexOf(DOCKET_ROW), b = html.indexOf(GREETING_ROW);
  if (a < 0 || b < a || html.indexOf(DOCKET_ROW, a + 1) >= 0 || !/\{\{referenceId\}\}[\s\S]*\{\{date\}\}/.test(html.slice(a, b))) {
    throw new Error(`${id}: the Reference and Date row before the greeting is not where the letter structure puts it`);
  }
  return `${html.slice(0, a)}<!--folio-docket-->${html.slice(a, b)}<!--/folio-docket-->${html.slice(b)}`;
}
const text = (h) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
function derive(id, scheme) {
  const doc = fs.readFileSync(path.join(ROOT, DOCS, `${id}.html`), 'utf8');
  const at = (re) => { const m = doc.match(re); if (!m) throw new Error(`${id}: ${re} not found`); return m; };
  const hero = doc.slice(at(/<tr><td class="px" bgcolor="[^"]+" style="padding:26px 28px 24px/).index);
  const chip = text(hero.match(/<span[^>]*border-radius:999px[^>]*>([\s\S]*?)<\/span>/)[1]);
  const title = text(hero.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]);
  const lead = text((hero.slice(hero.indexOf('</h1>')).match(/<p[^>]*>([\s\S]*?)<\/p>/) || [, ''])[1]);
  const open = BODY_ROW;
  const b = doc.indexOf(open);
  if (b < 0 || doc.indexOf(open, b + 1) >= 0) throw new Error(`${id}: one body row expected`);
  const body = doc.slice(b + open.length, doc.indexOf('\n<tr><td class="px" bgcolor="#F5F4F4"', b)).replace(/<\/td><\/tr>\s*$/, '').trim();
  /* The docket band (sender, reference, record link) sits above the body in the document; the frame has none, so the
     derived body opens with it, on the band's tint. */
  const d = doc.indexOf('data-folio-v3="docket"');
  if (d < 0 || d > b) throw new Error(`${id}: no docket band above the body`);
  const docket = doc.slice(doc.indexOf('>', d) + 1, b).replace(/<\/td><\/tr>\s*$/, '').trim();
  const inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FAFAF9" style="padding:12px 16px;background:#FAFAF9;border:1px solid #E8E6E7;border-radius:12px">${docket}</td></tr></table></td></tr>\n<tr><td style="padding-top:18px">${body}`;
  const foot = doc.slice(doc.indexOf('<tr><td class="px" bgcolor="#F5F4F4"'));
  const footerNote = text(foot.slice(0, foot.lastIndexOf('<tr', foot.indexOf('data-folio-v3="footer"'))));
  if (!footerNote) throw new Error(`${id}: no footer note`);
  if (/\bdear |hello/i.test(body.slice(0, 600))) throw new Error(`${id}: the body now greets; derive it like the others`);
  return { id, design: id, subject: at(/<title>([^<]*)<\/title>/)[1], preheader: text(at(/<div style="display:none;[^"]*">([^<]*)/)[1]).replace(/(&#8199;|&#847;)+$/, ''),
    hero: { purpose: id, chip, title, lead }, footerNote, scheme, lists: {}, derived: true,
    html: `<!-- folio-derived: the body of ${id}.html; the frame adds its own greeting -->\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-folio-fragment="${id}">\n<tr><td>${inner}</td></tr>\n</table>` };
}
const CHECK = process.argv.includes('--check');

const EMPTY_TEXT = 'No records fall inside the dates chosen. Widen the date range to see more.';
const emptyRow = (cols, text) => `<tr><td colspan="${cols}" style="padding:14px 0;font-family:Verdana,Geneva,sans-serif;font-size:13px;line-height:20px;color:#5F5C5D">${text}</td></tr>`;

function header(src, file) {
  const m = src.match(/^<!--([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`${file}: no header comment`);
  const h = m[1];
  const pick = (re) => { const x = h.match(re); if (!x) throw new Error(`${file}: header lacks ${re}`); return x[1]; };
  return {
    rest: src.slice(m[0].length),
    id: pick(/folio-fragment:\s*([\w-]+)/),
    design: pick(/design\s+([\w-]+)/),
    hero: JSON.parse(pick(/payload\.email\.hero = (\{.*\})/)),
    footerNote: JSON.parse(pick(/payload\.email\.footerNote = (".*")/)),
    subject: JSON.parse(pick(/subject = (".*?") \|/)),
    preheader: JSON.parse(pick(/preheader = (".*?")\s*$/m)),
  };
}

/* Collapse each run of identical sample rows into one repeated row. */
function lists(html) {
  const found = {};
  const out = html.replace(/(\s*<tr>[\s\S]*?<\/tr>\s*?)(?:\1)+/g, (run, row) => {
    if (!/\{\{row\./.test(row)) return run;
    const name = /\{\{row\.label\}\}/.test(row) ? 'bars' : 'rows';
    if (found[name]) throw new Error(`two ${name} lists in one fragment`);
    found[name] = true;
    const one = name === 'bars' ? row.replace(/width:50%;height:12px/, 'width:{{row.pct}}%;height:12px') : row;
    return `\n          <!--each:${name}-->${one.trimEnd()}\n          <!--/each:${name}-->\n`;
  });
  return { html: out, names: Object.keys(found) };
}

function officialBody() {
  const src = fs.readFileSync(path.join(ROOT, SRC, 'CL-Official--no-optional-lines.fragment.html'), 'utf8');
  const MAP = { referenceId: 'Reference', date: 'Date', recipientName: 'Salutation', body: 'Message', signatoryName: 'SenderName', signatoryTitle: 'SenderTitle' };
  /* The base's docket band holds Reference and Date ({{Reference}}, {{Date}}), so the body leaves out the fragment's row. */
  const html = documentBody(markDocket('CL-Official', header(src, 'CL-Official--no-optional-lines.fragment.html').rest.trim()))
    .replace(/^<table[^>]*data-folio-fragment="[^"]*">/, '').replace(/<\/table>$/, '').trim();
  return html.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!MAP[k]) throw new Error(`CL-Official body: no Mailer field for {{${k}}}`); return `{{${MAP[k]}}}`; })
    .replace(/^/, '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">').concat('</table>');
}

function build() {
  const dir = path.join(ROOT, SRC);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.fragment.html')).sort();
  const schemes = JSON.parse(fs.readFileSync(path.join(ROOT, SCHEMES), 'utf8'));
  const digest = crypto.createHash('sha256');
  const entries = {};
  const documents = {};
  for (const file of files) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    digest.update(file).update(src);
    const h = header(src, file);
    if (`${h.id}.fragment.html` !== file) throw new Error(`${file}: header names ${h.id}`);
    if (h.hero.purpose !== h.id) throw new Error(`${file}: hero.purpose is ${h.hero.purpose}`);
    const scheme = schemes.schemes?.[h.id] || schemes[h.id];
    if (!scheme) throw new Error(`${file}: no hero scheme for ${h.id} in ${SCHEMES}`);

    let html = h.rest.trim();
    const l = lists(html);
    html = l.html;
    const empty = {};
    html = html.replace(/<!-- folio-empty-state:[\s\S]*?(<tr>[\s\S]*?<\/tr>) -->/, (_, row) => { empty.rows = row.replace(/^.*?>([^<>]+)<\/td><\/tr>$/, '$1'); return ''; });
    for (const name of l.names) {
      const table = html.slice(0, html.indexOf(`<!--each:${name}-->`));
      const head = table.slice(table.lastIndexOf('<table'));
      const cols = (head.match(/<th\b/g) || []).length || (name === 'bars' ? 3 : 1);
      empty[name] = emptyRow(cols, empty[name] || EMPTY_TEXT);
    }
    if (h.id === 'RP-Management') {
      const fixed = 'Immediate attention is required for overdue items.';
      if (!html.includes(fixed)) throw new Error(`${file}: the insight sentence moved`);
      html = html.replace(fixed, '{{insight}}');
    }
    const greeting = (html.match(/>(Dear [^<]*)</) || [])[1];
    if (!greeting) throw new Error(`${file}: no greeting`);
    html = `<!-- folio-greeting: ${greeting} (this body carries its own greeting) -->\n${html}`;

    if (WITH_DOCUMENT.test(h.id)) {
      const doc = fs.readFileSync(path.join(ROOT, DOCS, `${h.id}.html`), 'utf8');
      digest.update(doc);
      html = markDocket(h.id, html);
      /* The document is the package file with its body table replaced by {{html}}: masthead, hero, docket band, notes
         and footer stay as delivered. Its body must be the fragment's, less the docket row. */
      const row = doc.indexOf(BODY_ROW);
      const open = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">';
      const start = row + BODY_ROW.length, close = doc.indexOf('\n<tr><td class="px" bgcolor="#F5F4F4"', start);
      const cell = doc.slice(start, close);
      if (row < 0 || doc.indexOf(BODY_ROW, row + 1) >= 0 || !doc.includes('data-folio-v3="docket"') || !cell.startsWith(open) || !cell.endsWith('</table></td></tr>') || close < 0) {
        throw new Error(`${DOCS}/${h.id}.html: one docket band and one body row expected`);
      }
      const body = cell.slice(0, -'</td></tr>'.length);
      if (same(body) !== same(documentBody(html))) throw new Error(`${DOCS}/${h.id}.html: its body is not the fragment's less the Reference and Date row`);
      documents[h.id] = `${doc.slice(0, start)}{{html}}${doc.slice(start + body.length)}`;
    }
    entries[h.id] = { id: h.id, design: h.design, subject: h.subject, preheader: h.preheader, hero: h.hero, footerNote: h.footerNote, scheme, lists: empty, html };
  }
  for (const id of DERIVED) {
    const doc = fs.readFileSync(path.join(ROOT, DOCS, `${id}.html`), 'utf8');
    digest.update(doc);
    const scheme = schemes.schemes?.[id] || schemes[id];
    if (!scheme) throw new Error(`${id}: no hero scheme`);
    entries[id] = derive(id, scheme);
  }
  const body = `/* GENERATED by scripts/build-email-fragments.mjs: do not edit. Run \`npm run emailfragments\` after changing a fragment in
   ${SRC}/.

   The IP_SEND_EMAIL body fragments of the e-mail template package (2026-10-20), one per design and variant. A sender
   fills one with core/email-fragment-service.js and puts it on the EMAIL payload as email.html, with email.hero and
   email.footerNote, so the frame draws the only masthead, hero and footer (finding F1). \`scheme\` is the hero colour set
   the frame looks up by hero.purpose (${SCHEMES}).
   Source digest: ${digest.digest('hex')} */
export const EmailFragments = Object.freeze(${JSON.stringify(entries, null, 2)});
`;
  const docs = `/* GENERATED by scripts/build-email-fragments.mjs: do not edit. Run \`npm run emailfragments\` after changing a document in
   ${DOCS}/.

   The complete documents of the e-mail template package for the designs that need one (${WITH_DOCUMENT}): each is the
   package file with its body replaced by {{html}}, where the filled fragment of the same ID goes. The fragment is
   what IP_SEND_EMAIL sends; this document is the review copy, and what DGO_MAIL_SEND sends. */
export const EmailDocuments = Object.freeze(${JSON.stringify(documents, null, 2)});
`;
  const seeds = {};
  for (const id of SEEDS) {
    const doc = fs.readFileSync(path.join(ROOT, DOCS, `${id}.html`), 'utf8');
    if (!doc.includes('{{Message}}')) throw new Error(`${id}: no {{Message}} line`);
    const title = doc.match(/<title>([^<]*)<\/title>/)[1];
    if (!doc.includes('{{SenderEmail}} · {{SenderPhone}}')) throw new Error(`${id}: the sender contact line moved`);
    seeds[id] = { subject: title, bodyHtml: doc.replace(/\{\{Message\}\}/g, '{{Message?}}').replace('{{SenderEmail}} · {{SenderPhone}}', '{{SenderContact?}}') };
  }
  const seedText = `// GENERATED by scripts/build-email-fragments.mjs: do not edit. Run \`npm run emailfragments\` after changing
// ${DOCS}/ML-*.html.
//
// The Mailer's starter letters from the e-mail template package (rows TR-091 to TR-093): complete documents with
// inline styles, presentational tables, a preheader and the hosted NITDA logo. {{Message?}} is optional.

export const SEED_LETTERS = Object.freeze(${JSON.stringify(seeds, null, 2)});

/* TR-100 (owner decision 2026-10-21): a new Mailer template starts on the Official letter base. This is its editable
   body cell, CL-Official--no-optional-lines with the Desk's tokens as the Mailer's fields; the masthead, hero colours
   and footer are added when the letter is sent (mailer/js/letterhead.js officialDocument). */
export const OFFICIAL_BODY = ${JSON.stringify(officialBody())};
`;
  return { [OUT]: body, [OUT_DOCS]: docs, [OUT_SEEDS]: seedText };
}

const outputs = build();
let stale = 0;
for (const [rel, text] of Object.entries(outputs)) {
  const target = path.join(ROOT, rel);
  const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (CHECK) {
    if (cur !== text) { console.error(`❌ ${rel} is out of date. Run: npm run emailfragments`); stale++; }
    else console.log(`✅ ${rel} matches the package`);
  } else if (cur !== text) { fs.writeFileSync(target, text); console.log(`wrote ${rel}`); }
  else console.log(`${rel} current`);
}
if (stale) process.exit(1);
