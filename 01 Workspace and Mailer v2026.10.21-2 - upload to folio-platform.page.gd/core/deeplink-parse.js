/* Deep-link parsing — pure, so it can be tested without a browser.
   Spec: docs/architecture/PLATFORM_ACCESS_SPEC.md §8a (DL-1 to DL-3).

   Deep-link values are attacker-supplied. They are restricted to the allow-list in
   config/deeplink.config.js and bounded in length here; consumers must still escape at their
   own output boundary. */
import { DeepLinkConfig } from '../config/deeplink.config.js';

export const MAX_PARAM_LENGTH = 256;
const MAX_LIST = 50;
const bound = v => String(v ?? '').slice(0, MAX_PARAM_LENGTH);

/** Query parameters from the search AND from a hash like `#/route?x=1`; search wins. */
export function paramsFrom(url, base = 'http://localhost/') {
  const u = new URL(url, base);
  const merged = new URLSearchParams(u.search);
  const h = String(u.hash || '');
  const q = h.includes('?') ? h.slice(h.indexOf('?') + 1) : '';
  if (q) new URLSearchParams(q).forEach((v, k) => { if (!merged.has(k)) merged.set(k, v); });
  return { u, params: merged };
}

/**
 * What a link asks for: { route, action, matchedParam, context }.
 * `route` is '' when the link names nothing this platform understands.
 */
export function parseDeepLink(url, base, config = DeepLinkConfig) {
  const { u, params } = paramsFrom(url, base);
  const out = { route: '', context: {}, matchedParam: '', action: '' };
  for (const [param, spec] of Object.entries(config.acceptedParams)) {
    const raw = params.get(param);
    if (!raw) continue;
    if (spec.list) {
      const ids = String(raw).split(',').map(x => bound(x.trim())).filter(Boolean).slice(0, MAX_LIST);
      if (!ids.length) continue;
      out.context[spec.contextKey] = ids[0];
      out.context.taskIds = ids;
    } else {
      out.context[spec.contextKey] = bound(raw);
    }
    out.route = spec.route; out.matchedParam = param; out.action = spec.action;
    break;
  }
  /* `ref=TASK-2109` is a task, and is acknowledged rather than looked up. */
  const taskRef = out.matchedParam && out.context.referenceId && config.taskRefPattern
    ? String(out.context.referenceId).match(config.taskRefPattern) : null;
  if (taskRef && out.route === 'lookup') {
    out.route = 'acknowledgment'; out.action = 'acknowledge-task'; out.context.taskId = taskRef[1];
  }
  /* The page the link was sent to decides the route when it names one. */
  /* A forwarder page (acknowledge.html, support.html, …) names itself in `page`, because
     after forwarding the path is the Workspace's own. Only names in pathRoutes count. */
  const page = String(params.get('page') || u.pathname.split('/').pop()).toLowerCase();
  const byPath = config.pathRoutes?.[page];
  if (byPath) { out.route = byPath.route; out.action = byPath.action; out.matchedParam ||= `path:${page}`; }
  for (const p of config.preserveQueryParams) {
    const v = params.get(p);
    if (v && !(p in out.context)) out.context[p] = bound(v);
  }
  return out;
}

/** The one link format for a task or an item, for anything that writes a link (DL-2, DL-5). */
export function buildDeepLink(base, { taskId, referenceId } = {}) {
  if (!base || /localhost|127\.0\.0\.1/.test(base)) throw new Error('a deep link needs the production base URL, not a local one');
  const u = new URL(base);
  if (taskId) u.searchParams.set('TaskID', String(taskId));
  else if (referenceId) u.searchParams.set('ref', String(referenceId));
  else throw new Error('a deep link names a task or an item');
  return u.href;
}

/* Where Lookup looks for a linked item, and under which list name it shows it. */
const LINKED_COLLECTIONS = [['activities', 'activities'], ['tasks', 'tracking'], ['emails', 'emails'], ['comments', 'comments'], ['approvals', 'approvals']];

/**
 * The record a link names, matched on its list id or its reference number, first in the
 * order Lookup lists them. { type, id } or null when it is not among the loaded records.
 */
export function findLinkedRecord(state, ref) {
  const want = String(ref ?? '').trim().toLowerCase();
  if (!want) return null;
  for (const [type, key] of LINKED_COLLECTIONS) {
    const hit = (state?.[key] || []).find(r => String(r?.id ?? '').toLowerCase() === want
      || String(r?.referenceId ?? '').toLowerCase() === want);
    if (hit) return { type, id: String(hit.id) };
  }
  return null;
}
