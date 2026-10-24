#!/usr/bin/env node
/**
 * The end-to-end implementation walkthrough for every open item.
 *
 * Generated, not written, so no value in it can be a placeholder: endpoint keys and workflow ids
 * come from docs/reference/endpoint-register.json, index targets from
 * docs/deployment/sharepoint/index-targets.json, notification rows from
 * config/notification-matrix.config.js, sites from docs/reference/sharepoint-list-index.json,
 * and every item's purpose, steps, constraints and completion criteria from the readiness
 * register. If the estate changes, npm run test:walkthrough fails until this is regenerated.
 *
 *   node scripts/build-implementation-walkthrough.mjs           # write
 *   node scripts/build-implementation-walkthrough.mjs --check    # fail if stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RequiredNotifications } from '../config/notification-matrix.config.js';
import { OrganizationalUnits } from '../config/organizational-units.config.js';
import { ownershipBanner } from './lib/document-ownership.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const OUT = 'docs/deployment/IMPLEMENTATION_WALKTHROUGH.md';
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const register = J('docs/deployment/PRODUCTION_READINESS_REGISTER.json');

/* How many scripts and suites decide what to check by asking git which files are tracked. Counted,
   not typed: it read "Ten" while the number was fifteen, and the sentence it sits in is the one
   that tells someone their export must be a clone. */
const gitReaders = (() => {
  const hit = (pattern) => execFileSync('git',
    ['grep', '-l', '-e', pattern, '--', 'scripts/*.mjs', 'scripts/lib/*.mjs', 'tests/*.mjs'],
    { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const all = new Set([...hit('ls-files'), ...hit('tracked-files.mjs')]);
  all.delete('scripts/build-implementation-walkthrough.mjs');   // this file only talks about it
  all.delete('scripts/lib/tracked-files.mjs');                  // this file IS the reader
  return all.size;
})();
const endpoints = Object.values(J('docs/reference/endpoint-register.json').current_configuration);
const indexTargets = J('docs/deployment/sharepoint/index-targets.json').targets;
const sites = J('docs/reference/sharepoint-list-index.json').sites;
const pkg = J('package.json');

/* ── What the record says about each console artifact of this domain ──────────────────────────
   WHY THIS IS DERIVED AND NOT WRITTEN

   The governance domain has GOVERNANCE-STATUS.md: one row per step, DONE or BLOCKED or
   OUTSTANDING, each against the run that established it. The portal domain had nothing
   equivalent. Its execution state existed — APPLIED_UNVERIFIED means "executed against the
   tenant, with a run record naming the evidence", and the register carries that per item — but
   nobody could read it per SCRIPT without joining three files by hand: the ownership register
   for what the domain owns, the runbook for where each is run, and the readiness register for
   what is recorded about the work it serves. A join done by hand is done once and then rots.

   WHAT A ROW DOES NOT SAY. The verdict column is the status of the ITEMS the artifact serves,
   never proof that the artifact was run. The estate keeps that distinction deliberately:
   APPLIED_UNVERIFIED exists precisely because an action performed is not an effect observed.
   An artifact no item names is not untested or unneeded — the verifiers are named by no item
   because they close none. */
const ownership = J('docs/reference/document-ownership.json');
const PORTAL_RUNBOOK = 'docs/deployment/PORTAL-TENANT-RUNBOOK.md';
const portalScripts = ownership.domains.find(d => d.owner === PORTAL_RUNBOOK).scripts;

/* Sections are read off the owning runbook's own headings. A section number typed here would be
   a second copy of the runbook's structure, which is the failure this whole document avoids. */
function sectionsOf(rel) {
  const at = new Map();
  let h2 = '', h3 = '';
  for (const line of readFileSync(join(ROOT, rel), 'utf8').split('\n')) {
    const m3 = /^###\s+(.*)$/.exec(line);
    const m2 = /^##\s+(.*)$/.exec(line);
    if (m3) h3 = m3[1].trim();
    else if (m2) { h2 = m2[1].trim(); h3 = ''; }
    for (const [, name] of line.matchAll(/([a-z0-9-]+\.browser\.js)/g)) {
      if (!at.has(name)) at.set(name, { label: h3 || h2, order: at.size });
    }
  }
  return at;
}

const sectionLabel = (heading) => {
  const sub = /^(\d+(?:\.\d+)*)\s+(.*)$/.exec(heading);
  if (sub) return `§${sub[1]} — ${sub[2]}`;
  const top = /^§(\S+)\s*·\s*(.*)$/.exec(heading);
  return top ? `§${top[1]} — ${top[2]}` : heading;
};

/* Worst first: a reader scanning this column is looking for what is not finished. */
const SEVERITY = ['BLOCKED', 'DECISION_REQUIRED', 'EVIDENCE_INCOMPLETE', 'SPECIFIED_NOT_APPLIED',
  'READY', 'APPLIED_UNVERIFIED', 'ACCEPTED', 'DISCHARGED_UNTRACKABLE', 'RESOLVED'];
const verdictOf = (name) => {
  const hits = register.items
    .filter(i => JSON.stringify(i).includes(name))
    .sort((a, b) => SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status));
  return hits.length
    ? hits.map(i => `\`${i.id}\` ${i.status}`).join(' · ')
    : 'no item names it';
};

/* Rationale, not status: what each replaces is a judgement about the manual pass it removes, so
   it is stated once here and joined onto a derived row rather than maintained as a second list. */
const REPLACES = {
  'harvest-trigger-urls.browser.js': 'opening 20 flows and copying 25 URLs by hand',
  'provision-sharepoint-fields.browser.js': 'a PnP PowerShell session and its app registration',
  'harvest-flow-metadata.browser.js': 'reading 39 flow definitions one designer tab at a time',
};

const portalSections = sectionsOf(PORTAL_RUNBOOK);
const unplaced = portalScripts.filter(n => !portalSections.has(n));
if (unplaced.length) {
  console.error(`❌ ${unplaced.length} owned script(s) appear in no section of ${PORTAL_RUNBOOK}: ${unplaced.join(', ')}`);
  process.exit(1);
}
const artifactRows = portalScripts
  .slice()
  .sort((a, b) => portalSections.get(a).order - portalSections.get(b).order)
  .map(n => `| \`${n}\` | ${sectionLabel(portalSections.get(n).label)} | ${verdictOf(n)} | ${REPLACES[n] || '—'} |`)
  .join('\n');

const recordedRows = ownership.consoleArtifacts.artifacts.map((a) => {
  const name = a.match ? `${a.path}/${a.match}` : a.path;
  const where = a.instructedBy
    ? `[\`${a.instructedBy.split('/').pop()}\`](./${a.instructedBy.split('/').pop()})`
    : '**nothing instructs it**';
  const items = (a.wouldAdvance || [])
    .map(id => `\`${id}\` ${register.items.find(i => i.id === id).status}`).join(' · ');
  return `| \`${name}\` | ${where} | ${items || verdictOf(name.split('/').pop())} |`;
}).join('\n');

/* DISCHARGED_UNTRACKABLE counts as closed: done, evidenced once, and unverifiable from
   this repository because the proof is a credential or a git-ignored file. See
   statusVocabulary in the register. */
const CLOSED = new Set(['RESOLVED', 'ACCEPTED', 'DISCHARGED_UNTRACKABLE']);
const open = register.items.filter(i => !CLOSED.has(i.status));
const byId = Object.fromEntries(register.items.map(i => [i.id, i]));

/* Execution order. Configuration first because every tenant proof needs a transmitting client;
   then the provisioning that makes those proofs possible; then the proofs; then the sends; then
   the decisions, which block nothing technical and can run in parallel throughout. */
/* CFG-1 and CFG-2 led this list until 2026-09-14. They are DISCHARGED_UNTRACKABLE now — wired and
   evidenced on 2026-09-13, with the proof deliberately destroyed — so they are no longer work to
   walk an implementer through. Wiring a NEW host is a deployment, and docs/deployment/
   CLEAR-THE-LAST-BLOCKER.md is the document that owns it. */
const ORDER = [
  'ITEM-2',                                             // prove the write path before using it
  'ITEM-23', 'ITEM-30',                                 // provisioning the proofs depend on
  'ITEM-43', 'ITEM-56', 'ITEM-44',                      // OTP: in service, allow-listed, proven
  'ITEM-11', 'ITEM-12', 'ITEM-6',                       // portal correctness proofs
  'ITEM-25', 'ITEM-40',                                 // evidence to be captured from the tenant
  'ITEM-48', 'ITEM-50', 'ITEM-51',                      // the notification sends
  'ITEM-9',                                             // estate documentation
  'MANUAL-2', 'MANUAL-3',                               // pre-live gates
  'G-04',                                               // enforcement, after posture is decided
  'ITEM-37', 'ITEM-41', 'ITEM-52', 'ITEM-57',           // agency decisions
];
const missing = open.map(i => i.id).filter(id => !ORDER.includes(id));
if (missing.length) {
  console.error(`❌ ${missing.length} open item(s) are absent from the execution order: ${missing.join(', ')}`);
  console.error('   Add them to ORDER in scripts/build-implementation-walkthrough.mjs. The walkthrough must cover every open item.');
  process.exit(1);
}
const stale = ORDER.filter(id => !open.some(i => i.id === id));
if (stale.length) {
  console.error(`❌ the execution order names ${stale.length} item(s) that are no longer open: ${stale.join(', ')}`);
  process.exit(1);
}
const ordered = ORDER.map(id => byId[id]);

/* The register's prose predates the personal-data rule and quotes mailboxes that name people —
   ITEM-52 records where the surplus sends go, and one of those is an individual's address. A
   generated document must not reproduce it: the address is personal data, and DGO_UserDirectory
   is where identity belongs. Role mailboxes pass through, because a post is not a person. */
const ROLE_MAILBOXES = new Set(OrganizationalUnits
  .flatMap(u => [u.email, u.headEmail]).filter(Boolean).map(e => e.toLowerCase()));
const GENERIC_MAILBOX = /^(dgs?|dgceo|registry|domains|icegov|digitalnigeria|cerrt|servicom|ncsc\w*|itpcu?|iicp|pppu|hpppu|comdir|dgsregistry|policy|operations|finance|ict)@/i;
const redactPersonal = t => String(t).replace(/[A-Za-z0-9._%+-]+@nitda\.gov\.ng/gi, m =>
  (ROLE_MAILBOXES.has(m.toLowerCase()) || GENERIC_MAILBOX.test(m))
    ? m
    : '[a personal mailbox, resolved from DGO_UserDirectory]');

const esc = s => redactPersonal(String(s ?? '')).replace(/\s+/g, ' ').trim()
  /* The register writes the values file as a parameter; the walkthrough must name the file. */
  .replace(/--values <file>/g, '--values ~/dgo-values.txt')
  .replace(/<file>/g, '~/dgo-values.txt');
const bullets = a => (Array.isArray(a) ? a : []).filter(Boolean).map(x => `- ${esc(x)}`).join('\n');
const steps = a => (Array.isArray(a) ? a : []).filter(Boolean)
  .flatMap(s => esc(s).split(/(?=\b\d+\.\s)/).map(x => x.trim()).filter(Boolean))
  .map((s, n) => `${n + 1}. ${s.replace(/^\d+\.\s*/, '')}`).join('\n');

/* Per-item execution detail that the register records as prose but an operator needs as a
   command or a table. Every value here is read from the estate above, never typed in. */
const internalKeys = endpoints.filter(e => e.key.startsWith('DGO_')).map(e => e.key);
const portalKeys = endpoints.filter(e => e.key.startsWith('PF_')).map(e => e.key);
const otp = endpoints.find(e => e.key === 'DGO_ENDPOINT_OTP_VERIFY');
const siteRows = sites.map(s => `| \`${s.key}\` | ${s.url} | ${s.lists} |`).join('\n');
const indexRows = indexTargets.map(t =>
  `| ${t.listTitle} | \`${t.internalName}\` | ${t.itemsAtCapture.toLocaleString('en-GB')} | \`${t.site}\` |`).join('\n');
const endpointRows = endpoints.map(e =>
  `| \`${e.key}\` | \`${e.workflow_id}\` | ${e.flow_name} |`).join('\n');
const rnRows = ids => RequiredNotifications.filter(n => ids.includes(n.id))
  .map(n => `| ${n.id} | ${n.status} | ${esc(n.event)} | ${n.audience} |`).join('\n');

const EXTRA = {
  'CFG-1': `**What this configures**

The 18 internal endpoint keys:

${internalKeys.map(k => `\`${k}\``).join(' · ')}

**Automated path — a console run, no PowerShell.** Harvesting the trigger URLs from the tenant is
**§3.2 of [\`PORTAL-TENANT-RUNBOOK.md\`](./PORTAL-TENANT-RUNBOOK.md)**, which is the only document
that carries the step. It produces \`~/dgo-values.txt\`, which the rest of this section assumes.

It finds each flow's Request trigger by kind, POSTs \`listCallbackUrl\`, and prints a complete
signed values file. It reads the token the portal already holds, so it needs no PowerShell, no
Entra app registration and no tenant admin. The ${endpoints.length} keys resolve to ${new Set(endpoints.map(e => e.workflow_id)).size} distinct flows, so it fetches ${new Set(endpoints.map(e => e.workflow_id)).size} URLs.

**Nothing is printed unless every flow resolves.** A half-complete values file is worse than
none, so a single failure suppresses the block and names the flow.

**Clear the console afterwards** — it holds 25 credentials once it has run.

**On a phone there is no console**, so the same harvest ships as a bookmark:
\`scripts/harvest-trigger-urls.bookmarklet.txt\`, driven by §4a of
\`docs/deployment/CLEAR-THE-LAST-BLOCKER-TERMUX.md\`. Same two API calls per flow, same refusal
to produce a half-complete file; it puts the result on the clipboard rather than on the screen.

**Then, from bash:**

\`\`\`bash
npm run check:values -- ~/dgo-values.txt
npm run setup -- --values ~/dgo-values.txt --force
npm run check:config
\`\`\`

**Manual fallback**, if a flow is owned by someone else and cannot be co-owned: run
\`npm run values:template ~/dgo-values.txt\`, open that one flow in Power Automate, copy its
HTTP trigger URL, and paste the value after \`sig=\` on its line. \`npm run values:sign --
~/dgo-values.txt\` prompts per key and reads from stdin so nothing enters shell history.`,

  'CFG-2': `**What this configures**

The 7 portal endpoint keys:

${portalKeys.map(k => `\`${k}\``).join(' · ')}

The same \`~/dgo-values.txt\` carries them — the console harvester fetches all ${endpoints.length} keys
in one pass and \`npm run setup\` writes both runtimes from that one file. There is no second
harvest. Verify the portal side specifically:

\`\`\`bash
npm run check:config:portal
npm run commission
\`\`\``,

  'ITEM-23': `**The nine columns to index**

| List | Column | Items at capture | Site |
|---|---|---|---|
${indexRows}

**Sites**

| Key | URL | Lists |
|---|---|---|
${siteRows}

**Automated path — a console run, no PowerShell.** Provisioning the portal columns is
**§2 of [\`PORTAL-TENANT-RUNBOOK.md\`](./PORTAL-TENANT-RUNBOOK.md)**, which is the only document
that carries the step. The lists and columns it covers are below.

It creates missing columns first, then makes a second pass that sets the indexes, reading each
field first and skipping any already indexed — so it is safe to run twice, and **the second run
is the verification**: the index pass must report every target already indexed.

You need **Manage Lists** on each site; Site Owner is enough and tenant admin is not used. This
file exists precisely so the PnP PowerShell path and its Entra app registration are not needed.

**A refusal is not a pass.** SharePoint can decline to index a column on a list already past
5,000 items, and two of these lists were at 15,804 and 21,249 at capture. The script reports the
refusal and exits non-zero. Indexing is necessary and not sufficient: an indexed clause still has
to return under 5,000 rows, which is why DGO_SCHEDULED_SWEEP asks for a 30-day window.

**If a target is refused**, the run says so rather than passing. Do not record ITEM-23 as closed
while any target is red.`,

  'ITEM-2': `**Automated path — generated, and not yet owned**

A console snippet for this package exists:
\`docs/deployment/internal/flows/console-apply/DGO_FETCH_ALL.console-apply.js\`, from
\`npm run console:apply\`. Left at \`DRY_RUN = true\` it reads the flow over the same API a write
would use and reports what it would change without writing — reaching the definition and
reporting a diff **is** the write path proven, the only step it does not take being the PATCH.

**No runbook carries the step that applies it, so this document does not either.**
\`docs/reference/document-ownership.json\` records all 16 snippets as unowned, with the condition
that would give them an owner.`,

  'ITEM-43': `**The flow the register names**

| Key | Workflow id | Flow |
|---|---|---|
| \`${otp.key}\` | \`${otp.workflow_id}\` | ${otp.flow_name} |

\`DGO_ENDPOINT_OTP_GENERATE\` resolves to the same workflow. The deployed configuration must
resolve OTP_VERIFY to this id and to no other.

\`\`\`bash
npm run reconcile -- --check
npm run test:otpdeployed
npm run test:otpprotocol
\`\`\``,

  'ITEM-11': `**Automated path**

\`\`\`bash
npm run prove:tenant -- --only ITEM-11
\`\`\`

Calls STATUS with a reference that cannot exist and asserts HTTP 404. A 200 here is the defect
this item records. Evidence is written to \`docs/deployment/evidence/\`.`,

  'ITEM-12': `**Automated path**

\`\`\`bash
npm run prove:tenant -- --include-writes --only ITEM-12
\`\`\`

Submits one marked record carrying an attachment. **The HTTP status is not the criterion.** Read
back \`Portal Attachments\` on
\`https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre\` and confirm one row
carries the run id the proof prints.`,

  'ITEM-6': `**Automated path**

\`\`\`bash
npm run prove:tenant -- --include-writes --only ITEM-6
\`\`\`

Writes a status transition through WRITEBACK, then track the same reference on the portal and
confirm the status it shows changed. Both halves are the criterion.`,

  'ITEM-44': `**Automated path**

\`\`\`bash
npm run prove:tenant -- --include-writes --only ITEM-44
\`\`\`

Requests a code through OTP_GENERATE. Take the code delivered to that mailbox and verify it
through OTP_VERIFY in the same session. A 200 from generate alone does not meet the criterion.`,

  'ITEM-56': `**Automated path**

\`\`\`bash
npm run prove:tenant -- --only ITEM-56
\`\`\`

Sends a request carrying \`Origin: https://activityweb.page.gd\` and asserts that
\`Access-Control-Allow-Origin\` comes back equal to it. This proof is read-only.`,

  'ITEM-48': `**The rows this item must move to PROVISIONED**

| Row | State now | Event | Audience |
|---|---|---|---|
${rnRows(['RN-001', 'RN-003', 'RN-004', 'RN-005'])}

**Automated path — generated, and not yet owned**

A console snippet for this package exists:
\`docs/deployment/internal/flows/console-apply/DGO_SEND_EMAIL.console-apply.js\`. At
\`DRY_RUN = true\` it reports WOULD REPLACE and changes nothing; one flow at a time, exercised
before the next, is the safe unit of work. **No runbook carries the step that applies it** —
\`docs/reference/document-ownership.json\` records why, and what would give it an owner.

\`\`\`bash
npm run notifications -- --check
\`\`\`

**Three limits.** A snippet replaces only a top-level scope that already exists, and stops if
the flow does not have one of that name — placement is not guessed. Connection references are
not patched, so a scope using a connector the flow does not already hold saves and then fails at
run time unbound; apply that one in the designer. And \`DGO_SCHEDULED_SWEEP\` has no snippet at
all: it is a recurrence flow with no HTTP endpoint, so no contract key names it.`,

  'ITEM-50': `**The rows this item must move to PROVISIONED**

| Row | State now | Event | Audience |
|---|---|---|---|
${rnRows(['RN-006', 'RN-016', 'RN-021', 'RN-024', 'RN-037'])}

**Automated path — generated, and not yet owned**

There is one snippet per flow in \`docs/deployment/internal/flows/console-apply/\`, which is also
the safe unit of work. **No runbook carries the step that applies them**, and this document
records rather than restates: see \`docs/reference/document-ownership.json\`.

\`\`\`bash
npm run notifications -- --check
npm run test:sendemail
\`\`\`

MISADDRESSED means the send happens but goes to a fixed mailbox rather than the audience the row
names. \`npm run sendemail\` regenerates the recipient patch these packages carry.`,

  'ITEM-51': `**The rows this item must move to PROVISIONED**

| Row | State now | Event | Audience |
|---|---|---|---|
${rnRows(['RN-009', 'RN-011', 'RN-012', 'RN-015', 'RN-017', 'RN-018', 'RN-019', 'RN-034', 'RN-036', 'RN-038'])}

**Automated path — generated, and not yet owned**

There is one snippet per flow in \`docs/deployment/internal/flows/console-apply/\`. **No runbook
carries the step that applies them**; \`docs/reference/document-ownership.json\` records that, and
what would change it.

\`\`\`bash
npm run notifications -- --check
\`\`\`

LOCAL_ONLY rows (RN-012, RN-015, RN-034) are recorded in browser storage and leave the device
for nobody. They need a carrier built, not a recipient corrected — those three are the ones the
packages cannot supply.`,

  'MANUAL-3': `**The browser suite, against the deployed hostname**

\`\`\`bash
npm install
npx playwright install chromium
DGO_BASE_URL=https://activityweb.page.gd npm run test:smoke
\`\`\`

\`https://activityweb.page.gd\` is the deployed internal site, recorded at
\`docs/deployment/PORTAL-TENANT-RUNBOOK.md\` line 550. In a container, set \`DGO_CHROME_PATH\`
to the Chromium binary. The suite covers boot, accessibility, all 29 routes, the themes and the
portal, across these twelve spec files:

\`\`\`
tests/admin-console.spec.js      tests/audit-remediation.spec.js
tests/closure.spec.js            tests/containment.spec.js
tests/correspondence.spec.js     tests/document-flags.spec.js
tests/dual-spine.spec.js         tests/endpoint-console.spec.js
tests/lookup-commits.spec.js     tests/portal.spec.js
tests/scan-intake.spec.js        tests/smoke.spec.js
\`\`\`

A local pass does not discharge this: deployment is where \`config.local.js\` presence differs.`,
};

const section = (item, n) => {
  const dep = (item.dependencies || []).filter(Boolean);
  const extra = EXTRA[item.id] ? `\n**Execution detail**\n\n${EXTRA[item.id]}\n` : '';
  return `## ${n}. ${item.id} — ${esc(item.title)}

**Status** ${item.status}  ·  **Executed by** ${esc(item.owner)}

### Purpose and expected outcome

${esc(item.description)}

**Expected outcome.** ${esc(item.resolutionCriteria)}

### Prerequisites and dependencies

${dep.length ? bullets(dep) : '- None beyond the environment in §1 and, for anything that transmits, CFG-1 and CFG-2.'}
${(item.constraints || []).length ? `\n**Constraints**\n\n${bullets(item.constraints)}` : ''}

### Execution steps

${steps(item.steps) || '1. (the register records no steps for this item)'}
${extra}
### Verification

${esc(item.validation) || 'Re-run the command named in the completion criteria below.'}

### If verification fails

${(item.risks || []).length ? bullets(item.risks) : '- Do not advance the item. Record the observed output and the command that produced it, and refer it to the party named above.'}
- Never mark the item closed on an expectation. \`APPLIED_UNVERIFIED\` is an open status: an
  action performed without its effect observed is not complete.

### Completion criteria

${esc(item.resolutionCriteria)}
`;
};

const nodeStages = pkg.scripts['test:node'].split('&&').length;

const md = `# Implementation walkthrough — every open item, in execution order

${ownershipBanner('docs/deployment/IMPLEMENTATION_WALKTHROUGH.md')}
>
> The command-line commissioning path is
> [\`CLEAR-THE-LAST-BLOCKER.md\`](./CLEAR-THE-LAST-BLOCKER.md) — on a phone,
> [\`CLEAR-THE-LAST-BLOCKER-TERMUX.md\`](./CLEAR-THE-LAST-BLOCKER-TERMUX.md).

Generated by \`npm run walkthrough\` from the readiness register, the tenant endpoint register,
the index targets, the notification matrix and the SharePoint list index. Do not edit by hand —
\`npm run test:walkthrough\` fails on drift.

**${open.length} open items.** ${register.items.length} in the register, ${register.items.length - open.length} closed.
Every value below is read from the estate. There are no placeholders: where a value is not yet
known to this repository, the step names the party who holds it rather than inventing one.

---

## 1. Environment

**Purpose.** A working tree that can run every gate.

**Prerequisites.** Node 22 or later, npm 10 or later, and git. Verified on Linux x86_64 with
Node v22.22.2 and npm 10.9.7.

**Steps**

\`\`\`bash
git clone https://github.com/dgoeaa/Commissioning.git
cd Commissioning
git checkout digital-servant-commissioning
npm install
\`\`\`

\`npm install\` is required only for \`npm run test:smoke\`, which needs Playwright. Every other
gate runs with no dependencies installed.

**You must work from a git clone, not an unpacked archive.** ${gitReaders} scripts and suites read
\`git ls-files\`. Without \`.git\`, \`npm run test:node\` aborts at its second stage, and
\`npm run commission\` reports a third blocker that is the absence of git rather than a secret, and
states that rotation could not be verified. \`npm run export\` produces a clone for this reason;
an external party was handed an unpacked archive on 2026-09-15 and hit all three.

**Verification**

\`\`\`bash
npm run test:node      # expect: exit 0, all ${nodeStages} stages green
npm run readiness      # expect: 10 passed, 0 failed
npm run commission     # expect: NOT CLEARED, 2 blockers (CFG-1, CFG-2)
\`\`\`

**If verification fails.** A \`test:node\` failure on a clean clone is a defect in the tree, not
in your environment; capture the failing stage name and its output before going further.

**Completion criteria.** \`test:node\` exit 0, \`readiness\` 10/10, and \`commission\` reporting
exactly the two configuration blockers.

---

## 2. Tooling for the automated path

**Purpose.** ${portalScripts.length} console scripts and ${ownership.consoleArtifacts.artifacts.length} recorded artifacts replace the manual passes that dominate this work.

**Constraint this obeys: no PowerShell, no Entra app registration, no tenant admin.** Every tool
below runs either as Node in this repository or from a devtools console using the session you are
already signed into. The browser provisioner states the reasoning the estate settled on: the
PowerShell runner "needs PnP.PowerShell installed and, since PnP 2.x, an Entra app registration to
sign in interactively. This file needs neither." The step itself is
**§2 of [\`PORTAL-TENANT-RUNBOOK.md\`](./PORTAL-TENANT-RUNBOOK.md)**.

**Prerequisites**

| Tool | Needs | Install |
|---|---|---|
| \`prove:tenant\` | Node 22 | already present |
| the console pastes | a signed-in browser | none |
| \`test:smoke\` (MANUAL-3) | Playwright Chromium | \`npx playwright install chromium\` |

**Permissions.** Flow work uses the portal's own user-scoped API, so you must OWN or CO-OWN each
flow; a flow owned solely by a colleague is invisible until they add you as co-owner. SharePoint
work needs **Manage Lists** on each site — Site Owner is enough. **Tenant admin is not needed
anywhere**, and no admin API is called.

**Every console artifact of this domain, in the order the runbook runs them**

Nothing in this table is typed: the artifacts come from \`docs/reference/document-ownership.json\`,
the section from the owning runbook's own headings, the verdict from
\`PRODUCTION_READINESS_REGISTER.json\`. The governance domain has had this view since
\`governance/GOVERNANCE-STATUS.md\`; the portal domain's equivalent was a join three files wide
that each reader had to make by hand.

| Artifact | Runbook section | What the register says | Replaces |
|---|---|---|---|
${artifactRows}

**Read that third column exactly.** It is the status of the items an artifact serves — never
proof the artifact was run. \`APPLIED_UNVERIFIED\` is the register's own term for *executed
against the tenant, with a run record naming the evidence*, and deliberately not the same as
resolved. \`no item names it\` is what a verifier looks like: it closes no item, it tells you
whether one closed.

**Artifacts recorded rather than owned**

| Artifact | Instructed by | What the register says |
|---|---|---|
${recordedRows}

\`npm run prove:tenant\` is Node in this repository rather than a console artifact. It replaces
six separate manual round-trips, for ITEM-11, ITEM-12, ITEM-6, ITEM-44 and ITEM-56.

Regenerate the generated sets when the register changes:

\`\`\`bash
npm run harvest:console      # rebuilds the console harvester from the endpoint register
npm run harvest:bookmarklet  # rebuilds the phone harvester from the same register
npm run console:apply        # rebuilds one console snippet per flow package
\`\`\`

**Every console script reports before it changes anything.** Each opens with \`DRY_RUN = true\`;
you read the report, set it to false, and paste again. All are safe to run twice.

**Verification**

\`\`\`bash
npm run test:harvestconsole      # the harvester matches the endpoint register
npm run test:harvestbookmarklet  # the phone harvester matches it, and still behaves
npm run test:consoleapply        # the snippets match their packages
\`\`\`

**If verification fails.** A stale message means the register or a package changed — regenerate
with the command it names. In a console, "No Flow access token in this page" means the tab has
not acquired one: open a flow you own at \`https://make.powerautomate.com\` and paste again on
that tab.

**Completion criteria.** Both checks green, and each console script's dry run printing its target
list without error.

---

## 3. The endpoint register — the authority for every URL

\`docs/reference/endpoint-register.json\` is the post-rotation tenant export. Where it and any
other artifact disagree, it is correct. It names, for all ${endpoints.length} contract keys, the workflow each
calls and that workflow's complete trigger URL with only the signature removed.

| Key | Workflow id | Flow |
|---|---|---|
${endpointRows}

**The signature is the one thing it may never carry.** A \`sig=\` value is a bearer credential:
43 base64url characters, an HMAC-SHA256, and possession alone authorises invoking the flow.
Never write one into any file except \`config.local.js\` and \`~/dgo-values.txt\`, both of which
are git-ignored. Never into a commit, a comment, an issue, a chat, or a log.

---

${ordered.map((i, n) => section(i, n + 4)).join('\n---\n\n')}
---

## ${ordered.length + 4}. Final completion criteria

The estate reaches production operations when all of the following hold, each with named evidence.

\`\`\`bash
npm run test:node          # ${nodeStages} stages, exit 0
npm run readiness          # 10 passed, 0 failed
npm run commission         # no blockers
npm run tenant:validate -- --strict   # ready: true
npm run disposition        # every remaining item has an accountable party
\`\`\`

- [ ] \`npm run commission\` reports no blockers, closing CFG-1 and CFG-2.
- [ ] \`npm run tenant:validate -- --strict\` returns \`ready: true\` with no errors and no blocked
      items. It currently returns \`ready: false\` with 61 blocked, which is the true state of the
      tenant backlog rather than a defect.
- [ ] Every item above is \`RESOLVED\` in the register, or carries a risk-acceptance record.
- [ ] The production authorisation record is complete (P-17 of
      \`docs/deployment/notification-instrument/tenant-execution/PENDING_WORK_REGISTER.md\`).
- [ ] \`npm run test:smoke\` passes against the deployed hostname.

**What no command can settle.** G-04 requires enforcement implemented in Power Automate and a
posture decision by the agency. Until both hold, caller identity is a client-asserted
\`userEmail\` from \`localStorage\`, RBAC is advisory, and a flow called directly answers whoever
calls it. No repository check can verify a Power Automate flow, so the gate reports this as a
standing manual obligation in every posture.
`;

if (CHECK) {
  let cur = null;
  try { cur = readFileSync(join(ROOT, OUT), 'utf8'); } catch { /* absent */ }
  if (cur !== md) {
    console.error(`❌ ${OUT} is stale — run: npm run walkthrough`);
    process.exit(1);
  }
  console.log(`✅ ${OUT} is current — ${open.length} open items, all covered, ${endpoints.length} endpoint keys, ${indexTargets.length} index targets`);
} else {
  writeFileSync(join(ROOT, OUT), md);
  console.log(`Wrote ${OUT}`);
  console.log(`  open items covered : ${open.length}`);
  console.log(`  endpoint keys      : ${endpoints.length}`);
  console.log(`  index targets      : ${indexTargets.length}`);
}
