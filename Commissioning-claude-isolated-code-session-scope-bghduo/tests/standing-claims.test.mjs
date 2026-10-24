/* THE THREE CLAIMS THIS ESTATE MUST NEVER MAKE.
 *
 * EXECUTION_GUIDE Appendix B carries seven standing constraints. Four of them are about handling
 * — redact this, never log that — and are enforced elsewhere: the secret ratchet, the exposure
 * scan, the designer-paste redaction checks. Three are about SPEECH, and nothing enforced them:
 *
 *   1. Do not claim the one-time code comparison is constant-time.
 *   2. Do not claim one-time codes are hashed.
 *   3. Do not claim the upload SHA-256 is verified.
 *
 * Each is a property a reader would reasonably act on. A security reviewer who reads "the code is
 * hashed" stops asking about list permissions. An assessor who reads "the digest is verified"
 * stops asking whether a corrupted upload can be filed. The claims are load-bearing precisely
 * because they are the ones that sound like diligence.
 *
 * All three have already been made in this repository and corrected by hand — item 19 rewrote
 * seven documents that instructed an implementer to compare in constant time, and section 4.2 of
 * DOCUMENT_PORTAL_FLOWS claimed a public-peppered digest of a six-digit code "still serves its
 * purpose" against someone reading the stored hash. A correction that nothing guards is a
 * correction with a half-life. This is the guard.
 *
 * HOW IT DECIDES. Each rule is a keyword plus the qualifications that make a mention honest. A
 * line that mentions constant-time comparison while also saying it is not achieved is the
 * documentation working correctly; a line that mentions it with no such qualification is an
 * assertion. The rules are calibrated against the corpus as it stands, so they start green, and
 * each one is mutation-tested below by asserting it rejects a sentence that makes the claim.
 *
 * Scope excludes two trees on purpose. `docs/reference/foundational/` is the deployed estate
 * recorded verbatim by decision D5 — it says what the tenant says, and editing it to satisfy a
 * test would destroy the evidence. `docs/audits/` is kept unedited for the same reason: an audit
 * that gets rewritten when it becomes inconvenient is not a record.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };

/* Two more trees are records rather than prose, on the same reasoning as the two above.
   `docs/reference/flow-contracts/deployed/` and `docs/deployment/sharepoint/evidence/` are read
   from the tenant; they say what the tenant says, and a claim cannot be "made" by a definition
   nobody here wrote. */
const SKIP = ['node_modules', '.git', 'docs/reference/foundational', 'docs/audits',
  'docs/reference/flow-contracts/deployed', 'docs/deployment/sharepoint/evidence'];

/* MARKDOWN WAS NEVER THE WHOLE CORPUS.
   This scanned `.md` only, and the document a reader would actually consult for whether the
   upload digest is verified is `PRODUCTION_READINESS_REGISTER.json` — its ITEM-18 states the
   position in prose, in JSON, outside the scan. Rewriting that one field to claim the digest was
   verified passed every gate. The readiness tracker carries the same text again as HTML. So the
   scan follows the prose wherever it is written: Markdown, the JSON registers and specifications,
   and the generated HTML pages. Flow definitions and tenant evidence stay out by SKIP above. */
const SCANNED = /\.(md|json|html)$/i;
function markdownFiles(dir, out = []) {
  if (SKIP.some((s) => dir.includes(s))) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (SKIP.some((s) => p.includes(s))) continue;
    if (statSync(p).isDirectory()) markdownFiles(p, out);
    else if (SCANNED.test(entry)) out.push(p);
  }
  return out;
}

/* A mention is honest when it carries one of these in the same line. They are the forms the
   corpus actually uses, not a wishlist: "not constant-time", "cannot be made so", "Do not
   claim", "should not be", "unachievable", "no bitwise operators". */
/* `would` and `if` were in this list and should never have been: neither NEGATES a claim, so
   any sentence containing them was exempt wherever it sat on the line. "Every one-time code is
   hashed before it reaches the list, which would reassure a reviewer" made the claim outright
   and passed, as did "The upload SHA-256 is verified against the received bytes if the client
   supplies one." Both are now rejected. Removing them costs the corpus nothing — of the 21 lines
   that mention a guarded claim, none relies on either word to read as qualified. */
const QUALIFIED = /\b(not|never|cannot|can't|without|unachievable|impossible|refus|avoid|must not|do not|does not|no bitwise|instead of|rather than|absent|missing|unverified|unclosed)/i;

/* QUOTING A CLAIM IS NOT MAKING IT.
   Three legitimate uses of these phrases carry no negation of their own and would otherwise be
   flagged. A reconciliation table citing what the functional specification DEMANDS — the row
   `| INT-005 | VERIFY_CONFIRM | constant-time compare, expire, single-use |` — is recording an
   unmet requirement, which is the opposite of claiming it is met. A heading naming the
   requirement in quotes is the same. And a correction note has to restate the sentence it is
   removing, or the reader cannot tell what was fixed.

   So a line is treated as citation, not assertion, when it names a specification requirement id
   (INT-nnn, SC-nnn) or when the claim phrase itself is wrapped in quotes, bold or backticks.
   That last is the narrow form deliberately: a stray quotation mark elsewhere on the line does
   not excuse a claim made in the open. */
const SPEC_ID = /\b(INT|SC)-\d+\b/;
const wrapped = (line, phrase) => {
  const i = line.search(phrase);
  if (i < 0) return false;
  const before = line.slice(Math.max(0, i - 3), i);
  const after = line.slice(i).replace(phrase, '').slice(0, 3);
  return /["“'*`]$/.test(before) && /^[^\w]*["”'*`]/.test(after);
};
const cited = (line, phrase) => SPEC_ID.test(line) || wrapped(line, phrase);

const RULES = [
  {
    id: 'constant-time',
    why: 'WDL has no bitwise operators, so equals() cannot be made constant-time.',
    mentions: /constant[- ]time/i,
    /* A sentence claiming the property outright, e.g. "compared in constant time". */
    violates: (line) => /constant[- ]time/i.test(line) && !QUALIFIED.test(line)
      && !cited(line, /constant[- ]time( compare)?/i),
    mutation: 'The one-time code is compared in constant time by the flow.',
  },
  {
    id: 'codes-hashed',
    why: 'One-time codes are stored in plaintext (SC-003). The protection is the lifecycle.',
    mentions: /\b(otp|one-time code|verification code)\b[^.\n]{0,80}\bhash/i,
    violates: (line) => /\b(otp|one-time code|verification code)\b[^.\n]{0,80}\bhash(ed|es|ing)?\b/i.test(line)
      && !QUALIFIED.test(line) && !cited(line, /hash(ed|es|ing)?/i),
    mutation: 'Every one-time code is hashed before it reaches the list.',
  },
  {
    id: 'digest-verified',
    why: 'The upload SHA-256 is not computed. It cannot be: WDL has no hash function, and the '
       + 'operator confirmed on 2026-09-03 that this tenant cannot run an inline-code action '
       + '(register ITEM-18, ACCEPTED). Only the size is checked.',
    mentions: /sha-?256/i,
    violates: (line) => /sha-?256[^.\n]{0,60}\b(is|are|was|were)\s+(verified|checked|validated|confirmed)/i.test(line)
      && !QUALIFIED.test(line) && !cited(line, /sha-?256/i),
    mutation: 'The upload SHA-256 is verified against the received bytes.',
  },
  {
    /* ADDED 2026-09-03, when ITEM-18 moved from "not yet built" to "cannot be built here".
       The claim above catches the direct form. What it does not catch is the form this
       acceptance invites: the digest IS now computed, and it IS stored, so it becomes easy to
       write that uploads are integrity-checked or that the checksum is enforced without ever
       using the word "verified". Recorded is not enforced, and the distinction is the whole of
       what was accepted — a reader who loses it has been told the upload boundary carries a
       control it does not carry. */
    id: 'digest-enforced',
    why: 'The declared digest is RECORDED, not ENFORCED (register ITEM-18). It supports an '
       + 'out-of-band comparison later; nothing checks it at intake, and a caller who controls '
       + 'the client declares the digest as well as the bytes.',
    mentions: /\b(digest|checksum|integrity)\b/i,
    violates: (line) =>
      /\b(digest|checksum)\b[^.\n]{0,60}\b(is|are)\s+(enforced|guaranteed|assured)\b/i.test(line)
      || /\bintegrity\b[^.\n]{0,60}\b(is|are)\s+(verified|checked|enforced|guaranteed|assured)\b/i.test(line)
      || /\bupload[^.\n]{0,40}\bintegrity[- ]checked\b/i.test(line),
    mutation: 'Upload integrity is verified at intake before the file is stored.',
  },
];

const files = markdownFiles('docs').concat(['README.md', 'PLATFORM_DOCUMENTATION.md', 'CONTRIBUTING.md']);

console.log(`\nStanding claims — the properties no document may assert\n`);
console.log(`  scanning ${files.length} markdown file(s); foundational corpus and audit record excluded by design\n`);

for (const rule of RULES) {
  const offenders = [];
  for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    text.split('\n').forEach((line, i) => {
      if (rule.violates(line)) offenders.push(`${f}:${i + 1} ${line.trim().slice(0, 90)}`);
    });
  }
  ok(offenders.length === 0, `no document claims: ${rule.id} (${rule.why})`,
    offenders.slice(0, 4).join(' | '));

  /* The rule must be capable of failing. A guard that cannot reject the very sentence it exists
     to catch is decoration, and this file would then pass forever while the claim crept back. */
  ok(rule.violates(rule.mutation), `the ${rule.id} rule rejects the claim it guards against`,
    `it accepted: "${rule.mutation}"`);
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
