#!/usr/bin/env node
/**
 * Emit the single end-to-end walkthrough: everything from an unconfigured checkout to a
 * commissioned estate, with every parameter derived rather than typed.
 *
 * WHY GENERATED
 *
 * A walkthrough is the document most likely to be read and least likely to be re-checked. This
 * estate has already produced fifteen competing commissioning documents, none wrong in a way a
 * reader could detect from inside it. So no GUID, count, key or site name is written here by
 * hand: every one is read from the artefact that owns it, and `--check` fails the build if the
 * document drifts from those artefacts.
 *
 * WHAT THE STATUS COLUMN MEANS, AND WHY IT IS NOT DERIVED
 *
 * Each step carries a status and the EVIDENCE for it — which run, on what date, reporting what.
 * Those are observations from executed runs, and an observation cannot be derived from a
 * specification: the whole failure this estate keeps repeating is a document asserting a tenant
 * state nobody watched happen. So statuses are stated explicitly below, each with its evidence
 * string, and anything not actually observed is marked OUTSTANDING rather than assumed.
 *
 * The tenant-side halves are cross-checked against docs/reference/governance-estate-position.json
 * on every build: if a step here claims DONE while the finding it closes still records tenant
 * work, the build fails.
 *
 *   npm run governance:walkthrough
 *   npm run governance:walkthrough -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { provisioningScope } from './lib/registry-provisioning-scope.mjs';
import { ownershipBanner } from './lib/document-ownership.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/deployment/governance/GOVERNANCE-STATUS.md');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };
const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

/* ── the artefacts that own each fact ───────────────────────────────────────────────────── */

const register = J('docs/reference/endpoint-register.json');
const ids = J('docs/reference/endpoint-workflow-ids.json');
const listRegistry = J('docs/reference/governance-list-registry.json');
const position = J('docs/reference/governance-estate-position.json');
const registrySpec = J('docs/reference/http-flow-registry-spec.json');
const provisioningSpec = J('docs/reference/sharepoint-provisioning-spec.json');

const SITE = listRegistry.decision.authoritativeSite;
const SITE_NAME = SITE.split('/sites/')[1];
const ORIGIN = SITE.split('/sites/')[0];
const dupSites = [...new Set(listRegistry.retire.map((r) => r.site))];
if (dupSites.length !== 1) fail(`the duplicates span ${dupSites.length} sites; this walkthrough assumes one`);
const DUP_SITE = `${ORIGIN}/sites/${dupSites[0]}`;

const keys = register.current_configuration.map((e) => e.key);
const internalKeys = keys.filter((k) => k.startsWith('DGO_ENDPOINT_'));
const portalKeys = keys.filter((k) => k.startsWith('PF_ENDPOINT_'));
if (internalKeys.length + portalKeys.length !== keys.length) {
  fail('a contract key uses neither the DGO_ENDPOINT_ nor the PF_ENDPOINT_ prefix');
}

/* The environment id appears in flow definitions and the runbook. Read it, never type it. */
const ENV_ID = (() => {
  const runbook = fs.readFileSync(path.join(ROOT, 'docs/deployment/governance/GOVERNANCE-TENANT-RUNBOOK.md'), 'utf8');
  const m = /Default-[0-9a-f-]{36}/.exec(runbook);
  if (!m) fail('no Power Automate environment id found in the execution runbook');
  return m[0];
})();

/* Step 4's targets, read from the deployed definitions so a display name can never drift from
   the GUID an operator has to open. */
const deployedDir = path.join(ROOT, 'docs/reference/flow-contracts/deployed');
const correctedDir = path.join(ROOT, 'docs/deployment/governance/flows');
const corrected = fs.existsSync(correctedDir)
  ? fs.readdirSync(correctedDir).filter((f) => f.endsWith('.corrected.json')).sort()
  : [];
const flowTargets = corrected.map((file) => {
  const num = /^(\d+)/.exec(file)?.[1];
  const deployed = fs.readdirSync(deployedDir).find((f) => new RegExp(`^${num} - GOV`).test(f));
  if (!deployed) fail(`no deployed definition found for corrected file ${file}`);
  const d = JSON.parse(fs.readFileSync(path.join(deployedDir, deployed), 'utf8'));
  const guid = d.workflow_identity?.internal_name;
  const name = d.workflow_identity?.tags?.flowDisplayName;
  if (!guid || !name) fail(`${deployed} carries no workflow identity`);
  const def = JSON.parse(fs.readFileSync(path.join(correctedDir, file), 'utf8'));
  const actions = Object.keys(def.definition?.actions || {}).length;
  return { file, num, guid, name, actions };
});

/* Step 5's scope, derived from the corrected flow definitions — the same derivation the runbook
   and the provisioner use. The comment that used to sit here said this was read from the
   provisioner's generator inputs; it was a third hand-kept copy, and it named three lists while
   the corrected flows touch six. */
let STEP5_LISTS;
try {
  ({ provisionNow: STEP5_LISTS } = provisioningScope({
    spec: registrySpec,
    corrections: corrected.map((f) => JSON.parse(fs.readFileSync(path.join(correctedDir, f), 'utf8'))),
  }));
} catch (err) {
  fail(err.message);
}
const step5 = STEP5_LISTS.map((t) => {
  const l = registrySpec.lists.find((x) => x.listTitle === t);
  if (!l) fail(`${t} is not in the HTTP flow registry specification`);
  return { title: t, fields: l.customFieldCount, key: l.uniqueKey, description: l.description };
});
const step5Deferred = registrySpec.lists.map((l) => l.listTitle).filter((t) => !STEP5_LISTS.includes(t));

/* Step 6 said the registry "already carries these". It does not carry WorkflowId — that column is
   in neither the specification nor flow 02, so Step 5 will never create it and flow 02 has no
   field to write it into. Derived, so the wording corrects itself when they acquire it. */
const registryFields = (registrySpec.fields || []).filter((f) => f.listTitle === 'DGO_HTTPFlowRegistry');
const SPEC_HAS_WORKFLOW_ID = registryFields.some((f) => f.internalName === 'WorkflowId');
const flow02Corrected = corrected.find((f) => f.startsWith('02'));
const FLOW_02_TAKES_WORKFLOW_ID = flow02Corrected
  ? /workflowId/i.test(fs.readFileSync(path.join(correctedDir, flow02Corrected), 'utf8'))
  : false;

const step6Gaps = [
  SPEC_HAS_WORKFLOW_ID ? null
    : '`WorkflowId` is not one of the ' + registryFields.length
      + ' fields the registry specification defines, so Step 5 will not create it.',
  FLOW_02_TAKES_WORKFLOW_ID ? null
    : 'Flow 02 neither declares `workflowId` on its trigger nor writes it to the registry row.',
].filter(Boolean);
const step6Lead = step6Gaps.length
  ? '**Not all of these exist yet, and no part of the gap is a tenant action.** '
    + step6Gaps.join(' ')
    + (step6Gaps.length > 1 ? ' Both are repository changes' : ' That is a repository change')
    + '; see GOVERNANCE-TENANT-RUNBOOK.md Step 6.2.'
  : '`DGO_HTTPFlowRegistry` carries these, and registering through flow **02** writes them together.';

const finding = (id) => position.openFindings.find((f) => f.id === id)
  || (position.closedFindings || []).find((f) => f.id === id);

/* ── executed observations ──────────────────────────────────────────────────────────────────
 *
 * Every entry is something a run actually printed, with the date it printed it. Nothing here is
 * inferred from a specification. A step with no observation is OUTSTANDING, not assumed-done.
 */
const OBSERVED = {
  'A': { status: 'OUTSTANDING', evidence: 'npm run commission reports both config files absent — 2 blockers stand.' },
  '1': { status: 'SUPERSEDED', evidence: 'Step 3 export (2026-09-09) downloaded all 17 duplicate lists including their items; the 10 keepers were not separately backed up before Step 2, which was additive only.' },
  '2': { status: 'DONE', evidence: 'Three consecutive runs 2026-09-09 — dry 0 created/97 present/0 failed; apply 1 created (EndpointRedacted)/97 present/0 failed; verify 0 created/98 present/10 seeds present/0 failed.' },
  '2.7': { status: 'DONE', evidence: 'cleanup-disambiguated-columns 2026-09-09 — dry listed exactly 3; live reported 3 deleted, 0 kept, 0 failed. Both original Version columns untouched and still populated.' },
  '3-survey': { status: 'DONE', evidence: '2026-09-09 — 17 surveyed, nothing changed. 13 empty, 4 populated (RoleCatalogue 6, AuditLog 5, UserDirectory 1, PilotCohorts 1).' },
  '3-export': { status: 'DONE', evidence: '2026-09-09 — 17 exported, 13 items in total, 0 failed.' },
  '3-rename': { status: 'DONE', evidence: '2026-09-09 — 17 renamed to ZZ_RETIRED_*, 0 skipped, 0 failed.' },
  '3-delete': { status: 'BLOCKED', evidence: 'Gated on GOV-09. The producer of the 2026-08-31T01:58Z writes is unidentified; deleting a list something still writes to breaks that producer silently.' },
  '4': { status: 'OUTSTANDING', evidence: 'The corrected definitions exist and are asserted by tests/governance-flow-corrections.test.mjs. The deployed flows are unchanged.' },
  '5': { status: 'OUTSTANDING', evidence: 'None of the registry lists exists in the tenant; the 2026-08-18 capture and tests/governance-estate.test.mjs agree.' },
  '6': { status: 'OUTSTANDING', evidence: 'GOV-06 stands: zero exported definitions carry an id the register knows.' },
  /* Step 7 exists in GOVERNANCE-TENANT-RUNBOOK.md and was in NEITHER completion table — not this
     one, which stopped at 6, nor the runbook's own. It is the step that would measure GOV-11, the
     one finding whose tenantStatus reads UNMEASURED. A step tracked nowhere is a step nobody runs,
     and the finding it would settle stays unmeasured for exactly as long. */
  '7': { status: 'OUTSTANDING', evidence: 'GOV-11 reads UNMEASURED: execution is reported, not observed. verify-flow-truth-provisioning.browser.js has never been run, so whether the three resources exist, on which site, and under which internal names is unknown. Read-only — it blocks nothing.' },
};

/* A step claiming DONE while the finding it closes still records tenant work is the exact
   contradiction this document exists to prevent. */
const CLOSES = { '2': 'GOV-08', '2.7': 'GOV-08' };
for (const [step, id] of Object.entries(CLOSES)) {
  if (OBSERVED[step].status !== 'DONE') continue;
  const f = finding(id);
  if (f && /^OUTSTANDING/i.test(String(f.tenantStatus || ''))) {
    fail(`step ${step} claims DONE but ${id}.tenantStatus still begins OUTSTANDING`);
  }
}

const badge = (s) => ({
  DONE: '✅ DONE',
  OUTSTANDING: '⬜ OUTSTANDING',
  BLOCKED: '⛔ BLOCKED',
  SUPERSEDED: '➖ SUPERSEDED',
}[s] || s);

const openIds = position.openFindings.map((f) => f.id).join(', ');

/* ── the document ───────────────────────────────────────────────────────────────────────── */

const rotationTemplate = fs.readFileSync(
  path.join(ROOT, 'docs/deployment/rotation/values.template.txt'),
  'utf8',
);

const rotationMatch = {
  need: /(\d+) keys need a NEW url/.exec(rotationTemplate),
  unaffected: /(\d+) keys are unaffected/.exec(rotationTemplate),
  unknown: /(\d+) keys have no workflow id recorded/.exec(rotationTemplate),
};

if (!rotationMatch.need || !rotationMatch.unaffected || !rotationMatch.unknown) {
  throw new Error(
    'Rotation worksheet does not expose the three expected header counts',
  );
}

const rotationCounts = Object.freeze({
  need: rotationMatch.need[1],
  unaffected: rotationMatch.unaffected[1],
  unknown: rotationMatch.unknown[1],
});

const doc = `# DGO Digital Operations — governance commissioning status

${ownershipBanner('docs/deployment/governance/GOVERNANCE-STATUS.md')}

> **GENERATED FILE — do not edit by hand.**
> Built by \`scripts/build-end-to-end-walkthrough.mjs\` from the artefacts that own each fact:
> \`endpoint-register.json\`, \`endpoint-workflow-ids.json\`, \`governance-list-registry.json\`,
> \`governance-estate-position.json\`, \`http-flow-registry-spec.json\`,
> \`sharepoint-provisioning-spec.json\` and the deployed flow definitions.
> Every GUID, count, key and site name below is read from those files. Edit them and re-run
> \`npm run governance:walkthrough\`.

## What this document is

The whole path, in order, from an unconfigured checkout to a commissioned estate. It replaces
nothing: [\`CLEAR-THE-LAST-BLOCKER.md\`](../CLEAR-THE-LAST-BLOCKER.md) remains the commissioning
authority for Phase A, and [\`GOVERNANCE-TENANT-RUNBOOK.md\`](GOVERNANCE-TENANT-RUNBOOK.md) remains the detailed
reference for Phase B. This is the sequence that joins them, with each step's **actual verified
state**.

**How to read the status column.** \`DONE\` means a run printed the result quoted beside it, on the
date quoted. It does not mean a specification says so. Anything not observed is \`OUTSTANDING\`,
never assumed.

---

## State of play

| | |
|---|---|
| Authoritative governance site | \`${SITE}\` |
| Site holding the duplicates | \`${DUP_SITE}\` |
| Power Automate environment | \`${ENV_ID}\` |
| Contract keys | **${keys.length}** — ${internalKeys.length} internal (\`DGO_ENDPOINT_*\`), ${portalKeys.length} portal (\`PF_ENDPOINT_*\`) |
| Distinct workflows serving them | **${ids.totals.distinctWorkflows}** |
| Governance lists kept | **${listRegistry.lists.length}**, all on \`${SITE_NAME}\` |
| Duplicate instances to retire | **${listRegistry.retire.length}**, all on \`${dupSites[0]}\` |
| Columns across the kept lists | **${(provisioningSpec.fields || []).length}** |
| Open findings | ${position.openFindings.length} — ${openIds} |

### Step status at a glance

| Step | What | Status |
|---|---|---|
| **A** | Configure both runtimes — clears the 2 commissioning blockers | ${badge(OBSERVED['A'].status)} |
| **1** | Back up the governance lists | ${badge(OBSERVED['1'].status)} |
| **2** | Provision columns and seeds on the ${listRegistry.lists.length} kept lists | ${badge(OBSERVED['2'].status)} |
| **2.7** | Remove the auto-disambiguated leftovers | ${badge(OBSERVED['2.7'].status)} |
| **3a** | Survey the ${listRegistry.retire.length} duplicates | ${badge(OBSERVED['3-survey'].status)} |
| **3b** | Export them | ${badge(OBSERVED['3-export'].status)} |
| **3c** | Rename them \`ZZ_RETIRED_*\` | ${badge(OBSERVED['3-rename'].status)} |
| **3d** | Delete them | ${badge(OBSERVED['3-delete'].status)} |
| **4** | Correct the ${flowTargets.length} governance flows | ${badge(OBSERVED['4'].status)} |
| **5** | Provision ${step5.length} HTTP flow registry lists | ${badge(OBSERVED['5'].status)} |
| **6** | Adopt the \`FlowId\`/\`WorkflowId\` join | ${badge(OBSERVED['6'].status)} |
| **7** | Measure the out-of-band provisioning (GOV-11) | ${badge(OBSERVED['7'].status)} |

**The critical path right now:** identify the GOV-09 producer → Step 4 → Step 3d → Steps 5, 6.
Step 7 is not on it — it is read-only and blocks nothing — but it is the only thing that would
settle GOV-11, which reads UNMEASURED because this table stopped at 6 and the runbook's own
checklist did too.
Phase A is independent of all of it and can proceed in parallel.

---

# Phase A — configure both runtimes

**Status: ${badge(OBSERVED['A'].status)}**
${OBSERVED['A'].evidence}

This is the only thing standing between the estate and a working pilot. It touches no governance
list.

### A.0 Before you start — the one rule

A \`sig=\` value **is** the authentication. Possession alone authorises invoking the flow. There is
no second factor, no caller allow-list, no expiry.

- Never paste a signed trigger URL into a ticket, an email, a chat message, or any file except
  \`config.local.js\`.
- Deleting a file **revokes nothing.** Only regenerating the trigger in Power Automate does.
- Both \`config.local.js\` files are git-ignored. Nothing wired there can be committed.

### A.1 Prerequisites

| # | Requirement | How to confirm |
|---|---|---|
| 1 | Node ≥ 22 and npm | \`node -v\` |
| 2 | The repository at this branch | \`git rev-parse --abbrev-ref HEAD\` |
| 3 | Power Automate maker access in \`${ENV_ID}\` | https://make.powerautomate.com → the environment selector shows it |

### A.2 Generate the values template

\`\`\`bash
npm install
npm run values:template
\`\`\`

Writes \`~/dgo-values.txt\` with one line per contract key — **${keys.length} lines**, each ending
\`=\`, waiting for a URL.

### A.3 Harvest the ${ids.totals.distinctWorkflows} trigger URLs

${ids.totals.distinctWorkflows} flows serve the ${keys.length} keys, so this is
**${ids.totals.distinctWorkflows} visits, not ${keys.length}**.

**You are pasting a signature, not a URL.** \`values:template\` emits every line already complete —
host, routing segment, workflow id, all of it — ending:

\`\`\`
...&sv=1.0&sig=
\`\`\`

For each flow in Power Automate: open it → expand **When an HTTP request is received** → from the
**HTTP POST URL**, copy **only the part after \`sig=\`** — 43 characters, the last parameter, to
the end of the line — and paste it after the \`=\` that is already there.

**Do not replace the whole line.** Pasting a complete URL after \`&sig=\` produces a value with two
\`sig=\` parameters in it. The line will look filled in and the endpoint will not authenticate.

### A.3a There are two values templates in this repository. Use the one above.

| | \`npm run values:template\` | \`docs/deployment/rotation/values.template.txt\` |
|---|---|---|
| Key names | \`DGO_ENDPOINT_*\` / \`PF_ENDPOINT_*\` | bare — \`FETCH_ACTIVITIES=\` |
| Line content | URL pre-filled, signature blank | **empty** — the whole URL is required |
| What you paste | 43 characters | a complete trigger URL, ${keys.length} times |

\`setup\` accepts **both** key forms — \`scripts/setup.mjs\` tries the prefixed name and then the
bare one — and no bare name is ambiguous, because the ${internalKeys.length} runtime and
${portalKeys.length} portal short names do not overlap. So the rotation worksheet is usable. It is
simply the harder and more error-prone of the two: a whole URL pasted ${keys.length} times is
${keys.length} chances to truncate a host or drop a workflow id, and the pre-filled template makes
those two mistakes impossible.

**If you are holding a copy of the rotation worksheet, check its header before trusting it.** It
states how many keys the disclosure affected, and that count is generated from the rotation
register. A copy taken before the rotation was addressed reads \`12 / 9 / 4\`; the current file
reads \`${rotationCounts.need} keys need a NEW url\`, \`${rotationCounts.unaffected} keys are unaffected\`,
\`${rotationCounts.unknown} keys have no workflow id recorded\`. If yours says anything else it is stale — regenerate it, or use
\`npm run values:template\` and ignore it.

### A.4 Check before writing anything

\`\`\`bash
npm run check:values -- ~/dgo-values.txt
\`\`\`

Prints **no URL, no host, no signature** — only shapes — so its output is safe to show anyone.

**Expected:** \`✅ ${keys.length} value(s), all with a complete 43-character signature.\`

**43 is exact, not approximate.** A signature is base64url of an HMAC-SHA256: 32 bytes, 43
characters unpadded. Any other number is a defect in the paste, not a variation.

| What it says | What it means |
|---|---|
| \`the URL is complete but its signature is blank\` | That key is not filled in yet |
| \`sig is N characters, not 43\`, N smaller | Truncated on copy |
| \`sig is N characters, not 43\`, N larger | Something extra pasted after it |
| \`no sig= parameter\` | The line was overwritten with a truncated URL — regenerate that key |
| \`NOT A URL\` | A smart quote, a space around the \`=\`, or a wrapped line |

### A.5 Write both config files

\`\`\`bash
npm run setup -- --values ~/dgo-values.txt --force
\`\`\`

\`--force\` is required: \`setup\` will not overwrite an existing \`config.local.js\` without it.

Writes \`config/config.local.js\` (${internalKeys.length} internal keys) and
\`document-portal/config.local.js\` (${portalKeys.length} portal keys).

### A.6 Confirm

\`\`\`bash
npm run check:config
npm run check:config:portal
npm run commission
\`\`\`

**Expected from \`commission\`:** the two blockers are gone. The governance findings remain as
warnings — they do not block a pilot, because the endpoint path reaches Power Automate directly
and touches no governance list.

### A.7 Afterwards

Shred \`~/dgo-values.txt\`. It holds ${keys.length} live credentials in plain text.

---

# Phase B — the governance estate

## Step 1 — Back up

**Status: ${badge(OBSERVED['1'].status)}**
${OBSERVED['1'].evidence}

Step 2 is additive — it creates columns and seed rows and modifies nothing — so the ${listRegistry.lists.length}
kept lists were never at risk from it. The lists that were at risk are the ${listRegistry.retire.length}
duplicates, and those were exported in full at Step 3b.

**If you want a backup of the keepers anyway**, use \`MODE = 'export'\` logic against the keeper
GUIDs in the appendix. It is not a precondition for anything below.

---

## Step 2 — Provision the ${listRegistry.lists.length} kept lists

**Status: ${badge(OBSERVED['2'].status)}**
${OBSERVED['2'].evidence}

Third-run idempotence is the check that matters: an apply reporting work on a second pass did not
do what it claimed on the first.

**Artefact:** \`scripts/provision-governance-lists.browser.js\`
**Site:** \`${SITE}\`
**Permission:** Manage Lists on \`${SITE_NAME}\` (Site Owner is enough; tenant admin is not needed)

Re-run it any time; it is idempotent and reports \`present\` for everything.

### 2.7 — the auto-disambiguated leftovers

**Status: ${badge(OBSERVED['2.7'].status)}**
${OBSERVED['2.7'].evidence}

\`createfieldasxml\` with \`Options: 24\` takes the internal name from the SchemaXml's \`Name\`
attribute, and does **not** fail when that name is taken — it appends a digit and creates the
column beside the existing one.

**Artefact:** \`scripts/cleanup-disambiguated-columns.browser.js\` — dry-run by default.

---

## Step 3 — Retire the ${listRegistry.retire.length} duplicates

**Artefact:** \`scripts/retire-duplicate-governance-lists.browser.js\`
**Site: \`${DUP_SITE}\`** — the **duplicate** site, not the authoritative one. The script refuses to
run if pasted on the authoritative site.

It is **MODE-driven, not \`DRY_RUN\`-driven**: one boolean is not enough protection when the
mistake is unrecoverable. \`delete\` cannot touch a list \`rename\` has not renamed, so the
reversible step cannot be skipped.

| Phase | Status | Evidence |
|---|---|---|
| **3a** \`survey\` | ${badge(OBSERVED['3-survey'].status)} | ${OBSERVED['3-survey'].evidence} |
| **3b** \`export\` | ${badge(OBSERVED['3-export'].status)} | ${OBSERVED['3-export'].evidence} |
| **3c** \`rename\` | ${badge(OBSERVED['3-rename'].status)} | ${OBSERVED['3-rename'].evidence} |
| **3d** \`delete\` | ${badge(OBSERVED['3-delete'].status)} | ${OBSERVED['3-delete'].evidence} |

### 3d is blocked, and this is why

The survey found four duplicates carrying items, all last written at **2026-08-31T01:58:48–49Z**
— within one second of each other, and **thirteen days after** the 2026-08-18 capture this estate
reasons from. The counts match the specification's seed set exactly: 6 role seeds, 1 bootstrap
user, 1 pilot cohort. **A provisioning run, pointed at the wrong site.** Recorded as **GOV-09**.

**What was searched, and what it found.** Every exported definition naming a governance list was
walked. **None creates a list. None posts an item to one.** The producer is therefore not in the
exported corpus — consistent with **GOV-06**, where only 13 of 73 exported definitions match a
register workflow by name. It is **unidentified, not absent**.

**The next probe is the tenant, not this repository:**

1. Power Automate → environment \`${ENV_ID}\` → run history around **2026-08-31 01:58 UTC**.
2. Or the SharePoint audit log for those four lists at that timestamp.

Nothing readable from a list says what wrote to it.

### Before 3d — one read-only check

**Artefact:** \`scripts/compare-duplicate-governance-lists.browser.js\` (read-only, both sites).

Answers one question: **does any row exist only in a duplicate?** If one does it is the sole copy
and must be reconciled first. It matches rows on each list's own seed key, never Title — two of
these lists legitimately repeat titles.

### Do not run \`restore\`

The rename has already defused **GOV-10** (below): every deployed reference to these lists is by
title, so \`ZZ_RETIRED_\` makes those calls 404 instead of silently hitting a duplicate. Restoring
the titles re-arms it.

---

## Step 4 — Correct the governance flows

**Status: ${badge(OBSERVED['4'].status)}**
${OBSERVED['4'].evidence}

This is now the **critical path**: Step 3d, GOV-09 and GOV-10 all wait on it.

### 4.1 The ${flowTargets.length} flows, with their import targets

| # | Flow | Flow GUID | Corrected definition | Actions |
|---|---|---|---|---|
${flowTargets.map((f) => `| ${f.num} | ${f.name} | \`${f.guid}\` | \`docs/deployment/governance/flows/${f.file}\` | ${f.actions} |`).join('\n')}

**Environment:** \`${ENV_ID}\`

### 4.2 What the corrections do

- **GOV-04** — every path now reaches a \`Response\` before any \`Terminate\`. Power Automate's
  \`Terminate\` ends the whole run, so anything downstream of it is unreachable: all four flows
  could end without answering their caller.
- **GOV-05** — the retirement cascade is gated by \`If_Safe_To_Retire\`. Both active counts are
  taken **before** any write; retirement is blocked with **409** when either is non-zero, and
  proceeds only when both are zero or \`force\` is true. \`Retire_Registry\` was lifted out of
  \`If_Registry_Found\`, where it would otherwise have escaped the guard — **a defect the test
  found, not the design.**

### 4.3 Applying a corrected definition

Power Automate's **Peek code** is read-only, so a definition cannot be pasted back through it.
The route is export → edit → import:

1. Power Automate → the flow → **⋯** → **Export** → **Package (.zip)**. **Keep this file — it is
   your rollback.**
2. Unzip. The definition is at
   \`Microsoft.Flow/flows/<flow GUID>/definition.json\`.
3. Replace its \`definition\` object with the corrected file's \`definition\` object.
4. Re-zip **the contents**, not the containing folder.
5. Power Automate → **Import** → upload → **Update** the existing flow (**not** Create as new).

### 4.4 Validate all four paths on flow 05

| Path | Send | Expect |
|---|---|---|
| Malformed | body missing \`flowId\` | **400**, no writes |
| Not found | a \`flowId\` with no registry row | **404**, no writes |
| Blocked | a flow with active consumers or dependencies | **409**, **nothing retired** |
| Guarded | a flow with none | **200**, retired |
| Forced | active consumers **and** \`force: true\` | **200**, retired, forced retirement recorded with both counts |

The **409 blocked** path is the one that matters. Verify afterwards that the consumers and
dependencies are **still active** — the original defect retired them, which erased the evidence
that any were active.

### 4.5 Also in Step 4 — GOV-10

**\`Repair the DGO governance lists\`**, button-triggered. Every action carries
\`dataset = ${DUP_SITE}\` — the site being retired — and addresses every list by
\`getbytitle(...)\`, never by GUID. It creates and indexes columns, and **deletes any column its
\`Filter_Strays\` step does not recognise.**

Its SchemaXml payload carries \`FlowUrl\` and \`ScopeId\` — the two names GOV-03 and GOV-08 removed
— and does **not** carry \`EndpointRedacted\` or \`EndpointFingerprint\`.

**Point it at the authoritative site, or restore the retired list titles, and it deletes
\`EndpointRedacted\` and \`EndpointFingerprint\` as strays and recreates \`FlowUrl\` and \`ScopeId\`.**
One button press undoes both findings, and reports success doing it.

Corrections required: repoint \`dataset\` to \`${SITE}\`, address lists by GUID, and regenerate its
\`varLists\` payload from \`docs/reference/sharepoint-provisioning-spec.json\`. **Until then, do not
run it.**

---

## Step 5 — Provision the HTTP flow registry lists

**Status: ${badge(OBSERVED['5'].status)}**
${OBSERVED['5'].evidence}

**Artefact:** \`scripts/provision-flow-registry-lists.browser.js\` — dry-run by default.
**Site:** \`${SITE}\`

### 5.1 What it creates

| List | Columns | Unique key | Purpose |
|---|---|---|---|
${step5.map((l) => `| \`${l.title}\` | ${l.fields} | \`${l.key}\` | ${l.description} |`).join('\n')}

${step5Deferred.length
  ? `**Deferred, and not created — ${step5Deferred.length} list(s):** ${step5Deferred.map((t) => `\`${t}\``).join(', ')}.`
  : '**Nothing is deferred.** The scope is every list the corrected flows read or write, plus the\nconfiguration list they read their parameters from.'}
A provisioner that creates more than the flows need is how a deferral quietly becomes a
deployment; one that creates fewer is how a runbook ends up telling an operator to exercise a
flow against a list that does not exist.

### 5.2 Why this one is different from Step 2

Step 2's lists already existed, so every address in that provisioner is a GUID captured from the
tenant. **None of these exist**, and a list that does not exist has no GUID — so creation is
unavoidably by title. That is exactly the operation that produced **GOV-02**.

So the title is used **once**, to ask whether the list is already there:

1. \`GET\` the list by title. If it exists, take its GUID and create nothing.
2. Only on **404**, \`POST\` to create it — then read back the GUID SharePoint assigned.
3. Every column and index after that addresses the **GUID**.

Run it twice and the second run creates nothing.

### 5.3 Afterwards — record the GUIDs

The script prints the GUID of each list it created or found. **Those must be recorded in
\`docs/reference/governance-list-registry.json\`**, or the repository goes on describing these
lists as unprovisioned while the tenant has them.

---

## Step 6 — Adopt the join

**Status: ${badge(OBSERVED['6'].status)}**
${OBSERVED['6'].evidence}

**GOV-06:** the exported definitions are identified by a 36-character Power Automate flow GUID;
the register by a 32-hex Logic Apps workflow id. Different identifier spaces for the same
objects, and **zero** exported definitions carry an id the register knows. Joining on normalised
display name — the only shared field — matches 13.

### 6.1 What to record per flow

${step6Lead}

| Field | Value | Where to read it |
|---|---|---|
| \`FlowId\` | the 36-character flow GUID | Power Automate → the flow → its URL, or the exported package's folder name |
| \`WorkflowId\` | the 32-hex Logic Apps workflow id | the trigger URL, between \`/workflows/\` and \`/triggers/\` |
| \`EnvironmentId\` | \`${ENV_ID}\` | fixed for this estate |
| \`RegistryKey\` | computed by flow 02 | **do not supply it** |

Recording both ids against one row is what makes the two corpora joinable — once the column and
the flow field exist to record them in.

---

# Appendix A — the ${listRegistry.lists.length} lists to keep

All on \`${SITE}\`.

| List | GUID |
|---|---|
${listRegistry.lists.map((l) => `| \`${l.listTitle}\` | \`${l.listGuid}\` |`).join('\n')}

# Appendix B — the ${listRegistry.retire.length} duplicates to retire

All on \`${DUP_SITE}\`. Currently renamed \`ZZ_RETIRED_*\`; **not** deleted.

| Live title after rename | GUID | Superseded by |
|---|---|---|
${listRegistry.retire.map((r) => `| \`ZZ_RETIRED_${r.listTitle}\` | \`${r.listGuid}\` | \`${r.supersededBy}\` |`).join('\n')}

# Appendix C — executable artefacts

Every one is a browser-console script. **No PowerShell, no PnP, no install.**

| Script | Phase | Writes? |
|---|---|---|
| \`harvest-trigger-urls.browser.js\` | A.3 | no |
| \`provision-governance-lists.browser.js\` | 2 | yes — dry-run default |
| \`verify-governance-columns.browser.js\` | 2 verify | no |
| \`dump-governance-columns.browser.js\` | 2 diagnose | no |
| \`inspect-governance-strays.browser.js\` | 2.7 | no |
| \`cleanup-disambiguated-columns.browser.js\` | 2.7 | yes — dry-run default |
| \`remediate-governance-strays.browser.js\` | 2.7 migrate | yes — dry-run default |
| \`compare-duplicate-governance-lists.browser.js\` | before 3d | no |
| \`retire-duplicate-governance-lists.browser.js\` | 3 | yes — MODE-driven |
| \`provision-flow-registry-lists.browser.js\` | 5 | yes — dry-run default |

# Appendix D — open findings

| ID | Title | Blocks commissioning? |
|---|---|---|
${position.openFindings.map((f) => `| **${f.id}** | ${f.title} | ${f.blocksCommissioning ? '**yes**' : 'no'} |`).join('\n')}

None blocks the endpoint commissioning path: it reaches Power Automate directly and touches no
governance list. What they block is enrolment, the role catalogue and the audit trail landing
where anything reads them — which an operator otherwise discovers as silence, after going live.
`;

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

console.log('\nEnd-to-end commissioning walkthrough\n');
console.log(`  contract keys   ${keys.length} (${internalKeys.length} internal, ${portalKeys.length} portal) across ${ids.totals.distinctWorkflows} workflows`);
console.log(`  lists kept      ${listRegistry.lists.length}   ·   duplicates ${listRegistry.retire.length}`);
console.log(`  step 4 flows    ${flowTargets.length}   ·   step 5 lists ${step5.length} (+${step5Deferred.length} deferred)`);
console.log(`  open findings   ${position.openFindings.length}`);
const done = Object.values(OBSERVED).filter((o) => o.status === 'DONE').length;
console.log(`  steps observed  ${done} DONE · ${Object.values(OBSERVED).filter((o) => o.status === 'BLOCKED').length} BLOCKED · ${Object.values(OBSERVED).filter((o) => o.status === 'OUTSTANDING').length} OUTSTANDING\n`);

if (CHECK) {
  if (doc !== previous) fail('the walkthrough is stale. Run: npm run governance:walkthrough');
  console.log('  ✅ the walkthrough matches every artefact it derives from\n');
  process.exit(0);
}

fs.writeFileSync(OUT, doc);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)} — ${Math.round(doc.length / 1024)} KB\n`);
