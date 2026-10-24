#!/usr/bin/env node
/**
 * One document owns each executable instruction. Nothing else may restate it.
 *
 * WHY THIS EXISTS
 *
 * Every fact in this estate already has one source: GUIDs, counts, site names and keys live in
 * JSON and are read into documents by generators, and `--check` fails the build if a document
 * drifts from the record. That property held.
 *
 * Procedure did not have it. Procedure is prose, written by hand inside the generators, and on
 * 2026-09-10 five of the sixteen instructed browser scripts had more than one document telling a
 * reader to run them — `provision-sharepoint-fields.browser.js` had nine. Twelve documents
 * carried a sentence of the form:
 *
 *     "Where this document and that one differ on a command, that one is right."
 *
 * Each of those is an admission that two documents can carry the same command with different
 * content. A precedence rule is not a single source of truth; it is a tie-breaker for a conflict
 * that should not be possible. And a reader who has the wrong document has no way to know it.
 *
 * The estate's own history says what happens next: `verify-governance-columns.browser.js` was
 * corrected and the runbook that describes it was not, so the runbook went on telling operators
 * to expect a verdict the script had stopped printing. That was one script and one document.
 * Nine documents is the same failure with nine chances to occur.
 *
 * WHAT IS CHECKED
 *
 *   1. Every emitted browser script is owned by exactly one document.
 *   2. No document other than the owner instructs a reader to run it.
 *   3. No two documents' names differ only by hyphen, underscore or case.
 *   4. No document carries a precedence sentence.
 *
 * WHAT "INSTRUCTING" MEANS, MECHANICALLY
 *
 * A markdown block — text between blank lines — that names a `*.browser.js` file AND carries an
 * imperative to paste, copy or open it. Naming a script, linking to it, or saying which document
 * runs it is not instructing, and must stay allowed: a status page that cannot name the script
 * whose step it is reporting on is useless.
 *
 * Usage:  node tests/single-source-of-truth.test.mjs
 * Exit:   0 = one source per instruction, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNERSHIP = path.join(ROOT, 'docs/reference/document-ownership.json');

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const own = JSON.parse(fs.readFileSync(OWNERSHIP, 'utf8'));

/** Every markdown file in docs/, relative to the repository root. */
const markdown = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) markdown.push(path.relative(ROOT, p));
  }
})(path.join(ROOT, 'docs'));

const SCRIPT_NAME = /([a-z0-9-]+\.browser\.js)/g;
/* The other shapes of emitted console artifact. A `.console-apply.js` snippet is pasted into a
   console exactly as a browser script is; a `.bookmarklet.txt` is saved as a bookmark, because the
   device it exists for has no console to paste into. Neither was visible to a check that globbed
   scripts/*.browser.js, which is how 16 snippets came to be instructed by nothing at all. */
const ARTIFACT_NAME = /([A-Za-z0-9_]+\.console-apply\.js|[a-z0-9-]+\.bookmarklet\.txt)/g;
/* Deliberately narrow. "Run" alone appears in far too much prose that is reporting rather than
   directing — "the run of 2026-09-09", "a re-run creates nothing". These are the forms that
   actually put a script in front of a reader. */
const IMPERATIVE = /\b(paste|copy the whole|copy the file|copy it|run it in the console|open [^\n]{0,60}\.browser\.js)\b/i;
const PRECEDENCE = /(differ on a command|that one is right|this one is wrong|that document is right)/i;

/**
 * @returns {Map<string, string[]>} script name -> documents that instruct it
 *
 * SCOPE OF THE WINDOW, AND WHY IT IS TWO LINES AND NOT A PARAGRAPH
 *
 * A whole paragraph is too coarse: a markdown table is one paragraph, so an audit listing script
 * filenames in one row and the words "designer-paste" in another read as an instruction to run
 * them. That is a historical record being told to reword itself, which teaches people the guard
 * is noise.
 *
 * A single line is too fine: "…signed in as normal, and paste\n`scripts/x.browser.js` into the
 * console" is an instruction split by a line wrap, and missing it is the failure that matters.
 *
 * Two consecutive lines catches the wrap and nothing else. Table rows are excluded outright: in
 * this estate an instruction is a numbered step or a sentence, never a cell. A cell describes
 * what a script is; the step that runs it lives in the owning runbook.
 */
function instructingDocuments(nameRe = SCRIPT_NAME) {
  const map = new Map();
  for (const rel of markdown) {
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const window = [lines[i], lines[i + 1] ?? ''];
      if (window.every((l) => l.trimStart().startsWith('|'))) continue;
      const text = window.join('\n');
      if (!IMPERATIVE.test(text)) continue;
      for (const [, name] of text.matchAll(nameRe)) {
        if (!map.has(name)) map.set(name, []);
        if (!map.get(name).includes(rel)) map.get(name).push(rel);
      }
    }
  }
  return map;
}

console.log('\nSingle source of truth — one document owns each executable instruction\n');

const declaredOwner = new Map();
for (const d of own.domains) {
  for (const s of d.scripts) {
    assert(!declaredOwner.has(s), `${s} is claimed by two domains`);
    declaredOwner.set(s, d.owner);
  }
}

check('every domain names an owning document that exists', () => {
  for (const d of own.domains) {
    assert(fs.existsSync(path.join(ROOT, d.owner)), `${d.id} names a missing owner: ${d.owner}`);
  }
});

check('every emitted browser script is owned by exactly one document', () => {
  const emitted = fs.readdirSync(path.join(ROOT, 'scripts')).filter((f) => f.endsWith('.browser.js'));
  const unowned = emitted.filter((f) => !declaredOwner.has(f));
  assert(!unowned.length,
    `${unowned.length} script(s) have no declared owner — add them to a domain in docs/reference/document-ownership.json: ${unowned.join(', ')}`);
  const phantom = [...declaredOwner.keys()].filter((f) => !emitted.includes(f));
  assert(!phantom.length, `the register owns ${phantom.length} script(s) that do not exist: ${phantom.join(', ')}`);
});

check('no document other than the owner instructs a reader to run a script', () => {
  const violations = [];
  for (const [script, docs] of instructingDocuments()) {
    const owner = declaredOwner.get(script);
    if (!owner) { violations.push(`${script} is instructed by ${docs.join(', ')} and owned by nothing`); continue; }
    for (const d of docs) {
      if (d !== owner) violations.push(`${script}: instructed by ${d}, owned by ${owner}`);
    }
    if (!docs.includes(owner)) {
      violations.push(`${script}: owned by ${owner}, which does not instruct it — the owner must carry the step, not only the name`);
    }
  }
  assert(!violations.length,
    `${violations.length} instruction(s) have a source other than their owner:\n      ${violations.join('\n      ')}`);
});

check('every owned script is instructed somewhere — a step with no document is a step nobody runs', () => {
  /* The duplication check only sees scripts that some document instructs, so a script nobody
     mentions passes it silently. That is the opposite failure and just as expensive: the estate
     ships a console script, the runbook never tells anyone to run it, and the work it does is
     simply never done. Naming the gap is cheap; discovering it during a tenant window is not. */
  const instructed = instructingDocuments();
  const orphans = [...declaredOwner.keys()].filter((s) => !instructed.has(s));
  assert(!orphans.length,
    `${orphans.length} script(s) are owned by a runbook that never tells anyone to run them:\n      `
    + orphans.map((s) => `${s} — owner ${declaredOwner.get(s)}`).join('\n      '));
});

/**
 * Every emitted console artifact, not only the ones that happen to end .browser.js.
 *
 * The rule above was written for `scripts/*.browser.js` and enforced by globbing exactly that.
 * Measured on 2026-09-11, the estate also emits 16 `*.console-apply.js` snippets under
 * docs/deployment/internal/flows/console-apply/ — pasted into a console in precisely the same way
 * — and no step-carrying document named a single one of them. They were not in contention with a
 * second document, which is what the rule looks for; they were in contention with nothing, which
 * the rule could not see. An artifact nobody instructs is the orphan case the check below already
 * guards for owned scripts, arriving through the gap in what counts as a script.
 */
const artifactsOnDisk = (a) => (a.match
  ? fs.readdirSync(path.join(ROOT, a.path)).filter((f) => f.endsWith(a.match.slice(1))).sort()
  : [path.posix.basename(a.path)]);

check('every emitted console artifact is owned by a domain or recorded as unowned', () => {
  const recorded = own.consoleArtifacts?.artifacts || [];
  assert(recorded.length, 'the register records no console artifacts; it emits several');

  const emitted = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts'))) {
    if (f.endsWith('.bookmarklet.txt')) emitted.push(`scripts/${f}`);
  }
  (function walkArtifacts(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walkArtifacts(p);
      else if (e.name.endsWith('.console-apply.js')) emitted.push(path.relative(ROOT, p).split(path.sep).join('/'));
    }
  })(path.join(ROOT, 'docs/deployment'));

  /* The counts are asserted, not just the paths: a seventeenth snippet appearing in a directory
     this register says holds sixteen is exactly the event that must fail a build. */
  for (const a of recorded) {
    assert(fs.existsSync(path.join(ROOT, a.path)), `${a.id} records a missing path: ${a.path}`);
    if (!a.match) continue;
    const n = artifactsOnDisk(a).length;
    assert(n === a.count,
      `${a.id} records ${a.count} artifact(s) and ${n} are on disk — one is neither owned nor recorded`);
  }

  const covered = (rel) => recorded.some((a) => (a.match
    ? path.posix.dirname(rel) === a.path && path.posix.basename(rel).endsWith(a.match.slice(1))
    : rel === a.path));
  const loose = emitted.filter((rel) => !covered(rel));
  assert(!loose.length,
    `${loose.length} emitted console artifact(s) are neither owned by a domain nor recorded in `
    + `consoleArtifacts:\n      ${loose.join('\n      ')}`);
});

check('a recorded artifact is named by the document that instructs it, and instructed by no other', () => {
  const instructed = instructingDocuments(ARTIFACT_NAME);
  const problems = [];
  let registerIds = null;

  for (const a of own.consoleArtifacts?.artifacts || []) {
    assert(a.generatedBy && fs.existsSync(path.join(ROOT, a.generatedBy)),
      `${a.id} names a generator that does not exist: ${a.generatedBy}`);
    assert((a.whyNotADomainScript || '').length > 40,
      `${a.id} does not say why it is not simply a domain-owned script`);

    const names = artifactsOnDisk(a);
    const instructors = new Set(names.flatMap((n) => instructed.get(n) || []));

    if (a.instructedBy) {
      assert(fs.existsSync(path.join(ROOT, a.instructedBy)),
        `${a.id} names a missing instructing document: ${a.instructedBy}`);
      const body = fs.readFileSync(path.join(ROOT, a.instructedBy), 'utf8');
      /* Naming, not an imperative. You do not "paste" a bookmarklet — you save it as a bookmark —
         so the paste vocabulary the script rule keys on does not apply, and demanding it would be
         the test dictating prose. What must hold is that the document it is recorded against is
         the document that actually carries it. */
      if (!names.some((n) => body.includes(n))) {
        problems.push(`${a.id}: recorded against ${a.instructedBy}, which never names it`);
      }
      /* An artifact that performs a step another document owns must point at that owner, which is
         the single-source rule surviving a change of mechanism rather than being escaped by one. */
      if (a.sameStepAs) {
        const ownerDoc = a.sameStepAs.split(/\s+/)[0];
        assert(fs.existsSync(path.join(ROOT, ownerDoc)), `${a.id} names a missing owner: ${ownerDoc}`);
        if (!body.includes(path.posix.basename(ownerDoc))) {
          problems.push(`${a.id}: ${a.instructedBy} performs a step ${ownerDoc} owns and does not point at it`);
        }
      }
      for (const d of instructors) {
        if (d !== a.instructedBy) problems.push(`${a.id}: also instructed by ${d}`);
      }
    } else {
      assert((a.ownedWhen || '').length > 40,
        `${a.id} has no instructing document and does not state what would give it one`);
      for (const d of instructors) {
        problems.push(`${a.id}: recorded as instructed by nobody, but ${d} instructs it — record the owner instead`);
      }
    }

    for (const id of a.wouldAdvance || []) {
      if (!registerIds) {
        const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/deployment/PRODUCTION_READINESS_REGISTER.json'), 'utf8'));
        registerIds = new Set(reg.items.map((i) => i.id));
      }
      assert(registerIds.has(id), `${a.id} names ${id}, which the readiness register does not carry`);
    }
  }

  assert(!problems.length,
    `${problems.length} recorded artifact(s) do not match what the documents say:\n      ${problems.join('\n      ')}`);
});

check('every document carrying tenant-action steps declares where they come from', () => {
  /* THE RULE ONLY EVER CHECKED BROWSER SCRIPTS, AND THAT WAS HALF THE ESTATE.
     A step in this repository comes in two kinds. A console-script step pastes a *.browser.js
     file; those are owned, and the checks above enforce it. A tenant-action step is a Power
     Automate click, an npm command or a configuration edit, written as a `**Do**` or `**Steps**`
     block — and nothing was looking at those at all.

     What that cost: ACTION_PLAN.md carried 24 `**Do**` blocks while its own banner said it
     carried no commands, and EXECUTION_RUNBOOK.md carried 48 `**Steps**` blocks under the same
     false banner. Both passed every check, because neither mentions a browser script. A reader
     sent away from a document that holds the steps they need is exactly the failure the
     duplication rule exists to prevent, arriving from the opposite direction.

     Three or more blocks is the threshold: one or two is a document illustrating a procedure it
     does not own, which is how a brief legitimately shows what a step looks like. */
  const BLOCK = /^\*\*(Do|Steps|Procedure)\*\*\s*$|^\*\*(Do|Steps|Procedure)\.?\*\*/gm;
  const owners = new Set(own.domains.map((d) => d.owner));
  const declaredViews = new Set((own.derivedStepViews?.views || []).map((v) => v.document));
  const undeclared = [];
  for (const rel of markdown) {
    if (rel.startsWith('docs/archive/')) continue;
    const n = (fs.readFileSync(path.join(ROOT, rel), 'utf8').match(BLOCK) || []).length;
    if (n < 3 || owners.has(rel) || declaredViews.has(rel)) continue;
    undeclared.push(`${rel} — ${n} step block(s)`);
  }
  assert(!undeclared.length,
    `${undeclared.length} document(s) carry tenant-action steps and are neither a domain owner nor `
    + `a declared derivedStepView in docs/reference/document-ownership.json:\n      ${undeclared.join('\n      ')}`);
});

check('every declared derived step view names a source that exists and a generator that writes it', () => {
  for (const v of own.derivedStepViews?.views || []) {
    for (const k of ['document', 'source', 'generator', 'blocks']) {
      assert(v[k], `a derivedStepView is missing ${k}`);
    }
    for (const k of ['document', 'source', 'generator']) {
      assert(fs.existsSync(path.join(ROOT, v[k])), `${v.document}: ${k} names a missing file — ${v[k]}`);
    }
    const gen = fs.readFileSync(path.join(ROOT, v.generator), 'utf8');
    assert(gen.includes(path.basename(v.source)),
      `${v.generator} does not read ${path.basename(v.source)} — the declared source is not the real one`);
    assert(gen.includes(path.basename(v.document)),
      `${v.generator} does not write ${path.basename(v.document)} — the declared generator is not the real one`);
  }
});

check('no document claims to carry no commands while carrying step blocks', () => {
  /* The specific false statement this whole check exists because of. A banner is read; a register
     entry is not. If the two disagree, the banner is what misleads someone. */
  const BLOCK = /^\*\*(Do|Steps|Procedure)\*\*\s*$|^\*\*(Do|Steps|Procedure)\.?\*\*/gm;
  const liars = [];
  for (const rel of markdown) {
    if (rel.startsWith('docs/archive/')) continue;
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (!/carries no commands/.test(text)) continue;
    const n = (text.match(BLOCK) || []).length;
    if (n >= 3) liars.push(`${rel} — says "carries no commands", carries ${n} step block(s)`);
  }
  assert(!liars.length, `${liars.length} document(s) contradict themselves:\n      ${liars.join('\n      ')}`);
});

check('no two documents differ only by hyphen, underscore or case', () => {
  /* One README per directory is a convention, not a collision: nobody asks for "the README" and
     means a specific one out of context. The hazard is a *titled* document — a runbook, a
     walkthrough, a plan — whose name is reachable by asking for it out loud. And the archive is
     archived; its names are history, not instructions. */
  const CONVENTIONAL = new Set(['readme', 'index', 'contributing', 'changelog', 'license', 'notes']);
  /* Declared, not inferred. A heuristic for "this pair is fine" would quietly absolve the next
     real collision; a list makes each exemption something a person decided and signed. */
  const exempt = new Set(
    (own.nameCollisionExemptions?.pairs || []).map((p) => [p.a, p.b].sort().join('|')),
  );
  const seen = new Map();
  const clashes = [];
  for (const rel of markdown) {
    if (rel.startsWith('docs/archive/')) continue;
    const key = path.basename(rel, '.md').toLowerCase().replace(/[-_]/g, '');
    if (CONVENTIONAL.has(key)) continue;
    if (!seen.has(key)) { seen.set(key, rel); continue; }
    if (exempt.has([seen.get(key), rel].sort().join('|'))) continue;
    clashes.push(`${seen.get(key)}  vs  ${rel}`);
  }
  assert(!clashes.length,
    `${clashes.length} pair(s) of documents are distinguishable only by punctuation or case — a reader asked for "the execution runbook" cannot tell which was meant:\n      ${clashes.join('\n      ')}`);
});

check('no document carries a precedence sentence', () => {
  const carriers = markdown.filter((rel) => PRECEDENCE.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
  assert(!carriers.length,
    `${carriers.length} document(s) resolve a conflict instead of preventing one. A tie-breaker is not a single source of truth; delete the sentence and point at the owner instead:\n      ${carriers.join('\n      ')}`);
});

check('the register explains why each non-executable document is not the owner', () => {
  for (const [doc, role] of Object.entries(own.nonExecutableRoles || {})) {
    assert(fs.existsSync(path.join(ROOT, doc)), `the register describes a missing document: ${doc}`);
    assert(typeof role === 'string' && role.length > 20, `${doc} has no stated role`);
  }
});

check('a document named like a runbook says whether it is one — everywhere, not just docs/deployment', () => {
  /* The punctuation check catches EXECUTION_RUNBOOK vs EXECUTION-RUNBOOK. It does not catch the
     larger problem, which is a NAME THAT CLAIMS A ROLE THE DOCUMENT DOES NOT HAVE. Measured on
     2026-09-10, `docs/deployment` held three files ending in RUNBOOK, three in WALKTHROUGH and
     three retired agent briefs — eleven documents whose names read as "execute me", of which one
     carried steps. One of the three runbooks was 279 bytes of position statement.

     Someone told to "follow the runbook" opens the wrong file, and nothing in it says so. The
     three retired briefs were fine — they disclaim themselves in their first lines, which is
     exactly the remedy. So the rule is: claim the role in your name, or say in your opening lines
     what you actually are.

     This was scoped to docs/deployment first, on the reasoning that elsewhere the directory
     already answers the question. It does not. `reference/platform-architecture-pack/` held an
     OPERATIONS_RUNBOOK.md, and six closed handoff rounds were still named EXEC-BRIEF and
     EXEC-DIRECTIVE with nothing saying the workstream had ended — the very documents someone
     searching for "the brief" would find. The narrower scope was a guess about where people look,
     and a guess is not a control. Everything outside docs/archive/ is now in scope; the archive is
     archived, and its names are history rather than instructions.

     `**Status: …**` in the opening lines counts as an answer. Two documents already used it before
     this check existed, and rewriting a working convention to match a sentence this test happens
     to prefer would be the test dictating prose rather than checking a property. */
  const CLAIMS = /(RUNBOOK|WALKTHROUGH|GUIDE|BRIEF|DIRECTIVE|HANDOVER|PLAN)/i;
  const DISCLAIMS = /carries no commands|carries steps, and owns none|retired|superseded|historical|\*\*Status:/i;
  const owners = new Set(own.domains.map((d) => d.owner));
  const silent = markdown.filter((rel) => {
    if (rel.startsWith('docs/archive/')) return false;
    if (!CLAIMS.test(path.basename(rel)) || owners.has(rel)) return false;
    const head = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').slice(0, 16).join('\n');
    return !DISCLAIMS.test(head);
  });
  assert(!silent.length,
    `${silent.length} document(s) are named as if they carry steps and say nothing either way. `
    + `Add the "carries no commands" banner, or make it an owner:\n      ${silent.join('\n      ')}`);
});

check('no document is both an owner and listed as carrying no steps', () => {
  /* A rename sweep produced exactly this: PORTAL-TENANT-RUNBOOK.md was made the portal owner and
     simultaneously inherited its predecessor's "restates no step" entry, because the sweep
     rewrote the key along with every other mention of the old filename. The register then said
     both things at once and nothing noticed — the other checks read `domains` and
     `nonExecutableRoles` separately and neither compares them. A register that contradicts
     itself is the defect this whole file exists to prevent, one level up. */
  const owners = new Set(own.domains.map((d) => d.owner));
  const both = Object.keys(own.nonExecutableRoles || {}).filter((d) => owners.has(d));
  assert(!both.length,
    `${both.length} document(s) are declared as a domain owner and as carrying no steps:\n      ${both.join('\n      ')}`);
});

check('the register describes the rule the test actually applies', () => {
  const stated = own.rule?.whatCountsAsInstructing || '';
  assert(/two consecutive lines/i.test(stated) && /table/i.test(stated),
    'the register still describes a paragraph-wide window; the test uses a two-line window excluding '
    + 'table rows. A rule nobody can read off the record is a rule nobody can check.');
  const artifact = own.rule?.artifactRule || '';
  assert(/console-apply/i.test(artifact) && /recorded/i.test(artifact),
    'the register states the rule for browser scripts only; the test also requires every other '
    + 'emitted console artifact to be owned or recorded.');
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  console.error(failures.map((f) => `  ✖  ${f}`).join('\n\n'));
  process.exit(1);
}
