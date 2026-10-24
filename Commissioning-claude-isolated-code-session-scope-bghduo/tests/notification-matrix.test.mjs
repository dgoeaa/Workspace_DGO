/* The required-notification matrix is complete, or this fails.
 *
 * `scripts/verify-notification-matrix.mjs` answers "is every row in the matrix true of the
 * estate". This file answers the harder half: "is every notification the estate owes actually
 * in the matrix". A matrix that is internally consistent and silently missing a whole audience
 * is exactly the failure mode the matrix was written to end, so completeness is tied here to
 * governed lists that already exist and are themselves enforced elsewhere.
 *
 * The four completeness anchors:
 *
 *   1. The governed status vocabulary. Every public state a submitter can be moved into and
 *      would have to be told about must have a row. Add a status to
 *      config/status-vocabulary.config.js and this fails until the matrix covers it.
 *   2. The assignment cascade's audiences. The cascade resolves an assignee, a supporting
 *      assignee and a copy-to list on every routing row. Each resolved audience must be
 *      written to by some row.
 *   3. The estate's own live mail actions. Every one of them is either accounted for by a row
 *      or is run-record telemetry. Nothing may be neither.
 *   4. Every action in the runtime whose name or label promises a notification must have a row,
 *      because an action that tells an operator it notified someone is a promise the estate
 *      has already made on the platform's behalf.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RequiredNotifications, Preconditions, SurplusNotifications, Audiences, Channels,
  ProvisioningStates, Severities, byId, outstanding, countByStatus,
} from '../config/notification-matrix.config.js';
import { StatusVocabulary } from '../config/status-vocabulary.config.js';
import { AssignmentCascadeConfig } from '../config/assignment-cascade.config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log('  ✅ ' + name); return; }
  failed++; console.log('  ❌ ' + name + (detail ? '\n     ' + detail : ''));
};

console.log('\nRequired-notification matrix — completeness\n');

/* ── 1. Every public state a submitter must be told about has a row ─────────────────────
   Stage 4 is a terminal decision and action-required is an explicit request to the submitter.
   Received and validation are progress a submitter can see by tracking; they are deliberately
   not required to generate mail, and that judgement is recorded here rather than assumed. */
{
  const mustNotify = StatusVocabulary
    .filter((s) => s.stage === 4 || s.key === 'action-required')
    .map((s) => s.key);
  const covered = RequiredNotifications
    .filter((r) => r.audience === 'citizen')
    .map((r) => `${r.event} ${r.trigger} ${r.basis}`.toLowerCase())
    .join(' | ');
  const uncovered = mustNotify.filter((k) => !covered.includes(k.replace('-', ' ')) && !covered.includes(k));
  ok(`every decisive public status has a citizen row (${mustNotify.join(', ')})`,
     uncovered.length === 0, uncovered.length ? `not covered: ${uncovered.join(', ')}` : '');
}

/* ── 2. Every audience the assignment cascade resolves is written to ─────────────────── */
{
  const aliases = AssignmentCascadeConfig.categoryFieldAliases;
  const resolved = [
    ['assignedTo', 'assignee', Boolean(aliases.assignedTo)],
    ['supportingAssignee', 'supporting', Boolean(aliases.supportingAssignee)],
    ['copyTo', 'copyTo', Boolean(aliases.copyTo)],
  ];
  const used = new Set(RequiredNotifications.map((r) => r.audience));
  for (const [field, audience, present] of resolved) {
    if (!present) continue;
    ok(`the cascade resolves ${field}, and some row writes to the ${audience} audience`,
       used.has(audience) || (audience === 'copyTo' && used.has('supporting')),
       `no row carries audience "${audience}"`);
  }
  ok('the cascade starts an acknowledgement clock and a row covers its expiry',
     RequiredNotifications.some((r) => /acknowledgement clock expires/i.test(r.event)),
     `ackDays present: ${AssignmentCascadeConfig.defaultAckDays}`);
  ok('the cascade starts a due clock and a row covers its breach',
     RequiredNotifications.some((r) => /due date is breached/i.test(r.event)));
}

/* ── 3. Every live mail action is accounted for ─────────────────────────────────────────
   Telemetry and response-record captures are one row (RN-025) covering many actions, so they
   are matched by subject rather than enumerated. Everything else must be named in some row's
   statusEvidence by the flow it lives in — which is what stops a mail action from existing in
   the estate that the matrix has never looked at. */
{
  const dir = join(ROOT, 'docs/reference/flow-contracts/deployed');
  const mails = [];
  const walk = (node, out) => {
    if (Array.isArray(node)) { for (const v of node) walk(v, out); return; }
    if (!node || typeof node !== 'object') return;
    const h = node.inputs?.host;
    if (h && typeof h === 'object' && String(h.operationId || '').includes('SendEmail')) {
      const p = node.inputs.parameters ?? {};
      /* SendEmailV2 (Office 365) and SendEmailV3 (Mail connector) name their parameters
         differently — `emailMessage/*` and `request/*`. Both are read, or the estate's one
         V3 action looks recipient-less here too. */
      out.push({
        to: String(p['emailMessage/To'] ?? p['request/to'] ?? ''),
        subject: String(p['emailMessage/Subject'] ?? p['request/subject'] ?? ''),
      });
    }
    for (const v of Object.values(node)) walk(v, out);
  };
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const out = [];
    try { walk(JSON.parse(readFileSync(join(dir, f), 'utf8')), out); } catch { continue; }
    for (const m of out) mails.push({ flow: f.split('__')[0], ...m });
  }

  const isRunRecord = (m) => /Flow Run Record|-Response$|Flow Definition/i.test(m.subject);
  /* A flow is accounted for when a row names it, or when the surplus register names it. The
     surplus register is the honest home for a send the estate makes that nothing obliges — it
     still has to be looked at, but it cannot be given a row without inventing an obligation. */
  const evidenceBlob = RequiredNotifications
    .flatMap((r) => [...r.statusEvidence, r.carrier, r.trigger])
    .join(' | ');
  const surplusFlows = new Set(SurplusNotifications.flatMap((s) => s.flows));

  const unaccounted = [...new Set(
    mails.filter((m) => !isRunRecord(m))
      .map((m) => m.flow)
      .filter((flow) => !evidenceBlob.includes(flow) && !surplusFlows.has(flow)))];

  ok(`every live mail action is accounted for (${mails.length} actions, ` +
     `${mails.filter(isRunRecord).length} run-record captures, ` +
     `${surplusFlows.size} flows on the surplus register)`,
     unaccounted.length === 0,
     unaccounted.length ? `flows sending mail that neither a row nor the surplus register names: ${unaccounted.join(', ')}` : '');

  /* And the reverse: the surplus register may not carry a flow that sends no mail, or one a
     row already covers. Either would let it become a place to park findings. */
  const flowsThatSend = new Set(mails.map((m) => m.flow));
  const phantom = [...surplusFlows].filter((f) => !flowsThatSend.has(f));
  ok('every flow on the surplus register really does send mail', phantom.length === 0, phantom.join(', '));
}

/* ── 4. Every action that promises a notification has a row ─────────────────────────────── */
{
  const boundaries = readFileSync(join(ROOT, 'config/module-boundaries.config.js'), 'utf8');
  const ownership = readFileSync(join(ROOT, 'config/action-ownership.config.js'), 'utf8');
  const promises = [...new Set([
    ...[...boundaries.matchAll(/'([a-z-]*(?:notify|remind|escalate)[a-z-]*)'/g)].map((m) => m[1]),
    ...[...ownership.matchAll(/'([a-z-]*(?:notify|remind)[a-z-]*)'\s*:/g)].map((m) => m[1]),
  ])];
  const blob = RequiredNotifications.map((r) => `${r.trigger} ${r.basis} ${JSON.stringify(r.statusEvidence)}`).join(' ');
  const uncovered = promises.filter((p) => !blob.includes(p));
  ok(`every action naming a notification has a row (${promises.join(', ')})`,
     uncovered.length === 0, uncovered.length ? `not covered: ${uncovered.join(', ')}` : '');
}

console.log('\nRequired-notification matrix — integrity\n');

/* Vocabulary closure, in both directions. An unused audience or channel is a vocabulary that
   has drifted from the matrix; an undeclared one is a typo that would silently create a
   category of its own. */
{
  const usedAudiences = new Set(RequiredNotifications.map((r) => r.audience));
  const usedChannels = new Set(RequiredNotifications.map((r) => r.channel));
  ok('every declared audience is used by at least one row',
     Object.keys(Audiences).every((a) => usedAudiences.has(a)),
     Object.keys(Audiences).filter((a) => !usedAudiences.has(a)).join(', '));
  ok('every declared channel is used by at least one row',
     Object.keys(Channels).every((c) => usedChannels.has(c)),
     Object.keys(Channels).filter((c) => !usedChannels.has(c)).join(', '));
  ok('every row names a declared audience, channel, state and severity',
     RequiredNotifications.every((r) =>
       Audiences[r.audience] && Channels[r.channel] && ProvisioningStates[r.status] && Severities[r.severity]));
}

/* Ids are sequential and unique, so a row cannot be added by overwriting another. */
{
  const ids = RequiredNotifications.map((r) => r.id);
  ok('row ids are unique', new Set(ids).size === ids.length);
  ok('row ids are sequential from RN-001',
     ids.every((id, i) => id === `RN-${String(i + 1).padStart(3, '0')}`),
     ids.filter((id, i) => id !== `RN-${String(i + 1).padStart(3, '0')}`).join(', '));
}

/* A row gated by an unresolved precondition cannot claim to be provisioned. This is the
   invariant that stops the matrix from being quietly marked green one row at a time while the
   mechanism those rows depend on still does not exist. */
{
  const unresolved = Preconditions.filter((p) => p.resolution !== 'Done.' && p.gates.length);
  /* `qualifies` is deliberately NOT checked here. A qualified row can be fully provisioned and
     still be affected — PRE-1 does not stop a verification code being sent, it leaves the
     sender identity undecided. Treating the two alike would hold provisioned rows open forever. */
  const violations = [];
  for (const p of unresolved) {
    for (const g of p.gates) {
      if (byId[g]?.status === 'PROVISIONED') violations.push(`${g} claims PROVISIONED while ${p.id} is open`);
    }
  }
  ok('no row gated by an open precondition claims to be provisioned',
     violations.length === 0, violations.join('; '));
}

/* Every precondition points at rows that exist, and PRE-4 is closed by this change. */
{
  const ids = new Set(RequiredNotifications.map((r) => r.id));
  ok('every precondition gates and qualifies rows that exist',
     Preconditions.every((p) => [...p.gates, ...(p.qualifies ?? [])].every((g) => ids.has(g))));
  ok('no row is both gated and qualified by the same precondition',
     Preconditions.every((p) => !p.gates.some((g) => (p.qualifies ?? []).includes(g))));
  ok('every precondition declares both gates and qualifies',
     Preconditions.every((p) => Array.isArray(p.gates) && Array.isArray(p.qualifies)));
  ok('PRE-4 is recorded as closed, because the register now carries the notification items',
     Preconditions.find((p) => p.id === 'PRE-4')?.resolution === 'Done.');
}

/* The generated document is the matrix, not a second copy of it that can disagree. */
{
  const doc = join(ROOT, 'docs/deployment/NOTIFICATION_MATRIX.md');
  ok('the generated matrix document exists', existsSync(doc));
  if (existsSync(doc)) {
    const md = readFileSync(doc, 'utf8');
    const missing = RequiredNotifications.filter((r) => !md.includes(r.id)).map((r) => r.id);
    ok('every row appears in the generated document', missing.length === 0, missing.join(', '));
    ok('the generated document is marked generated', /^> \*\*Generated\.\*\*/m.test(md));
  }
}

/* Every outstanding row carries somewhere for the work to go. A finding with no owner and no
   remediation is an observation, and this matrix is not for observations. */
{
  const orphans = outstanding().filter((r) => !r.owner || !r.remediation || r.remediation === 'None.');
  ok(`every outstanding row names an owner and a remediation (${outstanding().length} outstanding)`,
     orphans.length === 0, orphans.map((r) => r.id).join(', '));
}

/* The register carries the four notification items, and each cites the matrix. */
{
  const reg = JSON.parse(readFileSync(join(ROOT, 'docs/deployment/PRODUCTION_READINESS_REGISTER.json'), 'utf8'));
  /* The five notification items. They were ITEM-38..42 on the branch that raised them; the
   consolidation of 2026-09-05 renumbered them to 48..52 because 38..42 already named other
   items on the branch they merged into. Same items, same evidence, different numbers. */
  const want = ['ITEM-48', 'ITEM-49', 'ITEM-50', 'ITEM-51', 'ITEM-52'];
  const have = new Map(reg.items.map((i) => [i.id, i]));
  ok('the register carries all five notification items',
     want.every((i) => have.has(i)), want.filter((i) => !have.has(i)).join(', '));
  const uncited = want.filter((i) =>
    !(have.get(i)?.evidence ?? []).some((e) => String(e.ref).includes('notification-matrix.config.js')));
  ok('each notification item cites the matrix as its evidence', uncited.length === 0, uncited.join(', '));
  const unvalidated = want.filter((i) => have.get(i)?.validation !== 'npm run notifications -- --check');
  ok('each notification item is validated by the matrix verifier', unvalidated.length === 0, unvalidated.join(', '));
}

/* The surplus register is itself structured, so it cannot decay into free text. */
{
  ok('every surplus entry names flows, recipients, a concern and a decision',
     SurplusNotifications.every((s) => s.flows?.length && s.recipients && s.concern && s.decision),
     SurplusNotifications.filter((s) => !(s.flows?.length && s.recipients && s.concern && s.decision))
       .map((s) => s.id).join(', '));
  const sids = SurplusNotifications.map((s) => s.id);
  ok('surplus ids are unique and sequential from SN-001',
     new Set(sids).size === sids.length
       && sids.every((id, i) => id === `SN-${String(i + 1).padStart(3, '0')}`),
     sids.join(', '));
}

const counts = countByStatus();
console.log(`\n  ${RequiredNotifications.length} required notifications · ` +
  Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log(`  ${SurplusNotifications.length} surplus patterns covering ` +
  `${new Set(SurplusNotifications.flatMap((s) => s.flows)).size} flows`);
console.log(`\n${failed ? '❌' : '✅'} notification matrix: ${failed} failed\n`);
process.exit(failed ? 1 : 0);
