/**
 * Folio replays (IDENTIFICATION_SYSTEM.md §8.3, decision B3): a queued write is replayed with the
 * idempotency key it was queued with, a key never carries personal data, and a write queued more
 * than 7 days ago is held for review instead of being sent again.
 */
import assert from 'node:assert/strict';

const { PendingQueue, REPLAY_LIMIT_MS } = await import('../core/pending-queue.js');
const { State } = await import('../core/state.js');
const { Idempotency } = await import('../core/idempotency.js');

let passed = 0;
const ok = async (name, fn) => { try { await fn(); passed++; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
const actor = { email: 'Officer@nitda.gov.ng' };

await ok('an item queued with a key is replayed with that key', async () => {
  const k = await Idempotency.key({ operation: 'update-task', ref: 'TASK-2026-00417', actor, payload: { status: 'done' } });
  assert.equal(await PendingQueue.replayKey({ idempotencyKey: k, payload: {} }, actor), k);
  assert.equal(await PendingQueue.replayKey({ payload: { idempotencyKey: k } }, actor), k);
});

await ok('an item queued without a key gets the same key on every replay, however late', async () => {
  const item = { operation: 'flag-document', ref: 'NITDA-2026-00011', at: '2026-10-01T08:00:00.000Z', payload: { flag: 'urgent', nested: { a: 1 } } };
  const first = await PendingQueue.replayKey(item, actor);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await PendingQueue.replayKey(item, actor), first);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.ok(!first.includes('nitda.gov.ng'));
});

await ok('a write queued more than 7 days ago is held for review, not sent', async () => {
  const old = new Date(Date.now() - REPLAY_LIMIT_MS - 60_000).toISOString();
  const row = PendingQueue.enqueue({ key: 'DYNAMIC_ACTIONS', operation: 'update-task', payload: { a: 1 }, ref: 'TASK-2026-00001', at: old });
  let sent = false;
  await assert.rejects(PendingQueue.retry(row.id, async () => { sent = true; }), /more than 7 days old/);
  assert.equal(sent, false);
  const held = (State.get().pending || []).find((x) => x.id === row.id);
  assert.equal(held.status, 'review');
  assert.equal(held.retryable, false);
});

await ok('a recent write is still replayed', async () => {
  const row = PendingQueue.enqueue({ key: 'DYNAMIC_ACTIONS', operation: 'update-task', payload: { a: 2 }, ref: 'TASK-2026-00002' });
  let sent = false;
  await PendingQueue.retry(row.id, async () => { sent = true; });
  assert.equal(sent, true);
});

console.log(`identification-replay: ${passed} assertions passed`);
