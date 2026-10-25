#!/usr/bin/env node
// Extract the Correspondence Email Desk's email templates as standalone HTML.
//
//   node scripts/extract-correspondence-email-templates.mjs           write docs/reference/correspondence-email-templates/
//   node scripts/extract-correspondence-email-templates.mjs --check   exit 1 if what is committed differs
//
// WHERE THE TEMPLATES LIVE, AND WHY THIS DOES NOT COPY THEM
//
// The desk (modules/correspondence-email.js) has six templates, declared in
// config/correspondence-email-templates.config.js as a subject pattern and a design of the e-mail template package
// (docs/folio-Master-Flows-and-Endpoints/email-templates/, CL-*). render() in core/correspondence-email-service.js
// fills the design's body fragment, which the desk posts to the EMAIL endpoint as payload.email.html with
// payload.email.hero and payload.email.footerNote; the IP_SEND_EMAIL frame draws masthead, hero and footer around it
// (finding F1). render() also fills the design's complete document, which the desk previews and the Mailer sends.
//
// So every file written here is produced by calling that render() — the platform's own code —
// rather than by re-typing its markup. If the service, the config or the package changes, --check fails and
// the extraction is rebuilt from the new code; it cannot silently describe a letter the platform no longer sends.
//
// WHAT IT WRITES, PER TEMPLATE
//
//   html/<id>.html       the template: the body fragment with every field left as a {{token}}
//   rendered/<id>.html   a worked example: the complete document with sample values
//
// and once: templates.json (the catalogue), partials/flow-attachment-section.html, index.html
// (every template side by side) and README.md.
//
// DETERMINISM
//
// render() stamps today's date. Date is pinned to 25 September 2026 while rendering so the
// output is byte-stable; in html/ that date is then replaced by {{date}}.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'reference', 'correspondence-email-templates');
const CHECK = process.argv.includes('--check');

/* Pin "now" before the service is imported, so every new Date() inside it sees the same day. */
const FIXED = Date.UTC(2026, 8, 25, 9, 0, 0);
const RealDate = Date;
class PinnedDate extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FIXED])); }
  static now() { return FIXED; }
}
globalThis.Date = PinnedDate;

const { render } = await import('../core/correspondence-email-service.js');
const { CorrespondenceEmailTemplateConfig: C } = await import('../config/correspondence-email-templates.config.js');
const PINNED_DATE_TEXT = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
globalThis.Date = RealDate;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

/* What each condition in the config tests, in the service's own terms (conditions() in
   core/correspondence-email-service.js). */
const CONDITIONS = {
  hasDueDate: 'dueDate is set',
  hasActionRequired: 'actionRequired is set',
  hasAttachments: 'attachmentSummary is set',
};

/* Every field the composer can set, as a token. */
const FIELDS = ['referenceId', 'subject', 'recipientName', 'recipientEmail', 'body', 'priority', 'classification',
  'dueDate', 'actionRequired', 'attachmentSummary', 'signatoryName', 'signatoryTitle'];
const tokenDraft = (templateId) => Object.fromEntries([['templateId', templateId], ...FIELDS.map((f) => [f, `{{${f}}}`])]);

/** The flow's own markup (IP_SEND_EMAIL → Compose_SendEmail_Attachment_Section), verbatim. */
const FLOW_SECTION_OPEN = '<div style="margin-top:18px;padding-top:12px;border-top:1px solid #E8E6E7;font-family:Arial,Segoe UI,sans-serif;font-size:13px"><b>Attachments</b><ul><li>';
const FLOW_SECTION_CLOSE = '</li></ul></div>';

/* Sample values for the worked examples. Addressees are from the Nigerian Government Letter
   Mailing Guide; references and bodies are illustrative. */
const SAMPLES = {
  'official-correspondence': {
    referenceId: 'NITDA/DG/COR/2026/0142', subject: 'Adoption of the National Data Exchange Framework',
    recipientName: 'Executive Secretary', recipientEmail: 'info@nuc.edu.ng',
    body: 'The Agency writes to formally notify the Commission of the adoption of the National Data Exchange Framework and to request the nomination of two focal persons to coordinate implementation across Nigerian universities.',
    actionRequired: 'Nominate two focal persons and forward their details to the Office of the Director-General.',
    dueDate: '9 October 2026', priority: 'high',
  },
  'request-for-information': {
    referenceId: 'NITDA/DG/RFI/2026/0057', subject: 'Status of ICT projects funded in 2025',
    recipientName: 'Executive Secretary', recipientEmail: 'info@tetfund.gov.ng',
    body: '1. A list of ICT infrastructure projects approved in 2025, with their current status.\n2. The clearance reference issued by the Agency for each project.\n3. The name of the officer responsible for each project.',
    dueDate: '16 October 2026',
  },
  'document-transmittal': {
    referenceId: 'NITDA/DG/TRN/2026/0311', subject: 'Signed Memorandum of Understanding',
    recipientName: 'Director-General', recipientEmail: 'nimccustomercare@nimc.gov.ng',
    body: 'Enclosed is the counter-signed Memorandum of Understanding between the Agency and the Commission on digital identity integration, for your records.',
    attachmentSummary: 'NITDA-NIMC_MoU_Signed.pdf; Annex_A_Data_Sharing_Schedule.pdf',
  },
  'meeting-invitation': {
    referenceId: 'NITDA/DG/INV/2026/0088', subject: 'Stakeholder Workshop on the National AI Strategy',
    recipientName: 'Director-General', recipientEmail: 'info@son.gov.ng',
    body: 'Date: Thursday, 22 October 2026\nTime: 10:00 a.m.\nVenue: NITDA Corporate Headquarters, Abuja\n\nThe workshop will review the implementation roadmap and the role of standards in trustworthy AI.',
    dueDate: '15 October 2026',
  },
  'circular-notice': {
    referenceId: 'NITDA/DG/CIR/2026/0009', subject: 'Revised Guidelines for IT Project Clearance',
    recipientName: 'Sir/Ma', recipientEmail: 'info@bpp.gov.ng',
    body: 'With effect from 1 November 2026, every IT project clearance request must be submitted through the Agency\'s online portal. Paper submissions will no longer be accepted.',
  },
  'closure-response': {
    referenceId: 'NITDA/DG/COR/2026/0142', subject: 'Adoption of the National Data Exchange Framework',
    recipientName: 'Executive Secretary', recipientEmail: 'info@nuc.edu.ng',
    body: 'The Agency acknowledges receipt of the Commission\'s nominations dated 7 October 2026. The focal persons have been enrolled, and no further action is required from the Commission.',
  },
};

/* When each variant design is sent instead of the template's own, and which lines drop out when their field is empty. */
const variantText = (t) => (t.variants || []).map((v) => `${v.otherwise} when none of: ${v.when.map((k) => CONDITIONS[k] || k).join(', ')}`);

function header(template, kind) {
  const variants = variantText(template);
  return `<!--
  Internal platform · Correspondence Email Desk · template "${template.id}" (${template.label}) · design ${template.design}
  ${kind === 'template'
    ? `TEMPLATE: the body fragment the desk sends as payload.email.html. The IP_SEND_EMAIL frame draws the masthead, the
  hero (payload.email.hero) and the footer (payload.email.footerNote) around it. Every {{token}} is a field set in
  the desk's composer; {{date}} is the send date (en-GB, "25 September 2026"). Values are HTML-escaped when merged.
  Lines left out when their field is empty: ${(template.optional || []).join(', ') || 'none'}.${variants.length ? `\n  Sent as ${variants.join('; ')}.` : ''}`
    : `WORKED EXAMPLE: the design's complete document with sample values, as the recipient sees it and as the Mailer's
  DGO_MAIL_SEND sends it.`}
  Subject line: ${template.subject}
  Generated by scripts/extract-correspondence-email-templates.mjs from config/correspondence-email-templates.config.js,
  config/email-fragments.generated.js and core/correspondence-email-service.js. Do not edit: change those and re-run.
-->`;
}

/** Put the note just after the doctype: anything before <!doctype> sends a browser into quirks mode. */
const withHeader = (html, note) => {
  if (!/^<!doctype html>/i.test(html)) throw new Error('the preview document no longer starts with <!doctype html>');
  return html.replace(/^<!doctype html>/i, (d) => `${d}\n${note}`);
};

export function buildAll() {
  /* render() reads new Date() for its date line: keep the pinned day for the whole build, or the
     output (and --check) would change at midnight. */
  globalThis.Date = PinnedDate;
  try { return buildAllPinned(); } finally { globalThis.Date = RealDate; }
}

function buildAllPinned() {
  const files = {};
  const catalogue = [];
  for (const t of C.templates) {
    /* 1. The template, tokenised: every field set, so every line is present. */
    const tok = render(tokenDraft(t.id), {});
    if (tok.design !== t.design || !tok.html.includes(PINNED_DATE_TEXT)) throw new Error(`${t.id}: the tokenised render is not ${t.design} with its date line — has render() changed?`);
    files[`html/${t.id}.html`] = `${header(t, 'template')}\n${tok.html.replace(PINNED_DATE_TEXT, '{{date}}')}\n`;

    /* 2. The worked example, in its complete document. */
    const sample = SAMPLES[t.id] || {};
    const r = render({ templateId: t.id, ...sample }, {});
    files[`rendered/${t.id}.html`] = withHeader(r.preview, header(t, 'example')) + '\n';

    catalogue.push({
      id: t.id,
      label: t.label,
      category: t.category,
      tone: t.tone,
      subject: t.subject,
      exampleSubject: r.subject,
      requiredFields: t.required || [],
      design: t.design,
      exampleDesign: r.design,
      variants: (t.variants || []).map((v) => ({ design: v.otherwise, sentWhenNoneOf: v.when.map((k) => CONDITIONS[k] || k) })),
      optionalLines: t.optional || [],
      hero: r.hero,
      footerNote: r.footerNote,
      files: { template: `html/${t.id}.html`, example: `rendered/${t.id}.html` },
      examplePlainText: r.plain,
    });
  }

  files['partials/flow-attachment-section.html'] = `<!--
  Appended by the IP_SEND_EMAIL flow (Compose_SendEmail_Attachment_Section) after the desk's HTML,
  whenever payload.email.attachments is non-empty. One <li> per attachment reference, as sent.
  Note: it is concatenated after the desk's closing </html>. Outlook renders it; a strict parser would not.
-->
${FLOW_SECTION_OPEN}{{attachment1}}</li><li>{{attachment2}}${FLOW_SECTION_CLOSE}
`;

  files['templates.json'] = JSON.stringify({
    generatedBy: 'scripts/extract-correspondence-email-templates.mjs',
    module: 'modules/correspondence-email.js (Correspondence Email Desk)',
    templateConfig: 'config/correspondence-email-templates.config.js',
    renderer: 'core/correspondence-email-service.js → render()',
    sentThrough: { endpointKey: 'EMAIL', operation: 'sendCorrespondenceEmail', flow: 'IP_SEND_EMAIL', bodyField: 'payload.email.html', heroField: 'payload.email.hero', footerNoteField: 'payload.email.footerNote', attachmentsField: 'payload.email.attachments' },
    designs: 'docs/folio-Master-Flows-and-Endpoints/email-templates/ (CL-* fragments and complete documents)',
    brand: C.brand,
    defaults: C.defaults,
    templates: catalogue,
  }, null, 2) + '\n';

  files['index.html'] = gallery(catalogue);
  files['README.md'] = readme(catalogue);
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, Buffer.from(v, 'utf8')]));
}

function gallery(catalogue) {
  const cards = catalogue.map((t) => `
  <section class="card" id="${esc(t.id)}">
    <header><span class="cat">${esc(t.category)} · ${esc(t.tone)}</span><h2>${esc(t.label)}</h2>
      <p><b>Subject:</b> <code>${esc(t.subject)}</code></p>
      <p><b>Required:</b> ${t.requiredFields.map((f) => `<code>${esc(f)}</code>`).join(' ')}
      <br><b>Design:</b> <code>${esc(t.design)}</code>${t.variants.length ? `<br><b>Variants:</b> ${t.variants.map((v) => `<code>${esc(v.design)}</code> when none of ${esc(v.sentWhenNoneOf.join(', '))}`).join('; ')}` : ''}</p>
      <p><a href="${esc(t.files.template)}">Template (tokens)</a> · <a href="${esc(t.files.example)}">Worked example</a></p></header>
    <iframe title="${esc(t.label)} — worked example" src="${esc(t.files.example)}" sandbox loading="lazy"></iframe>
  </section>`).join('');
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Correspondence email templates · NITDA</title>
<style>
:root{--g:#05583B;--ink:#373435;--line:#E8E6E7;--paper:#FAFAF9}
body{margin:0;font:15px/1.5 Arial,Segoe UI,sans-serif;color:var(--ink);background:var(--paper)}
main{max-width:1200px;margin:0 auto;padding:24px 16px}
h1{color:var(--g);margin:0 0 6px}.lede{margin:0 0 24px;max-width:75ch}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;margin-bottom:24px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);overflow:hidden}
.card header{padding:18px}.card h2{margin:4px 0 10px;color:var(--g);font-size:1.15rem}
.cat{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5F5C5D}
code{background:var(--paper);padding:1px 5px;border-radius:4px;font-size:.88em}
iframe{width:100%;height:640px;border:0;border-left:1px solid var(--line);background:var(--paper)}
@media (max-width:820px){.card{grid-template-columns:1fr}iframe{border-left:0;border-top:1px solid var(--line)}}
</style></head>
<body><main>
<h1>Correspondence email templates</h1>
<p class="lede">The ${catalogue.length} templates of the Correspondence Email Desk in the internal platform, each shown as the recipient receives it. Every example is the platform's own <code>render()</code> output in its design's complete document (<code>docs/folio-Master-Flows-and-Endpoints/email-templates/</code>).</p>
${cards}
</main></body></html>
`;
}

function readme(catalogue) {
  return `# Correspondence email templates

These are the email templates used by the **Correspondence Email Desk** in the internal
platform (\`modules/correspondence-email.js\`). They are extracted as standalone HTML.

> **Generated. Don't edit these files.** The templates come from
> \`config/correspondence-email-templates.config.js\`. Their letterhead comes from \`render()\` in
> \`core/correspondence-email-service.js\`. Change those files, then run
> \`npm run extract:emailtemplates\`. \`npm run test:emailtemplates\` fails while this folder is out of date.

## How a correspondence email is built and sent

1. The desk's composer collects the fields: template, reference, subject, recipient, Cc/Bcc,
   classification, priority, due date, required action, attachment references, body and signatory.
2. \`render()\` fills the template's design from the e-mail template package
   (\`docs/folio-Master-Flows-and-Endpoints/email-templates/\`, CL-*): the reference and date, the greeting, the body,
   the lines that apply, and the signatory. A letter with no value for a line is sent as the design's variant
   without it.
3. **Send** posts \`{ operation: "sendCorrespondenceEmail", email: { to, cc, bcc, subject, html, text, hero,
   footerNote, attachments } }\` to the \`EMAIL\` endpoint, which is the **IP_SEND_EMAIL** flow. \`html\` is the body
   fragment only (finding F1).
4. The flow draws the masthead, the hero from \`email.hero\` and the footer with \`email.footerNote\` around it, and
   appends an **Attachments** list when \`email.attachments\` is not empty
   (\`partials/flow-attachment-section.html\`).

## Files

| Path | What it is |
|---|---|
| \`html/<id>.html\` | **The template.** The body fragment, with each field left as a \`{{token}}\` and every line present. |
| \`rendered/<id>.html\` | **A worked example** in the design's complete document, filled in with sample values. |
| \`partials/flow-attachment-section.html\` | The attachment list the flow appends. |
| \`templates.json\` | The catalogue: subject patterns, required fields, designs, variants, optional lines, hero and footer note, defaults. |
| \`index.html\` | All the templates side by side. Open it in a browser. |

## The templates

| Template | Design | Category | Subject line | Required fields | Variant sent when a line is empty |
|---|---|---|---|---|---|
${catalogue.map((t) => `| [${t.label}](html/${t.id}.html) (\`${t.id}\`) | \`${t.design}\` | ${t.category} | \`${t.subject}\` | ${t.requiredFields.map((f) => `\`${f}\``).join(', ')} | ${t.variants.map((v) => `\`${v.design}\` (none of: ${v.sentWhenNoneOf.join(', ')})`).join('; ') || '—'} |`).join('\n')}

## Tokens

| Token | Filled from |
|---|---|
| \`{{recipientName}}\` | The recipient name. Defaults to *Sir/Ma*. |
| \`{{subject}}\`, \`{{referenceId}}\` | The subject and reference fields. These are pre-filled from the source letter. |
| \`{{body}}\` | The correspondence body. Line breaks become \`<br>\`. |
| \`{{actionRequired}}\`, \`{{dueDate}}\`, \`{{attachmentSummary}}\` | Optional fields. Each one's line is left out when it is empty. |
| \`{{classification}}\`, \`{{priority}}\` | Shown in the hero chip and lead. Defaults: *Official* and *normal*. |
| \`{{signatoryName}}\`, \`{{signatoryTitle}}\` | Defaults: *${C.defaults.signatoryName}*, *${C.defaults.signatoryTitle}*. |
| \`{{date}}\` | The date the email is rendered, in the form *25 September 2026*. |

Every value is HTML-escaped when it is merged.

## Not included

\`core/acknowledgement-service.js\` builds a separate *Task Acknowledgment Confirmation* email.
It belongs to the Acknowledgment module and is a task notification, not correspondence, so it
isn't part of this desk.
`;
}

function main() {
  const files = buildAll();
  const drift = [];
  for (const [rel, buf] of Object.entries(files)) {
    const abs = path.join(OUT, rel);
    const cur = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
    if (cur && cur.equals(buf)) continue;
    if (CHECK) { drift.push(rel); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buf);
  }
  if (CHECK) {
    if (drift.length) { console.log(`  ❌ docs/reference/correspondence-email-templates is stale — run: npm run extract:emailtemplates\n     ${drift.join('\n     ')}`); process.exit(1); }
    console.log(`  ✅ correspondence email templates match the platform's renderer (${Object.keys(files).length} files)`);
  } else console.log(`  docs/reference/correspondence-email-templates: ${Object.keys(files).length} files current`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
