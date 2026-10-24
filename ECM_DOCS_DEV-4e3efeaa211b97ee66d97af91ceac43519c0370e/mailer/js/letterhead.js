// The Agency letterhead: the internal platform's six correspondence templates, rendered here
// exactly as its Correspondence Email Desk renders them.
//
// The template data and the designs (the CL-* fragments and complete documents of the e-mail template package) come
// from letterhead.generated.js, compiled from the platform's config. The fill below is the platform's render() in
// core/correspondence-email-service.js, with its dependency on platform state removed: the caller supplies the
// context and the date instead. tests/mailer.test.mjs renders every template through both and requires identical
// bytes, so a letter sent from the mailer and one previewed in the platform cannot look different.
//
// Tokens here are the platform's own ({{recipientName}}, {{referenceId}}, {{body}}, …);
// campaign.js maps the mailer's fields onto them.

import { LETTERHEAD } from './letterhead.generated.js';

const C = LETTERHEAD;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;
const clean = (v) => String(v ?? '').trim();
/* The subject line is plain text: its values are not HTML-escaped (an "&" arrives as "&", not "&amp;"). */
const textTokens = (text, ctx) => String(text || '').replace(TOKEN, (_, k) => String(ctx[k] ?? ''));
const MULTILINE = ['body', 'actionRequired', 'attachmentSummary'];
const tokens = (html, ctx) => String(html || '').replace(TOKEN, (_, k) => { const e = esc(ctx[k] ?? ''); return MULTILINE.includes(k) ? e.replace(/\r?\n/g, '<br>') : e; });
/* The platform's documentBody() (core/email-fragment-service.js), unchanged: the document's docket band holds Reference
   and Date, so the fragment's own row (marked <!--folio-docket-->) is left out and the greeting loses its gap. */
const documentBody = (html) => String(html ?? '').replace(/<!--folio-docket-->[\s\S]*?<!--\/folio-docket-->(\s*<tr><td style=")padding-top:14px("><p style="margin:)8px 0 0 0;/,
  (_, td, p) => `${td}${p}0;`);
/* A template saved on the base before the letter structure of 2026-10-21 opens its body with the Reference and Date
   row, which the docket band now carries: that row is left out when the letter is built. */
const LEGACY_DOCKET = /^(<table[^>]*>\s*)<tr><td style=""><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed">(?:(?!<\/table>)[\s\S])*\{\{Reference\}\}(?:(?!<\/table>)[\s\S])*\{\{Date\}\}(?:(?!<\/table>)[\s\S])*<\/table><\/td><\/tr>(<tr><td style=")padding-top:14px("><p style="margin:)8px 0 0 0;/;

/** Which conditions hold — the platform's conditions(), unchanged. */
export function conditions(ctx) {
  return {
    hasDueDate: !!ctx.dueDate,
    hasAttachments: !!ctx.attachmentSummary,
    hasActionRequired: !!ctx.actionRequired,
    isConfidential: ['confidential', 'restricted', 'secret'].includes(String(ctx.classification || '').toLowerCase()),
  };
}

export const letterheadTemplate = (id) => C.templates.find((t) => t.id === id) || null;

/** The date line, as the platform prints it: "25 September 2026". */
export const letterheadDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

/** The design a letter is sent with — the platform's designFor(), unchanged. */
export function designFor(template, ctx) {
  const cond = conditions(ctx);
  const v = (template.variants || []).find((x) => !x.when.some((k) => cond[k]));
  return v ? v.otherwise : template.design;
}

/* A row whose tokens are all optional and empty is left out with everything in it — the platform's
   core/email-fragment-service.js prune(), unchanged. */
function prune(html, drop) {
  let out = '', i = 0;
  const re = /<tr\b|<\/tr>/g;
  for (;;) {
    re.lastIndex = i;
    const m = re.exec(html);
    if (!m || m[0] === '</tr>') { out += html.slice(i); return out; }
    let depth = 0, end = -1, x;
    re.lastIndex = m.index;
    while ((x = re.exec(html))) { depth += x[0] === '</tr>' ? -1 : 1; if (!depth) { end = x.index + 5; break; } }
    if (end < 0) { out += html.slice(i); return out; }
    const row = html.slice(m.index, end), open = row.match(/^<tr\b[^>]*>/)[0];
    out += html.slice(i, m.index) + (drop(row) ? '' : open + prune(row.slice(open.length, -5), drop) + '</tr>');
    i = end;
  }
}
function dropEmptyRows(html, ctx, optional) {
  if (!optional.length) return html;
  html = prune(html, (row) => {
    const keys = [...row.matchAll(TOKEN)].map((m) => m[1]);
    return keys.length > 0 && keys.every((k) => optional.includes(k) && !clean(ctx[k]));
  });
  return html.replace(/<tr\b[^>]*>\s*<td\b[^>]*>\s*<table\b[^>]*>\s*(?:<tbody>\s*<\/tbody>)?\s*<\/table>\s*<\/td>\s*<\/tr>/g, '');
}

/**
 * Render one letter: the design's complete document, as DGO_MAIL_SEND sends it.
 * @param {object} template  an entry of LETTERHEAD.templates
 * @param {object} ctx       recipientName, subject, referenceId, body, actionRequired, dueDate,
 *                           attachmentSummary, classification, priority, signatoryName, signatoryTitle
 * @param {string} dateText  the date line, e.g. letterheadDate(campaign.date)
 */
export function renderLetterhead(template, ctx, dateText) {
  const subject = textTokens(template.subject, ctx);
  const design = C.designs[designFor(template, ctx)];
  const full = { ...ctx, date: dateText, referenceId: ctx.referenceId || 'N/A' };
  const body = tokens(dropEmptyRows(design.html, full, template.optional || []), full).replace(/\n{3,}/g, '\n\n');
  const doc = { year: String(new Date().getFullYear()), ...full };
  const html = design.document.replace(TOKEN, (_, k) => (k === 'html' ? documentBody(body) : esc(doc[k] ?? '')));
  return { subject, html, design: design.id };
}

/* TR-100, owner decision 2026-10-21: a Mailer template the operator writes is on the Official letter base. Only its
   headline and body cell are the operator's; the masthead, hero colours, chip and footer are CL-Official's, added at
   send time, so they cannot be edited away. Templates and mailings keep the base in a marker at the head of bodyHtml,
   which is all the shared template list stores. */
export const OFFICIAL_MARK = /^<!--folio-base:CL-Official\|([^>]*?)-->/;
export const officialMark = (headline) => `<!--folio-base:CL-Official|${String(headline || '{{LetterTitle}}').replace(/--+|>/g, ' ').trim()}-->`;
export function officialParts(bodyHtml) {
  const m = OFFICIAL_MARK.exec(String(bodyHtml || ''));
  return m ? { headline: m[1], body: String(bodyHtml).slice(m[0].length) } : null;
}
/** The letter, as a template of Mailer fields: CL-Official's document with the headline and body cell put in. */
export function officialDocument(headline, body, { priority = 'normal' } = {}) {
  const doc = C.designs['CL-Official'].document;
  const fill = { subject: headline || '{{LetterTitle}}', referenceId: '{{Reference}}', date: '{{Date}}', recipientEmail: '{{Email}}', classification: 'Official', priority: esc(priority), year: '{{Year}}',
    html: String(body || '').replace(LEGACY_DOCKET, (_, table, td, p) => `${table}${td}${p}0;`) };
  return doc.replace(TOKEN, (_, k) => { if (!(k in fill)) throw new Error(`CL-Official: no value for {{${k}}}`); return fill[k]; });
}

/** The six templates as mailer templates. They are defined by the platform, so they are read-only here. */
export const LETTERHEAD_TEMPLATES = Object.freeze(C.templates.map((t) => Object.freeze({
  key: `agency-${t.id}`,
  kind: 'letterhead',
  letterheadId: t.id,
  name: `${t.label} (Agency letterhead)`,
  description: `${t.category} · the internal platform's ${t.label} template on the Agency letterhead, exactly as its Correspondence Email Desk sends it.`,
  subject: t.subject,
  bodyHtml: '',
  readOnly: true,
})));

/** Mailer field → platform field, for the fields a letterhead template can require. */
export const REQUIRED_LABEL = Object.freeze({
  subject: 'Letter title',
  referenceId: 'Reference',
  body: 'Message',
  recipientEmail: 'Recipient email',
});

/** Mailer campaign fields each optional line reads. */
export const OPTIONAL_FIELDS = Object.freeze({
  actionRequired: 'ActionRequired',
  dueDate: 'DueDate',
  attachmentSummary: 'AttachmentSummary',
});
