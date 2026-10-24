/* A CLOSED ITEM MUST NOT COME BACK AS AN OPEN ONE.
 *
 * The estate has one register of what is outstanding —
 * docs/deployment/PRODUCTION_READINESS_REGISTER.json — and four surfaces that speak about the
 * same items: the commissioning gate an operator runs, the runbook and action plan generated
 * from the register, the findings file the items were first written in, and the prose that
 * introduces the repository. Nothing held them to each other. On 2026-09-14 all four disagreed
 * with the register at once:
 *
 *   · npm run commission, the command the commissioning directive names as the readiness test,
 *     asked the operator to get the routing table approved (MANUAL-1, RESOLVED on 2026-09-08)
 *     and reported the personal-data disposition as outstanding (MANUAL-4, RESOLVED the same
 *     day). The register then cited the gate's own stale sentence as evidence the item had
 *     been open — a closed item round-tripping through the instrument that measures it.
 *
 *   · EXECUTION_RUNBOOK.md printed "Why it is still open." above all 48 items, so each of the
 *     24 closed ones read "Why it is still open. Resolved 2026-09-03."
 *
 *   · OPEN_ITEMS.md carried ten items as outstanding that the register had closed, and struck
 *     one — 37 — as withdrawn while the register held the decision it left behind open.
 *
 *   · README.md told the reader to rotate trigger tokens that ITEM-22 had already rotated.
 *
 * Every one of those was a correction someone had already made, undone by a second document
 * nobody thought to change. The register moves; the surfaces do not follow. This is what makes
 * them follow.
 *
 * WHAT IT CHECKS
 *
 *   1. Status agreement in OPEN_ITEMS.md, both ways. A row the register has closed may not be
 *      presented as open, and a row struck as closed may not correspond to an item the register
 *      still carries as open. Check 7 of verify-readiness-register.mjs already required every
 *      open row to EXIST in the register; existence was never the problem — agreement was.
 *
 *   2. The commissioning gate reports no obligation the register has closed. It is run, not
 *      read, because what an operator sees is the output and not the source.
 *
 *   3. No generated document labels a closed item as open.
 *
 *   4. Named superseded claims are not restated anywhere in the commissioning surface. These
 *      are the specific sentences a closed item makes false, listed one by one with the item
 *      that closed them, in the idiom of tests/standing-claims.test.mjs.
 *
 * WHAT IT DOES NOT CHECK, AND WHY
 *
 * Dated sections are a record. A session note written on 2026-08-31 saying no ALLOWED_ORIGIN
 * row had been added is a true statement about 2026-08-31; rewriting it to match today would
 * destroy the record and teach the next reader that dated entries are unreliable. The same
 * reasoning already exempts docs/audits/ and docs/reference/foundational/ from
 * tests/standing-claims.test.mjs. Scope here follows it: docs/audits/, docs/archive/,
 * docs/forensic/, the foundational corpus, tenant evidence, and any section under a dated
 * heading are out. A document that is wholly a record of a past reading is exempt by carrying a
 * superseded banner, which check 4 requires of it.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? `\n       ${d}` : ''}`)); };

const REGISTER = 'docs/deployment/PRODUCTION_READINESS_REGISTER.json';
const GOVERNANCE = 'docs/reference/governance-estate-position.json';
const reg = JSON.parse(read(REGISTER));
/* DISCHARGED_UNTRACKABLE counts as closed: done, evidenced once, and unverifiable from
   this repository because the proof is a credential or a git-ignored file. See
   statusVocabulary in the register. */
const CLOSED = new Set(['RESOLVED', 'ACCEPTED', 'DISCHARGED_UNTRACKABLE']);
const byId = new Map(reg.items.map((i) => [i.id, i]));
const isClosed = (id) => byId.has(id) && CLOSED.has(byId.get(id).status);

/* TWO REGISTERS. The governance estate keeps its own position file — openFindings and
   closedFindings, with tests/governance-estate.test.mjs over it — and it earns the separation:
   the endpoint commissioning path touches no governance list, so a GOV finding does not gate a
   pilot and does not belong beside rows that do. What matters here is the property, not the
   file: closing a finding there must stop the gate reporting it, exactly as RESOLVED does. It
   does, because the gate iterates openFindings. So both count as a binding, and an id in
   neither is still unbound. */
const governance = (() => {
  try { return JSON.parse(read(GOVERNANCE)); } catch { return { openFindings: [], closedFindings: [] }; }
})();
const govOpen = new Set((governance.openFindings || []).map((f) => f.id));
const govClosed = new Set((governance.closedFindings || []).map((f) => f.id));

console.log('\nClosure alignment — the register against everything that speaks for it\n');

/* ------------------------------------------------------------------ *
 * 1 · OPEN_ITEMS.md agrees with the register, in both directions
 * ------------------------------------------------------------------ */

/* The register groups items 31 and 33 under ITEM-23: one provisioner run against
   index-targets.json closes all three, and splitting them would imply three visits. Declared
   here as it is in verify-readiness-register.mjs, so a reader can see it and disagree. */
const GROUPED = { 31: 'ITEM-23', 33: 'ITEM-23' };

{
  const md = read('docs/deployment/sharepoint/OPEN_ITEMS.md').split('\n');
  const staleOpen = [];     // register says closed, the row says open
  const staleClosed = [];   // register says open, the row says closed
  const unknown = [];       // the row names an item the register does not carry
  let inDatedSection = false;

  md.forEach((line, idx) => {
    /* A `## 2026-…` heading opens a dated record; any other `##` closes it and returns to the
       live tables. */
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) inDatedSection = /^\d{4}-\d{2}-\d{2}/.test(h2[1].trim());
    if (inDatedSection) return;

    const m = line.match(/^\|\s*(~~)?\*\*(\d+)\*\*(?:~~)?\s*\|(.*)$/);
    if (!m) return;
    const n = Number(m[2]);
    const rowClosed = Boolean(m[1]) || (m[3].includes('✅') && m[3].includes('Closed'));
    const id = GROUPED[n] || `ITEM-${n}`;
    if (!byId.has(id)) {
      /* Items the register never carried — closed long before it was compiled — are struck
         here and are not its business. Only an unstruck one is a gap. */
      if (!rowClosed) unknown.push(`${n} (would be ${id})`);
      return;
    }
    if (isClosed(id) && !rowClosed) staleOpen.push(`row ${n} at line ${idx + 1} — ${id} is ${byId.get(id).status}`);
    if (!isClosed(id) && rowClosed) staleClosed.push(`row ${n} at line ${idx + 1} — ${id} is ${byId.get(id).status}`);
  });

  ok(staleOpen.length === 0,
    'no OPEN_ITEMS.md row presents a closed item as outstanding',
    staleOpen.join('\n       '));
  ok(staleClosed.length === 0,
    'no OPEN_ITEMS.md row strikes an item the register still carries as open',
    staleClosed.join('\n       '));
  ok(unknown.length === 0,
    'every unstruck OPEN_ITEMS.md row names an item the register carries',
    unknown.join(', '));
}

/* ------------------------------------------------------------------ *
 * 1b · a governance finding that is done is filed as done
 * ------------------------------------------------------------------ */

/* THE ASSERTION WHOSE ABSENCE COST FIVE DAYS.
 *
 * Check 1 holds OPEN_ITEMS.md to the readiness register. Nothing held the governance position file
 * to itself. So GOV-08 — `closedUtc: 2026-09-09`, `repositoryStatus: "RESOLVED IN THE REPOSITORY"`,
 * `tenantStatus: "RESOLVED IN THE TENANT"` — sat in `openFindings`, and every operator who ran
 * `npm run commission` between the 9th and the 14th was told:
 *
 *     GOV-08 — STILL TO DO IN THE TENANT: RESOLVED IN THE TENANT.
 *
 * A sentence that contradicts itself inside eight words. It survived because one test asserted the
 * finding was *present* in `openFindings` — so closing it would have gone red, and the cheapest
 * correct-looking action was to leave it open.
 *
 * Three ways a finding declares itself done, any one of which is enough: a `closedUtc`, or both
 * status lines reading resolved. A finding may legitimately be resolved on ONE side and open —
 * that is the whole point of tracking the two separately, and four findings are in that state
 * right now — so both must read resolved before this fires. */
{
  const RESOLVED_LINE = /^\s*(RESOLVED|CLOSED)\b/i;
  const misfiled = (governance.openFindings || []).filter((f) => {
    if (f.closedUtc) return true;
    return RESOLVED_LINE.test(f.repositoryStatus || '') && RESOLVED_LINE.test(f.tenantStatus || '');
  }).map((f) => {
    const why = f.closedUtc ? `carries closedUtc ${f.closedUtc}` : 'reads resolved in both the repository and the tenant';
    return `${f.id} ${why}, but is in openFindings`;
  });

  ok(misfiled.length === 0,
    'no governance finding that is done is still filed as open',
    misfiled.join('\n       '));

  /* And the rule is shown to fire, in the idiom the rest of this file uses: the exact shape that
     went unnoticed, asserted to be rejected. A rule calibrated against a corpus that already
     satisfies it is indistinguishable from a rule that matches nothing. */
  {
    const MUTANTS = [
      ['closedUtc alone', { id: 'X-1', closedUtc: '2026-09-09', repositoryStatus: 'MEASURED.', tenantStatus: 'OUTSTANDING.' }],
      ['both sides resolved', { id: 'X-2', repositoryStatus: 'RESOLVED IN THE REPOSITORY. …', tenantStatus: 'RESOLVED IN THE TENANT. …' }],
    ];
    const SURVIVORS = [
      ['repository only', { id: 'X-3', repositoryStatus: 'RESOLVED IN THE REPOSITORY. …', tenantStatus: 'OUTSTANDING.' }],
      ['tenant only', { id: 'X-4', repositoryStatus: 'MEASURED.', tenantStatus: 'RESOLVED IN THE TENANT. …' }],
    ];
    const fires = (f) => Boolean(f.closedUtc)
      || (RESOLVED_LINE.test(f.repositoryStatus || '') && RESOLVED_LINE.test(f.tenantStatus || ''));
    const wrong = [
      ...MUTANTS.filter(([, f]) => !fires(f)).map(([n]) => `does not reject "${n}"`),
      ...SURVIVORS.filter(([, f]) => fires(f)).map(([n]) => `wrongly rejects "${n}", which is legitimately open`),
    ];
    ok(wrong.length === 0,
      `the done-but-open rule fires on what it names and spares what it should (${MUTANTS.length + SURVIVORS.length} mutations)`,
      wrong.join('\n       '));
  }
}

/* ------------------------------------------------------------------ *
 * 2 · the commissioning gate reports nothing the register has closed
 * ------------------------------------------------------------------ */

/* Run it rather than read it. The failure being guarded against was a hardcoded string in the
   gate's source, and reading the source for hardcoded strings is how it went unnoticed: what an
   operator acts on is the output. `npm run commission` exits 1 while a blocker stands, which is
   the normal state of an unconfigured checkout, so the exit code is not the signal here. */
{
  let out = '';
  try {
    out = execFileSync(process.execPath, [join(ROOT, 'scripts/commission-check.mjs')],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = `${e.stdout || ''}${e.stderr || ''}`;
  }

  const manualBlock = out.split(/🔒|✅ PASS/)[0];
  const claimed = [];
  const closedIds = [
    ...reg.items.filter((i) => CLOSED.has(i.status)).map((i) => i.id),
    ...govClosed,
  ];
  /* Match the `[ID]` marker the gate prints beside each reported obligation, not a bare mention.
     A bare mention caught GOV-07 inside another finding's prose — "…GOV-07 are gone." — which is
     a closed finding being CITED as closed, the opposite of the failure. What makes an
     obligation reported is the marker, so that is what is read. */
  const reported = new Set((manualBlock.match(/\[((?:ITEM|CFG|MANUAL|G|GOV)-[A-Z0-9]+)\]/g) || [])
    .map((m) => m.slice(1, -1)));
  for (const id of closedIds) if (reported.has(id)) claimed.push(id);
  ok(claimed.length === 0,
    'npm run commission reports no obligation the register has closed',
    claimed.length ? `still reported as outstanding: ${claimed.join(', ')}` : '');

  /* AN UNBOUND MANUAL IS INVISIBLE TO THE CHECK ABOVE, WHICH IS WHY IT IS CHECKED HERE.
     The check above looks for a CLOSED id inside the MANUALS block. Delete the id from a
     manual() call and there is no id to find, so the check passes while the gate goes back to
     asserting a hardcoded obligation nothing can close — the original failure, restored, with
     the guard reporting green. The gate prints `[ID]` beside every tracked manual; one without
     it is either untracked-by-declaration or a binding someone dropped. */
  const manualLines = (manualBlock.split(/📋[^\n]*\n/)[1] || '')
    .split('\n')
    .filter((l) => /^ {5}\S/.test(l));
  const UNTRACKED = [/this is not a git work tree/];
  const unbound = manualLines
    .filter((l) => !/\[(?:ITEM|CFG|MANUAL|G|GOV)-[A-Z0-9]+\]\s*$/.test(l.trimEnd()))
    .filter((l) => !UNTRACKED.some((re) => re.test(l)))
    .map((l) => l.trim());
  ok(unbound.length === 0,
    'every obligation npm run commission reports names the register item that tracks it',
    unbound.join('\n       '));

  const printedIds = [...new Set((manualBlock.match(/\[((?:ITEM|CFG|MANUAL|G|GOV)-[A-Z0-9]+)\]/g) || [])
    .map((m) => m.slice(1, -1)))];
  const orphans = printedIds.filter((id) => !byId.has(id) && !govOpen.has(id) && !govClosed.has(id));
  ok(orphans.length === 0,
    `every id the gate prints belongs to a register (${printedIds.length} checked)`,
    orphans.length ? `in neither register: ${orphans.join(', ')}` : '');

  ok(out.includes('commissioning readiness'),
    'npm run commission produced its report (the checks above are meaningful)');
  ok(manualLines.length > 0,
    'the MANUALS block was parsed (the binding check above is meaningful)');

  /* And the gate refuses an unbound manual itself, rather than relying on this file to notice.
     Dropping an id turns the manual into a BLOCKER — it leaves the MANUALS block, so the check
     above would go quiet, which is exactly the shape of the original failure. The defence has to
     be in the instrument. Asserted by mutation: the source is copied, one id is removed, and the
     copy is run. */
  {
    const mutantDir = join(ROOT, 'node_modules', '.closure-mutation');
    try {
      execFileSync('mkdir', ['-p', join(mutantDir, 'scripts', 'lib'), join(mutantDir, 'docs', 'deployment')], { cwd: ROOT });
      const src = read('scripts/commission-check.mjs')
        .replace("'docs/deployment/MINIMAL-PILOT.md §8', 'MANUAL-2');", "'docs/deployment/MINIMAL-PILOT.md §8');");
      writeFileSync(join(mutantDir, 'scripts/commission-check.mjs'), src);
      for (const lib of ['endpoint-surface.mjs', 'endpoint-validation.mjs', 'published-signatures.mjs']) {
        writeFileSync(join(mutantDir, 'scripts/lib', lib), read(`scripts/lib/${lib}`));
      }
      writeFileSync(join(mutantDir, REGISTER), read(REGISTER));
      let mutantOut = '';
      try {
        mutantOut = execFileSync(process.execPath, [join(mutantDir, 'scripts/commission-check.mjs')],
          { cwd: mutantDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) { mutantOut = `${e.stdout || ''}${e.stderr || ''}`; }
      ok(/reported with no register item/.test(mutantOut),
        'the gate itself refuses a manual that names no register item',
        'removing an id from a manual() call did not raise a blocker');
    } catch (e) {
      ok(false, 'the gate itself refuses a manual that names no register item', e.message);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 3 · no generated document labels a closed item as open
 * ------------------------------------------------------------------ */

{
  const runbook = read('docs/deployment/EXECUTION_RUNBOOK.md');
  const mislabelled = [];
  /* Sections are `### ID — title`; the label follows within the section. */
  const sections = runbook.split(/^### /m).slice(1);
  for (const sec of sections) {
    const id = (sec.match(/^((?:ITEM|CFG|MANUAL|G)-[A-Z0-9]+)/) || [])[1];
    if (!id || !isClosed(id)) continue;
    if (sec.includes('**Why it is still open.**')) mislabelled.push(id);
  }
  ok(mislabelled.length === 0,
    'EXECUTION_RUNBOOK.md labels no closed item "still open"',
    mislabelled.join(', '));

  const plan = read('docs/deployment/ACTION_PLAN.md');
  const planned = reg.items.filter((i) => CLOSED.has(i.status))
    .filter((i) => new RegExp(`^### \\d+\\. ${i.id} —`, 'm').test(plan))
    .map((i) => i.id);
  ok(planned.length === 0,
    'ACTION_PLAN.md lists no closed item as an action',
    planned.join(', '));
}

/* ------------------------------------------------------------------ *
 * 3b · every surface that counts open items reaches the same number
 * ------------------------------------------------------------------ */

/* Four commands report how much work is left, and they disagreed. `npm run pending` said 25
   while the register, ACTION_PLAN.md and `npm run readiness` said 24: its closed-status list
   omitted ACCEPTED, so ITEM-18 — a risk accepted, recorded and guarded — was counted as
   outstanding work on every run. An acceptance that keeps reappearing as pending is an
   acceptance nobody trusts. A reader with two numbers has to pick one, and there is nothing in
   either output to pick on. */
{
  const expected = reg.items.filter((i) => !CLOSED.has(i.status)).length;
  const runOut = (script, args = []) => {
    try {
      return execFileSync(process.execPath, [join(ROOT, script), ...args],
        { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { return `${e.stdout || ''}${e.stderr || ''}`; }
  };

  const sources = [
    ['npm run pending', (runOut('scripts/run-pending.mjs').match(/(\d+) open items in the register/) || [])[1]],
    ['docs/deployment/ACTION_PLAN.md', (read('docs/deployment/ACTION_PLAN.md').match(/\*\*(\d+) open\*\*/) || [])[1]],
    ['docs/deployment/IMPLEMENTATION_WALKTHROUGH.md', (read('docs/deployment/IMPLEMENTATION_WALKTHROUGH.md').match(/\*\*(\d+) open items\.\*\*/) || [])[1]],
    ['docs/deployment/COMMISSIONING_SURFACE.md', (read('docs/deployment/COMMISSIONING_SURFACE.md').match(/(\d+) closed, (\d+) open/) || [])[2]],
  ];
  const wrong = sources.filter(([, n]) => Number(n) !== expected)
    .map(([what, n]) => `${what} reports ${n === undefined ? 'no count at all' : n}, register has ${expected}`);
  ok(wrong.length === 0,
    `every surface that counts open items reports ${expected}`,
    wrong.join('\n       '));
}

/* ------------------------------------------------------------------ *
 * 4 · superseded claims are not restated in the commissioning surface
 * ------------------------------------------------------------------ */

/* Each entry is a sentence a closed item made false, the item that closed it, and the
   qualification that makes a mention honest. A document may still SAY the words — quoting the
   old finding, or recording that it was corrected — provided the qualification sits on the same
   line. That is the calibration tests/standing-claims.test.mjs uses, for the same reason: a
   corpus that cannot discuss its own history is worse than one that repeats it. */
const SUPERSEDED = [
  {
    item: 'ITEM-22',
    what: 'the disclosed trigger signatures are still live',
    /* Not `\bsig=\b` or a bare count: the corpus states the disclosure as a standing fact,
       which is true. What is false is that they still authenticate something. */
    pattern: new RegExp(
      // the claim in either order: "signatures are live", "live signatures", "are all live right now"
      '(?:\\b(?:signature|sig=|trigger (?:url|token))[^.]{0,60}\\b(?:are|is|remain|remains|stay|stays)\\s+(?:all\\s+)?(?:live|valid|current|active)\\b)'
      + '|(?:\\b(?:are|is|remain|remains|stay|stays)\\s+(?:all\\s+)?(?:live|valid|current|active)\\b[^.]{0,60}\\b(?:signature|sig=|trigger (?:url|token)))'
      // "14 of which carry two live signatures each". Narrowed to the signature nouns: "live
      // trigger URLs, read from each flow's trigger card" is an instruction to go and read the
      // current ones, not a claim that the disclosed set still authenticates anything.
      + '|(?:\\b(?:live|valid|current|active)\\s+(?:sig=\\s*|signed\\s+)?signatures?\\b)', 'i'),
  },
  {
    item: 'ITEM-22',
    what: 'the rotation is still to be done',
    pattern: /\brotate every one of them\b|\brotation (?:is|remains) (?:outstanding|pending|still to be done)\b/i,
  },
  {
    item: 'MANUAL-1',
    what: 'the routing table is unapproved',
    pattern: /routing (?:table|matrix)[^.]{0,60}\b(?:has not been approved|is unapproved|needs approval|awaits approval)\b|\bit has not been approved by anyone\b/i,
  },
  {
    item: 'ITEM-7',
    what: 'the third-party API keys are unrotated',
    pattern: /\b(?:api key|third-party key)s?\b[^.]{0,80}\b(?:still live|not (?:been )?rotated|await rotation)\b|\bredaction is not rotation\b/i,
  },
  {
    item: 'ITEM-38',
    what: 'the OTP verify hardening exists only on disk',
    pattern: /hardening[^.]{0,60}\b(?:exists )?on disk only\b|\bexists on disk only\b[^.]{0,60}hardening/i,
  },
  {
    item: 'ITEM-39',
    what: 'OTP_Transactions.Attempts is unprovisioned',
    pattern: /\bOTP_Transactions\.Attempts\b[^.]{0,60}\b(?:is unprovisioned|does not exist|has not been (?:created|provisioned))\b/i,
  },
];

/* `--recover` is retired and refuses to run. Telling a reader to use it is not a status claim
   about a register item, but it is the same failure — a document outliving the thing it
   describes — and it costs the reader a command that exits 1 with a wall of text. */
const RETIRED_COMMANDS = [
  { cmd: 'npm run recover', why: 'retired — it would wire a dead estate; use npm run values:template' },
];

const QUALIFIED = /\b(not|never|no longer|superseded|was |were |until|previously|corrected|withdrawn|retired|burned|revoked|rotated|closed|resolved|historic|as it stood|this read|used to)\b/i;

/* A document whose whole purpose is to record a past reading declares it in a banner near the
   top. Those are exempt: the banner is the qualification, and repeating it on every line would
   be noise. The banner must be in the first 40 lines, where a reader meets it before the
   claim. */
const SUPERSEDED_BANNER = /superseded|consolidation note|is a record of|not (?:a )?current state|reading of .* at `?[0-9a-f]{7}/i;

const SKIP_DIRS = [
  'node_modules', '.git', 'dist',
  'docs/audits',                              // an audit rewritten when inconvenient is not a record
  'docs/archive',                             // retired by definition
  'docs/forensic',                            // a forensic reading of a past state
  'docs/reference/foundational',              // the deployed estate verbatim, decision D5
  'docs/reference/flow-contracts',            // exports; they say what the tenant says
  'docs/deployment/sharepoint/evidence',      // tenant readings
  'docs/process',                             // generated from a dated discovery run
];

function surfaceFiles(dir, out = []) {
  const rel = dir.slice(ROOT.length + 1);
  if (SKIP_DIRS.some((s) => rel === s || rel.startsWith(s + '/'))) return out;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') && entry !== '.github') continue;
    const p = join(dir, entry);
    const r = p.slice(ROOT.length + 1);
    if (SKIP_DIRS.some((s) => r === s || r.startsWith(s + '/'))) continue;
    if (statSync(p).isDirectory()) surfaceFiles(p, out);
    else if (/\.md$/i.test(entry)) out.push(p);
  }
  return out;
}

{
  const files = surfaceFiles(ROOT);
  const violations = [];
  let exempted = 0;

  for (const abs of files) {
    const rel = abs.slice(ROOT.length + 1);
    const text = readFileSync(abs, 'utf8');
    const lines = text.split('\n');
    /* A banner exempts a document from the superseded-claim patterns, because a record of a past
       reading has to be able to state what it read. It does NOT exempt it from prescribing a
       retired command: `npm run recover` exits 1 with a wall of text whatever the status of the
       document that sent the reader there, and a banner saying "this is historic" does not make
       the instruction cost less. Otherwise a banner would be a way to switch this gate off. */
    const banner = SUPERSEDED_BANNER.test(lines.slice(0, 40).join('\n'));
    if (banner) exempted++;

    let inDatedSection = false;
    lines.forEach((line, idx) => {
      const h = line.match(/^#{2,3}\s+(.*)$/);
      if (h) inDatedSection = /^\d{4}-\d{2}-\d{2}|^\w+ \d{1,2},? \d{4}/.test(h[1].trim());
      if (inDatedSection) return;
      /* The qualification may sit on the next line. Prose in this corpus wraps at about 100
         columns, so "…which is now" / "**retired and exits 2**" is one sentence across two
         lines, and a line-scoped test reads the first half as an unqualified claim. The window
         is the line and the one after it — enough for a wrap, not enough for a paragraph that
         changes subject. */
      if (QUALIFIED.test(line) || QUALIFIED.test(lines[idx + 1] || '')) return;

      if (!banner) {
        for (const s of SUPERSEDED) {
          if (s.pattern.test(line)) {
            violations.push(`${rel}:${idx + 1} — ${s.what} (closed by ${s.item})`);
          }
        }
      }
      for (const r of RETIRED_COMMANDS) {
        if (line.includes(r.cmd)) violations.push(`${rel}:${idx + 1} — prescribes ${r.cmd}, ${r.why}`);
      }
    });
  }

  ok(violations.length === 0,
    `no commissioning document restates a superseded claim (${files.length - exempted} scanned, ${exempted} exempt by banner)`,
    violations.slice(0, 25).join('\n       ') + (violations.length > 25 ? `\n       …and ${violations.length - 25} more` : ''));
}

/* ------------------------------------------------------------------ *
 * 5 · the rules above actually reject what they claim to reject
 * ------------------------------------------------------------------ */

/* Calibrated rules start green, which is indistinguishable from rules that match nothing. Each
   pattern is shown a sentence that makes its claim, and a qualified one that does not. */
{
  const MUTANTS = [
    ['ITEM-22', 'All 55 signatures are live right now.', 'All 55 signatures were live until the estate was rotated.'],
    ['ITEM-22', 'Rotate every one of them in Power Automate before going live.', 'This previously said: rotate every one of them in Power Automate.'],
    ['MANUAL-1', 'The routing table needs approval from the agency.', 'The routing table needed approval and no longer does.'],
    ['ITEM-7', 'Seven third-party API keys are still live at their providers.', 'Seven third-party API keys were still live until 2026-09-08.'],
    ['ITEM-38', 'The hardening exists on disk only.', 'The hardening previously existed on disk only.'],
    ['ITEM-39', 'OTP_Transactions.Attempts is unprovisioned.', 'OTP_Transactions.Attempts was unprovisioned until 2026-09-03.'],
  ];
  const misses = [];
  for (const [item, claim, qualified] of MUTANTS) {
    const rules = SUPERSEDED.filter((s) => s.item === item);
    if (!rules.some((r) => r.pattern.test(claim))) misses.push(`${item}: does not reject "${claim}"`);
    if (QUALIFIED.test(claim)) misses.push(`${item}: the claim "${claim}" reads as qualified, so the rule can never fire`);
    if (!QUALIFIED.test(qualified)) misses.push(`${item}: the qualified form "${qualified}" would be flagged`);
  }
  ok(misses.length === 0, `each superseded-claim rule rejects the claim it names (${MUTANTS.length} mutations)`,
    misses.join('\n       '));
}

/* ------------------------------------------------------------------ *
 * 6 · every closed item names what closed it
 * ------------------------------------------------------------------ */

/* A closure with no reason is how an item gets reopened: the next reader cannot tell whether it
   was closed on evidence or closed by being forgotten, so they reopen it to be safe. */
{
  const bare = reg.items
    .filter((i) => CLOSED.has(i.status))
    .filter((i) => !i.whyOpen || i.whyOpen.trim().length < 40 || !(i.evidence || []).length)
    .map((i) => i.id);
  ok(bare.length === 0, 'every closed item states why it closed and cites evidence', bare.join(', '));
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
