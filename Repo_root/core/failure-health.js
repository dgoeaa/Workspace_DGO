/* Failed notices, as System Health shows them (owner decision, 2026-10-18).
 *
 * Every failed notice is registered in Portal Outbox Receipts (Status failed); Folio_Failure_Watch reports only some of
 * them and writes the open count per group to Flow Configuration NOTIFY_FAILURE_HEALTH, which FETCH_ALL returns as
 * failureHealth (registry, executive and administrator callers only). This shows that row, read-only, and links to the
 * register itself: nothing here sends or changes anything. */
import { FailureGroups, FailureResolutions } from '../config/notification-failure-groups.config.js';

export const FAILURE_REGISTER_URL = 'https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre/Lists/Portal%20Outbox%20Receipts';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const count = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0);

/** The FETCH_ALL failureHealth value as the Workspace keeps it, or null when the reply carried none. */
export function normalizeFailureHealth(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const open = Object.fromEntries(Object.keys(FailureGroups).map((g) => [g, count(raw.open?.[g])]));
  const at = typeof raw.at === 'string' && !Number.isNaN(Date.parse(raw.at)) ? raw.at : '';
  return { at, open, openTotal: count(raw.openTotal ?? Object.values(open).reduce((a, b) => a + b, 0)), newSinceLastRun: count(raw.newSinceLastRun), connectionBroken: raw.connectionBroken === true };
}

/** The System Health panel. `health` is normalizeFailureHealth's result (or null). */
export function failureHealthPanel(health) {
  const link = `<a href="${FAILURE_REGISTER_URL}" target="_blank" rel="noopener">Open the delivery record list</a> and filter Status to failed.`;
  if (!health) return `<section class="panel" data-failure-health="none"><div class="eyebrow">Failed notices</div>
    <p class="meta">No check has been reported yet. Every failed notice is still registered in Portal Outbox Receipts. ${link}</p></section>`;
  const rows = Object.entries(FailureGroups).map(([g, d]) => `<tr><td>${esc(d.label)}</td><td>${health.open[g]}</td><td>${d.reported ? 'reported to the server' : 'registered and counted'}</td></tr>`).join('');
  const when = health.at ? new Date(health.at).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }) : 'unknown';
  return `<section class="panel" data-failure-health="${health.connectionBroken ? 'broken' : 'ok'}"><div class="eyebrow">Failed notices</div>
    ${health.connectionBroken ? `<p><span class="pill danger">Mail connection may be broken</span> ${health.newSinceLastRun} notices failed in the last hour. Check the registry mailbox connection in Power Automate.</p>` : ''}
    <p><b>${health.openTotal}</b> open &middot; ${health.newSinceLastRun} new at the last check &middot; checked ${esc(when)} (West Africa Time)</p>
    <table class="dgo-table"><thead><tr><th>Group</th><th>Open</th><th>Handling</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="meta">${link} A failure is closed by setting its Status to ${Object.keys(FailureResolutions).map((k) => `<code>${k}</code>`).join(', ')}.</p></section>`;
}
