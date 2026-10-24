#!/usr/bin/env node
/**
 * Emit `docs/deployment/HOW-TO-USE-THIS-BUNDLE.md` — the operating manual for the execution bundle.
 *
 * WHY THIS IS THE ONLY ENTRY DOCUMENT
 *
 * There were three. A bundle README said what was in the box, START-HERE.md named the documents
 * carrying steps, and this said how to run them — and every section of the README restated
 * something in one of the other two. Three files that all read as "start here" is the confusion
 * this repository spent a day removing from its runbooks, rebuilt at the bundle root.
 *
 * So this absorbed START-HERE's two unique sections and the README became a pointer. A reader who
 * knows there are runbooks and does not know that §0 of the brief must be filled before any of
 * them has been told where the steps are and not how to run them; both belong in one place.
 *
 * WHY GENERATED
 *
 * Every count and every section name in it is read from the artefact that owns it: the ownership
 * register, the closure disposition, the governance position, and the section headings of the
 * runbooks themselves. A manual that names a section that has been renamed sends someone to a
 * heading that is not there, and this repository has paid for that twice already —
 * `verify-governance-columns` outliving its decision, and Appendix A naming a package that does
 * not exist.
 *
 *   npm run bundleguide
 *   npm run bundleguide -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ownership } from './lib/document-ownership.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/deployment/HOW-TO-USE-THIS-BUNDLE.md');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };
const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const disposition = J('docs/deployment/closure-disposition.json');
const position = J('docs/reference/governance-estate-position.json');
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\n').filter(Boolean);

/** Top-level sections of a runbook, in order, as a reader sees them. */
const sections = (rel) => (fs.readFileSync(path.join(ROOT, rel), 'utf8').match(/^## .+$/gm) || [])
  .map((h) => h.replace(/^## /, '').trim());

/**
 * Where a reader finds a file, written as they will type it: relative to this document.
 *
 * This used to be a hand-written map to a `registers/ … packages/ … notification/` layout, and on
 * 2026-09-15 no directory named `registers/` existed anywhere in the tree and no command in this
 * repository produced that shape. A bundle was assembled by hand once; the manual for it outlived
 * the assembly, and went on sending readers to paths that resolved nowhere.
 *
 * So it is derived now, from the actual location of the actual file, and `here()` cannot name a
 * path that does not exist because `exists()` refuses to emit one.
 */
const HERE = 'docs/deployment';
/** Doc-relative, for a link a reader clicks. */
const here = (rel) => {
  if (!fs.existsSync(path.join(ROOT, rel))) fail(`this manual would name ${rel}, which does not exist`);
  return path.relative(HERE, rel);
};
/** Repository-root, for a path a reader types or greps — §3 says so in its lead-in. */
const abs = (rel) => {
  if (!fs.existsSync(path.join(ROOT, rel))) fail(`this manual would name ${rel}, which does not exist`);
  return rel;
};
/** A directory, with the count of tracked files under it — so a table of directories cannot go stale. */
const dir = (rel, filter = () => true) => {
  if (!fs.existsSync(path.join(ROOT, rel))) fail(`this manual would name the directory ${rel}, which does not exist`);
  const n = tracked.filter((f) => f.startsWith(`${rel.replace(/\/$/, '')}/`)).filter(filter).length;
  if (!n) fail(`this manual would name ${rel} as somewhere to look, and nothing tracked is under it`);
  return n;
};

for (const d of ownership.domains) {
  if (!fs.existsSync(path.join(ROOT, d.owner))) fail(`${d.id} names a missing owner`);
}

const byId = Object.fromEntries(ownership.domains.map((d) => [d.id, d]));
const need = ['portal-endpoint', 'governance-tenant', 'notification-remediation'];
for (const id of need) if (!byId[id]) fail(`the manual is written around a domain that no longer exists: ${id}`);

const tenant = disposition.items.filter((i) => i.authority === 'TENANT_EXECUTION');
const agency = disposition.items.filter((i) => i.authority === 'AGENCY_DECISION');
const open = position.openFindings;

const portalSections = sections('docs/deployment/PORTAL-TENANT-RUNBOOK.md').filter((s) => s.startsWith('§'));
const govSections = sections('docs/deployment/governance/GOVERNANCE-TENANT-RUNBOOK.md').filter((s) => s.startsWith('Step'));
const notifSections = sections('docs/deployment/NOTIFICATION-TENANT-RUNBOOK.md').filter((s) => s.startsWith('§'));

const list = (ss) => ss.map((s) => `| \`${s.split(/\s[·—]\s/)[0]}\` | ${s.split(/\s[·—]\s/).slice(1).join(' — ') || '—'} |`).join('\n');

const totalScripts = ownership.domains.reduce((n, d) => n + (d.scripts?.length || 0), 0);

/* The two directories holding designer packages, and every directory named `evidence`. Both were
 * single invented names — `packages/` and `evidence/` — in the layout this manual used to describe. */
const DESIGNER = [
  'docs/deployment/internal/flows/designer-paste',
  'docs/deployment/sharepoint/flows/designer-paste',
];
const PROCESSOR_SPEC = abs('docs/deployment/notification-instrument/notification-processor/processor-spec.json');
const EVIDENCE = [...new Set(tracked
  .filter((f) => /(^|\/)evidence\//.test(f))
  .map((f) => `${f.slice(0, f.indexOf('evidence/') + 'evidence'.length)}/`))].sort();
if (!EVIDENCE.length) fail('nothing tracked sits under a directory named evidence, and this manual says where the record is kept');

const doc = `# How to use this bundle

> **GENERATED FILE — do not edit by hand.** Built by \`scripts/build-bundle-guide.mjs\` from the
> ownership register, the closure disposition, the governance position, and the section headings of
> the runbooks themselves. \`npm run bundleguide -- --check\` fails if it drifts from any of them.

**This is the only entry document.** It says which documents carry steps, what you do with them,
in what order, and what you hand back. Nothing else in this bundle is a starting point — if a file
is not named here, it is context, evidence, or an input a step will send you to.

*One thing comes before it, and only if you are outside the organisation that built this:*
[\`HANDOVER_BRIEF.md\`](./HANDOVER_BRIEF.md) *is the cover letter for an exported copy — what you
hold, what is deliberately missing, what you must never edit. It carries no steps. Read it once,
then come back here.*

---

## 0. Who is doing this, and what they need

This bundle assumes **one operator with a browser and a terminal**, or **an agent paired with a
human who pastes into the browser and returns the console output**. Either works. Nothing here
needs PowerShell, PnP, or an Entra app registration.

**Before anything else, fill §0 of [\`governance/EXECUTION-AGENT-BRIEF.md\`](./governance/EXECUTION-AGENT-BRIEF.md).**
Seven inputs cannot be derived from any artefact in this bundle. **If §0.4 — the escalation
recipient — is blank, do not start.** An escalation with no recipient is a stop with no resumption.

Access required, all of it before §1 of anything:

| Access | Proves out by |
|---|---|
| SharePoint Site Owner on the governance site | Site contents loads |
| Power Automate maker in the environment | A flow opens for editing |
| Power Automate **run history** in that environment | Any flow → Run history |
| A clone of the repository, or an export of it from \`npm run export\` — **with its \`.git\` directory** | \`npm run commission\` runs and reports 2 blockers, not 3 |
| node. Not \`npm ci\`: the gate needs no dependencies | \`npm run test:node\` runs |

---

## 1. The order, and why it is that order

\`\`\`
    fill §0 of the brief
            │
            ├── A. Portal runbook §0 → §4  ──┐   (prerequisites, then both
            │                                │    surfaces configured)
            │                                ├─ A and B are independent
            └── B. Governance runbook      ──┘   and run in parallel
                   Steps 1 → 7
                        │
                        ├── C. Notification runbook §1 → §4   (needs A at §4)
                        │
                        ├── D. Portal runbook §5 → §11        (needs A and B)
                        │
                        └── E. The ${tenant.length} items in ${here('docs/deployment/ACTION_PLAN.md')}
\`\`\`

**Portal §0 is five prerequisites** — repository write access, a connectivity dry run, the role
catalogue seed, the writeback flow, and recording the workflow ids. Nothing else works until 0.3
has loaded the role catalogue: every internal flow resolves its caller against it.

**A and B are independent and run in parallel.** C cannot start until the portal runbook reaches
§4, because notification carriers send through a connection §4 configures. D depends on both. E is
last because most of its items close conditions the earlier work creates.

---

## 2. What each of the ${ownership.domains.length} step-carrying documents is for

### \`${here(byId['portal-endpoint'].owner)}\` — ${byId['portal-endpoint'].title}

${byId['portal-endpoint'].scripts.length} console scripts. Run it front to back; the sections are ordered by dependency, not by topic.

| Section | What it does |
|---|---|
${list(portalSections)}

**How a console step works, every time:** open the named file from \`scripts/\`, select all, copy,
paste into the browser console on the site the section names, press Enter. Scripts that write are
dry-run by default — read the table, then set \`DRY_RUN = false\` at the top of the pasted text and
paste again. **Paste a third time unmodified**; a script that reports work on the third run did not
do what it claimed on the second.

### \`${here(byId['governance-tenant'].owner)}\` — ${byId['governance-tenant'].title}

${byId['governance-tenant'].scripts.length} console scripts. **Steps 2, 2.7 and 3a–3c are already complete against the tenant** — re-running
them is safe and reports "present, 0 created", which is how you confirm you are where the runbook
thinks you are.

| Step | What it does |
|---|---|
${list(govSections)}

**Step 3d — the delete — is gated and must stay gated** until Step 4 identifies who wrote to the
duplicate site on 2026-08-31, or the 14-day substitute control in the brief is satisfied and
recorded.

### \`${here(byId['notification-remediation'].owner)}\` — ${byId['notification-remediation'].title}

No console scripts; every step is a Power Automate or SharePoint action.

| Section | What it does |
|---|---|
${list(notifSections)}

**§2 is the one to do first and not batch with the rest.** It stops verification codes going to a
fixed mailbox instead of the person who asked for one — a credential delivered to the wrong
recipient, reported as sent.

---

## 2a. Two documents render steps they do not own

${(ownership.derivedStepViews?.views || []).map((v) => `- \`${here(v.document)}\` — ${v.blocks}, generated from \`${here(v.source)}\``).join('\n')}

They are one truth in two shapes, not two truths: both are generated from the same register and a
\`--check\` fails the build if either drifts. **Read them; never edit them.** To change a step,
change the register.

---

## 3. What every other directory is for

Paths are written from the repository root. This page sits in \`${HERE}/\`.

| Directory | When you open it |
|---|---|
| \`scripts/\` | Every time a runbook names a \`.browser.js\` file — ${dir('scripts', (f) => f.endsWith('.browser.js'))} of them are here. Never pick one off the directory listing: go to the runbook section that names it, which carries the mode, the site and the pass condition |
| \`${DESIGNER[0]}\`<br>\`${DESIGNER[1]}\` | When a step says to paste a designer package. ${DESIGNER.reduce((n, d) => n + dir(d), 0)} files across the two, of which ${tracked.filter((f) => DESIGNER.some((d) => f.startsWith(`${d}/`)) && f.includes('.variables.')).length} are \`*.variables.*\` carriers. The carrier is pasted **before** the flow package, because the package reads declarations the carrier supplies |
| \`${HERE}/\` | This directory. \`ACTION_PLAN.md\` for the ${tenant.length} remaining items and their closing conditions; the registers they are generated from are the \`.json\` files beside it. \`*-spec.json\` is what a console script was generated from — read one to understand what a script will do, never to drive it by hand |
| \`${HERE}/notification-instrument/\` | ${dir(`${HERE}/notification-instrument`)} files: the email templates, \`${PROCESSOR_SPEC}\` when you reach §3, and in \`${HERE}/notification-instrument/tenant-execution/evidence/\` the blank forms you fill and return |
| \`${HERE}/governance/\` | \`${HERE}/governance/EXECUTION-AGENT-BRIEF.md\` before you start. \`${HERE}/governance/GOVERNANCE-STATUS.md\` to see what is already done. \`${HERE}/governance/WHAT-WAS-DONE.md\` for repository-side work you do not need to repeat |
| the ${EVIDENCE.length} directories named \`evidence\` | Read-only, and the record of what happened: ${EVIDENCE.map((e) => `\`${e}\``).join(', ')}. **Never re-run a script you find in one** — re-running is the duplication case, not a repair |

---

## 4. What you produce, and what you hand back

Nothing in this bundle is complete until the evidence exists. For each section you execute:

1. **The relay line.** Every writing script prints one line of JSON between two markers. Copy that
   line — not the table. A \`console.table\` copies as one unbroken string, and a whole-console paste
   also contains the script, whose source names every verdict the ledger can produce.
2. **The outcome**, one of \`COMPLETE\`, \`PARTIAL\`, \`BLOCKED\`, \`NOT ATTEMPTED\`.
3. **Any deviation** from the section's stated expectation, quoted exactly.

Files you create that are deliberately not in this bundle:

| File | Created by | Where it comes from |
|---|---|---|
| \`config.local.js\` (both surfaces) | you | Portal runbook §4 |
| \`~/dgo-values.txt\` | the harvest script | Portal runbook §3.2 |
| the Step 1 backup manifest | the backup script | Governance runbook Step 1 |
| \`tenant-inventory.json\`, \`connection-verification.json\` | you | The blank forms are tracked at \`${here('docs/deployment/notification-instrument/tenant-execution/evidence')}/\` — fill them and return them |

---

## 5. When to stop

Stop and escalate to §0.4's recipient — do not work around — on any of:

- Any access in §0 is unavailable.
- A read-back reports \`MISSING\`, \`RESERVED NAME\` or \`UNREADABLE\`.
- A third paste of a writing script creates anything.
- Any duplicate list's item count has **increased**.
- A row exists only in a duplicate — deleting would destroy the only copy.
- Any operation returns 403. That is permission, not procedure.
- Anything requires a decision on the ${agency.length} agency items. **Those are not an executor's to make.**

---

## 6. Two things that will look like failures and are not

**Flow 01 reporting a field-count variance.** \`DGO_HTTPFlowRegistry\` now specifies 36 columns and
the registry total is 102, not 101. Flow 01's \`validation.expectedFields\` and the seed
\`ProvisioningSchemaExpectedFieldCount\` both still say 101. Provision 102 without updating those two
and a correct run reports a variance against itself. Update both, or expect and discount it.

**A \`ZZ_RETIRED_\` list failing a call.** That is the point of the rename. Every deployed reference
to those lists is by title, so the prefix makes a stale caller fail visibly instead of silently
writing to a duplicate.

---

## 8. Why the step-carrying documents are not all in one directory

Because location was never the defect. Documents that carried steps without saying so, and
documents that said they carried none while carrying dozens — that was the defect, and it is
declared in \`${abs('docs/reference/document-ownership.json')}\` and enforced by a guard, neither of which cares
where a file sits. Moving the console runbooks would rewrite 70 file references with execution
imminent, and the notification instrument records a deliberate decision to keep its delivered
shape. What a single directory would have bought is somewhere to start. That is this page.

---

## 9. Checking your position at any time

\`\`\`bash
npm run commission        # computes the gate from the record; no stored verdict to go stale
npm run test:node         # the full chain
\`\`\`

The gate currently reports **NOT CLEARED**. ${open.length} governance findings are open and ${tenant.length} items remain
executable. Run it before and after every tenant session — the difference between the two runs is
what you actually changed.
`;

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

console.log('\nBundle operating manual\n');
console.log(`  domains        ${ownership.domains.length}`);
console.log(`  console scripts ${totalScripts}`);
console.log(`  sections cited  ${portalSections.length + govSections.length + notifSections.length}`);
console.log(`  open items      ${tenant.length} executable, ${agency.length} agency-decision\n`);

if (CHECK) {
  if (doc !== previous) fail('the bundle guide is stale. Run: npm run bundleguide');
  console.log('  ✅ the bundle guide matches the register and the runbooks\n');
  process.exit(0);
}

fs.writeFileSync(OUT, doc);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)}\n`);
