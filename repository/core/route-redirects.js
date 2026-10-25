/**
 * The cut-over's redirects (essentials plan UX-401, docs/architecture/ESSENTIALS_MAP.md §6.2).
 *
 * A route that is no longer a place still opens: the router asks here first, and lands on the place its work moved to,
 * with that list opened at the matching filter (config/workflow-clarity.config.js RouteRedirects). A link that names a
 * record (?DGOPID=, ?ITEMID=, ?ref=) keeps its record: core/deeplink-resolver.js has already put it in deepLinkContext,
 * and the record page opens it once it has loaded. A link that opened a screen with a record chosen (State.selectedId,
 * set by the old hand-offs) opens that record.
 */
import { RouteRedirects } from '../config/workflow-clarity.config.js';
import { UIState } from './ui-state.js';
import { State } from './state.js';

const INBOX = { source: 'all', status: 'open', category: '', files: false, q: '', panel: '', selected: [] };

/** Where a route goes now, or null when it is a place. Applies the destination's filter as it answers. */
export function redirectFor(route) {
  const r = RouteRedirects[route];
  if (!r) return null;
  if (r.inbox) UIState.set('inbox', { ...UIState.get('inbox', INBOX), ...INBOX, ...r.inbox });
  if (r.tasks) UIState.set('tasks', { q: '', ...r.tasks });
  const selected = r.openSelected ? String(State.get().selectedId || '') : '';
  if (selected) {
    const ctx = State.get().deepLinkContext || {};
    State.patch({ selectedId: null, deepLinkContext: { ...ctx, taskId: '', referenceId: selected, recordPageOpenedAt: '' } }, { module: 'router', action: 'redirect:open-selected', ref: selected });
    setTimeout(() => dispatchEvent(new Event('dgo:open-linked-record')), 50);
  }
  return { to: r.to, palette: !!r.palette, support: !!r.support, why: r.why };
}
