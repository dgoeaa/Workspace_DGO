/* Every failed notice is registered; only some are reported (owner decision, 2026-10-18;
   config/notification-failure-groups.config.js).
 *
 * Registered: every mail send in every released identification package writes a Portal Outbox Receipts row that runs
 * after the send whether it succeeded or failed, so a failure always leaves Status failed. Placed: every message type
 * those receipts write belongs to a group, so nothing reaches the watch as unclassified by oversight. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FailureGroups, FailureGroupByType, FailureGroupByFlowType, FailureResolutions, FailureWatchDefaults, failureGroupOf } from '../config/notification-failure-groups.config.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const rel = read('docs/folio-Master-Flows-and-Endpoints/registers/identification-release.json');
const RECEIPTS = '88a81ca1-319a-45f5-8409-f91a24538ffa';
const SENDS = /^(SendEmailV2|SendEmail|SendMailWithOptions|SendEmailV3)$/;
let pass = 0; const ok = (c, m, d = '') => { assert.ok(c, `${m}${d ? `: ${d}` : ''}`); pass++; console.log(`  ✅ ${m}`); };

const sends = [], unregistered = [], types = [];
for (const p of Object.keys(rel.packages)) {
  const pkg = read(`docs/folio-Master-Flows-and-Endpoints/packages/${p}`);
  const flow = p.split('/').pop().split('__')[1];
  const visit = (c) => { for (const [n, a] of Object.entries(c || {})) {
    if (a.type === 'OpenApiConnection' && SENDS.test(a.inputs?.host?.operationId || '')) {
      sends.push(`${flow}/${n}`);
      const r = Object.values(c).find((b) => b.runAfter?.[n] && b.inputs?.parameters?.table === RECEIPTS);
      if (!r || !(r.runAfter[n] || []).includes('Failed') || !(r.runAfter[n] || []).includes('Succeeded')) unregistered.push(`${flow}/${n}`);
    }
    const pr = a.inputs?.parameters;
    if (pr?.table === RECEIPTS && pr['item/MessageType'] !== undefined && /^(PostItem|PatchItem)$/.test(a.inputs.host.operationId)) {
      const t = String(pr['item/MessageType']);
      if (!t.startsWith('@')) types.push({ flow, type: t });
      else { const m = /outputs\('([^']+)'\)/.exec(t); const src = m && JSON.stringify(locate(pkg.serializedValue.actions, m[1]) ?? '');
        for (const lit of (src || '').match(/'[a-z]+(?:-[a-z0-9]+)+'/g) || []) types.push({ flow, type: lit.slice(1, -1) }); }
    }
    visit(a.actions); if (a.else) visit(a.else.actions); for (const x of Object.values(a.cases || {})) visit(x.actions); if (a.default) visit(a.default.actions);
  } };
  visit(pkg.serializedValue?.actions);
}
function locate(o, name) { for (const [n, a] of Object.entries(o || {})) { if (n === name) return a; const f = locate(a.actions, name) ?? (a.else ? locate(a.else.actions, name) : undefined) ?? Object.values(a.cases || {}).map((x) => locate(x.actions, name)).find(Boolean); if (f) return f; } return undefined; }

console.log('Failure register');
ok(sends.length >= 40, `the released packages hold mail sends (${sends.length})`);
ok(!unregistered.length, 'every send writes its receipt after success and after failure', unregistered.join(', '));
const unplaced = types.filter((t) => failureGroupOf({ MessageType: t.type, Title: `${t.type}:${t.flow}:run` }) === 'unclassified');
ok(!unplaced.length, `every receipt message type is placed in a group (${new Set(types.map((t) => t.type)).size} types)`, unplaced.map((t) => `${t.flow}:${t.type}`).join(', '));
ok([...Object.values(FailureGroupByType), ...Object.values(FailureGroupByFlowType)].every((g) => FailureGroups[g]), 'every mapping names a declared group');
ok(failureGroupOf({ MessageType: 'an-email-v2', Title: 'an-email-v2:IP_OTP_GENERATE:x' }) === 'codes' && failureGroupOf({ MessageType: 'an-email-v2', Title: 'an-email-v2:Folio_Incoming_Correspondence_Scan_Processing_Flow:x' }) === 'ops', 'a type two flows share is placed by its flow');
ok(failureGroupOf({ MessageType: 'something-new', Title: '' }) === 'unclassified' && FailureGroups.unclassified.reported, 'an unknown type is reported (fail-safe)');
ok(FailureGroups.citizen.reported && !FailureGroups.codes.reported && !FailureGroups.staff.reported && !FailureGroups.ops.reported && !FailureGroups.outward.reported, 'only citizen outcomes (and unknown types) are reported by default');
ok(Object.keys(FailureResolutions).every((k) => k.startsWith('resolved-')) && !('failed' in FailureResolutions), 'a resolution is a Status other than failed, so the open set is Status failed');
ok(FailureWatchDefaults.schedule.hours[0] === 7 && FailureWatchDefaults.schedule.hours.at(-1) === 18 && FailureWatchDefaults.schedule.weekDays.length === 5, 'the watch runs hourly, 07:00 to 18:00, Monday to Friday');

/* The watch package itself. */
const watch = Object.keys(rel.packages).find((p) => p.includes('Folio_Failure_Watch'));
ok(!!watch, 'the released set holds the Folio_Failure_Watch package');
const W = JSON.stringify(read(`docs/folio-Master-Flows-and-Endpoints/packages/${watch}`));
ok(W.includes("Status eq ''failed'' and Created gt") && W.includes('NOTIFY_FAILURE_WATCH_CURSOR') && W.includes('NOTIFY_FAILURE_HEALTH'), 'the watch reads each failure once, by its cursor, and writes the health row');
ok(!/emailMessage\/Body[^}]*item\(\)\?\['Body'\]/.test(W) && !W.includes("'Body'"), 'the watch carries no message body');
ok(W.includes("if(empty(string(coalesce(item()?['LastError'],''))),'',substring("), 'a receipt with no LastError does not break the watch (tenant, 2026-10-18: substring of an empty string)');
ok(W.includes("concat('utc:'") && W.includes("startsWith(") && W.includes("'utc:'"), 'the cursor is stored with a utc: prefix, so the list cannot reformat it (tenant, 2026-10-18)');
ok(W.includes('Compose_Watch_Run_Outcome') && W.includes("'watch-failed'"), 'a watch that could not do its job ends its run Failed');
ok(W.includes("not(equals(string(coalesce(actions('Condition_Watch_Report')?['status'],'')),'Failed'))"), 'the cursor does not move past a window whose report failed');
const F = JSON.stringify(read(`docs/folio-Master-Flows-and-Endpoints/packages/${Object.keys(rel.packages).find((p) => p.includes('FETCH_ALL__'))}`));
ok(F.includes('failureHealth') && F.includes("Title eq 'NOTIFY_FAILURE_HEALTH'"), 'FETCH_ALL returns the health row as failureHealth');
/* A malformed citizen address must not stop a registry alert (tenant, 2026-10-18). */
for (const [key, send] of [['SUPPORT__', 'Send_Helpdesk_Alert_Email'], ['WRITEBACK__', 'Send_Writeback_Alert_Email']]) {
  const P = read(`docs/folio-Master-Flows-and-Endpoints/packages/${Object.keys(rel.packages).find((p) => p.includes(key))}`);
  let rt = null; const walk = (o) => { for (const [n, a] of Object.entries(o || {})) { if (n === send) rt = a.inputs.parameters['emailMessage/ReplyTo']; walk(a.actions); if (a.else) walk(a.else.actions); for (const c of Object.values(a.cases || {})) walk(c.actions); } };
  walk(P.serializedValue.actions);
  ok(typeof rt === 'string' && rt.startsWith('@if(and(equals(length(split(') && rt.includes("not(contains(") && rt.includes("Compose_Notify_Config')?['replyTo']"), `${send}: a citizen address is its Reply-To only when well formed`);
}
console.log(`\n✅ ${pass} passed, 0 failed`);
