#!/usr/bin/env node
/**
 * The staff portal-status write-back client (DECISIONS.md D1, ITEM-6; core/portal-status-service.js).
 *
 *   - unconfigured: refused without a network call
 *   - the request: PUT to the SCAN_INTAKE address, X-DGO-Action writeback, JSON body, no identity field in the body
 *   - only the portal's governed staff statuses are sent; withdrawn (the citizen's) and unknown values are refused locally
 *   - the reply is read from the flow's envelope; each refusal maps to a reason the screen can explain
 *   - the loader reads FETCH_ALL data.register into portalRegister on the portal lane
 */
let passed = 0; const failures = [];
const check = (name, ok, detail = '') => { if (ok) { passed++; console.log(`  ✅ ${name}`); } else { failures.push(name); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); } };
console.log('\nPortal status write-back (D1)\n');

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const URL_ = 'https://flow.example/powerautomate/automations/direct/workflows/88401ce1f44148539c0da53c9491f8e6/triggers/manual/paths/invoke?api-version=1&sig=' + 'A'.repeat(43);
const UNCONFIGURED = process.argv.includes('--unconfigured');
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
/* The endpoint registry reads window.DGO_CONFIG once, at import: each configuration runs in its own process. */
globalThis.window = { DGO_CONFIG: { endpoints: UNCONFIGURED ? {} : { SCAN_INTAKE: URL_ } } };
globalThis.document = undefined;
const svc = await import('../core/portal-status-service.js');
if (UNCONFIGURED) {
  let calls = 0;
  const none = await svc.setPortalStatus({ referenceId: 'NITDA-2026-00018', status: 'review' }, { fetchImpl: async () => { calls++; } });
  process.exit(none.ok === false && none.reason === 'not-configured' && calls === 0 && svc.portalStatusConfigured() === false ? 0 : 1);
}
const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--unconfigured'], { encoding: 'utf8' });
check('unconfigured: refused as not-configured, and nothing is sent', child.status === 0, child.stderr.slice(0, 300));
let calls = 0;
let seen = null;
const reply = (status, body) => async (url, init) => { seen = { url, init }; return { ok: status < 300, status, json: async () => body }; };
const ok = await svc.setPortalStatus({ referenceId: ' nitda-2026-00018 ', status: 'Review', note: 'Assigned to Legal.' },
  { fetchImpl: reply(200, { referenceId: 'NITDA-2026-00018', data: { status: 'review', label: 'Under review.', updatedBy: 'officer@nitda.gov.ng' } }) });
const sent = JSON.parse(seen?.init?.body || '{}');
check('the request is a PUT to the SCAN_INTAKE address with X-DGO-Action writeback', seen?.url === URL_ && seen.init.method === 'PUT' && seen.init.headers['X-DGO-Action'] === 'writeback' && seen.init.headers['Content-Type'] === 'application/json');
check('the body carries the reference (upper case), the status (lower case) and the note, and no identity of its own',
  sent.referenceId === 'NITDA-2026-00018' && sent.status === 'review' && sent.note === 'Assigned to Legal.' && !('email' in sent) && !('caller' in sent) && !('userEmail' in sent));
check('a 200 reply gives the reference, status, label and the officer the flow recorded',
  ok.ok && ok.referenceId === 'NITDA-2026-00018' && ok.status === 'review' && ok.label === 'Under review.' && ok.updatedBy === 'officer@nitda.gov.ng');

calls = 0;
const counting = async () => { calls++; return { ok: true, status: 200, json: async () => ({}) }; };
const wd = await svc.setPortalStatus({ referenceId: 'NITDA-2026-00018', status: 'withdrawn' }, { fetchImpl: counting });
const bad = await svc.setPortalStatus({ referenceId: 'NITDA-2026-00018', status: 'closed' }, { fetchImpl: counting });
const noref = await svc.setPortalStatus({ referenceId: '', status: 'review' }, { fetchImpl: counting });
check('withdrawn, an unknown status and a missing reference are refused locally, with no call', wd.reason === 'invalid' && bad.reason === 'invalid' && noref.reason === 'invalid' && calls === 0);
check('the staff statuses are the portal\'s governed values, without withdrawn',
  JSON.stringify(svc.PORTAL_STAFF_STATUSES.map((s) => s.value)) === JSON.stringify(['received', 'validation', 'review', 'action-required', 'approved', 'declined']));

const map = {};
for (const [code, want] of [[401, 'unauthenticated'], [403, 'forbidden'], [404, 'not-found'], [400, 'invalid'], [500, 'refused']]) {
  const r = await svc.setPortalStatus({ referenceId: 'NITDA-2026-00018', status: 'review' }, { fetchImpl: reply(code, {}) });
  map[code] = r.reason === want && r.ok === false;
}
check('refusals map to reasons: 401 unauthenticated, 403 forbidden, 404 not-found, 400 invalid, other refused', Object.values(map).every(Boolean), JSON.stringify(map));
const down = await svc.setPortalStatus({ referenceId: 'NITDA-2026-00018', status: 'review' }, { fetchImpl: async () => { throw new Error('offline'); } });
check('a network failure is unreachable', down.ok === false && down.reason === 'unreachable');

const loader = await import('../core/data-loader.js');
const parsed = loader.parseFetchAll({ ok: true, status: { http: 200 }, data: { register: [{ referenceId: 'NITDA-2026-00018', subject: 'Bridging the digital divide', channel: 'Portal', status: { Value: 'received' }, senderEmail: 'citizen@example.org', submittedAtUtc: '2026-10-08T04:41:51Z' }] } });
const row = (parsed.patch.portalRegister || [])[0] || {};
check('the loader reads FETCH_ALL register rows into portalRegister, on the portal lane, with the status as text',
  row.referenceId === 'NITDA-2026-00018' && row.status === 'received' && row.entryPoint === 'public-portal' && parsed.feeds.portalRegister?.byEntryPoint?.['public-portal'] === 1, JSON.stringify({ row, feeds: parsed.feeds.portalRegister }));

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
