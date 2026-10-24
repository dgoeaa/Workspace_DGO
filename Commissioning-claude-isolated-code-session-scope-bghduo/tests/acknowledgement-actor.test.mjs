#!/usr/bin/env node
/**
 * Who an official acknowledgement is attributed to.
 *
 * `buildAcknowledgementNotification` sends an email, from the platform, to the task's assignee,
 * CC'd to dgsregistry@nitda.gov.ng, saying who acknowledged. The name in it came from
 * `resolveAcknowledgementActor`, which resolved every field with its own `||` chain — so the
 * address could come from the signed-in profile while the name came from a query parameter.
 * `config/deeplink.config.js` preserves `actorName`, `userName` and `displayName`, and
 * `canActorAcknowledge` gates the ADDRESS against the assignee and checks nothing else, so that
 * combination passed every guard.
 *
 * This file had no predecessor: the function that decides attribution on a government file was
 * covered by nothing. Written as negative controls — restore the field-by-field merge and the
 * mixing cases below fail.
 *
 * Run: node tests/acknowledgement-actor.test.mjs
 */
import assert from 'node:assert/strict';

const { resolveAcknowledgementActor, canActorAcknowledge } =
  await import('../core/acknowledgement-service.js');

let passed = 0, failed = 0;
const t = (label, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${label}`); }
  catch (e) { failed++; console.log(`  ❌ ${label}\n       ${e.message}`); }
};

const PROFILE = { email: 'assignee@nitda.gov.ng', name: 'Amina Bello', persona: 'officer', department: 'Registry' };

console.log('\nAcknowledgement actor — one source, not a merge\n');

t('with nothing supplied, the identity is the signed-in profile', () => {
  const a = resolveAcknowledgementActor({ profile: PROFILE, context: {}, form: {} });
  assert.equal(a.email, 'assignee@nitda.gov.ng');
  assert.equal(a.name, 'Amina Bello');
  assert.equal(a.source, 'state-profile');
});

t('a deep link that names no address cannot supply a name', () => {
  /* THE DEFECT. A link carrying only actorName took the address from the profile and the name
     from the link, and the assignee gate — which reads the address alone — let it through. */
  const a = resolveAcknowledgementActor({
    profile: PROFILE,
    context: { taskId: 'T-1', actorName: 'Director-General' },
    form: {},
  });
  assert.equal(a.email, 'assignee@nitda.gov.ng');
  assert.equal(a.name, 'Amina Bello', 'the link supplied the name for the profile\'s address');
  assert.equal(a.source, 'state-profile');
});

t('the same holds for userName and displayName, which the link config also preserves', () => {
  for (const key of ['userName', 'displayName', 'name']) {
    const a = resolveAcknowledgementActor({ profile: PROFILE, context: { [key]: 'Director-General' }, form: {} });
    assert.equal(a.name, 'Amina Bello', `${key} overrode the profile name`);
  }
});

t('a deep link that DOES name an address supplies the whole identity', () => {
  /* Still honoured: this is how an assignee arrives from their mailbox while auth is inert. */
  const a = resolveAcknowledgementActor({
    profile: PROFILE,
    context: { actorEmail: 'other@nitda.gov.ng', actorName: 'Chidi Okafor', persona: 'reviewer' },
    form: {},
  });
  assert.equal(a.email, 'other@nitda.gov.ng');
  assert.equal(a.name, 'Chidi Okafor');
  assert.equal(a.persona, 'reviewer');
  assert.equal(a.source, 'deeplink');
});

t('a link-supplied identity never borrows the profile for its other fields', () => {
  const a = resolveAcknowledgementActor({
    profile: PROFILE,
    context: { actorEmail: 'other@nitda.gov.ng' },
    form: {},
  });
  assert.equal(a.email, 'other@nitda.gov.ng');
  assert.equal(a.name, 'other@nitda.gov.ng', 'it took the profile name for a different address');
  assert.equal(a.department, '', 'it took the profile department for a different address');
});

t('the form outranks both, and supplies the whole identity too', () => {
  const a = resolveAcknowledgementActor({
    profile: PROFILE,
    context: { actorEmail: 'other@nitda.gov.ng', actorName: 'Chidi Okafor' },
    form: { actorEmail: 'typed@nitda.gov.ng', actorName: 'Typed Name' },
  });
  assert.equal(a.email, 'typed@nitda.gov.ng');
  assert.equal(a.name, 'Typed Name');
  assert.equal(a.source, 'form');
});

t('persona defaults to operator rather than to an empty string', () => {
  const a = resolveAcknowledgementActor({ profile: { email: 'x@nitda.gov.ng' }, context: {}, form: {} });
  assert.equal(a.persona, 'operator');
});

t('the assignee gate still admits the assignee and refuses everyone else', () => {
  const task = { assignedTo: 'assignee@nitda.gov.ng' };
  assert.equal(canActorAcknowledge(task, { email: 'assignee@nitda.gov.ng' }).allowed, true);
  assert.equal(canActorAcknowledge(task, { email: 'other@nitda.gov.ng' }).allowed, false);
  assert.equal(canActorAcknowledge(task, { email: '' }).allowed, false);
  assert.equal(canActorAcknowledge({ assignedTo: '' }, { email: 'assignee@nitda.gov.ng' }).allowed, false);
});

t('the gate is case-insensitive on both sides, so casing is not an escape', () => {
  assert.equal(canActorAcknowledge({ assignedTo: 'Assignee@NITDA.gov.ng' },
    { email: 'assignee@nitda.gov.NG' }).allowed, true);
});

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
