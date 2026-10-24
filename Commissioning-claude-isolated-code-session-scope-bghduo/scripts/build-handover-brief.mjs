#!/usr/bin/env node
/**
 * Emit `docs/deployment/HANDOVER_BRIEF.md` — the cover letter for an exported copy of this branch.
 *
 *   npm run brief
 *   npm run brief -- --check
 *
 * WHY A SIXTH BRIEF IS NOT WHAT THIS IS
 *
 * Five documents in this estate already brief someone, and three of them carry a banner reading
 * DO NOT COMMISSION FROM THIS DOCUMENT because they were written for a reader who no longer
 * exists. Adding another document that says "start here" is the failure this repository has spent
 * a week removing.
 *
 * So this is not an entry document and does not try to be one. `HOW-TO-USE-THIS-BUNDLE.md` is the
 * entry document: it says which files carry steps, in what order, and what you hand back. That
 * page assumes a reader who is already inside the estate and has been given access to it.
 *
 * This covers the one thing that page cannot: the handover itself. Somebody outside this
 * organisation receives an export of the branch and nothing else — no credentials, no tenant, no
 * conversation history, no way to ask what a directory is for. What they need first is not the
 * order of the steps. It is: what am I holding, what is missing on purpose, what in here is
 * authoritative and what is merely a record, what may I never edit, and how do I prove I have
 * broken nothing. Then they are handed to the entry document.
 *
 * WHY GENERATED
 *
 * Every number below is read from the artefact that owns it. A brief that states a count by hand
 * is stale the first time the count moves, and a stale brief about how much work is left is worse
 * than no brief: it is a number the reader will act on.
 *
 * WHAT IS DELIBERATELY NOT IN IT
 *
 * The tracked file count and the per-file digests. Those move on every commit, so stating them
 * here would put `npm run brief -- --check` in the red on any commit that adds a file — including
 * the commit that adds this generator. They belong to the export, which is built from one commit
 * at one moment: `npm run export` writes them into `EXPORT_MANIFEST.json` beside the files. Counts
 * that move when the WORK moves belong here; counts that move when the TREE moves belong there.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { documentFiles } from './lib/tracked-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/deployment/HANDOVER_BRIEF.md');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };
const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const T = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const master = J('docs/deployment/MASTER_REGISTER.json');
const external = J('docs/deployment/EXTERNAL_EXECUTION.json');
const sources = J('docs/deployment/OUTSTANDING_SOURCES.json');
const ownership = J('docs/reference/document-ownership.json');
const pkg = J('package.json');

/* ── The three tiers a reader must be able to tell apart ──────────────────────────────────────
 *
 * docs/README.md owns this classification. Reading it rather than restating it means a brief that
 * renames a tier when the table does, and fails loudly when the table stops carrying one.
 */
const classification = (() => {
  const rows = [...T('docs/README.md').matchAll(/^\|\s*\*\*(\w+)\*\*\s*\|([^|]+)\|([^|]+)\|([^|]+)\|/gm)]
    .map((m) => ({ kind: m[1], is: m[2].trim(), read: m[3].trim(), where: m[4].trim() }));
  /* 'Harvest' was a fourth tier whose only location was the harvest corpus. That corpus is no
     longer carried, so the tier no longer exists and requiring it here would fail for a document
     that is correct. The three that remain are still mandatory. */
  for (const want of ['Specification', 'Procedure', 'Record']) {
    if (!rows.some((r) => r.kind === want)) fail(`docs/README.md no longer classifies "${want}" — this brief is written around that table`);
  }
  /* That table's paths are written relative to docs/, because that is where it sits. This page sits
   * one level deeper, so a reader copying `architecture/` out of it would look in the wrong place.
   * Re-root each one, and refuse to emit a path that is not there. */
  for (const r of rows) {
    r.where = r.where.split(',').map((cell) => {
      const p = cell.trim().replace(/`/g, '');
      const full = `docs/${p}`;
      if (!fs.existsSync(path.join(ROOT, full))) fail(`docs/README.md classifies "${p}", which does not resolve to ${full}`);
      return `\`${full}\``;
    }).join(', ');
  }
  return rows;
})();

/* ── Files that look like a credential and are not ────────────────────────────────────────────
 *
 * tests/check-secrets.mjs owns the rule; this re-derives only the count, with the same pattern and
 * the same 43-character normalisation, so the sentence in the brief cannot claim a number the
 * scanner would not report. If the two ever disagree the scanner is right.
 */
const deadSignatures = (() => {
  const files = execFileSync('git', ['ls-files', 'docs/reference/foundational/'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const ALL = /sig=[A-Za-z0-9_-]{20,}/g;
  const distinct = new Set();
  let carrying = 0;
  for (const rel of files) {
    let text;
    try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
    const hits = text.match(ALL);
    if (!hits) continue;
    carrying++;
    for (const h of hits) distinct.add(h.slice(0, 'sig='.length + 43));
  }
  return { distinct: distinct.size, carrying, corpus: files.length };
})();

/* Top-level sections of a runbook, as a reader sees them — the same derivation the entry document
 * uses, so the two cannot disagree about how many steps a runbook has. */
const sections = (rel, prefix) => (T(rel).match(/^## .+$/gm) || [])
  .map((h) => h.replace(/^## /, '').trim())
  .filter((s) => s.startsWith(prefix));

const stages = pkg.scripts['test:node'].split('&&').length;
const counted = sources.sources.filter((s) => s.counted !== false);
const carryBack = external.tracks.flatMap((t) => t.steps.filter((s) => s.carryBack).map((s) => ({ ...s, track: t.title })));
const gating = master.gatingCommissioning || [];

/* ── Documents that must never be edited ──────────────────────────────────────────────────────
 *
 * Found the way the brief tells the reader to find them: by the banner at the top of the file. A
 * derivation that instead read the generators would have been circular for the reader — they would
 * have to trust a list they cannot check — and it produced two wrong answers when tried: it missed
 * every document whose generator is not declared with a --check, and it claimed an audit was
 * generated because a script happened to name it.
 *
 * The count is large and the list is not printed. 204 paths in a cover letter is noise; "look at
 * the top of the file" is a test the reader can apply to the one document in front of them.
 */
const generatedDocs = (() => {
  /* Tracked AND generated-but-ignored: the four documents MUST_CARRY_BANNER names are printed by
   * `npm run generate`, not carried in the tree, so `ls-files` alone cannot see them and this
   * check would pass over an empty set. See documentFiles() for why this is not a directory walk. */
  const files = documentFiles({ root: ROOT, pathspec: ['docs'], what: 'documents' })
    .filter((f) => f.endsWith('.md'));
  const BANNER = /GENERATED FILE|[Gg]enerated by|[Dd]o not edit|DO NOT EDIT/;
  const SAYS_HOW = /--check|npm run|scripts\//;
  return files.filter((rel) => {
    const head = T(rel).split('\n').slice(0, 14).join('\n');
    return BANNER.test(head) && SAYS_HOW.test(head);
  });
})();

/* The four an executor is most likely to try to edit. If one of these ever stops carrying its
 * banner, "you can tell by the top of the file" has become false for the documents it matters most
 * for. The portal and notification runbooks are deliberately NOT here: they are hand-written and
 * they OWN their steps, which is a different thing from a rendering that must not be touched. */
const MUST_CARRY_BANNER = [
  'docs/deployment/governance/GOVERNANCE-TENANT-RUNBOOK.md',
  ...ownership.derivedStepViews.views.map((v) => v.document),
];
for (const rel of MUST_CARRY_BANNER) {
  if (!generatedDocs.includes(rel)) {
    fail(`${rel} is generated but carries no do-not-edit banner in its first 14 lines.\n     `
      + '     This brief tells an external reader that the banner is how they identify a generated\n'
      + '     document. Restore the banner, or that instruction is false for a file they will open.');
  }
}

const track = (t) => `| **${t.id}** | ${t.title} | ${t.steps.length} | ${t.who} |`;

const doc = `# Handover brief

> **GENERATED FILE — do not edit by hand.** Built by \`scripts/build-handover-brief.mjs\` from the
> master register, the external execution plan, the declared sources, the ownership register and
> \`package.json\`. \`npm run brief -- --check\` fails if it drifts from any of them.

**Status: a cover letter, not a runbook.** It owns no steps and restates none. The only commands in
it are the four in §8, which verify that what you received is intact and unbroken.

**Read this once, then open [\`HOW-TO-USE-THIS-BUNDLE.md\`](./HOW-TO-USE-THIS-BUNDLE.md) and work from
there.** This page is the cover letter for the export. It tells you what you are holding, what is
missing on purpose, what you must not change, and how to prove you have broken nothing. It carries
no steps. The steps live in the three runbooks the entry document names.

---

## 1. What you have been given

**A git repository**, not a folder of files. Every file that is tracked on one branch is in it, at
one commit. \`EXPORT_MANIFEST.json\` beside them states which commit, how many files, and a SHA-256
for each one — check that first if the transfer was long or lossy.

That it is a repository is load-bearing, not incidental. Twelve scripts in here ask git which files
are tracked, and \`npm run test:node\` reaches one of them at its second stage. **Keep the \`.git\`
directory, and do not unpack this inside another repository** — in the first case the gate stops
dead, and in the second some checks quietly answer for the wrong repository.

The history is shallow on purpose: deep enough for the readiness gate to reach the commit the
register is compiled against, and no deeper. \`git log\` will not show you the whole story, and is
not meant to.

${classification.length} kinds of thing are in there, and telling them apart matters more than anything else on this
page:

| Kind | What it means for you | Where it lives |
|---|---|---|
${classification.map((r) => `| **${r.kind}** | ${r.read} | ${r.where} |`).join('\n')}

Put plainly:

- **A specification is a promise the system must keep.** If the code disagrees with it, that is a
  defect in one of them, and you say which.
- **A procedure is binding while you are executing it** and not before or after.
- **A record is what somebody found on a date.** It is never edited to agree with today. If a
  record is wrong now, that is not a correction to make — it is a finding to report.
- **A harvest is raw material that was captured, not written.** Prefer the contract to the sample,
  every time.

---

## 2. What is missing, on purpose

Nothing in this export will let you reach the tenant. That is deliberate, not an oversight, and
you should not ask for a shortcut around it.

| Missing | Why | What you do instead |
|---|---|---|
| \`config/config.local.js\` and \`document-portal/config.local.js\` | They hold signed Power Automate URLs. A signed URL is a credential: holding one is enough to invoke the flow. Both are git-ignored, so no commit can carry them | Create your own. The portal runbook §4 is the section that does it |
| A values file (\`~/dgo-values.txt\`) | Same reason. It is produced on the machine that will host the system, by a harvest step, and shredded after | Produce your own on your own host |
| Tenant credentials of any kind | They are not the repository's to give | Obtain them from the party who owns the tenant, with the accesses listed in §0 of the entry document |
| A filled-in escalation contact | Nobody in the repository knows who yours is | Fill §0 of \`governance/EXECUTION-AGENT-BRIEF.md\` before you start. **If the escalation recipient is blank, do not start** — an escalation with no recipient is a stop with no resumption |

---

## 3. Nothing in here is a credential

This estate used to carry a harvest corpus holding signature-shaped strings — dead ones, from
triggers that were rotated long ago, kept as the record of what had been built. That corpus is no
longer carried, and \`npm run test:secrets\` holds the count at its baseline, which may only shrink.

The rule it illustrated is worth keeping even though the files are gone: **deleting a file does not
revoke a credential.** Rotation does, and nothing else.
Only re-issuing the trigger does.

If you find a signature anywhere *outside* that directory, that is different, and it is a real
finding. \`npm run test:secrets\` is the check that draws exactly that line.

---

## 4. What you must never edit

**Every generated document — and there are ${generatedDocs.length} of them.** They are written by a script from a
register. Editing one does not change the system: it breaks the build, and your edit is gone the
next time anything regenerates.

**How to tell, for any file in front of you: look at the top.** Every one of the ${generatedDocs.length} says so in
its first few lines and names the script that writes it. Reading that banner is how the ${generatedDocs.length} were
counted, so the same test works on whichever file you happen to have open — there is no list to
consult and none is printed here.

Three of them are the ones you are most likely to reach for, because they read like a plan:

${ownership.derivedStepViews.views.map((v) => `- \`${v.document}\` — ${v.blocks}, generated from \`${v.source.split('/').pop()}\``).join('\n')}

**To change what a step says, change the register it is generated from, then regenerate.**
${ownership.derivedStepViews.rule}

Two documents are the opposite case and it is worth knowing the difference:
\`PORTAL-TENANT-RUNBOOK.md\` and \`NOTIFICATION-TENANT-RUNBOOK.md\` are written by hand and they **own**
their steps — no register sits behind them. You still do not edit them while executing them, but
if you find a step that is wrong, those two are where the correction belongs.

**Every record.** \`docs/audits/\` and the directories named \`evidence\` are what was true on a date.
They are not edited, ever — not to fix a typo, not to reflect a later correction. A record that
has been overtaken is superseded by a new document that says so, and the old one stays as it was.

---

## 5. What is authoritative when two things disagree

In order, highest first:

1. **A command.** Where a document and a command disagree, the command governs. This estate has
   been wrong in prose and right in code often enough that the rule is worth stating plainly.
2. **The registers.** \`PRODUCTION_READINESS_REGISTER.json\` is the record of what is open. The
   other ${counted.length - 1} counted sources are declared in \`OUTSTANDING_SOURCES.json\`.
3. **The generated documents**, which are those registers rendered for reading.
4. **Everything else**, which is context.

No document in this export briefs an engagement. Three once did, and they are deleted rather
than banner-marked, so there is nothing to read past: the commissioning path is the one named
above, and the tenant work is in the governance runbook.

---

## 6. How much is left

**${master.totals.open} items are open. ${master.totals.closed} are closed.** The open ones come from ${counted.length} separate sources, which is
why no single register answers the question on its own and why \`MASTER_REGISTER.json\` exists.

| Source | Where it lives |
|---|---|
${counted.map((s) => `| \`${s.id}\` | \`${s.path}\` |`).join('\n')}

**Not one of the ${master.totals.open} can be finished inside the repository.** Every one needs a tenant, a
decision, or a person with an access this export cannot contain. They are grouped by who holds
that access:

| Track | What it is | Steps | Who can do it |
|---|---|---:|---|
${external.tracks.map(track).join('\n')}

${gating.length} of them gate commissioning — until they close, \`npm run commission\` reports NOT CLEARED:
${gating.map((g) => `\`${g}\``).join(', ')}.

The full text of each step, with its actions, its inputs and what closes it, is in
[\`EXTERNAL_EXECUTION.md\`](./EXTERNAL_EXECUTION.md). Read that after the entry document, not
instead of it.

---

## 7. The ${carryBack.length} values you must bring back

Most steps close on evidence you produce and keep. These ${carryBack.length} are different: they produce a value
the repository needs written into it, and until that happens the repository goes on describing a
state that is no longer true.

The right-hand column is quoted from the register, so a cross-reference in it — "the registry
stand-up below", for instance — points into [\`EXTERNAL_EXECUTION.md\`](./EXTERNAL_EXECUTION.md),
where that step is written out in full.

| Step | What has to come back |
|---|---|
${carryBack.map((s) => `| **${s.id}** — ${s.title.trim()} | ${s.carryBack} |`).join('\n')}

Send them as text. Not a screenshot: a value that has to be retyped from an image gets retyped
wrong, and these are identifiers.

---

## 8. How to prove you have broken nothing

Run this before you change anything, and again after. Keep both outputs — the difference between
them is what you actually changed.

\`\`\`bash
npm run test:node         # the gate: ${stages} stages, exit 0 when clean
npm run commission        # the commissioning verdict, computed from the record
npm run outstanding       # one total across the ${counted.length} declared sources
\`\`\`

**You do not need \`npm ci\` for any of those three.** They need node and git and nothing else — no
install, no \`node_modules\`, no network. That is measured on this branch, not assumed. \`npm ci\` is
needed only for \`npm run test:smoke\`, the browser suite, which is not the gate.

\`npm run test:node\` is the one that matters. It is not a test suite in the usual sense — most of its
stages regenerate a document and fail if the result differs from the committed one. That makes it
the check that you have not silently edited something generated.

Three things it will report that are **not** your fault and are not regressions:

- **\`CFG-1\` and \`CFG-2\` are blockers in every clone, permanently.** The work is done and evidenced;
  the evidence is a git-ignored local config by design, so no command run here can ever confirm it.
  The register carries them as \`DISCHARGED_UNTRACKABLE\` and the gate says so where it reports them.
  **Those two, and only those two.** \`npm run commission\` should report exactly **2 blockers**. If it
  reports a third — a secret-ratchet failure in particular — you are not looking at a defect in this
  repository: you are running outside a git working tree, and the ratchet is failing to ask git for
  the file list. Restore the \`.git\` directory and run it again.
- **The browser suite (\`npm run test:smoke\`) does not pass clean, and is not the gate.** It needs a
  real browser, some of its assertions are not deterministic between runs, and its results depend on
  which browser build you have. Run it if you want the signal; do not treat a failure there as
  something you caused, and do not chase it. \`npm run test:node\` is the gate to hold green.

---

## 9. When to stop

Stop and escalate — do not work around, and do not improvise — on any of these:

- Any access you were told you would have is not actually there.
- Any operation returns **403**. That is permission, not procedure, and retrying will not fix it.
- A read-back reports \`MISSING\`, \`RESERVED NAME\` or \`UNREADABLE\`.
- A script that writes reports work on a **third**, unmodified run. It should report nothing to do.
  If it does not, it is not idempotent and something is being created twice.
- A row exists only in a list you were about to delete. Deleting it would destroy the only copy.
- Anything requires one of the agency decisions. **Those are not an executor's to make**, and there
  are ${external.tracks.find((t) => t.id === 'decisions')?.steps.length ?? 0} of them waiting.

---

## 10. What "finished" looks like

Not "all the steps were run". This:

1. \`npm run commission\` reports **CLEARED**.
2. \`npm run test:node\` still exits 0 — the same ${stages} stages, green.
3. The ${carryBack.length} carry-back values in §7 have been sent, and are in the repository.
4. For every step you executed, you have returned: the relay line the script printed, the outcome
   (\`COMPLETE\`, \`PARTIAL\`, \`BLOCKED\` or \`NOT ATTEMPTED\`), and any deviation from what the section
   said would happen, quoted exactly.

The fourth is the one that gets skipped. A step with no recorded outcome is indistinguishable from
a step that was never run, and the next person to look at this will have to do it again to find out.

---

Now open [\`HOW-TO-USE-THIS-BUNDLE.md\`](./HOW-TO-USE-THIS-BUNDLE.md).
`;

if (CHECK) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (current === doc) {
    console.log(`\n  ✅ HANDOVER_BRIEF.md matches the registers (${master.totals.open} open, ${external.tracks.length} tracks, ${carryBack.length} carry-back values).\n`);
    process.exit(0);
  }
  console.error('\n  ✖  docs/deployment/HANDOVER_BRIEF.md has drifted from the artefacts it is generated from.');
  console.error('     Run: npm run brief\n');
  process.exit(1);
}

fs.writeFileSync(OUT, doc);
console.log('\nHandover brief, rebuilt from the registers\n');
console.log(`  wrote docs/deployment/HANDOVER_BRIEF.md  (${(doc.length / 1024).toFixed(1)} KB)`);
console.log(`        ${master.totals.open} open across ${counted.length} sources, ${external.tracks.length} tracks, ${carryBack.length} carry-back values`);
console.log(`        ${generatedDocs.length} generated documents named as unedittable`);
console.log(`        ${deadSignatures.distinct} dead signatures across ${deadSignatures.carrying} files declared as not-a-leak\n`);
