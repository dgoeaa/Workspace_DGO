// Letter HTML that came from storage or from SharePoint (a template, a mailing's body) is put
// into the page only after this has cleaned it. Templates and mailings are shared data: anyone
// who can write them could otherwise place markup inside the mailer itself — a <meta refresh>
// that sends the tab to a look-alike sign-in page, or a <style> that restyles the whole app.
//
// It keeps what a letter needs (paragraphs, emphasis, lists, tables, links, images, inline
// styles) and removes everything else:
//   - elements that act on the page (script, style, meta, base, link, iframe, object, embed,
//     form and its fields, svg, math, template) are removed with their content;
//   - any other element not on the list is unwrapped: its text stays, the tag goes;
//   - comments are removed;
//   - every on* attribute, id, class, and any attribute not on the list, is removed;
//   - href and src keep only http(s) and mailto (and data:image for src);
//   - inline style loses anything that could lift an element out of the letter onto the page
//     (position, z-index, top/left/right/bottom/inset) and any url() or expression().
//
// Merge fields ({{Field}}, {{{Field}}}) are text, so they pass through untouched.

const DROP = new Set(['script', 'style', 'meta', 'base', 'link', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'form', 'input', 'button', 'textarea', 'select', 'option', 'svg', 'math', 'template', 'noscript', 'title', 'head', 'audio', 'video', 'source', 'track', 'portal']);
const KEEP = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'small', 'big', 'mark', 'span', 'div', 'font', 'center',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'a', 'img',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'col', 'colgroup']);
const ATTRS = new Set(['href', 'src', 'alt', 'title', 'style', 'width', 'height', 'align', 'valign', 'colspan', 'rowspan', 'border',
  'cellpadding', 'cellspacing', 'color', 'face', 'size', 'bgcolor', 'target', 'dir', 'lang']);
const STYLE_BANNED = /^(position|z-index|top|left|right|bottom|inset(-.*)?|behavior|-moz-binding)$/i;

const safeUrl = (v, { image = false } = {}) => {
  const u = String(v || '').trim();
  if (/^(https?:|mailto:)/i.test(u) || /^[#/?]/.test(u) || /^\{\{\{?\w+\??\}\}\}?$/.test(u)) return u;
  if (image && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(u)) return u;
  return null;
};

export function cleanStyle(style) {
  return String(style || '').split(';').map((d) => d.trim()).filter(Boolean).filter((d) => {
    const i = d.indexOf(':');
    if (i < 1) return false;
    const prop = d.slice(0, i).trim();
    const val = d.slice(i + 1);
    return !STYLE_BANNED.test(prop) && !/url\s*\(|expression\s*\(|javascript:/i.test(val);
  }).join('; ');
}

function cleanNode(node, doc) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 8) { child.remove(); continue; } // comments
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toLowerCase();
    if (DROP.has(tag)) { child.remove(); continue; }
    cleanNode(child, doc);
    if (!KEEP.has(tag)) { child.replaceWith(...child.childNodes); continue; }
    for (const { name, value } of [...child.attributes]) {
      const n = name.toLowerCase();
      if (!ATTRS.has(n)) { child.removeAttribute(name); continue; }
      if (n === 'href' || n === 'src') {
        const ok = safeUrl(value, { image: n === 'src' && tag === 'img' });
        if (ok === null) child.removeAttribute(name); else child.setAttribute(name, ok);
      } else if (n === 'style') {
        const s = cleanStyle(value);
        if (s) child.setAttribute('style', s); else child.removeAttribute('style');
      } else if (n === 'target') child.setAttribute('target', '_blank');
    }
    if (tag === 'a' && child.hasAttribute('target')) child.setAttribute('rel', 'noopener noreferrer');
  }
}

/** Clean letter HTML for display in the page. Without a DOM (tests, tools) everything is escaped. */
export function sanitizeHtml(html) {
  const src = String(html ?? '');
  if (!src) return '';
  if (typeof DOMParser === 'undefined') return src.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${src}</body></html>`, 'text/html');
  /* Anything the parser hoisted into <head> (meta, style, base, link, title) is dropped with it. */
  cleanNode(doc.body, doc);
  return doc.body.innerHTML;
}
