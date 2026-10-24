import { canCurrentUserAccess } from './current-user.js';
/* F-21 (module rationalisation): screens linked to routes the officer's role cannot open (25 role/screen pairs: Command
   Center's "Open FastTrack" for every role, the Assignment Desk for executives, Registry for viewers…), and each link
   ended at the access-denied page. No module checked. This guard runs over every screen the router mounts, and again
   whenever a screen redraws itself: a link or button to a route the role cannot open is removed from view. The
   route itself still refuses, so this changes what is offered, not what is allowed. */
const ROUTE_OF = (el) => {
  const href = el.getAttribute('href') || el.dataset.href || el.dataset.openRoute || '';
  const m = /^#\/([^?#/]+)/.exec(href) || (el.dataset.openRoute ? [null, el.dataset.openRoute] : null);
  return m ? m[1] : '';
};
export function guardLinks(root) {
  if (!root?.querySelectorAll) return 0;
  let hidden = 0;
  for (const el of root.querySelectorAll('a[href^="#/"],[data-href^="#/"]')) {
    const route = ROUTE_OF(el);
    if (!route) continue;
    const allowed = canCurrentUserAccess(route);
    if (!allowed && !el.hasAttribute('data-link-denied')) { el.setAttribute('data-link-denied', route); el.hidden = true; hidden++; }
    else if (allowed && el.hasAttribute('data-link-denied')) { el.removeAttribute('data-link-denied'); el.hidden = false; }
  }
  return hidden;
}
const observed = new WeakSet();
export function watchLinks(root) {
  guardLinks(root);
  if (!root || observed.has(root) || typeof MutationObserver === 'undefined') return;
  observed.add(root);
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; guardLinks(root); }); }).observe(root, { childList: true, subtree: true });
}
