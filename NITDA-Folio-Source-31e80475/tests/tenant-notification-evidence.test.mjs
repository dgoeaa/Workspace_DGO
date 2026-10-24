/* The tenant-execution pack, checked against the matrix it serves.
 *
 * This file arrived with the notification instrument and, until 2026-09-09, ran nowhere. It was
 * in no npm script, and it read `deployment/tenant-execution/...` — the layout of the repository
 * it was written in, not this one, where the pack sits under `docs/deployment/notification-
 * instrument/`. It therefore threw ENOENT on its first read and nobody saw it, which is the only
 * reason a hard-coded `38` survived inside it.
 *
 * Two things are asserted here. The pack's defaults must be SAFE: a tenant that has captured
 * nothing reads as blocked and not-captured, never as ready — an evidence pack that defaults to
 * "fine" is worse than no pack. And the pack must be IN STEP with the matrix: one acceptance case
 * per required row, and a required-count taken from the matrix's own length rather than a number
 * someone has to remember to raise. Adding a row and forgetting its acceptance case is exactly
 * the drift this catches, and nothing else in the repository was catching it. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RequiredNotifications } from '../config/notification-matrix.config.js';

const INSTRUMENT = 'docs/folio-Master-Flows-and-Endpoints/deployment/notification-instrument';
const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));

const decisions = read(`${INSTRUMENT}/tenant-execution/decisions/agency-decisions.json`);
const inventory = read(`${INSTRUMENT}/tenant-execution/evidence/tenant-inventory.json`);
const results = read(`${INSTRUMENT}/tenant-execution/evidence/notification-test-results.json`);
const acceptance = read(`${INSTRUMENT}/notification-acceptance-cases.json`);

/* A row the owner withdrew (RN-033, SMS: owner 2026-10-03, confirmed 2026-10-19) is not a notification Folio sends, so it is
   not tested and not counted: the pack covers the rows still in service. */
const tested = RequiredNotifications.filter((r) => r.status !== 'WITHDRAWN');
const required = tested.length;

/* Safe states. Decisions may be BLOCKED or PROPOSED; APPROVED only with every approval recorded. The inventory
   may be NOT_CAPTURED, or CAPTURED with its commit, flows and endpoints (ITEM-71 gate 1, 2026-10-16). */
assert.ok(['BLOCKED', 'PROPOSED', 'APPROVED'].includes(decisions.status), `decisions status ${decisions.status}`);
if (decisions.status === 'APPROVED') for (const [k, v] of Object.entries(decisions.approvals)) assert.ok(v, `decisions are APPROVED but ${k} is not recorded`);
else assert.ok(Object.values(decisions.approvals).every((v) => !v), 'an approval is recorded on decisions that are not APPROVED');
assert.ok(['NOT_CAPTURED', 'CAPTURED'].includes(inventory.evidenceStatus), `inventory status ${inventory.evidenceStatus}`);
if (inventory.evidenceStatus === 'CAPTURED') assert.ok(inventory.authoritativeCommit && inventory.capturedAtUtc && inventory.flows.length && inventory.endpoints.length, 'a CAPTURED inventory carries its commit, time, flows and endpoints');
else assert.equal(inventory.flows.length, 0);
/* Results: none, or one per required row (2026-10-18), with the summary counted from the rows. */
assert.ok(results.results.length === 0 || results.results.length === required,
  `the pack holds ${results.results.length} results; it holds none or one per required row (${required})`);
const count = (s) => (results.results.length ? results.results.filter((r) => r.status === s).length : 0);
const blockedCount = results.results.length ? count('BLOCKED') : required;

/* In step with the matrix. */
assert.equal(results.summary.required, required,
  `the pack expects ${results.summary.required} results; the matrix requires ${required}`);
assert.equal(results.summary.blocked, blockedCount, `summary.blocked ${results.summary.blocked}; the rows give ${blockedCount}`);
for (const s of ['passed', 'failed']) assert.equal(results.summary[s], count(s.toUpperCase()), `summary.${s} does not match the rows`);
assert.equal(results.summary.riskAccepted, count('RISK_ACCEPTED'), 'summary.riskAccepted does not match the rows');
const outOfService = results.results.filter((r) => !tested.some((x) => x.id === r.requirementId)).map((r) => r.requirementId);
assert.deepEqual(outOfService, [], `results for rows that are not in service (withdrawn or unknown): ${outOfService.join(', ')}`);

const cased = new Set(acceptance.cases.map((c) => c.requirementId));
const uncovered = tested.map((r) => r.id).filter((id) => !cased.has(id));
const orphaned = [...cased].filter((id) => !tested.some((r) => r.id === id)); /* a withdrawn row has no case either */
assert.deepEqual(uncovered, [], `required rows with no acceptance case: ${uncovered.join(', ')}`);
assert.deepEqual(orphaned, [], `acceptance cases for rows that do not exist: ${orphaned.join(', ')}`);

console.log(`tenant execution pack: safe states, ${results.results.length}/${required} results (${count('PASSED')} passed), ${cased.size} acceptance cases`);
