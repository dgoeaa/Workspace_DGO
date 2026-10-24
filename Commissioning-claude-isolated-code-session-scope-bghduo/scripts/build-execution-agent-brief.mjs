#!/usr/bin/env node
/**
 * Emit the engagement brief for an independent external agent executing the outstanding work.
 *
 * SCOPE BOUNDARY — READ BEFORE EDITING
 *
 * Three earlier agent documents — AGENT_HANDOVER.md, AGENT_COMMISSIONING_DIRECTIVE.md and
 * COMMISSIONING_AGENT_BRIEF.md — are retired and must stay retired: they briefed an engagement to
 * perform an audit and remediation that was subsequently carried out, and
 * tests/commissioning-authority.test.mjs fails if any of them reads as live again.
 *
 * This is a different document for a different engagement. It briefs execution of what remains
 * AFTER that work: tenant-side actions the repository cannot perform. It supersedes none of the
 * retired three and reinstates nothing from them.
 *
 * WHY GENERATED
 *
 * The brief must be executable without consultation, which means every identifier in it has to be
 * correct. Each is read from the artefact that owns it and `--check` fails the build on drift.
 * The only hand-written content is procedure and decision rules, which no artefact owns.
 *
 *   npm run governance:agentbrief
 *   npm run governance:agentbrief -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { provisioningScope } from './lib/registry-provisioning-scope.mjs';
import { ownershipBanner } from './lib/document-ownership.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/deployment/governance/EXECUTION-AGENT-BRIEF.md');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };
const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const listRegistry = J('docs/reference/governance-list-registry.json');
const position = J('docs/reference/governance-estate-position.json');
const disposition = J('docs/deployment/closure-disposition.json');
const register = J('docs/reference/endpoint-register.json');
const ids = J('docs/reference/endpoint-workflow-ids.json');
const registrySpec = J('docs/reference/http-flow-registry-spec.json');
const spec = J('docs/reference/sharepoint-provisioning-spec.json');

const SITE = listRegistry.decision.authoritativeSite;
const ORIGIN = SITE.split('/sites/')[0];
const dupSites = [...new Set(listRegistry.retire.map((r) => r.site))];
if (dupSites.length !== 1) fail(`the duplicates span ${dupSites.length} sites`);
const DUP_SITE = `${ORIGIN}/sites/${dupSites[0]}`;

const keys = register.current_configuration.map((e) => e.key);
const internalKeys = keys.filter((k) => k.startsWith('DGO_ENDPOINT_'));
const portalKeys = keys.filter((k) => k.startsWith('PF_ENDPOINT_'));

const ENV_ID = (() => {
  const rb = fs.readFileSync(path.join(ROOT, 'docs/deployment/governance/GOVERNANCE-TENANT-RUNBOOK.md'), 'utf8');
  const m = /Default-[0-9a-f-]{36}/.exec(rb);
  if (!m) fail('no environment id in the execution runbook');
  return m[0];
})();

const BRANCH = (() => {
  const head = fs.readFileSync(path.join(ROOT, '.git/HEAD'), 'utf8').trim();
  const m = /ref: refs\/heads\/(.+)$/.exec(head);
  return m ? m[1] : head;
})();

/* Step 4 targets, read from the deployed definitions. */
const deployedDir = path.join(ROOT, 'docs/reference/flow-contracts/deployed');
const correctedDir = path.join(ROOT, 'docs/deployment/governance/flows');
const flows = fs.readdirSync(correctedDir).filter((f) => f.endsWith('.corrected.json')).sort().map((file) => {
  const num = /^(\d+)/.exec(file)[1];
  const dep = fs.readdirSync(deployedDir).find((f) => new RegExp(`^${num} - GOV`).test(f));
  if (!dep) fail(`no deployed definition for ${file}`);
  const d = JSON.parse(fs.readFileSync(path.join(deployedDir, dep), 'utf8'));
  return { file, num, guid: d.workflow_identity.internal_name, name: d.workflow_identity.tags.flowDisplayName };
});

/* Step 5's scope, derived from the corrected flow definitions rather than restated here — this
   was the fourth hand-kept copy of one decision. See scripts/lib/registry-provisioning-scope.mjs. */
let STEP5;
try {
  ({ provisionNow: STEP5 } = provisioningScope({
    spec: registrySpec,
    corrections: flows.map((f) => JSON.parse(fs.readFileSync(path.join(correctedDir, f.file), 'utf8'))),
  }));
} catch (err) {
  fail(err.message);
}
const step5 = STEP5.map((t) => {
  const l = registrySpec.lists.find((x) => x.listTitle === t);
  if (!l) fail(`${t} not in the registry specification`);
  return { title: t, fields: l.customFieldCount, key: l.uniqueKey };
});
const step5Deferred = registrySpec.lists.map((l) => l.listTitle).filter((t) => !STEP5.includes(t));

/* The counts the agent is told to expect. These were typed — "3 lists and 54 columns" — beside a
   list that is now derived, so they would have contradicted the table above them. */
const step5Fields = (registrySpec.fields || []).filter((f) => STEP5.includes(f.listTitle));
const step5Totals = {
  lists: STEP5.length,
  fields: step5Fields.length,
  indexed: step5Fields.filter((f) => f.indexed === true || f.indexed === 'Yes').length,
};

const tenantItems = disposition.items.filter((i) => i.authority === 'TENANT_EXECUTION');
const agencyItems = disposition.items.filter((i) => i.authority === 'AGENCY_DECISION');
if (tenantItems.length + agencyItems.length !== disposition.items.length) {
  fail('an open item carries an authority this brief does not classify');
}

/* GOV-10's flow, read rather than named by hand. */
const repairFlow = (() => {
  const f = fs.readdirSync(deployedDir).find((x) => /^Repair the DGO/.test(x));
  if (!f) fail('the Repair flow definition is not in the deployed corpus');
  const d = JSON.parse(fs.readFileSync(path.join(deployedDir, f), 'utf8'));
  return { guid: d.workflow_identity.internal_name, name: d.workflow_identity.tags?.flowDisplayName || f.split('__')[0] };
})();

const open = position.openFindings;
const findingRow = (f) => `| **${f.id}** | ${f.title} | ${f.blocksCommissioning ? 'yes' : 'no'} |`;

const doc = `# Execution engagement brief — DGO Digital Operations

> **GENERATED FILE — do not edit by hand.** Built by \`scripts/build-execution-agent-brief.mjs\`.
> Every identifier is read from the artefact that owns it; \`npm run governance:agentbrief -- --check\`
> fails if this document drifts from them.

${ownershipBanner('docs/deployment/governance/EXECUTION-AGENT-BRIEF.md')}
>
> The command-line commissioning path is
> [\`CLEAR-THE-LAST-BLOCKER.md\`](../CLEAR-THE-LAST-BLOCKER.md). This brief sequences and scopes
> execution; it replaces neither.

**Audience.** An independent agent engaged to execute the outstanding tenant-side work.
**Prior knowledge assumed.** None beyond SharePoint Online, Power Automate and a terminal.
**Consultation required.** None. Every decision branch in this document is pre-decided. Where a
decision is not the agent's to make, §9 says so and gives the exact escalation.

---

## 0. Inputs the engaging party must supply

**This brief is complete on decisions and incomplete on inputs.** Seven things cannot be derived
from any artefact. Fill every row before handing this to an agent; an unfilled row is a
consultation the brief promised would not be needed.

| # | Input | Why it cannot be derived | Value |
|---|---|---|---|
| 0.1 | Repository clone URL | Not recorded in the repository | \`________\` |
| 0.2 | Account for the agent to use, and how it signs in | The brief cannot provision access | \`________\` |
| 0.3 | **An authenticated browser session on \`${ORIGIN.replace('https://', '')}\`** | See §0.A — this determines whether the engagement is executable at all | \`________\` |
| 0.4 | Escalation recipient — name and channel | §9 stops work; someone must receive it | \`________\` |
| 0.5 | Evidence storage location for exports and \`BEFORE-\` packages | Backups held somewhere unagreed are not backups | \`________\` |
| 0.6 | Written authorisation to delete SharePoint lists, and to modify and disable Power Automate flows | WP-3 and WP-4 are destructive and irreversible | \`________\` |
| 0.7 | Change window, or written confirmation that none is required | ${listRegistry.retire.length} list deletions and ${flows.length} flow updates are production changes | \`________\` |

### 0.A The capability that decides everything: browser console access

**Six of the eight work packages require pasting JavaScript into the developer console of a
browser already signed in to SharePoint.** That is how this estate's tooling is built, because
PowerShell was unavailable to the operator it was written for.

| Work package | Terminal alone | Browser console required |
|---|---|---|
| WP-0 baseline | partly — \`npm\`/\`git\` | **yes**, for column verification |
| WP-1 configure runtimes | partly — \`npm\` | **yes**, to read trigger URLs from Power Automate |
| WP-2 identify producer | no | **yes** — Power Automate run history is a web UI |
| WP-3 correct flows | no | **yes** — export/import is a web UI |
| WP-4 delete duplicates | no | **yes** |
| WP-5 registry lists | no | **yes** |
| WP-6 adopt the join | no | **yes** |
| WP-7 remaining items | partly | **mostly** |

**An agent with a terminal but no authenticated browser can execute the \`npm\` and \`git\` portions
of WP-0 and WP-1 and nothing else.** It cannot complete a single work package end to end.

Before engaging, confirm one of:

1. **The agent drives a real browser** with an interactive Microsoft sign-in — then this brief is
   executable as written; or
2. **A human operator pairs with the agent**, pasting scripts and returning console output — then
   this brief is executable as written, and the human is performing §0.3; or
3. **Neither.** Then the tooling must first be re-targeted to run without a browser session. That
   requires an access token, which requires an Azure AD app registration with \`Sites.Manage.All\`
   — **a tenant-administrator action, not an agent action.** It is not in this brief's scope and
   nothing here should be attempted until it exists.

**Do not begin under option 3.** A partially executed destructive engagement is worse than an
unstarted one.

### 0.B Working under option 2 — the pairing protocol

**This engagement is running under option 2: a human operator performs §0.3.** The agent's only
view of the tenant is what that operator relays, so the relay is part of the control surface, not
a convenience.

**Per script, the loop is fixed:**

| | Agent | Operator |
|---|---|---|
| 1 | States the **exact file path**, the **mode** to set, and the **site** to be signed in to | Confirms the site in the address bar before pasting |
| 2 | — | Pastes the file, presses Enter, waits for the run to finish |
| 3 | — | Copies **the single line between the RELAY markers** and returns it |
| 4 | Parses that line and confirms \`script\`, \`mode\` and \`site\` match what it asked for | — |

**Copy the RELAY line, not the table.** Every script that writes ends with:

\`\`\`
───────── RELAY: COPY THE SINGLE LINE BELOW ─────────
{"script":"…","mode":"…","site":"…","utc":"…","rows":N,"tally":{…},"ledger":[…]}
───────── END RELAY ─────────
\`\`\`

That line is one line of JSON. It survives copy and paste, it parses, and it carries its own
provenance.

**Three relay failures are known, and the protocol exists because of them:**

1. \`console.table\` renders as a grid on screen and copies as one unbroken string with its header
   repeated and no delimiters. Counting rows out of it means guessing where each ends.
2. A whole-console paste normally includes the pasted **script** as well as its output, and the
   script's source contains every verdict string the ledger can produce. Searching such a paste
   for a verdict finds the source, not the result.
3. Nothing else in the output identifies which script, mode or site produced it, so two runs
   pasted in sequence are indistinguishable.

**Agent obligations under option 2:**

- **Never infer a count from a pasted table.** If the RELAY line is absent, ask for it. Do not
  proceed on a reading taken from the table.
- **Reject a relay whose \`script\`, \`mode\` or \`site\` is not what was requested.** Ask for the run
  to be repeated. A mismatch means a different script, a different mode, or the wrong site.
- **Treat a missing RELAY line after a destructive mode as unknown state**, not as success. Ask
  the operator to re-run the same script in its read-only or survey mode and relay that.

**Operator obligations under option 2:**

- Confirm the address bar before every paste. Several scripts act on one site and refuse another.
- Change **only** the named setting — \`DRY_RUN\`, or \`MODE\` and \`I_HAVE_THE_EXPORT\`. Change
  nothing else in any file.
- Return the RELAY line verbatim, including both markers.
- If the console shows an error, return the error text too. An error is information, not a
  failure to hide.

---

## 1. Scope

### 1.1 In scope

${tenantItems.length} open items of authority \`TENANT_EXECUTION\`, and the outstanding steps of
\`docs/deployment/governance/GOVERNANCE-TENANT-RUNBOOK.md\`. These require access to the tenant; the
repository cannot perform them.

### 1.2 Explicitly out of scope

${agencyItems.length} open items of authority \`AGENCY_DECISION\`. **Do not execute, work around, or
form a recommendation on these.** Each requires a documented risk acceptance by the agency.

| Item | Title | Accountable |
|---|---|---|
${agencyItems.map((i) => `| ${i.id} | ${i.title} | ${i.accountable} |`).join('\n')}

Record their state and hand them back per §9. Attempting one is a breach of this brief.

### 1.3 Documents that are retired and must not be used

The three documents that briefed an earlier engagement are deleted, not shelved. If one
reappears in a checkout, it is not a source: the engagement it scopes was completed against this
baseline, and every count in it is a reading of an earlier commit.

### 1.4 Authoritative documents for this engagement

| Purpose | Document |
|---|---|
| Endpoint commissioning | \`docs/deployment/CLEAR-THE-LAST-BLOCKER.md\` |
| Governance tenant work | \`docs/deployment/governance/GOVERNANCE-TENANT-RUNBOOK.md\` |
| Sequence and current state | \`docs/deployment/governance/GOVERNANCE-STATUS.md\` |
| Findings, with repository/tenant status split | \`docs/reference/governance-estate-position.json\` |
| Open items and their authority | \`docs/deployment/closure-disposition.json\` |

Where any two disagree on a command, \`CLEAR-THE-LAST-BLOCKER.md\` governs for Phase A and
\`GOVERNANCE-TENANT-RUNBOOK.md\` governs for Phase B.

---

## 2. Access required

| # | Access | Verify by | Needed for |
|---|---|---|---|
| 1 | Node ≥ 22, npm, git | \`node -v && npm -v && git --version\` | all |
| 2 | Read access to the repository, branch \`${BRANCH}\` | \`git rev-parse --abbrev-ref HEAD\` | all |
| 3 | Site Owner (Manage Lists) on \`${SITE.split('/sites/')[1]}\` | open the site; Site contents loads | WP-3, WP-5 |
| 4 | Site Owner (Manage Lists) on \`${dupSites[0]}\` | open the site; Site contents loads | WP-4 |
| 5 | Power Automate maker in \`${ENV_ID}\` | the environment selector shows it; a flow opens for editing | WP-1, WP-2, WP-6 |
| 6 | Permission to read Power Automate **run history** in that environment | open any flow → **Run history** | WP-2 |

**If any is absent, stop and report it under §9.** Do not proceed with a partial subset: several
work packages verify each other, and a partial run produces a report that cannot be trusted.

---

## 3. Non-negotiable safety invariants

These hold for the entire engagement.

1. **A \`sig=\` value is the authentication.** Possession alone authorises invoking the flow. Never
   paste a signed trigger URL into a ticket, email, chat message, screenshot, or any file except
   \`config.local.js\` and the values file described in WP-1.
2. **Deleting a file revokes nothing.** Only regenerating the trigger in Power Automate does.
3. **Never delete a SharePoint list or column that has not first been proven empty or backed up**,
   by the procedure in the work package concerned.
4. **Never address a governance list by title where a GUID is given.** The duplicates share titles
   with the lists being kept. Every GUID needed is in §10.
5. **Every provided script is dry-run or survey by default.** Read its output before changing the
   mode. If a dry run's report does not match what this brief says to expect, stop and report.
6. **Do not run the flow named in WP-3.5** until that work package is complete.
7. **Record every console output.** §8 defines the report.

---

## 4. Verified current state

Each line is an observation from an executed run, with its date. Anything not listed here is
outstanding.

| Verified | On | Evidence |
|---|---|---|
| Governance columns and seeds provisioned on the ${listRegistry.lists.length} authoritative lists | 2026-09-09 | Three consecutive runs: dry 0 created/97 present/0 failed; apply 1 created/97 present/0 failed; verify 0 created/98 present/10 seeds present/0 failed |
| Three auto-disambiguated leftover columns removed | 2026-09-09 | Dry run listed exactly 3; live run 3 deleted, 0 kept, 0 failed |
| ${listRegistry.retire.length} duplicate lists surveyed | 2026-09-09 | 13 empty, 4 populated (RoleCatalogue 6, AuditLog 5, UserDirectory 1, PilotCohorts 1) |
| ${listRegistry.retire.length} duplicate lists exported | 2026-09-09 | 17 exported, 13 items total, 0 failed |
| ${listRegistry.retire.length} duplicate lists renamed \`ZZ_RETIRED_*\` | 2026-09-09 | 17 renamed, 0 skipped, 0 failed |

**Independently re-verify before starting** (§WP-0). Do not take the table above on trust.

### 4.1 Open findings

| ID | Title | Blocks commissioning? |
|---|---|---|
${open.map(findingRow).join('\n')}

---

## 5. Work packages, in dependency order

\`\`\`
WP-0  baseline
 ├── WP-1  configure both runtimes          (independent — may run in parallel)
 └── WP-2  investigate: the GOV-09 producer (2.1–2.4), the GOV-11 provisioning (2.5)
      └── WP-3  correct the flows
           └── WP-4  delete the duplicates
                └── WP-5  provision registry lists
                     └── WP-6  adopt the join
\`\`\`

WP-1 depends on nothing and unblocks the pilot on its own. WP-4 must not begin before WP-3
completes. Every other order is fixed as drawn.

---

## WP-0 — Establish the baseline

**Purpose.** Confirm the repository and the tenant are in the state §4 describes, before changing
anything.

\`\`\`bash
git clone <repository URL> dgo
cd dgo
git checkout ${BRANCH}
git rev-parse HEAD          # record this commit in the report
npm install
npm run test:node           # must exit 0
npm run commission          # record the full output
\`\`\`

**Expected from \`commission\`:** ${(() => {
  const blockers = 2;
  return `${blockers} blockers (both configuration), ${open.length} governance warnings, 3 passes.`;
})()}

Then run the read-only column verification: **§2.6 of
[\`GOVERNANCE-TENANT-RUNBOOK.md\`](GOVERNANCE-TENANT-RUNBOOK.md)**, which is the only document that
carries the step.

It checks **every column the specification declares** — ${(spec.fields || []).length} across the
${listRegistry.lists.length} lists — against the tenant, and it is generated from that
specification, so it cannot assert a name the specification has withdrawn.

**Expected final line:** \`WP-0 PASSES: every specified column exists under its specified name.\`

A verdict of \`OLD NAME PRESENT\` is **not** a failure. It reports a superseded internal name still
on a list, which on some lists holds live data. Record it and continue. Only \`MISSING\`,
\`RESERVED NAME\` or \`UNREADABLE\` stop the engagement.

| Result | Action |
|---|---|
| \`npm run test:node\` exits non-zero | **Stop.** Report under §9. The repository is not in a known state. |
| \`commission\` reports other than the above | Record verbatim and continue; a changed count is information, not a blocker |
| Any \`MISSING\`, \`RESERVED NAME\` or \`UNREADABLE\` | **Stop.** Report under §9. §4 is wrong and every later package depends on it |
| \`OLD NAME PRESENT\` | Record it and continue — a superseded name still on a list is information, not a fault |

---

## WP-1 — Configure both runtimes

**Closes:** \`CFG-1\`, \`CFG-2\`. **Blocks:** the pilot. **Depends on:** WP-0 only.

### 1.1 Generate the template

\`\`\`bash
npm run values:template ~/dgo-values.txt
\`\`\`

Writes ${keys.length} lines. Each is **already complete** — host, routing segment, workflow id —
ending \`&sv=1.0&sig=\`.

### 1.2 Fill it

${ids.totals.distinctWorkflows} flows serve the ${keys.length} keys: **${ids.totals.distinctWorkflows} visits, not ${keys.length}**.

Per flow: Power Automate → open the flow → expand **When an HTTP request is received** → from the
**HTTP POST URL** copy **only the characters after \`sig=\`** — 43 characters, the last parameter,
to end of line — and paste after the \`=\` already present.

**Do not replace the line.** A whole URL pasted after \`&sig=\` yields two \`sig=\` parameters; the
line looks filled and does not authenticate.

> A second template exists at \`docs/deployment/rotation/values.template.txt\` with bare key names
> and empty values. It is usable — \`setup\` accepts both key forms — but requires ${keys.length}
> complete URLs instead of ${keys.length} signatures. **Use \`values:template\`.** If a copy of the
> rotation worksheet is in circulation, check its header: the current file states \`0 keys need a
> NEW url\`. Any other count means the copy predates the rotation and must not be used.

### 1.3 Verify, then write

\`\`\`bash
npm run check:values -- ~/dgo-values.txt
\`\`\`

Prints no URL, host or signature — only shapes. **Expected:**
\`✅ ${keys.length} value(s), all with a complete 43-character signature.\`

**43 is exact.** A signature is base64url of an HMAC-SHA256: 32 bytes, 43 characters unpadded.

| Message | Cause | Action |
|---|---|---|
| \`signature is blank\` | not filled | fill that key |
| \`sig is N characters\`, N < 43 | truncated on copy | recopy that key |
| \`sig is N characters\`, N > 43 | extra text pasted | recopy that key |
| \`no sig= parameter\` | line overwritten | regenerate template, redo that key |
| \`NOT A URL\` | smart quote, space around \`=\`, or wrapped line | retype that line |

Only when it reports ${keys.length} of ${keys.length}:

\`\`\`bash
npm run setup -- --values ~/dgo-values.txt --force
npm run check:config
npm run check:config:portal
npm run commission
\`\`\`

\`--force\` is required; \`setup\` will not overwrite an existing config without it.

**Pass:** \`commission\` no longer reports the two configuration blockers.
**Then:** delete \`~/dgo-values.txt\`. It holds ${keys.length} live credentials.

---

## WP-2 — Investigate: the GOV-09 producer, and the GOV-11 provisioning

**Blocks:** WP-4 (2.1–2.4 only; 2.5 blocks nothing).
**This is an investigation, not a change. Make no modification in this package** — the one
exception is 2.3's instruction to disable an identified producer, which is named there explicitly.

Two questions are answered here because both are answered by reading the same two sites with the
same browser session, and neither can be answered from the repository. They are otherwise
unrelated: **2.1–2.4** ask who wrote to the duplicate site on 2026-08-31; **2.5** asks what a pair
of out-of-band scripts put on the tenant on 2026-09-10.

### 2.1 The fact to explain

Four duplicate lists on \`${dupSites[0]}\` were written at **2026-08-31T01:58:48–49Z**, within one
second of each other. The list capture the estate reasons from is dated **2026-08-18**. The row
counts match the specification's seed set exactly: 6 role seeds, 1 bootstrap user, 1 pilot cohort.

**Already established, do not repeat:** every exported flow definition naming a governance list
was searched. None creates a list; none posts an item to one. The producer is not in the exported
corpus. This is consistent with GOV-06 — only 13 of 73 exported definitions match a register
workflow by name — so the corpus is known to be partial. The producer is **unidentified, not
absent**.

### 2.2 Procedure

1. Power Automate → environment \`${ENV_ID}\` → **Solutions** and **My flows** → for every flow,
   **Run history** → filter to **2026-08-31**.
2. Identify every run whose start time falls between **01:58:00Z** and **01:59:30Z**.
3. For each, open the run and record: flow display name, flow GUID, trigger type, the user or
   service principal shown as the initiator, and whether its actions target
   \`${dupSites[0]}\`.
4. If Power Automate run history does not retain that date, use SharePoint: Site settings → Site
   collection audit log reports → **Content modifications**, scoped to
   \`${dupSites[0]}\`, for 2026-08-31.

### 2.3 Decision rules — all outcomes pre-decided

| Finding | Action |
|---|---|
| Exactly one flow ran in that window and writes to the duplicate site | Record it as the producer. Disable it (**Turn off**, do not delete). Proceed to WP-3 |
| More than one candidate | Record all. Disable all that write to the duplicate site. Proceed to WP-3 |
| A candidate is a **scheduled** flow | Record it and disable it. Note in the report that it will have run again since |
| A candidate is **button-triggered** | Record it, and record the initiator. Do not disable — a button flow runs only when invoked. Note the initiator in the report |
| Run history does not retain 2026-08-31, and the audit log is unavailable or empty | Record that the producer **cannot be identified from available evidence**. Proceed to WP-3. WP-4 remains blocked; see 2.4 |
| The producer is outside Power Automate (a script, a person, a third-party tool) | Record what the evidence shows. Disable or revoke as the evidence indicates. Proceed to WP-3 |

**Do not delete any flow in this package.** Disabling is reversible; deletion is not, and a
disabled flow remains available for inspection.

### 2.4 If the producer cannot be identified

WP-4's deletion stays blocked. This is a deliberate outcome, not a failure. The renamed state is
stable and safe: every deployed reference to these lists is by title, so \`ZZ_RETIRED_\` makes those
calls fail visibly rather than silently hitting a duplicate.

**Substitute control:** re-run the survey (WP-4.1) at **7 and 14 days** after WP-3 completes. If
no \`ZZ_RETIRED_*\` list has gained an item in 14 days, and WP-3 is complete, the deletion may
proceed under WP-4.4. Record both survey dates and outcomes.

### 2.5 Measure the out-of-band flow-truth provisioning — GOV-11

**Blocks nothing. Changes nothing. Do not skip it** — it is the only measurement of tenant state
this estate did not author.

**The fact to explain.** Two browser scripts were reported executed on **2026-09-10**, creating
two lists and a document library — \`NITDA Flow Truth Registry\`, \`NITDA Flow Truth History\`,
\`NITDA Flow Truth Artefacts\` — with 90 columns between them. They are held verbatim at
\`docs/reference/out-of-band/\`. None of the three is in any specification this estate holds, and
none is in the 2026-08-18 capture. Three properties of those scripts make the outcome
unpredictable from reading them:

- Neither pins a site. Both take whichever site the console happened to be open on, and neither
  records which. **Both candidate sites must therefore be asked.**
- Both call \`createfieldasxml\` with \`Options: 0\`. Without bit 8, \`AddFieldInternalNameHint\`,
  SharePoint may derive each internal name from the display name — so \`RegistryKey\` may be on the
  tenant as \`Registry_x0020_Key\`: correct in every view, invisible to every flow.
- The idempotence guard compares live \`InternalName\` against the SchemaXml \`Name\`, which is only
  sound when bit 8 is set. If it is not, every re-run re-created every column and SharePoint
  disambiguated by appending a digit.

**Procedure.** Run **§7 of [\`GOVERNANCE-TENANT-RUNBOOK.md\`](GOVERNANCE-TENANT-RUNBOOK.md)**,
which is the only document that carries the step. It reads only, and it asks both candidate sites.
Copy the single relay line and report it verbatim. The verdicts and what to do about each are:

| Verdict | Meaning | Action |
|---|---|---|
| \`absent\` on every resource, both sites | The provisioning did not reach either candidate site | Record it. Nothing further |
| \`PRESENT\` on a resource | It exists — record the site, GUID, template and item count | Record. **Do not delete it** |
| \`asked-name\` | The column carries the internal name the script asked for | Record |
| \`DERIVED NAME\` | The column is there under a different internal name | Record the name found. This is the \`Options: 0\` outcome |
| \`DUPLICATED\` | More than one column answers to the same base name | Record. The script ran more than once |
| \`REQUIRED CLEARED\` | Created \`Required\`, not \`Required\` now | Record |
| \`UNIQUENESS NOT ENFORCED\` | The key column does not enforce uniqueness | Record |

**Do NOT re-run either out-of-band script.** A re-run is the duplication case, not a repair.

**Do NOT delete, rename or repair anything this reports.** Whether these three resources are
adopted into \`http-flow-registry-spec.json\` or retired in favour of the seven specified registry
lists is an **agency decision**, and §7's out-of-scope rule applies to it in full. Report and
stop.

---

## WP-3 — Correct the governance flows

**Closes:** GOV-04, GOV-05, GOV-10. **Blocks:** WP-4. **Depends on:** WP-2.

### 3.1 Targets

| # | Flow | Flow GUID | Corrected definition |
|---|---|---|---|
${flows.map((f) => `| ${f.num} | ${f.name} | \`${f.guid}\` | \`docs/deployment/governance/flows/${f.file}\` |`).join('\n')}

Environment: \`${ENV_ID}\`

### 3.2 What the corrections change

- **GOV-04** — every path reaches a \`Response\` before any \`Terminate\`. \`Terminate\` ends the whole
  run, so anything downstream of it is unreachable; all four flows could end without answering.
- **GOV-05** — the retirement cascade is gated by \`If_Safe_To_Retire\`. Both active counts are
  taken before any write; retirement is blocked with **409** when either is non-zero and proceeds
  only when both are zero or \`force\` is true. \`Retire_Registry\` sits under the gate.

### 3.3 Procedure, per flow

**This procedure has not been executed against this tenant.** It follows Power Automate's
documented export/import behaviour. Treat flow **${flows[0].num}** as a rehearsal: complete it end to
end, verify it, and only then proceed to the others. If it does not behave as described, stop and
report under §9.

1. Power Automate → the flow → **⋯** → **Export** → **Package (.zip)**. **Retain this file. It is
   the only rollback.** Name it \`BEFORE-<flow GUID>.zip\`.
2. Unzip. The definition is at \`Microsoft.Flow/flows/<flow GUID>/definition.json\`.
3. In that file, replace the value of the \`definition\` key with the \`definition\` object from the
   corrected file. Change nothing else.
4. Re-zip **the contents** of the unzipped folder, not the folder itself.
5. Power Automate → **Import** → upload → choose **Update** the existing flow. **Not** Create as
   new.
6. Open the flow and confirm it saves without validation error.

**Rollback:** Import the \`BEFORE-\` package, choosing Update.

### 3.4 Validate flow ${flows.find((f) => f.num === '05')?.num || '05'} — all five paths

Send each request to the flow's trigger URL. Record status and body for each.

| Path | Request | Required result |
|---|---|---|
| Malformed | body omitting \`flowId\` | **400**, no list writes |
| Not found | \`flowId\` with no registry row | **404**, no list writes |
| Blocked | a flow with active consumers or dependencies | **409**, **nothing retired** |
| Guarded | a flow with neither | **200**, retired |
| Forced | active consumers **and** \`force: true\` | **200**, retired, forced retirement recorded with both counts |

**After the Blocked case, confirm the consumers and dependencies are still active.** The original
defect retired them, which erased the evidence that any were active. If they are not still active,
the correction did not apply — roll back and report.

**Pass condition for WP-3.4: all five rows match.** Any deviation — stop, roll back that flow,
report.

### 3.5 GOV-10 — the repair flow

**Flow:** ${repairFlow.name} · \`${repairFlow.guid}\` · button-triggered.

Verified from its definition: every action carries
\`dataset = ${DUP_SITE}\` — the site being retired — and addresses
every list by \`getbytitle(...)\`. It creates and indexes columns, and **deletes any column its
\`Filter_Strays\` step does not recognise**. Its SchemaXml payload carries \`FlowUrl\` and \`ScopeId\`
and does not carry \`EndpointRedacted\` or \`EndpointFingerprint\`.

**Consequence:** run against the authoritative site, it deletes \`EndpointRedacted\` and
\`EndpointFingerprint\` as strays and recreates \`FlowUrl\` and \`ScopeId\`, undoing GOV-03 and GOV-08,
and reports success.

**Required action, in this order:**

1. **Turn the flow off now**, before any other WP-3 work.
2. Correct it: repoint \`dataset\` to \`${SITE}\`; replace every
   \`getbytitle('<title>')\` with \`lists(guid'<GUID>')\` using §10; regenerate its \`varLists\` payload
   from \`docs/reference/sharepoint-provisioning-spec.json\` so the column set it enforces matches
   the corrected specification.
3. Do **not** turn it back on until WP-5 completes.

**If correcting it is not possible within this engagement:** leave it off, and record that under
§9. Off is a safe state. On and uncorrected is not.

---

## WP-4 — Delete the duplicate lists

**Closes:** GOV-02. **Depends on:** WP-2 and WP-3 both complete.

**Precondition, mandatory:** WP-3 is complete, and either WP-2 identified and disabled the
producer, or WP-2.4's 14-day substitute control has been satisfied and recorded.

**Site: \`${DUP_SITE}\`** — the duplicate site. The script refuses to run
on the authoritative site.

**Script:** \`scripts/retire-duplicate-governance-lists.browser.js\`. MODE-driven. \`delete\` cannot
act on a list \`rename\` has not renamed.

### 4.1 Re-survey

Paste with \`MODE = 'survey'\`.

**Expected:** ${listRegistry.retire.length} rows, every \`liveTitle\` beginning \`ZZ_RETIRED_\`.

| Result | Action |
|---|---|
| All ${listRegistry.retire.length} renamed, item counts unchanged from §4 | Continue |
| Any item count **higher** than §4 | **Stop.** Something is still writing. Return to WP-2 |
| Any list missing | Record; it was deleted by another party. Continue |

### 4.2 Confirm nothing unique would be lost

Run **§3.2b of [\`GOVERNANCE-TENANT-RUNBOOK.md\`](GOVERNANCE-TENANT-RUNBOOK.md)**, which is the
only document that carries the step. It reads only, on both sites.

| Verdict | Action |
|---|---|
| No row exists only in a duplicate | Continue to 4.3 |
| \`ROWS EXIST ONLY HERE\` | **Stop.** Those rows are the only copy. Report under §9 with the row keys |

### 4.3 Re-export

Paste with \`MODE = 'export'\`. **Expected:** ${listRegistry.retire.length} exported, 0 failed.
Retain all ${listRegistry.retire.length} JSON files. The earlier export is superseded by this one.

### 4.4 Delete

Set \`MODE = 'delete'\` **and** \`I_HAVE_THE_EXPORT = true\`. Paste.

**Expected:** ${listRegistry.retire.length} deleted, 0 kept, 0 failed.

| Result | Action |
|---|---|
| \`REFUSED — NOT RENAMED\` | That list was restored. Re-run \`rename\`, then delete |
| \`DELETE FAILED\` | Record the message. Do not retry more than once |
| Any count other than ${listRegistry.retire.length} deleted | Record and report; do not force |

### 4.5 Confirm

Re-paste with \`MODE = 'survey'\`. **Expected:** every row \`ALREADY GONE\`.

---

## WP-5 — Provision the HTTP flow registry lists

**Depends on:** WP-4. **Site:** \`${SITE}\`

**Script:** \`scripts/provision-flow-registry-lists.browser.js\`, dry-run by default.

### 5.1 What it creates

| List | Columns | Unique key |
|---|---|---|
${step5.map((l) => `| \`${l.title}\` | ${l.fields} | \`${l.key}\` |`).join('\n')}

${step5Deferred.length
  ? `**Deferred and not created — ${step5Deferred.length}:** ${step5Deferred.map((t) => `\`${t}\``).join(', ')}.\n**Do not add them.** They are deferred by decision, not by oversight.`
  : '**Nothing is deferred.** The scope is every list the corrected flows read or write, plus the\nconfiguration list they read their parameters from. **Do not add to it** — a provisioner that\ncreates more than the flows need is how a deferral quietly becomes a deployment.'}

### 5.2 Procedure

1. Paste as-is. **Expected:** ${step5Totals.lists} lists and ${step5Totals.fields} columns all \`WOULD CREATE\`.
2. Set \`DRY_RUN = false\`. Paste. **Expected:** ${step5Totals.lists} lists created, ${step5Totals.fields} columns created,
   ${step5Totals.indexed} indexed, 0 failed.
3. Paste again unmodified. **Expected:** every row \`present\`, 0 created. **This third run is the
   pass condition.** An apply reporting work on a second pass did not do what it claimed.
4. **Record all ${step5Totals.lists} list GUIDs the script prints.** They are required by §8.

| Result | Action |
|---|---|
| A list already exists | Expected if re-running. The script uses it and creates nothing |
| \`RESERVED NAME\` on any column | **Stop.** Report the column name under §9 |
| Third run creates anything | **Stop.** Report under §9 |

---

## WP-6 — Adopt the FlowId / WorkflowId join

**Closes:** GOV-06. **Depends on:** WP-5.

The exported definitions are identified by a 36-character Power Automate flow GUID; the register
by a 32-hex Logic Apps workflow id. Zero exported definitions carry an id the register knows.

For each HTTP-triggered flow in \`${ENV_ID}\`, record one row in
\`DGO_HTTPFlowRegistry\`:

| Field | Value | Source |
|---|---|---|
| \`FlowId\` | the 36-character flow GUID | the flow's URL in Power Automate |
| \`WorkflowId\` | the 32-hex Logic Apps workflow id | the trigger URL, between \`/workflows/\` and \`/triggers/\` |
| \`EnvironmentId\` | \`${ENV_ID}\` | fixed |
| \`RegistryKey\` | — | **do not supply**; flow 02 computes it |

**Do not paste a trigger URL into the list.** Read the workflow id from it and record only that.
Recording both ids against one row is what makes the two corpora joinable.

---

## WP-7 — Remaining tenant-execution items

The ${tenantItems.length} items of authority \`TENANT_EXECUTION\`. \`CFG-1\` and \`CFG-2\` are closed by
WP-1. Each remaining item names its closing condition in
\`docs/deployment/closure-disposition.json\` and its steps in \`docs/deployment/ACTION_PLAN.md\`.

| Item | Title |
|---|---|
${tenantItems.map((i) => `| ${i.id} | ${i.title} |`).join('\n')}

**Rule:** execute an item only when its closing condition is met by evidence you have produced.
Record the evidence. An item performed but not observed is \`APPLIED_UNVERIFIED\`, not closed.

---

## 8. Reporting

Produce one report. For each work package:

1. **Package and outcome** — one of \`COMPLETE\`, \`PARTIAL\`, \`BLOCKED\`, \`NOT ATTEMPTED\`.
2. **Commands run**, verbatim, in order.
3. **Console output**, verbatim, with **every \`sig=\` value replaced by \`sig=<redacted>\`**.
4. **Deviations** — anything not matching the Expected line in this brief, quoted exactly.
5. **Artefacts produced** — file names of exports and \`BEFORE-\` packages, held at the location
   given in §0.5.

Additionally record:

- The commit hash from WP-0.
- All ${step5Totals.lists} list GUIDs from WP-5.
- The producer determination from WP-2, including "cannot be identified from available evidence"
  where that is the outcome.
- The WP-2.5 relay line, verbatim — including the case where nothing was found, which is a
  result and not an absence of one.
- The state of each of the ${agencyItems.length} out-of-scope items, unchanged.

**Redaction is mandatory, not advisory.** A report containing a live signature is a credential
disclosure.

---

## 9. Escalation

Stop and escalate — do not work around — on any of:

| Condition | Why |
|---|---|
| Any access in §2 is unavailable | Partial execution produces an untrustworthy report |
| WP-0 \`npm run test:node\` exits non-zero | The repository is not in a known state |
| WP-0 column verification reports MISSING, RESERVED NAME or UNREADABLE | §4 is wrong; later packages depend on it |
| WP-3.3 rehearsal does not behave as described | The procedure is unexecuted against this tenant |
| WP-3.4 any path deviates | The correction did not apply as intended |
| WP-4.1 any item count increased | A producer is still active |
| WP-4.2 reports rows only in a duplicate | Deletion would destroy the only copy |
| WP-5 third run creates anything | The apply did not do what it reported |
| Any operation returns 403 | Permission, not procedure. §2 access is insufficient |
| Anything requires a decision on the ${agencyItems.length} out-of-scope items | Not the agent's to make |

**Escalate to the recipient named in §0.4.** Content: the condition, the exact output, the package
and step, and what was done immediately before. Do not attempt a remedy not written in this brief.

**If §0.4 is unfilled, do not start the engagement.** An escalation with no recipient is a stop
with no resumption.

---

## 10. Reference — list GUIDs

### 10.1 Authoritative — never delete, never rename

Site: \`${SITE}\`

| List | GUID |
|---|---|
${listRegistry.lists.map((l) => `| \`${l.listTitle}\` | \`${l.listGuid}\` |`).join('\n')}

### 10.2 Duplicates — currently renamed, deletion gated by WP-4

Site: \`${DUP_SITE}\`

| Current title | GUID | Superseded by |
|---|---|---|
${listRegistry.retire.map((r) => `| \`ZZ_RETIRED_${r.listTitle}\` | \`${r.listGuid}\` | \`${r.supersededBy}\` |`).join('\n')}

### 10.3 Scripts

All are browser-console scripts. No PowerShell, no installation.

| Script | Package | Writes |
|---|---|---|
| \`verify-governance-columns.browser.js\` | WP-0 | no |
| \`compare-duplicate-governance-lists.browser.js\` | WP-4.2 | no |
| \`retire-duplicate-governance-lists.browser.js\` | WP-4 | yes — MODE-driven |
| \`provision-flow-registry-lists.browser.js\` | WP-5 | yes — dry-run default |
| \`provision-governance-lists.browser.js\` | re-verification | yes — dry-run default |
| \`dump-governance-columns.browser.js\` | diagnosis | no |
| \`inspect-governance-strays.browser.js\` | diagnosis | no |

---

## 11. Known limits of this brief

Stated so they are not discovered as surprises.

1. **The WP-3.3 export/import procedure has not been executed against this tenant.** It follows
   documented behaviour. WP-3.3 requires the first flow be treated as a rehearsal.
2. **The GOV-09 producer is unidentified.** WP-2 gives the procedure and pre-decides every
   outcome, including the outcome where it cannot be found.
3. **The 2026-08-18 list capture is older than the tenant.** WP-0 and WP-4.1 re-verify against the
   live tenant before anything is deleted.
4. **${agencyItems.length} open items are not executable by any agent.** They require a documented
   agency risk acceptance.
5. **This brief does not authorise schema changes beyond those specified.** Any additional column,
   list or flow change is out of scope, whatever its apparent merit.
`;

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

console.log('\nExecution agent brief\n');
console.log(`  branch          ${BRANCH}`);
console.log(`  in scope        ${tenantItems.length} tenant-execution item(s) + runbook steps`);
console.log(`  out of scope    ${agencyItems.length} agency-decision item(s)`);
console.log(`  work packages   8 (WP-0 … WP-7)`);
console.log(`  open findings   ${open.length}\n`);

if (CHECK) {
  if (doc !== previous) fail('the agent brief is stale. Run: npm run governance:agentbrief');
  console.log('  ✅ the agent brief matches every artefact it derives from\n');
  process.exit(0);
}

fs.writeFileSync(OUT, doc);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)} — ${Math.round(doc.length / 1024)} KB\n`);
