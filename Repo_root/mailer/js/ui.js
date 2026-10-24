// UI primitives: toasts, a modal dialog, badges. Views render HTML strings built with esc();
// nothing here inserts unescaped text that came from a person or a flow. Letter HTML is shown
// only in a sandboxed frame (previewFrame) or, in the editor, after sanitize.js has cleaned it.

import { esc } from './util.js';

/* How long a notice stays, by kind. An error stays until it is dismissed: a failure that fades
   before anyone reads it has not been reported. Every notice can be clicked away, and anything
   an operation did is also in its report (reports.js), so nothing depends on catching a notice. */
const TOAST_MS = { ok: 8000, info: 8000, warn: 15000, bad: 0 };

export function toast(message, kind = 'info', ms = TOAST_MS[kind] ?? 8000, { action } = {}) {
  let host = document.getElementById('toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  const dismiss = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  const text = document.createElement('span');
  text.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '✕';
  el.append(text);
  /* An optional action, e.g. { label: 'View report', run: () => … }: the notice closes when used. */
  if (action) {
    const act = document.createElement('button');
    act.type = 'button';
    act.className = 'toast-action';
    act.textContent = action.label;
    act.addEventListener('click', () => { dismiss(); action.run(); });
    el.append(act);
  }
  el.append(close);
  host.appendChild(el);
  /* At most three at once: the oldest gives way (its outcome is in the report either way). */
  const shown = [...host.children].filter((x) => !x.classList.contains('out'));
  if (shown.length > 3) shown[0].querySelector('.toast-close')?.click();
  close.addEventListener('click', dismiss);
  if (ms > 0) setTimeout(dismiss, Math.max(ms, 1500));
}

/**
 * A modal dialog. Resolves with the submitted FormData as an object, or null when dismissed.
 * @param {{title:string, body:string, submit?:string, cancel?:string, danger?:boolean, wide?:boolean}} o
 *        `body` is trusted HTML built by the caller with esc().
 */
export function modal({ title, body, submit = 'Save', cancel = 'Cancel', danger = false, wide = false, onOpen }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = `modal${wide ? ' modal-wide' : ''}`;
    dlg.innerHTML = `
      <form method="dialog" class="modal-form" novalidate>
        <header class="modal-head"><h2>${esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
        <div class="modal-body">${body}</div>
        <footer class="modal-foot">
          ${cancel ? `<button type="button" class="btn" data-close>${esc(cancel)}</button>` : ''}
          ${submit ? `<button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok">${esc(submit)}</button>` : ''}
        </footer>
      </form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    let result = null;
    const close = () => { dlg.close(); };
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    form.addEventListener('submit', (e) => {
      if (!form.checkValidity()) { e.preventDefault(); form.reportValidity(); return; }
      const fd = new FormData(form);
      result = {};
      for (const [k, v] of fd.entries()) {
        if (k in result) result[k] = [].concat(result[k], v);
        else result[k] = v;
      }
      form.querySelectorAll('input[type=checkbox][name]').forEach((c) => { if (!fd.has(c.name)) result[c.name] = false; else if (result[c.name] === 'on') result[c.name] = true; });
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
    onOpen?.(dlg);
    dlg.querySelector('input:not([type=hidden]),textarea,select')?.focus();
  });
}

export const confirmDialog = (title, message, { submit = 'Confirm', danger = false } = {}) =>
  modal({ title, body: `<p>${esc(message)}</p>`, submit, danger }).then((r) => r !== null);

export function badge(text, kind = 'neutral', title = '') {
  return `<span class="badge badge-${kind}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;
}

export const STATUS_BADGE = {
  pending: ['Pending', 'neutral'],
  sending: ['Sending…', 'info'],
  sent: ['Sent', 'ok'],
  duplicate: ['Sent (earlier)', 'ok'],
  simulated: ['Simulated', 'info'],
  failed: ['Failed', 'bad'],
  refused: ['Refused', 'bad'],
  skipped: ['Skipped', 'warn'],
};

export function statusBadge(status, title = '') {
  const [label, kind] = STATUS_BADGE[status] || [status || 'Pending', 'neutral'];
  return badge(label, kind, title);
}

export const empty = (title, text, action = '') =>
  `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;

/** A sandboxed iframe preview of an email body. Scripts never run inside it. */
export function previewFrame(html, title = 'Message preview') {
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:16px;background:#fff;color:#1b1b1b}mark.mm-missing{background:#ffe08a;color:#5a3d00;padding:0 2px;border-radius:2px}</style></head><body>${html}</body></html>`;
  return `<iframe class="preview-frame" title="${esc(title)}" sandbox="allow-popups" srcdoc="${esc(doc)}"></iframe>`;
}
