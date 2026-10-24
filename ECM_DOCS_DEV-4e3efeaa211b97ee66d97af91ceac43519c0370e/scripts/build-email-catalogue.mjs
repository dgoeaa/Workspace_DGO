#!/usr/bin/env node
/**
 * The e-mail catalogue (readiness register ITEM-68).
 *
 *   npm run emailcatalogue                 check every template against catalogue.json, run the acceptance checks, write
 *                                          catalogue.json, ACCEPTANCE.md and README.md
 *   npm run emailcatalogue -- --check      the same, exit 1 if anything written would change
 *   npm run emailcatalogue -- --extract    take every message the identification packages send into the catalogue: a
 *                                          template per message, its text as the package holds it now. Used once to found
 *                                          the catalogue, and to add a new message; an existing template is not overwritten.
 *
 * The identification builders (npm run idphase3, idphase4) write each send's body from the catalogue
 * (scripts/lib/email-catalogue.mjs applyCatalogue), so a template is edited here, once, and the packages follow.
 *
 * The acceptance checks are the ones a template can be held to without a mail client: a full document with a language and
 * a light colour scheme, a preheader, layout tables marked presentational, alternative text on every image, colours from
 * the brand tokens, a recipient taken from the request rather than fixed, and a body no wider than 640 px. Rendering in the
 * mail clients, dark mode, images off and screen-reader reading are checked by a person and recorded in ACCEPTANCE.md.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE_DIR, messagesOf, sha, fileOf, loadCatalogue } from './lib/email-catalogue.mjs';
import { messageType } from './lib/identification-flow-edit.mjs';
import { CorrespondenceEmailTemplateConfig } from '../config/correspondence-email-templates.config.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const EXTRACT = process.argv.includes('--extract');
const PKGS = ['identification-phase3', 'identification-phase4'].map((d) => `docs/folio-Master-Flows-and-Endpoints/packages/${d}`);
const DIR = join(ROOT, CATALOGUE_DIR);

/* The brand palette: the primitive tokens, the one set an e-mail may take colours from (tests/brand-authority.test.mjs §3c). */
const PALETTE = new Set([...readFileSync(join(ROOT, 'document-portal/ds/tokens/tokens.primitive.css'), 'utf8').matchAll(/--dgo-[\w-]+:\s*(#[0-9A-Fa-f]{6})\b/g)].map((m) => m[1].toUpperCase()));
for (const v of Object.values(CorrespondenceEmailTemplateConfig.brand)) if (/^#[0-9A-Fa-f]{6}$/.test(v) && !PALETTE.has(v.toUpperCase())) throw new Error(`the letterhead colour ${v} is not a primitive token`);

const packages = PKGS.flatMap((d) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.paste.json')).map((f) => ({ dir: d, file: f })));
/* One template per message: sends whose bodies are identical share one, kept under shared/ (named for the message type). */
const shared = new Map();
if (EXTRACT) {
  const bySha = new Map();
  for (const { dir, file } of packages) for (const m of messagesOf(JSON.parse(readFileSync(join(ROOT, dir, file), 'utf8')))) {
    const k = sha(m.html); if (!bySha.has(k)) bySha.set(k, []); bySha.get(k).push(m.send);
  }
  const used = new Set();
  for (const [k, sends] of bySha) if (sends.length > 1) {
    let name = messageType(sends[0]); let n = 2;
    while (used.has(name)) name = `${messageType(sends[0])}-${n++}`;
    used.add(name); shared.set(k, `shared/${name}.html`);
  }
}
const prev = loadCatalogue(ROOT) || { messages: [] };
const messages = [];
const writes = {};
for (const { dir, file } of packages) {
  const pkg = JSON.parse(readFileSync(join(ROOT, dir, file), 'utf8'));
  const [key, flow, id8] = file.replace(/\.paste\.json$/, '').split('__');
  for (const m of messagesOf(pkg)) {
    const old = prev.messages.find((x) => x.package === file && x.send === m.send) || {};
    const rel = old.file || shared.get(sha(m.html)) || fileOf(file, m.send);
    const path = join(DIR, rel);
    let html;
    if (existsSync(path)) html = readFileSync(path, 'utf8');
    else if (writes[rel] !== undefined) html = writes[rel];
    else if (EXTRACT) { html = m.html; writes[rel] = html; }
    else throw new Error(`${file}: ${m.send} has no template — run: npm run emailcatalogue -- --extract`);
    messages.push({ id: `${key}.${messageType(m.send)}`, package: file, packageDir: dir.split('/').pop(), contractKey: key, flow, flowId8: id8, send: m.send,
      messageType: messageType(m.send), shape: m.shape, ...(m.wrapper ? { wrapper: m.wrapper } : {}), subject: m.subject, to: m.to,
      file: rel, sha256: sha(html), chars: html.length, owner: old.owner ?? null, acceptance: accept(html, m) });
  }
}
/* A template no package sends any more is not kept. */
for (const e of prev.messages) if (!messages.some((x) => x.file === e.file)) throw new Error(`${e.file}: no package sends ${e.send} any more — remove the template and its entry`);
/* Two templates with the same text are one message kept twice. */
{ const seen = new Map(); for (const e of messages) { const o = seen.get(e.sha256); if (o && o !== e.file) throw new Error(`${e.file} and ${o} hold the same template — keep one under shared/`); seen.set(e.sha256, e.file); } }

/* The template with every @{…} expression replaced by a placeholder, so markup checks are not misled by a ">" inside one. */
function markup(html) {
  let out = '', depth = 0, quote = false;
  for (let i = 0; i < html.length; i++) {
    const c = html[i];
    if (!depth) { if (c === '@' && html[i + 1] === '{') { depth = 1; i++; out += 'EXPR'; } else out += c; continue; }
    if (quote) { if (c === "'") quote = false; continue; }
    if (c === "'") quote = true; else if (c === '{') depth++; else if (c === '}') depth--;
  }
  return out;
}
function accept(raw, m) {
  const html = markup(raw);
  const full = /<html\b/i.test(html);
  /* A table with column headings is a data table and keeps its semantics; only layout tables are presentational. */
  const tables = [];
  for (const t of html.matchAll(/<table\b[^>]*>/gi)) {
    const rest = html.slice(t.index + t[0].length);
    const end = rest.search(/<\/?table\b/i);
    if (!/<th\b/i.test(end < 0 ? rest : rest.slice(0, end))) tables.push(t[0]);
  }
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((x) => x[0]);
  const hex6 = (h) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toUpperCase();
  const colours = [...new Set([...html.matchAll(/(?<![&\w])#[0-9A-Fa-f]{6}\b|(?<![&\w])#[0-9A-Fa-f]{3}\b(?![0-9A-Fa-f])/g)].map((x) => hex6(x[0])))];
  const widths = [...html.matchAll(/max-width:\s*(\d+)px/gi)].map((x) => Number(x[1]));
  const fixedTo = typeof m.to === 'string' && m.to && !/@\{|^@/.test(m.to);
  /* Administrative mail goes to the registry mailbox (owner decision, 2026-10-06), so that fixed recipient is the policy, not a finding. */
  const adminTo = fixedTo && m.to.trim().toLowerCase() === 'dgsregistry@nitda.gov.ng';
  /* A body that is one expression passes on HTML composed elsewhere (IP_SEND_EMAIL carries the Correspondence Desk's own
     documents, config/correspondence-email-templates.config.js); the structure checks belong to that source. */
  if (/^@(?!\{)/.test(raw) && !/</.test(raw)) return { passThrough: true, document: null, colourScheme: null, preheader: null, presentationTables: null, imageAlt: null,
    offPalette: [...new Set([...html.matchAll(/(?<![&\w])#[0-9A-Fa-f]{6}\b/g)].map((x) => x[0].toUpperCase()))].filter((c) => !PALETTE.has(c)), recipientFromRequest: !fixedTo || adminTo, width: null };
  return {
    document: full && /<html\b[^>]*\blang=/i.test(html),
    colourScheme: /name="color-scheme"/i.test(html),
    preheader: /display:\s*none[^"]*max-height:\s*0/i.test(html),
    presentationTables: tables.length === tables.filter((t) => /role="presentation"/i.test(t)).length,
    imageAlt: imgs.every((t) => /\balt="/i.test(t)),
    offPalette: colours.filter((c) => !PALETTE.has(c)).sort(),
    recipientFromRequest: !fixedTo || adminTo,
    width: widths.length ? Math.max(...widths) <= 640 : null,
  };
}

/* The person-checked outcome, recorded in person-acceptance.json (date, reviewer, findings, resolution, acceptance). */
const PERSON_FILE = join(DIR, 'person-acceptance.json');
const PERSON = existsSync(PERSON_FILE) ? (() => { const a = JSON.parse(readFileSync(PERSON_FILE, 'utf8'));
  return [`**${a.outcome}** · ${a.date} · reviewer ${a.reviewer} · accepted by ${a.acceptedBy}`, '', `Findings: ${a.findings.join('; ')}.`, '', `Resolution: ${a.resolution}`, '', `Evidence: ${a.evidence.join('; ')}.`].join('\n'); })() : null;
const CHECKS = [['document', 'full document with lang'], ['colourScheme', 'colour scheme declared'], ['preheader', 'preheader'], ['presentationTables', 'layout tables presentational'], ['imageAlt', 'images carry alt text'], ['palette', 'colours from the brand tokens'], ['recipientFromRequest', 'recipient from the request (administrative mail: the registry mailbox)'], ['width', 'width ≤ 640 px']];
const passes = (e, k) => (k === 'palette' ? e.acceptance.offPalette.length === 0 : e.acceptance[k] === true || e.acceptance[k] === null);
const catalogue = { schema: 'dgo-email-catalogue/v1', generatedBy: 'scripts/build-email-catalogue.mjs', register: 'ITEM-68',
  palette: { source: 'document-portal/ds/tokens/tokens.primitive.css', colours: PALETTE.size },
  counts: { messages: messages.length, packages: new Set(messages.map((x) => x.package)).size, ...Object.fromEntries(CHECKS.map(([k]) => [k, messages.filter((e) => passes(e, k)).length])) },
  messages };
const mark = (e, k) => (k !== 'palette' && e.acceptance[k] === null ? '—' : passes(e, k) ? '✓' : '✗');
const acceptance = `# E-mail acceptance

**Generated by \`npm run emailcatalogue\` from \`scripts/build-email-catalogue.mjs\`. Do not edit by hand.**

Readiness register ITEM-68. ${messages.length} messages from ${catalogue.counts.packages} identification packages. The automated checks below are
the ones a template can be held to without a mail client; a ✗ is a finding, not a build failure.

| Check | Messages passing |
|---|---|
${CHECKS.map(([k, l]) => `| ${l} | ${catalogue.counts[k]} of ${messages.length} |`).join('\n')}

## Per message

| Message | Package | ${CHECKS.map(([, l]) => l).join(' | ')} |
|---|---|${CHECKS.map(() => '---').join('|')}|
${messages.map((e) => `| \`${e.id}\` (${e.send}) | ${e.contractKey} ${e.flow} | ${CHECKS.map(([k]) => mark(e, k)).join(' | ')} |`).join('\n')}

## Colours outside the brand tokens

${messages.filter((e) => e.acceptance.offPalette.length).map((e) => `- \`${e.id}\`: ${e.acceptance.offPalette.join(', ')}`).join('\n') || 'None.'}

## Checked by a person

${PERSON ? PERSON : `Not yet recorded. For each message, before it is accepted: rendering in Outlook (desktop and web), Gmail and iOS Mail; dark mode;
images off; a screen reader reading it in order. Record the outcome here with the date and the reviewer.`}
`;
const readme = `# E-mail catalogue

**Generated by \`npm run emailcatalogue\` from \`scripts/build-email-catalogue.mjs\`.** The templates are edited here; the index and
the acceptance report are generated.

Every message an identification package sends has one template in this folder, under its package's name, or under \`shared/\` when
several sends compose the same message. The flows' own expression
syntax (\`@{…}\`) is kept: a template is what the flow composes, not a rendered e-mail. \`npm run idphase3\` and \`npm run idphase4\`
write each send's body from its template, cut into steps of at most 6,000 characters where the flow composed it in parts, so a
change made here reaches every package that sends the message. A send that has no template fails those builds.

- [\`catalogue.json\`](catalogue.json): every message, its package, send step, shape, subject, recipient, template file and checks.
- [\`ACCEPTANCE.md\`](ACCEPTANCE.md): the automated checks per message, and the checks a person records.

To add a message: build the package with the new send, then \`npm run emailcatalogue -- --extract\` and edit the new template.
`;
const out = { 'catalogue.json': `${JSON.stringify(catalogue, null, 2)}\n`, 'ACCEPTANCE.md': acceptance, 'README.md': readme };
let stale = 0;
for (const [rel, t] of Object.entries({ ...writes, ...out })) {
  const p = join(DIR, rel);
  const cur = existsSync(p) ? readFileSync(p, 'utf8') : null;
  if (cur === t) continue;
  if (CHECK) { stale++; console.error(`stale: ${CATALOGUE_DIR}/${rel}`); continue; }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, t);
}
if (CHECK && stale) { console.error('e-mail catalogue is out of date — run: npm run emailcatalogue'); process.exit(1); }
console.log(`e-mail catalogue: ${messages.length} messages, ${Object.keys(writes).length} template(s) extracted${CHECK ? ' (check)' : ''}`);
