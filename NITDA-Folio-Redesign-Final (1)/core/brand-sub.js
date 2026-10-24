// The DGO Digital Ops lockup for surfaces drawn by script.
//
// The markup lives once, in index.html's <template id="dgo-sub-tpl">, written there by
// `npm run brand:sync` from scripts/lib/brand-kit.mjs (styles: kit/brand-platform.css). The shell
// and the welcome screens clone it rather than keep a copy of their own.
//
// DGO Digital Ops is the internal sub-brand: it appears on staff-facing screens only, always
// beside the NITDA logo, never on the public portal (styles/dgo-design-system/README.md).

export function dgoSub({ reverse = true, size = '' } = {}) {
  const tpl = typeof document !== 'undefined' && document.getElementById('dgo-sub-tpl');
  if (!tpl) return '';
  const el = tpl.content.firstElementChild.cloneNode(true);
  el.classList.toggle('bk-sub--reverse', reverse);
  if (!reverse) el.classList.add('bk-sub--brand');
  if (size) el.classList.add(`bk-sub--${size}`);
  return el.outerHTML;
}
