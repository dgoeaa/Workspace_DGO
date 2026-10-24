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

const INSTRUMENT = 'docs/deployment/notification-instrument';
const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));

const decisions = read(`${INSTRUMENT}/tenant-execution/decisions/agency-decisions.json`);
const inventory = read(`${INSTRUMENT}/tenant-execution/evidence/tenant-inventory.json`);
const results = read(`${INSTRUMENT}/tenant-execution/evidence/notification-test-results.json`);
const acceptance = read(`${INSTRUMENT}/notification-acceptance-cases.json`);

const required = RequiredNotifications.length;

/* Safe defaults. */
assert.equal(decisions.status, 'BLOCKED');
assert.equal(inventory.evidenceStatus, 'NOT_CAPTURED');
assert.equal(results.results.length, 0);

/* In step with the matrix. */
assert.equal(results.summary.required, required,
  `the pack expects ${results.summary.required} results; the matrix requires ${required}`);
assert.equal(results.summary.blocked, required,
  `nothing is captured, so every one of the ${required} required results is blocked, not ${results.summary.blocked}`);

const cased = new Set(acceptance.cases.map((c) => c.requirementId));
const uncovered = RequiredNotifications.map((r) => r.id).filter((id) => !cased.has(id));
const orphaned = [...cased].filter((id) => !RequiredNotifications.some((r) => r.id === id));
assert.deepEqual(uncovered, [], `required rows with no acceptance case: ${uncovered.join(', ')}`);
assert.deepEqual(orphaned, [], `acceptance cases for rows that do not exist: ${orphaned.join(', ')}`);

console.log(`tenant execution pack: safe blocked defaults, ${required} required results, ${cased.size} acceptance cases`);
