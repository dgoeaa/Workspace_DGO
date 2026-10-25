// A small rich-text editor for email bodies: a contenteditable surface with a formatting
// toolbar, a raw-HTML source mode, and merge-field chips that insert {{Field}} at the caret.
//
// document.execCommand is deprecated but still implemented by every engine, and it is the only
// way to get undo-aware formatting in a contenteditable without shipping an editor library.

import { esc } from './util.js';
import { sanitizeHtml } from './sanitize.js';

const TOOLS = [
  ['bold', 'B', 'Bold'], ['italic', 'I', 'Italic'], ['underline', 'U', 'Underline'],
  ['insertUnorderedList', '• List', 'Bulleted list'], ['insertOrderedList', '1. List', 'Numbered list'],
  ['createLink', 'Link', 'Insert link'], ['removeFormat', 'Clear', 'Clear formatting'],
];

/** Markup for one editor. `name` is the form field the HTML is written to. */
export function editorHtml({ id, name, value, fields = [] }) {
  /* The body may come from SharePoint (a shared template or mailing): cleaned before it is part
     of the page (sanitize.js). */
  value = sanitizeHtml(value);
  return `
    <div class="editor" data-editor="${esc(id)}">
      <div class="editor-bar" role="toolbar" aria-label="Formatting">
        ${TOOLS.map(([cmd, label, title]) => `<button type="button" class="tool" data-cmd="${cmd}" title="${esc(title)}">${esc(label)}</button>`).join('')}
        <span class="tool-sep"></span>
        <button type="button" class="tool" data-source aria-pressed="false" title="Edit the HTML directly">HTML</button>
      </div>
      <div class="editor-fields" aria-label="Insert a merge field">
        ${fields.map((f) => `<button type="button" class="chip" data-field="${esc(f)}" title="Insert {{${esc(f)}}}">${esc(f)}</button>`).join('')}
      </div>
      <div class="editor-surface" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Message body">${value || ''}</div>
      <textarea class="editor-source" hidden spellcheck="false" aria-label="Message body HTML">${esc(value || '')}</textarea>
      <input type="hidden" name="${esc(name)}" value="${esc(value || '')}">
    </div>`;
}

/** Wire an editor rendered by editorHtml(). `onChange(html)` fires on every edit. */
export function bindEditor(root, id, onChange = () => {}) {
  const el = root.querySelector(`[data-editor="${CSS.escape(id)}"]`);
  if (!el) return null;
  const surface = el.querySelector('.editor-surface');
  const source = el.querySelector('.editor-source');
  const hidden = el.querySelector('input[type=hidden]');
  const srcBtn = el.querySelector('[data-source]');
  let sourceMode = false;
  let lastRange = null;

  const value = () => (sourceMode ? source.value : surface.innerHTML);
  const sync = () => { hidden.value = value(); onChange(hidden.value); };

  surface.addEventListener('input', sync);
  source.addEventListener('input', sync);
  const remember = () => {
    const sel = document.getSelection();
    if (sel?.rangeCount && surface.contains(sel.anchorNode)) lastRange = sel.getRangeAt(0).cloneRange();
  };
  surface.addEventListener('keyup', remember);
  surface.addEventListener('mouseup', remember);
  surface.addEventListener('blur', remember);

  el.querySelector('.editor-bar').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-source')) {
      sourceMode = !sourceMode;
      if (sourceMode) source.value = surface.innerHTML; else surface.innerHTML = sanitizeHtml(source.value);
      source.hidden = !sourceMode;
      surface.hidden = sourceMode;
      srcBtn.setAttribute('aria-pressed', String(sourceMode));
      el.querySelectorAll('[data-cmd]').forEach((t) => { t.disabled = sourceMode; });
      sync();
      return;
    }
    const cmd = b.dataset.cmd;
    surface.focus();
    if (lastRange) { const sel = document.getSelection(); sel.removeAllRanges(); sel.addRange(lastRange); }
    if (cmd === 'createLink') {
      const url = prompt('Link address (https://…)');
      if (url && /^(https?:|mailto:)/i.test(url.trim())) document.execCommand('createLink', false, url.trim());
    } else document.execCommand(cmd, false, null);
    sync();
  });

  el.querySelector('.editor-fields').addEventListener('click', (e) => {
    const b = e.target.closest('[data-field]');
    if (!b) return;
    const token = `{{${b.dataset.field}}}`;
    if (sourceMode) {
      const s = source.selectionStart ?? source.value.length;
      source.value = source.value.slice(0, s) + token + source.value.slice(source.selectionEnd ?? s);
      source.focus();
      source.selectionStart = source.selectionEnd = s + token.length;
    } else {
      surface.focus();
      if (lastRange) { const sel = document.getSelection(); sel.removeAllRanges(); sel.addRange(lastRange); }
      document.execCommand('insertText', false, token);
      remember();
    }
    sync();
  });

  return { value, set(html) { const clean = sanitizeHtml(html); surface.innerHTML = clean; source.value = clean; sync(); } };
}
