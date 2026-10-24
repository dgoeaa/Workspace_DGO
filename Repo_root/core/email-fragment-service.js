/* E-mail body fragments for the IP_SEND_EMAIL frame (finding F1, the double frame).
 *
 * A sender used to post a complete HTML document as payload.email.html, and the frame wrapped it in a second
 * masthead, hero and footer. Now it posts the body fragment of its template (config/email-fragments.generated.js,
 * built from docs/folio-Master-Flows-and-Endpoints/email-templates/01-Templates/fragments/) with two fields the
 * frame draws around it:
 *   email.hero        {purpose, chip, title, lead}: purpose is the template ID, the key of its colour scheme
 *   email.footerNote  the line above the frame's address block
 *
 * render() fills one fragment:
 *   - every {{token}} is escaped; a token named in `multiline` keeps its line breaks as <br>;
 *   - each <!--each:name--> row is repeated for lists[name] ({{row.*}} tokens), or replaced by the fragment's
 *     empty-state row when the list is empty;
 *   - a row whose tokens are all named in `optional` and all empty is left out, as the previous templates did. */
import { EmailFragments } from '../config/email-fragments.generated.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const clean = (v) => String(v ?? '').trim();
const get = (ctx, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

export function fragment(id) {
  const f = EmailFragments[id];
  if (!f) throw new Error(`Unknown e-mail fragment ${id}`);
  return f;
}

/** Fill text: `html` escapes values (and keeps markup in the text itself); plain text leaves them as they are. */
export function fillText(text, ctx = {}, { html = true, multiline = [] } = {}) {
  return String(text ?? '').replace(TOKEN, (_, k) => {
    const v = get(ctx, k);
    if (!html) return String(v ?? '');
    const e = esc(v);
    return multiline.includes(k) ? e.replace(/\r?\n/g, '<br>') : e;
  });
}

/* A row (at any depth, outermost first) whose tokens are all optional and all empty is left out with everything in
   it, so a line's label goes with its value; a row that stays is pruned the same way inside. A row left holding only
   an empty table goes too. */
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
  const empty = (k) => !clean(get(ctx, k));
  html = prune(html, (row) => {
    const keys = [...row.matchAll(TOKEN)].map((m) => m[1]);
    return keys.length > 0 && keys.every((k) => optional.includes(k) && empty(k));
  });
  return html.replace(/<tr\b[^>]*>\s*<td\b[^>]*>\s*<table\b[^>]*>\s*(?:<tbody>\s*<\/tbody>)?\s*<\/table>\s*<\/td>\s*<\/tr>/g, '');
}

/** One filled fragment: {id, html, text, subject, preheader, hero, footerNote}. */
export function render(id, ctx = {}, { lists = {}, optional = [], multiline = [], hero: heroOverride = {} } = {}) {
  const f = fragment(id);
  let html = f.html.replace(/<!--each:(\w+)-->([\s\S]*?)<!--\/each:\1-->/g, (_, name, row) => {
    const items = lists[name] || [];
    return items.length ? items.map((item) => fillText(row, { ...ctx, row: item })).join('') : (f.lists[name] || '');
  });
  html = dropEmptyRows(html, ctx, optional);
  html = fillText(html, ctx, { multiline }).replace(/\n{3,}/g, '\n\n');
  const hero = Object.fromEntries(Object.entries({ ...f.hero, ...heroOverride }).map(([k, v]) => [k, k === 'purpose' ? v : fillText(v, ctx)]));
  return {
    id,
    html,
    text: plainText(html),
    subject: fillText(f.subject, ctx, { html: false }).replace(/\s+/g, ' ').trim(),
    preheader: fillText(f.preheader, ctx, { html: false }),
    hero,
    footerNote: fillText(f.footerNote, ctx),
  };
}

/** The text/plain part: one line per paragraph or table row. */
export function plainText(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ')
    .replace(/<\/span>/gi, ' ')
    .replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => `${label} (${href})`)
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|tr|h\d|li)>/gi, '\n').replace(/<\/t[dh]>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}

/** A CL fragment's body as its complete document holds it. The document carries Reference and Date in its docket band
    (letter structure of 2026-10-21), so the fragment's own Reference and Date row, which the build marks with
    <!--folio-docket-->, is left out, and the greeting loses the gap it kept below that row. */
export function documentBody(html) {
  return String(html ?? '').replace(/<!--folio-docket-->[\s\S]*?<!--\/folio-docket-->(\s*<tr><td style=")padding-top:14px("><p style="margin:)8px 0 0 0;/,
    (_, td, p) => `${td}${p}0;`);
}

/** The complete document for a rendered fragment: `shell` is its entry in config/email-documents.generated.js. The
    shell's own tokens (hero, docket, envelope, year) are filled from ctx; {{html}} takes the filled fragment's body. */
export function documentFor(shell, r, ctx = {}) {
  const full = { year: String(new Date().getFullYear()), ...ctx };
  return String(shell).replace(TOKEN, (_, k) => (k === 'html' ? documentBody(r.html) : esc(get(full, k) ?? '')));
}

/** The fields a sender puts on payload.email for one rendered fragment. */
export function emailFields(r) {
  return { subject: r.subject, html: r.html, text: r.text, preheader: r.preheader, hero: r.hero, footerNote: r.footerNote, templateId: r.id };
}

export const EmailFragmentService = Object.freeze({ fragment, render, fillText, plainText, emailFields, documentFor, documentBody, ids: () => Object.keys(EmailFragments) });
