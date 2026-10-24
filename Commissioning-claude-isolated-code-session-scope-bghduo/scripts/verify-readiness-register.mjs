#!/usr/bin/env node
/**
 * Does the production-readiness register cite things that exist?
 *
 * WHY THIS EXISTS
 * `docs/deployment/PRODUCTION_READINESS_REGISTER.json` is the answer to "what stands between this
 * estate and production", and it is only worth reading if its citations are real. A register that
 * cites a moved file or a renamed npm script degrades into a document that sounds authoritative
 * and is not — which is the exact failure mode the rest of this repository's checks exist to
 * prevent, applied to the document that describes the checks.
 *
 * So this verifies the register's own claims about the repository:
 *
 *   1. every item carries all eleven required fields, present and non-empty
 *   2. every `file` evidence reference resolves to a file that exists
 *   3. every `command` evidence reference names a script that exists in package.json
 *   4. every id is unique, and every dependency names an id in this register
 *   5. every status is one of the declared vocabulary
 *   6. targetDate is null exactly when targetDateStatus says none is established — no item may
 *      quietly acquire an estimated date
 *   7. every OPEN item in OPEN_ITEMS.md is represented here, so the register cannot silently
 *      drop one
 *
 * Check 7 is the one that matters most over time. The others catch rot; that one catches
 * omission, which is the failure a reader cannot detect by reading.
 *
 * Usage:
 *   node scripts/verify-readiness-register.mjs
 *   node scripts/verify-readiness-register.mjs --check   # exit 1 on any failure
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const strict = process.argv.includes('--check');

const REGISTER = 'docs/deployment/PRODUCTION_READINESS_REGISTER.json';
const reg = read(REGISTER);
const pkg = read('package.json');

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };

console.log('\nProduction-readiness register\n');

const REQUIRED = ['id', 'title', 'category', 'description', 'status', 'evidence', 'whyOpen',
  'requirements', 'steps', 'owner', 'resolutionCriteria', 'targetDate', 'targetDateStatus',
  'validation'];

/* 1. field completeness */
{
  const incomplete = [];
  for (const it of reg.items) {
    for (const f of REQUIRED) {
      const v = it[f];
      const empty = v === undefined
        || (typeof v === 'string' && !v.trim())
        || (Array.isArray(v) && v.length === 0);
      /* targetDate is legitimately null — that is the point of targetDateStatus. */
      if (f === 'targetDate') continue;
      if (empty) incomplete.push(`${it.id}.${f}`);
    }
  }
  ok(incomplete.length === 0, `all ${reg.items.length} items carry every required field`, incomplete.join(', '));
}

/* 2 + 3. every citation resolves */
{
  const badFiles = [], badCommands = [];
  for (const it of reg.items) {
    for (const e of it.evidence || []) {
      if (e.type === 'file' && !existsSync(join(ROOT, e.ref))) badFiles.push(`${it.id} → ${e.ref}`);
      if (e.type === 'command') {
        const script = String(e.ref).replace(/^npm run /, '').replace(/^npm /, '');
        if (!pkg.scripts[script]) badCommands.push(`${it.id} → ${e.ref}`);
      }
    }
  }
  ok(badFiles.length === 0, 'every file cited as evidence exists', badFiles.join(', '));
  ok(badCommands.length === 0, 'every command cited as evidence is a real npm script', badCommands.join(', '));
}

/* 4. ids unique; dependencies resolve */
{
  const ids = reg.items.map((i) => i.id);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  ok(dup.length === 0, 'every item id is unique', dup.join(', '));

  const known = new Set(ids);
  const dangling = [];
  for (const it of reg.items) {
    for (const d of it.dependencies || []) {
      /* A dependency is either an item id, optionally followed by prose after an em dash or
         space, or a free-text condition. Only the id-shaped ones are resolvable. */
      const m = String(d).match(/^((?:ITEM|CFG|MANUAL|G)-[A-Z0-9]+)/);
      if (m && !known.has(m[1])) dangling.push(`${it.id} → ${m[1]}`);
    }
  }
  ok(dangling.length === 0, 'every dependency names an item in this register', dangling.join(', '));
}

/* 5. status vocabulary */
{
  const vocab = new Set(Object.keys(reg.statusVocabulary));
  const bad = reg.items.filter((i) => !vocab.has(i.status)).map((i) => `${i.id}=${i.status}`);
  ok(bad.length === 0, 'every status is one of the declared values', bad.join(', '));
}

/* 6. NO ESTIMATED DATES.
   The register declares that no target date exists anywhere in this estate. That declaration is
   only worth making if nothing can quietly contradict it, so a non-null targetDate is a failure
   unless targetDateStatus says one was actually established. */
{
  const bad = reg.items.filter((i) =>
    (i.targetDate === null) !== (i.targetDateStatus === 'ESTABLISHED_NONE'))
    .map((i) => `${i.id} date=${i.targetDate} status=${i.targetDateStatus}`);
  ok(bad.length === 0, 'no item carries a date that was not actually established', bad.join(', '));
}

/* 7. COVERAGE — the check a reader cannot perform by reading.
   Every item OPEN_ITEMS.md still lists as open must appear here. An item silently dropped from
   the register is indistinguishable, to a reader, from an item that does not exist. */
{
  const md = readFileSync(join(ROOT, 'docs/deployment/sharepoint/OPEN_ITEMS.md'), 'utf8');
  const open = new Set();
  for (const line of md.split('\n')) {
    const m = line.match(/^\|\s*(~~)?\*\*(\d+)\*\*(?:~~)?\s*\|(.*)$/);
    if (!m) continue;
    const closed = Boolean(m[1]) || (m[3].includes('✅') && m[3].includes('Closed'));
    if (!closed) open.add(Number(m[2]));
  }
  /* The register groups items 31 and 33 into ITEM-23: all three are closed by one provisioner
     run against index-targets.json, and splitting them would imply three visits. The grouping is
     declared here rather than assumed, so a reader can see it and disagree. */
  const GROUPED = { 31: 'ITEM-23', 33: 'ITEM-23', 34: 'ITEM-34' };
  const present = new Set(reg.items.map((i) => i.id));
  const missing = [...open]
    .filter((n) => !present.has(`ITEM-${n}`) && !(GROUPED[n] && present.has(GROUPED[n])))
    .sort((a, b) => a - b);
  /* REPRESENTATION, NOT AGREEMENT — and the difference cost this estate ten items.
     This asks only whether an open row EXISTS in the register. A row the register had closed
     went on being presented here as outstanding and passed, every time, because it existed. Ten
     did. Status agreement, in both directions, is `npm run test:closure`; this check stays as
     the omission guard it was written to be. */
  ok(missing.length === 0,
    `every open item in OPEN_ITEMS.md is represented (${open.size} open, ${reg.items.length} register entries)`,
    missing.length ? `missing: ${missing.join(', ')}` : '');
}

/* 8. FRESHNESS — the check whose absence let this register go stale for 38 commits.
 *
 * Revision 1.0.0 was compiled against 5831840 and not revised again while twelve live flow
 * exports were compared, all fourteen flows were verified current against the tenant, and four
 * new items arose. Every check above passed throughout: they verify that the citations resolve
 * and that no OPEN_ITEMS row is missing, and both remained true of a register describing an
 * estate that had moved on. A register that is authoritative about a state nobody re-read is
 * the exact failure the rest of this repository's checks exist to prevent, applied to the
 * document that lists them.
 *
 * The rule: evidence is dated in its own filename, and the register must be at least as new as
 * the newest evidence file AND must actually cite it. Landing evidence without folding it into
 * the register now fails the build, which is the only way this stays true.
 *
 * AND IT HAPPENED AGAIN, IN THE PART THIS CHECK COULD NOT SEE.
 *
 * Revision 1.1.7 was compiled against 5bcc913 on 2026-09-05 and stayed pinned there for 110
 * commits — while the file's own CONTENT was edited fourteen times. A reader was told the register
 * described a commit it had long stopped describing. This check was green every single day,
 * because it was blind three ways at once:
 *
 *   1. It walked two of the FOUR directories named `evidence`. The endpoint harvest wrote to the
 *      repository root, the notification work to tenant-execution/; neither was looked at.
 *   2. It matched only `^YYYY-MM-DD-` filename prefixes. The governance and endpoint work dates
 *      itself INSIDE the file (`recordedUtc`, `exportedAtUtc`, `generatedAtUtc`) or as a filename
 *      suffix — so even adding those directories would have matched nothing in them.
 *   3. It never read `compiledAgainstCommit` at all. Nothing compared it to HEAD.
 *
 * And the comparison it did make was satisfied by a TIE: the newest date-prefixed filename was
 * 2026-09-05, which is exactly `compiledUtc`. A check that passes on equality cannot distinguish
 * "just revised" from "frozen on the day the newest thing happened to land".
 *
 * All three are closed below. The commit check is the one that matters, because it needs no
 * convention to hold: whatever a future workstream calls its evidence or where it puts it, a
 * register pinned to a commit that is not HEAD is stale by inspection. */
{
  const DIRS = [
    'docs/deployment/sharepoint/evidence',
    'docs/deployment/internal/evidence',
    'docs/deployment/notification-instrument/tenant-execution/evidence',
    'evidence',
  ];
  const DATED = /^(\d{4}-\d{2}-\d{2})-/;
  /* A date the file states about itself.
     NOT an enumerated list of key names — enumerating the places to look is the mistake that made
     this check blind in the first place, and enumerating the keys would repeat it one level down.
     Any JSON key that ends in Utc, At or Date and holds an ISO date counts, which covers
     recordedUtc, exportedAtUtc, generatedAtUtc, capturedAtUtc, verifiedAtUtc, executedAtUtc and
     whatever the next workstream invents. */
  const EMBEDDED = /"[A-Za-z_]*(?:Utc|At|Date)"\s*:\s*"(\d{4}-\d{2}-\d{2})/g;
  /* Markdown records its date under a heading rather than in a field. */
  const MD_DATE = /^#{1,3}\s*Date\s*$\n+\s*(\d{4}-\d{2}-\d{2})/m;
  const SUFFIX = /[_-](\d{4})-?(\d{2})-?(\d{2})(?:[_.T]|$)/;

  const found = [];
  for (const d of DIRS) {
    const abs = join(ROOT, d);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      const ref = `${d}/${name}`;
      const m = DATED.exec(name);
      if (m) { found.push({ date: m[1], ref }); continue; }
      const s = SUFFIX.exec(name);
      if (s) { found.push({ date: `${s[1]}-${s[2]}-${s[3]}`, ref }); continue; }
      /* Only read a file's insides when its name gives nothing away, and only small text files —
         this check must not become a reason not to run the suite. */
      try {
        const abs2 = join(abs, name);
        if (!/\.(json|md)$/i.test(name) || statSync(abs2).size > 512 * 1024) continue;
        const text = readFileSync(abs2, 'utf8');
        const dates = [...text.matchAll(EMBEDDED)].map((x) => x[1]);
        const md = MD_DATE.exec(text);
        if (md) dates.push(md[1]);
        dates.sort();
        if (dates.length) found.push({ date: dates.pop(), ref, embedded: true });
      } catch { /* unreadable is not evidence */ }
    }
  }

  /* THE CHECK THAT NEEDS NO CONVENTION. A register pinned to an old commit is stale by inspection,
     whatever its evidence directories happen to contain.

     But "pinned commit is not HEAD" alone would fail on EVERY commit, including ones that change
     a stylesheet — and a check that fires on everything gets satisfied by bumping the field
     without re-reading anything, which is worse than no check. So it asks the narrower question:
     has anything the register DESCRIBES changed since it was pinned? Register-relevant means the
     paths its own items cite as evidence, plus the evidence trees above. The register file itself
     is excluded — revising it is the fix, not the offence. */
  {
    let head = null;
    try {
      head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch { /* not a work tree; the suites that need git say so themselves */ }

    const pinned = String(reg.compiledAgainstCommit || '');
    if (head && pinned) {
      const current = head.startsWith(pinned) || pinned.startsWith(head);
      let drifted = [];
      /* UNREACHABLE IS NOT THE SAME AS DRIFTED, AND THE DIFFERENCE IS THE WHOLE REMEDY.
         If the pin names a commit this history does not contain — a re-upload, a rebase, or a
         value that was never a commit — then nothing was compared and no path was found to have
         changed. Reporting that as "1 path(s) have changed" is a count of a sentinel string, and
         it sends the reader off to re-read a path that is not named because it does not exist.
         The honest report is that the property is UNVERIFIABLE here, with the one action that
         makes it verifiable again. */
      let reachable = true;
      if (!current) {
        try {
          execFileSync('git', ['cat-file', '-e', `${pinned}^{commit}`], { cwd: ROOT, stdio: 'pipe' });
        } catch { reachable = false; }
      }
      if (!current && reachable) {
        try {
          const relevant = new Set(DIRS);
          for (const it of reg.items) for (const e of it.evidence || []) if (e.type === 'file' && e.ref) relevant.add(e.ref);
          const isRelevant = (f) => f !== REGISTER
            && [...relevant].some((r) => f === r || f.startsWith(r.endsWith('/') ? r : `${r}/`));

          /* A COMMIT THAT REVISED THE REGISTER RE-READ ITS OWN EVIDENCE.
             Without this the check is unsatisfiable: you cannot write a commit's own hash into a
             file that commit contains, so revising the register and its evidence together would
             always land pinned one commit behind and always fail — and the only way to be green
             would be an empty follow-up commit that bumps a field, which proves nothing. So drift
             is measured only over commits that left the register alone. Those are the ones where
             evidence moved and nobody looked. */
          const commits = execFileSync('git', ['rev-list', `${pinned}..HEAD`],
            { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }).split('\n').filter(Boolean);
          const unreviewed = new Set();
          for (const c of commits) {
            const files = execFileSync('git', ['show', '--pretty=format:', '--name-only', c],
              { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }).split('\n').filter(Boolean);
            if (files.includes(REGISTER)) continue;          // revised here; its evidence was re-read
            for (const f of files) if (isRelevant(f)) unreviewed.add(f);
          }
          /* TOUCHED IS NOT THE SAME AS CHANGED, AND SAYING SO KEEPS THE CHECK CREDIBLE.
             Merging 28 commits from a concurrent session flagged nine cited paths; eight had NO
             NET DIFFERENCE from the pinned commit — regenerated, or edited and reverted along the
             way. Both still need re-reading, because in both cases evidence moved under an
             unrevised register. But reporting them identically as "changed" overstates eight of
             nine, and a check that overstates is a check the next reader learns to wave through. */
          drifted = [...unreviewed].sort().map((f) => {
            let net = '';
            try {
              net = execFileSync('git', ['diff', '--shortstat', `${pinned}..HEAD`, '--', f],
                { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }).trim();
            } catch { net = ''; }
            return net ? `${f}  (changed)` : `${f}  (touched, no net change)`;
          });
        } catch {
          /* Reachable, but the walk still failed. Report it as drift of unknown extent rather
             than as nothing. */
          drifted = ['(the history could not be walked from the pinned commit)'];
        }
      }
      if (!reachable) {
        ok(false,
          `the register is pinned to a commit this history contains (${pinned})`,
          `${pinned} is not in this history, so "has the evidence changed since it?" cannot be\n`
          + '       answered here — nothing was compared, and no cited path is known to have changed.\n'
          + '       This is what a re-upload or a rewritten history leaves behind.\n'
          + '       An owner re-reads the evidence the register cites, then sets compiledAgainstCommit\n'
          + '       to a commit IN this history, with compiledUtc and registerVersion, together.');
      } else {
        ok(current || drifted.length === 0,
          `the register is pinned to a commit whose evidence still stands (${pinned}${current ? ' — HEAD' : ''})`,
          `${drifted.length} path(s) the register cites have changed since ${pinned}:\n       `
          + `${drifted.slice(0, 8).join('\n       ')}${drifted.length > 8 ? `\n       …and ${drifted.length - 8} more` : ''}\n`
          + '       Re-read them, revise the items they bear on, and update compiledAgainstCommit, '
          + 'compiledUtc and registerVersion together.');
      }
    } else if (head) {
      ok(false, 'the register names the commit it was compiled against',
        'compiledAgainstCommit is unset, so nothing can tell whether it describes this tree.');
    }
  }

  if (!found.length) {
    ok(false, 'dated evidence was found to check the register against', `looked in ${DIRS.join(', ')}`);
  } else {
    const newestDate = found.map((f) => f.date).sort().pop();
    const newest = found.filter((f) => f.date === newestDate);
    ok(reg.compiledUtc >= newestDate,
      `the register is no older than the newest evidence (${newestDate})`,
      `compiledUtc ${reg.compiledUtc} predates ${newest.map((f) => f.ref).join(', ')} — re-read the estate and revise the register`);

    const cited = new Set();
    for (const it of reg.items) for (const e of it.evidence || []) if (e.ref) cited.add(e.ref);
    const uncited = newest.filter((f) => !cited.has(f.ref));
    ok(uncited.length === 0,
      `every piece of the newest evidence is cited by an item`,
      uncited.length ? `not cited: ${uncited.map((f) => f.ref).join(', ')}` : '');
  }
}

/* ------------------------------------------------------------------ *
 * 12 · every "N of M" in register prose is sourced, or retracted on the record
 *
 * Revision 1.2.2 corrected four items against a figure that came from nowhere: "the live endpoint
 * harvest ran on 2026-09-12, resolving 21 of 25 keys through ListCallbackUrl". The date belonged
 * to two flow exports and the count had no source in this repository at all. It reached four
 * items, the revision note and the generated runbook before anything noticed, because every gate
 * here checked citations, coverage, freshness and vocabulary — and none checked whether a number
 * stated in prose was a number anything held.
 *
 * A count is the most quotable thing a register says and the easiest to invent, so it is now the
 * one kind of prose claim that has to resolve. A claim passes by appearing somewhere outside the
 * register and the documents generated from it, or by being listed in `retractedClaims` with the
 * reason it is withdrawn — a declaration on the record, the way OUTSTANDING_SOURCES declares an
 * uncounted source, rather than a silent exemption.
 * ------------------------------------------------------------------ */
{
  const CLAIM = /\b\d{1,4} of \d{1,4}\b/g;
  /* The register and everything generated from it. A claim that appears only in these is a claim
     that only ever appeared in the register: it corroborates nothing. */
  /* A GATE MUST NOT CORROBORATE THE CLAIM IT IS CHECKING, AND THIS ONE DID.
     The comment above quotes "21 of 25" to explain why the check exists — and because this file
     lives under scripts/, the first version of the search found it and reported the claim as
     sourced. Removing the retraction then left the gate green on exactly the sentence it was
     written to catch, which a mutation run proved. So the verifier and the suites that exercise it
     are excluded: a test fixture quoting a number is not a record of that number. */
  const DERIVED = /PRODUCTION_READINESS_REGISTER|ACTION_PLAN|EXECUTION_RUNBOOK|IMPLEMENTATION_WALKTHROUGH|CLOSURE_DISPOSITION|COMMISSIONING_SURFACE|MASTER_REGISTER|OUTSTANDING|CLOSED\.md|FLOW_REGISTRY_SEED|closure-disposition\.json|verify-readiness-register\.mjs|^tests\//;

  const retracted = new Set((reg.retractedClaims || []).map((r) => r.claim));
  const claims = new Map();
  for (const it of reg.items) {
    for (const f of ['whyOpen', 'description', 'resolutionCriteria']) {
      for (const m of String(it[f] || '').matchAll(CLAIM)) {
        if (!claims.has(m[0])) claims.set(m[0], new Set());
        claims.get(m[0]).add(`${it.id}.${f}`);
      }
    }
  }

  const unsourced = [];
  for (const [claim, where] of claims) {
    if (retracted.has(claim)) continue;
    let out = '';
    try {
      out = execFileSync('grep', ['-rlF', claim, 'docs/', 'evidence/', 'scripts/', 'tests/', 'config/'],
        { cwd: ROOT, encoding: 'utf8' });
    } catch { out = ''; }               /* grep exits 1 when nothing matches */
    const corroborating = out.split('\n').filter(Boolean).filter((f) => !DERIVED.test(f));
    if (!corroborating.length) unsourced.push(`"${claim}" (${[...where].join(', ')})`);
  }

  ok(unsourced.length === 0,
    `every "N of M" in register prose is sourced or retracted (${claims.size} claims, ${retracted.size} retracted)`,
    unsourced.length
      ? `${unsourced.join('; ')}\n       Nothing outside the register and its generated documents states this.`
        + '\n       Cite evidence that carries the number, or add it to retractedClaims with the reason.'
      : '');

  /* A retraction has to explain itself, or retractedClaims becomes a way to keep a false number. */
  const thin = (reg.retractedClaims || []).filter((r) => !r.why || r.why.length < 40 || !r.claim);
  ok(thin.length === 0, 'every retracted claim states why it was withdrawn',
    thin.map((r) => r.claim || '(unnamed)').join(', '));
}

/* Summary by category and status, printed rather than asserted. */
const byCat = {}, byStatus = {};
for (const it of reg.items) {
  byCat[it.category] = (byCat[it.category] || 0) + 1;
  byStatus[it.status] = (byStatus[it.status] || 0) + 1;
}
console.log('\n  by category:', Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('  by status:  ', Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed\n`);
process.exit(strict && fail ? 1 : (fail ? 1 : 0));
