/* Assignment validation messages — every rule an officer can trip must read as a sentence.

   The audit (P-03, and the standard it set for the internal platform) asks that a rejected
   field name itself, state its rule and give the reason. The validators in
   core/assignment-cascade.js and core/assignment-payload.js return rule IDENTIFIERS
   ("assignedTo must be a valid email") — correct as a contract, unreadable as a message —
   and core/ui.js renders them through AssignmentFieldMessages.

   That table used to live in core/ui.js, a file away from the rules. The two drifted: of the
   13 identifiers the validators can emit, only 7 had messages, so six reached operators as
   raw developer text. The table now sits beside the rules; this test is what keeps it there,
   by failing the moment a rule is added without one. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); if (detail) console.log(`       ${detail}`); }
};

/* The identifiers are extracted from the validator SOURCE rather than imported, so a rule
   added inside any branch is caught whether or not a test happens to exercise that branch. */
const VALIDATOR_FILES = ['core/assignment-cascade.js', 'core/assignment-payload.js'];
const emitted = new Set();
for (const f of VALIDATOR_FILES) {
  for (const m of read(f).matchAll(/push\('([^']+)'\)/g)) emitted.add(m[1]);
}

const { AssignmentFieldMessages } = await import('../core/assignment-cascade.js');
const mapped = new Set(Object.keys(AssignmentFieldMessages));

console.log('\nAssignment validation messages\n');

ok('the validators emit at least the 13 known rules', emitted.size >= 13,
   `found ${emitted.size}: ${[...emitted].join(', ')}`);

/* The load-bearing assertion. */
const unmapped = [...emitted].filter(id => !mapped.has(id));
ok('every rule the validators emit has an operator-facing message', unmapped.length === 0,
   unmapped.length ? `no message for: ${unmapped.join(' · ')}` : '');

/* A message that is merely the identifier back again would satisfy the check above while
   still showing developer text, so each one must actually read as a sentence. */
const notSentences = [...mapped].filter(id => {
  const [, msg] = AssignmentFieldMessages[id];
  return !msg || msg === id || !/—/.test(msg) || msg.length < 25;
});
ok('each message names its field and gives a reason, rather than restating the rule',
   notSentences.length === 0, notSentences.length ? `too thin: ${notSentences.join(' · ')}` : '');

const noField = [...mapped].filter(id => !AssignmentFieldMessages[id][0]);
ok('each message carries the field to move focus to', noField.length === 0,
   noField.length ? `no field: ${noField.join(' · ')}` : '');

/* Negative control — proves the completeness check can actually fail, so a green run above
   means the table is complete rather than that the matcher is broken. */
ok('the completeness check detects a missing message',
   ['a rule that does not exist'].filter(id => !mapped.has(id)).length === 1);

/* The messages are what an operator reads, so the vocabulary the audit bans (I-07) must not
   appear in them. */
const BANNED = /\b(endpoint|payload|backend|runtime|posture|module)\b/i;
const jargon = [...mapped].filter(id => BANNED.test(AssignmentFieldMessages[id][1]));
ok('no message uses the vocabulary reserved for the IT-only screens', jargon.length === 0,
   jargon.length ? `jargon in: ${jargon.join(' · ')}` : '');

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
