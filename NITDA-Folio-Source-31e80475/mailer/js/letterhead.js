// The Agency letterhead: the internal platform's six correspondence templates, rendered here
// exactly as its Correspondence Email Desk renders them.
//
// The template data comes from letterhead.generated.js (compiled from the platform's config).
// The markup below is the platform's render() in core/correspondence-email-service.js, with its
// dependency on platform state removed: the caller supplies the context and the date instead.
// tests/mailer.test.mjs renders every template through both and requires identical bytes, so
// a letter sent from the mailer and one sent from the platform cannot look different.
//
// Tokens here are the platform's own ({{recipientName}}, {{referenceId}}, {{body}}, …);
// campaign.js maps the mailer's fields onto them.

import { LETTERHEAD } from './letterhead.generated.js';

const C = LETTERHEAD;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const tokens = (html, ctx) => String(html || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => esc(ctx[k] ?? ''));
/* The subject line is plain text: its values are not HTML-escaped (an "&" arrives as "&", not "&amp;"). */
const textTokens = (text, ctx) => String(text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => String(ctx[k] ?? ''));
const pill = (ctx) => `${esc(ctx.classification)} · ${esc(ctx.priority || 'normal')}`;

/** Which conditional paragraphs apply — the platform's conditions(), unchanged. */
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

/**
 * Render one letter.
 * @param {object} template  an entry of LETTERHEAD.templates
 * @param {object} ctx       recipientName, subject, referenceId, body, actionRequired, dueDate,
 *                           attachmentSummary, classification, priority, signatoryName, signatoryTitle
 * @param {string} dateText  the date line, e.g. letterheadDate(campaign.date)
 */
export function renderLetterhead(template, ctx, dateText) {
  const cond = conditions(ctx);
  const subject = textTokens(template.subject, ctx);
  const sections = template.sections.filter((x) => !x.when || cond[x.when]).map((x) => `<p>${tokens(x.html, ctx).replace(/\n/g, '<br>')}</p>`).join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:${C.brand.paper};font-family:Arial,Segoe UI,sans-serif;color:${C.brand.ink}">
  <div style="max-width:760px;margin:0 auto;padding:24px">
    <div style="background:#fff;border:1px solid ${C.brand.line};border-radius:18px;overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,.08)">
      <div style="background:${C.brand.deepGreen};color:#fff;padding:18px 22px"><div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase">${esc(C.brand.ministry)}</div><h1 style="margin:6px 0 0;font-size:22px">${esc(C.brand.agency)}</h1><div>${esc(C.brand.office)}</div></div>
      <div style="padding:22px"><div style="display:inline-block;background:${C.brand.smartGreen};color:${C.brand.onAccent || '#011610'};border-radius:999px;padding:5px 10px;font-size:12px">${pill(ctx)}</div><h2 style="margin:14px 0 4px;color:${C.brand.deepGreen}">${esc(ctx.subject || subject)}</h2><p style="color:${C.brand.muted || '#5F5C5D'}">Reference: <b>${esc(ctx.referenceId || 'N/A')}</b> · Date: ${esc(dateText)}</p>${sections}<p>Yours faithfully,</p><p><b>${esc(ctx.signatoryName)}</b><br>${esc(ctx.signatoryTitle)}</p></div>
      <div style="border-top:1px solid ${C.brand.line};padding:14px 22px;color:${C.brand.muted || '#5F5C5D'};font-size:12px">Confidentiality Notice: This correspondence and any attachment(s) are intended solely for the addressed recipient(s). If received in error, please notify the sender and delete the message.<br>${esc(C.brand.agency)} · ${esc(C.brand.office)}</div>
    </div>
  </div></body></html>`;
  return { subject, html };
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

/** Mailer campaign fields each conditional paragraph reads. */
export const CONDITION_FIELDS = Object.freeze({
  hasActionRequired: 'ActionRequired',
  hasDueDate: 'DueDate',
  hasAttachments: 'AttachmentSummary',
});
