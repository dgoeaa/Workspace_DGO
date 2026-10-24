/* The report e-mails: Reports (modules/reports.js, register row TR-089) and Statistics (modules/statistics.js, TR-090).
 *
 * Each used to post a bare HTML document with no inline styling as payload.html, which the IP_SEND_EMAIL frame then
 * wrapped (findings F1 and F4). Each now sends its design's body fragment from the e-mail template package
 * (RP-Management, RP-Statistics) with the hero and footer note the frame draws. The lists are filled from the rows
 * the screen shows; an empty range prints the fragment's empty-state row. */
import { DeepLinkConfig } from '../config/deeplink.config.js';
import { buildDeepLink } from './deeplink-parse.js';
import { reportSummary, groupCount } from './report-export-service.js';
import { render, emailFields } from './email-fragment-service.js';

const val = (x) => (typeof x === 'object' && x ? (x.Value || x.value || '') : (x || ''));
const statusOf = (r) => val(r.taskStatus || r.activityStatus || r.status);
const reportsUrl = () => new URL('#/reports', DeepLinkConfig.productionBase).href;
const rowUrl = (r) => (/^https?:/i.test(r.link || '') ? r.link : r.referenceId ? buildDeepLink(DeepLinkConfig.productionBase, { referenceId: r.referenceId }) : reportsUrl());
const stamp = (d) => d.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
const fmtDate = (v) => String(v ?? '').slice(0, 10); // core/ui.js fmtDate, without its DOM imports
const LIST_LIMIT = 80;

/** RP-Management: the summary tiles, the insight line and the task list. */
export function managementReportEmail({ profile = {}, rows = [], reportName = 'DGO Report', start = '', end = '' } = {}) {
  const sum = reportSummary(rows);
  const ctx = {
    reportName, start: start || 'the beginning', end: end || 'today',
    profileName: profile.name || profile.email || 'colleague', persona: profile.persona || profile.department || 'Not recorded',
    ...sum, reportsUrl: reportsUrl(),
    insight: sum.overdue ? 'Immediate attention is required for overdue items.' : 'No overdue item is visible in the selected range.',
  };
  const list = rows.slice(0, LIST_LIMIT).map((r) => ({ title: r.title || '', assignedTo: r.assignedTo || 'Unassigned', category: r.category || '', due: r.due || '—', status: statusOf(r) || 'Pending', ack: val(r.ack) || 'Pending', url: rowUrl(r) }));
  return emailFields(render('RP-Management', ctx, { lists: { rows: list } }));
}

/** RP-Statistics: the summary tiles, the status breakdown and the record list. */
export function statisticsReportEmail({ profile = {}, rows = [], start = '', end = '', now = new Date() } = {}) {
  const total = rows.length, assigned = rows.filter((r) => r.assignedTo).length;
  const ctx = {
    profileName: profile.name || profile.email || 'a Folio officer', start: start || 'All', end: end || 'Now', yyyyMMddHHmmss: stamp(now),
    total, completed: reportSummary(rows).completed, coverage: total ? `${Math.round(assigned / total * 100)}%` : '—',
  };
  const stats = groupCount(rows.map((r) => ({ stat: statusOf(r) || 'Blank' })), 'stat');
  const max = Math.max(1, ...stats.map(([, n]) => n));
  const bars = stats.slice(0, 12).map(([label, count]) => ({ label, count, pct: Math.max(2, Math.round(count / max * 100)) }));
  const list = rows.slice(0, LIST_LIMIT).map((r, i) => ({ n: i + 1, title: r.title || '', kind: r.kind || '', category: r.category || '', assignedTo: r.assignedTo || 'Unassigned', date: fmtDate(r.created || r.start || '') || '—', priority: r.priorityLabel || r.priority || '—', status: statusOf(r) || 'Blank', url: rowUrl(r) }));
  return emailFields(render('RP-Statistics', ctx, { lists: { bars, rows: list } }));
}
