// The merge engine: turns a template plus one recipient's fields into that recipient's message.
//
//   {{Field}}     the value, HTML-escaped (in a body) — newlines become <br>
//   {{Field?}}    the same, but optional: no value means nothing, not an error — and a
//                 paragraph left empty by it is removed
//   {{{Field}}}   the value inserted as-is — for operator-authored HTML such as SignatureBlock
//
// Field names are matched case-insensitively. A field with no value is reported, never
// silently dropped: a letter that reads "Dear ," has gone to a head of agency, and the mailer
// refuses to send any message that still carries an unresolved field.

import { esc } from './util.js';

export const FIELD_RE = /\{\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}\}|\{\{\s*([A-Za-z][A-Za-z0-9_]*)(\?)?\s*\}\}/g;

/** Every field a template mentions, in first-seen order, without duplicates. */
export function fieldsIn(...templates) {
  const seen = new Map();
  for (const t of templates) {
    for (const m of String(t ?? '').matchAll(FIELD_RE)) {
      const name = m[1] || m[2];
      if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
    }
  }
  return [...seen.values()];
}

function lookup(data, name) {
  if (Object.prototype.hasOwnProperty.call(data, name)) return data[name];
  const lower = name.toLowerCase();
  for (const k of Object.keys(data)) if (k.toLowerCase() === lower) return data[k];
  return undefined;
}

const present = (v) => v !== undefined && v !== null && String(v).trim() !== '';

/**
 * Merge one template string.
 * @param {string} template
 * @param {Record<string, unknown>} data
 * @param {{html?: boolean}} opts  html:true escapes {{…}} values for an HTML body
 * @returns {{text: string, missing: string[]}}
 */
export function merge(template, data, { html = false } = {}) {
  const missing = new Set();
  let text = String(template ?? '').replace(FIELD_RE, (whole, raw, plain, optional) => {
    const name = raw || plain;
    const v = lookup(data, name);
    if (!present(v)) {
      if (optional) return '';
      missing.add(name);
      return whole;
    }
    if (raw) return String(v);
    if (!html) return String(v).replace(/\s*\n\s*/g, ' ').trim();
    return esc(v).replace(/\r?\n/g, '<br>');
  });
  /* A paragraph an optional field left empty would print as a blank gap in the letter. */
  if (html) text = text.replace(/<p\b[^>]*>\s*<\/p>\s*/gi, '');
  return { text, missing: [...missing] };
}

/** Highlight unresolved fields in a rendered preview. The input is already-merged HTML. */
export const markMissing = (html) => String(html).replace(FIELD_RE, (w) => `<mark class="mm-missing" title="No value for this field">${esc(w)}</mark>`);
