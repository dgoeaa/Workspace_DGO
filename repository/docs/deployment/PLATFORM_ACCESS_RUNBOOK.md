# Platform access and deep links — status and runbook

**Status as of 30 September 2026, at commit `09ffe8d4` on branch `claude/system-remediation-gaps-ahpmsy`.**
Design and requirements: [`docs/architecture/PLATFORM_ACCESS_SPEC.md`](../architecture/PLATFORM_ACCESS_SPEC.md).
Generated worklist: [`DEEPLINK_AUDIT.md`](../folio-Master-Flows-and-Endpoints/deployment/DEEPLINK_AUDIT.md).
Commissioning authority: [`RUNBOOK.md`](RUNBOOK.md). This page covers platform access and deep links only.

This page records what the plan has delivered, what remains, and the complete procedure for every remaining step: who does it, what they need, the exact commands and values, how to check it worked, and how to undo it.

**How to read it.** Every statement cites where in this branch it can be checked. Where a value can only come from you or your tenant (a password, a signature, a task number on your live site), the step says so, names the value, and says exactly where to read it. Nothing is filled with an example. Section 3 lists what this branch cannot prove.

---

## 1. Status

### 1.1 The plan, phase by phase

The plan is `PLATFORM_ACCESS_SPEC.md` §8 (phases 1–7) and §8a (deep links DL-1 to DL-5).

| Phase | What it delivers | Status | Evidence in this branch |
|---|---|---|---|
| 1. Config | Every platform declares audience, category, purpose, owner, exposure and health path | **Done** | commit `1a3bbb83`; `scripts/platforms.config.mjs`; `npm run test:platforms` |
| 2. Hub | Platform Hub on port 8079, with live status | **Done** | commit `1a3bbb83`; `scripts/hub-server.mjs`, `tools/hub/`; `npm run test:hub` |
| 3. Generated docs | README platform table generated from the registry | **Done** | commit `88a4775a`; README between `platforms:begin`/`platforms:end`; `npm run platforms:readme` |
| 4. Workspace switcher | "Other platforms" in the Account menu, filtered by role | **Done** | commit `88a4775a`; `shared/shell.js` `platformLinksHtml()`; `config/platforms.data.js` |
| 5. Boundaries | Back-links to the Hub, the advisory-role label, the portal linking to no internal platform | **Done** | commit `87430a03`; `tests/hub.test.mjs` |
| 6. Governance | The rule for adding a platform | **Done** | commit `87430a03`; `CONTRIBUTING.md` "Adding a platform" |
| 7. Production | Production addresses for every platform; roles enforced on the server | **Partly done.** The Workspace (`https://folio-gateway.rf.gd/`) and Mailer (`https://internal-platform.rf.gd/mailer.html`) addresses are recorded. The other platforms have none, and server-side enforcement waits on authentication (§2, part H) | commit `dc0f49de`; `prodUrl` in `scripts/platforms.config.mjs` |
| DL-1 | Links survive sign-in | **Done in code and tested** with authentication enforced against the dev server. Not yet tested against the live code flows (§2, part H) | commit `09ffe8d4`; `tests/deeplinks-signin.spec.js` |
| DL-2 | Notification links open the exact item | **Done in code.** The flows still send old or broken links (part C) | commit `727d3f76`; `modules/lookup.js` `openLinked()` |
| DL-3 | The bell opens items with the same resolver as a link | **Done** | commit `727d3f76`; `shared/shell.js` `data-notify-open-ref` |
| DL-4 | `Hub/?to=<platform>&…` forwards the link | **Done** | commit `727d3f76`; `tools/hub/hub.js` |
| DL-5 | Links use the production address; the audit finds any that don't | **Done in code** (`productionBase`, the audit, forwarding pages). The flows still need repointing (part C) | commits `dc0f49de`, `c9685607`, `7a6d18b1` |

### 1.2 Quality gates on this branch

| Gate | Result | How to re-run it |
|---|---|---|
| Full non-browser gate | All suites pass, no failures | `npm run test:node` |
| Browser suite | 189 of 189 pass, including the two new sign-in tests | `npm run test:smoke` |
| Link audit and patches | 14 live link actions; the prepared corrections re-audit to 0 live problems | `npm run test:deeplinks` |

`test:brand` and `test:connectors` were failing before this work began. Both were fixed in commit `da508c13`.

### 1.3 Defects found and fixed along the way

| # | Defect | Effect | Fixed in |
|---|---|---|---|
| 1 | Assignment links (`?item=…&ref=TASK-…`) matched `ref` | They opened Lookup, not the task | `727d3f76` |
| 2 | Lookup never read the linked item | Item links showed "No record open" | `727d3f76` |
| 3 | A new link merged into the last link's saved context | An old task ID could ride along with a new link | `727d3f76` |
| 4 | Every flow call, including the two code calls, required sign-in | Once enforced, nobody could sign in | `09ffe8d4` |
| 5 | Nothing asked people to sign in; the welcome sign-in accepted any code | Governed actions just stopped | `09ffe8d4` |
| 6 | Only systemAdmin could open the Acknowledgment Queue | Assignees following an email link met "Access denied" | `09ffe8d4` |
| 7 | The acknowledging person came from the device's default profile | A signed-in assignee was refused as "not the assigned user" | `09ffe8d4` |
| 8 | `docs/visual/folio-brief.html` had no doctype and no brand, and scrolled sideways on phones | The brand gate failed | `da508c13` |

### 1.4 In the live flows today

The evidence is the adopted flow definitions in `docs/folio-Master-Flows-and-Endpoints/contracts/deployed/` (exports, and the tenant captures of 2026-10-01) and the recorded live run `docs/folio-Master-Flows-and-Endpoints/evidence/2026-09-16-runs/IP_Create_Task__08584121032392107627328339279CU09__flow_run_record.json` (15 September 2026, status Succeeded).

- **3 flows, 9 actions** put links into emails that go out. **4 of those are broken in emails going out today**; the other 5 point at the old host `taskack.page.gd`. The full list is [`DEEPLINK_AUDIT.md`](../folio-Master-Flows-and-Endpoints/deployment/DEEPLINK_AUDIT.md). The count is of the adopted flows only ([`FLOW_ADOPTION.md`](../folio-Master-Flows-and-Endpoints/reference/FLOW_ADOPTION.md)); the flows retired on 2026-10-05 are no longer counted.
- **Broken 1–2.** In `Single_Task_Assignment` (internal id `3caf9458-8d95-4740-a01b-6803dad97d34`), the flow `SINGLE_ASSIGNMENT` runs on, the email that `Send_an_email_(V2)_Main_5` sends is built from `Compose_Email_Notification_Template_3`. Its **Acknowledge Receipt** and **Support Access** buttons have `href=""`. This is the same design as `Deployed - Create Task` (retired) and the 15 September run record.
- **Broken 3–4.** In `DGSO INCOMING AI PROCESSING`, `Set_variable_Deeplink` and `Set_variable_Deeplink_2` append `veggie ` after the document ID. The **View Document** button (`variables('DeepLink')` in `Compose_7`) therefore links to `https://apps.powerapps.com/play/1b402856-92cb-45e8-afbf-f362265afaa1?DGOPID=<id>veggie`. The 15 September task request carried this very link in its description: `…?DGOPID=22202veggie`.

### 1.5 The pull request

- This branch already has an open pull request into `main`: [dgoeaa/ECM_DOCS_DEV#28](https://github.com/dgoeaa/ECM_DOCS_DEV/pull/28).
- GitHub reports it as `mergeable_state: clean`, with 693 commits and 1,636 files changed. Its head is `09ffe8d4`.
- Its title and description describe only its first piece of work (SharePoint columns).
- `git merge origin/main` refuses with "unrelated histories": the branch and `main` share no commit. The branch's first commits date from 1 September 2026 and `main`'s from 1 August 2026.

---

## 2. Walkthrough of every remaining step

Order: **A → B → C → D → E**. F can be done at any time. G and H come after authentication is switched on. Don't start a step until the check of the step before it has passed.

### Part A — Decide how this branch reaches `main`

**Who:** the repository owner (`dgoeaa`). **Needs:** GitHub access to `dgoeaa/ECM_DOCS_DEV`.

This is a decision only you can make, because the two histories are unrelated (§1.5):

| Option | What happens | Consequence |
|---|---|---|
| A1. Merge pull request #28 on GitHub | GitHub reports it mergeable. `main` gains all 693 commits | `main` becomes this branch's content. Anything only on `main` stays in the history, but the files match the branch |
| A2. Leave `main` as it is and build from the branch | Nothing changes on GitHub | Part B builds from `claude/system-remediation-gaps-ahpmsy` at a recorded commit |

**Steps for A1**

1. Open https://github.com/dgoeaa/ECM_DOCS_DEV/pull/28.
2. Optionally edit the title and description to describe the whole branch.
3. Choose **Merge pull request**, then **Confirm merge**.

**Check (A1):** https://github.com/dgoeaa/ECM_DOCS_DEV/tree/main shows `acknowledge.html`, `index_Bulk.html`, `support.html` and `docs/deployment/PLATFORM_ACCESS_RUNBOOK.md`.

**Check (A2):** record the commit you'll build from. `git rev-parse HEAD` on the branch prints it; at the time of writing it's `09ffe8d4`.

### Part B — Build the Workspace and publish it to `https://folio-gateway.rf.gd/`

**Who:** whoever holds the hosting account of `folio-gateway.rf.gd`. The Mailer's go-live guide publishes through its host's **File Manager** (`scripts/mailer-package/GO-LIVE.html`, steps 3.1–3.2).

**Needs:**
- Node.js 22 or newer (`package.json` engines; `npm run platforms` lists it).
- Git.
- The hosting account login. It isn't in this branch.
- For B1 option 1 only: access to the flows in Power Automate, to copy trigger signatures.

**Inputs you provide:**

| Input | Where it comes from |
|---|---|
| Hosting account login | You. It isn't recorded in this branch |
| For option 1: the `sig=` part of each flow's trigger URL, one per key in B1 | Power Automate → open the flow named in the values file → expand **When an HTTP request is received** → copy the part of the **HTTP POST URL** after `sig=` (43 characters) |

#### B0. Get the code

```bash
git clone https://github.com/dgoeaa/ECM_DOCS_DEV.git
cd ECM_DOCS_DEV
git checkout claude/system-remediation-gaps-ahpmsy   # skip if building from main after A1
git rev-parse HEAD                                    # record this commit
npm install
```

**Check:** `git rev-parse HEAD` prints the commit you recorded in part A.

#### B1. Choose where the endpoint addresses come from

The Workspace calls 18 flow endpoints, and their addresses are in `config/config.local.js`. The live site already has one. Choose **one** option:

**Option 1 — build with a values file.** Use this if you'll re-supply the signatures.

1. Write the template **outside** the repository. The script refuses a path inside it, because a filled file holds credentials:
   ```bash
   npm run values:template ~/dgo-values.txt
   ```
   The file has 25 lines, one per key. Every URL is complete except its signature.
2. For each of the 18 `DGO_ENDPOINT_…` keys below, add its signature:
   ```bash
   npm run values:sign -- ~/dgo-values.txt DGO_ENDPOINT_FETCH_ALL
   ```
   Paste the signature, press Enter, then Ctrl-D. On an Android phone with Termux: `termux-clipboard-get | npm run values:sign -- ~/dgo-values.txt DGO_ENDPOINT_FETCH_ALL`.

   | Key | Flow to copy the signature from |
   |---|---|
   | `DGO_ENDPOINT_FETCH_ACTIVITIES`, `DGO_ENDPOINT_GET_DOCS` | `IP_Get_Docs_Endpoint` |
   | `DGO_ENDPOINT_SUBSIDIARY_ACTIONS`, `DGO_ENDPOINT_DYNAMIC_ACTIONS` | `IP_Dynamic_Global_Actions_Endpoint` |
   | `DGO_ENDPOINT_FETCH_ALL` | `FETCH_ALL` |
   | `DGO_ENDPOINT_REFERENCE_DATA` | `IP_Reference_Data_Endpoint` |
   | `DGO_ENDPOINT_FETCH_EMAIL_ATTACHMENTS` | `IP_Retrieve_Email_Attachment_Endpoint` |
   | `DGO_ENDPOINT_SINGLE_ASSIGNMENT` | `Single_Task_Assignment` |
   | `DGO_ENDPOINT_BULK_ASSIGNMENT` | `BULK OPS DATA RETRIEVAL HTTP` |
   | `DGO_ENDPOINT_BULK_ASSIGNMENT_DIRECT` | `IP_Bulk_Assign_Endpoint` |
   | `DGO_ENDPOINT_EMAIL` | `IP_SEND_EMAIL` |
   | `DGO_ENDPOINT_EMAIL_RELATED_TASK` | `IP_Create_Email_Assignment_Endpoint` |
   | `DGO_ENDPOINT_AI_EMAIL_ANALYSIS`, `DGO_ENDPOINT_AI_DOC_ANALYSIS`, `DGO_ENDPOINT_AI_CHAT` | `AI_Document_Processing` |
   | `DGO_ENDPOINT_OTP_GENERATE`, `DGO_ENDPOINT_OTP_VERIFY` | `IP_OTP_VERIFY` |
   | `DGO_ENDPOINT_SCAN_INTAKE` | `IP_SCAN_INTAKE` |

   The pairings are from `docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json` (`current_configuration`), as written into the template.
3. Check the file. `check:values` reports **every** blank key, including the 7 `PF_ENDPOINT_…` keys of the public portal. The Workspace build (`--surface runtime`) doesn't read those, so for this build only the 18 `DGO_ENDPOINT_…` lines must come back without an error. Then build and verify:
   ```bash
   npm run check:values -- ~/dgo-values.txt
   npm run package -- --surface runtime --values ~/dgo-values.txt
   npm run package:verify -- --verify dist/dgo-internal-platform
   ```

**Option 2 — keep the live site's endpoint file.** Use this if you won't re-supply the signatures.

```bash
npm run package -- --surface runtime
npm run package:verify -- --verify dist/dgo-internal-platform
```

In B3, **don't upload** `config/config.local.js`: the live site keeps its own.

**Check (either option):**
- `package:verify` ends without an error.
- `dist/dgo-internal-platform/` contains `index.html`, `acknowledge.html`, `index_Bulk.html`, `support.html`, and the folders `assets`, `config`, `core`, `modules`, `shared` and `styles`.
- Verified on this branch: the package builds, and `DEPLOY.md` inside it states "207 files, 2.7 MB, entry `index.html`".

#### B2. Back up the live site

1. Sign in to the hosting account and open **File Manager**.
2. Open the folder that holds `index.html` and `mailer.html`.
3. Download `config/config.local.js`. It holds signed URLs, so keep it private.
4. If the File Manager offers it, download the whole folder as a zip. That's your rollback copy.

**Check:** you hold a copy of the live `config/config.local.js`, and the zip if one was offered.

#### B3. Upload

Upload the contents of `dist/dgo-internal-platform/` into that folder, choosing to overwrite existing files:

| Upload | Rule |
|---|---|
| `index.html`, `acknowledge.html`, `index_Bulk.html`, `support.html` | always |
| `assets/`, `core/`, `modules/`, `shared/`, `styles/` | always, whole folders |
| every file in `config/` except `config.local.js` | always |
| `config/config.local.js` | **only** with B1 option 1 |
| `mailer.html` | **never.** It isn't in this package; leave the live one |

#### B4. Check the live site

Use a private browser window. You need two values from the live site:
- a **task number:** open the Workspace's **Acknowledgment Queue** and use a task's number as shown there;
- a **document reference number:** open **Registry** or **Lookup** and use a reference as shown there.

| # | Open | Expected |
|---|---|---|
| 1 | `https://folio-gateway.rf.gd/` | The Workspace loads |
| 2 | `https://folio-gateway.rf.gd/index.html?item=` + task number + `&ref=TASK-` + task number | Acknowledgment Queue; "Task opened from a link" shows that number |
| 3 | `https://folio-gateway.rf.gd/acknowledge.html?items=` + task number | The address becomes `index.html?…&page=acknowledge.html`; Acknowledgment Queue on that task |
| 4 | `https://folio-gateway.rf.gd/index_Bulk.html?items=` + task number | Acknowledgment Queue on that task |
| 5 | `https://folio-gateway.rf.gd/support.html?item=` + task number | Assistant |
| 6 | `https://folio-gateway.rf.gd/?DGOPID=` + reference number | Lookup & Direct Action, with that item open |
| 7 | `https://folio-gateway.rf.gd/?DGOPID=DOES-NOT-EXIST` | Lookup: "The item this link points to has not loaded" |
| 8 | `https://folio-platform.page.gd/mailer.html` | The Mailer still opens |

These expectations are what `tests/deeplinks.test.mjs` and the Chromium checks recorded for commits `727d3f76` and `dc0f49de` showed against the dev server.

**If a check fails:**
- Check 1 fails: files are missing. Compare the folder with `dist/dgo-internal-platform/`.
- Checks 2–7 fail: try another browser, in case an old copy is cached.
- To roll back, upload the zip from B2, or re-upload the `config/config.local.js` from B2.

### Part C — The link corrections are in the flows (done)

The corrections this part used to apply by hand are carried by the identification release packages, and the tenant
runs them: `Single_Task_Assignment` (`SINGLE_ASSIGNMENT`) and `IP_Create__Task__for_received_Email_Endpoint`
(`EMAIL_RELATED_TASK`) read back as release 42 on 2026-10-20 (`docs/folio-Master-Flows-and-Endpoints/evidence/2026-10-20-flows-check.json`).
`DGSO INCOMING AI PROCESSING`, the third flow, was replaced on 2026-10-16 by
`Folio_Incoming_Correspondence_Scan_Processing_Flow`. The single-action values and designer pastes once kept under
`patches/deeplinks/` and `patches/deeplinks-flows/`, and the `deeplinks:patches`, `deeplinks:paste` and
`deeplinks:live` commands, were retired on 2026-10-21 (`registers/flow-retirement.json`): the branch keeps only the
latest version of every package. To check a flow against its package: `npm run flows:update -- --only <flow>`.

### Part D — Test from real emails

**Who:** the flow owner and one recipient who can receive the email. **Inputs you provide:** the recipient's address, as an assignee your flows accept.

What starts each flow isn't fully recorded in this branch. The only recorded trigger is a single assignment on 15 September 2026 (then served by `Deployed - Create Task`, now retired; `SINGLE_ASSIGNMENT` runs on `Single_Task_Assignment`), called from `https://activityweb.page.gd` with `"source":"DGO_FAST_Track_WEB_OPS"` and `"action":"singleassignment"` (the run record's `request` and `response_record`). For each flow:

1. Make the action that normally starts it happen, assigned to the test recipient. For `Single_Task_Assignment`, that's a single assignment from the front end recorded above.
2. In Power Automate, open the flow's **28-day run history** and confirm a run at the time of your test.
3. Open the email on a phone and on a computer, then hover over or long-press each button.

| Email | Button | The address must | Clicking must |
|---|---|---|---|
| Single-task assignment | Acknowledge Receipt | start `https://folio-gateway.rf.gd/index.html?item=` | open the Acknowledgment Queue on that task |
| Single-task assignment | Support Access | start `https://folio-gateway.rf.gd/support.html?` | open Assistant |
| Task from email | acknowledge link | start `https://folio-gateway.rf.gd/index.html?item=` | open the Acknowledgment Queue on that task |
| Incoming document | View Document | be `https://folio-gateway.rf.gd/?DGOPID=` followed by digits only | open Lookup with the document |

**Pass:** every row passes, and no address contains `taskack.page.gd`, `apps.powerapps.com`, `[`, `](` or `veggie`.

### Part E — Re-export and close the audit

**Who:** the flow owner, on Windows PowerShell 5.1. Then the maintainer commits.

```powershell
Install-Module Microsoft.PowerApps.PowerShell -Scope CurrentUser -AllowClobber
./scripts/export-power-automate-flows.ps1 -ListOnly
./scripts/export-power-automate-flows.ps1 -EnvironmentName Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1 -WorkflowId 3caf9458-8d95-4740-a01b-6803dad97d34,b6d92bae-591e-fa1e-52eb-b350cad988a7,ab1a3555-7fce-4bfe-a193-b8b84654b0a4
```

The script signs in as you, needs no admin role or app registration, and redacts `sig=` values. It writes to `docs/folio-Master-Flows-and-Endpoints/contracts/exported/` (script header).

```bash
node scripts/audit-deeplinks.mjs --from docs/folio-Master-Flows-and-Endpoints/contracts/exported --print
```

**Done when:** the first table row reads **0**, and "Broken right now" reads **0**.

**Record it:**
1. Replace the five matching files in `docs/folio-Master-Flows-and-Endpoints/contracts/deployed/` with the new exports.
2. Run `npm run deeplinks:audit` and `npm run deeplinks:patches`.
3. Run `npm run test:deeplinks`.
4. Commit.

### Part F — Platform owners

**Who:** the maintainer. **Inputs you provide:** the accountable owner of each of the eight platforms. **This branch doesn't name them**: every entry in `scripts/platforms.config.mjs` reads `owner: 'DGO Platform Engineering'`, which was set as a placeholder in commit `1a3bbb83`.

| Platform id | Name in the registry |
|---|---|
| `runtime` | Folio Workspace |
| `portal` | NITDA Document Portal |
| `console` | Folio Estate Console |
| `mailer` | DGO Correspondence Mailer |
| `workbench` | Folio Flow Workbench |
| `capsule` | Folio Vault |
| `centre` | Folio Central Administration Centre |
| `hub` | Platform Hub |

**Steps:**
1. Edit each `owner:` line in `scripts/platforms.config.mjs`.
2. Run:
   ```bash
   npm run platforms:data
   npm run platforms:readme
   npm run test:platforms && npm run test:hub
   ```
3. Commit.

### Part G — Links through sign-in, against the live code flows

**Who:** the maintainer. **When:** after part H switches authentication on.

The Workspace side is done and tested (§1.1 DL-1). To rehearse locally, run `DGO_DEV_AUTH=1 npm run dev` and sign in with `000000`.

**Against live:**
1. Open an acknowledgement link from part D while signed out.
2. Sign in with the emailed code.
3. Check that the same task is selected, and that **Acknowledge Receipt** succeeds.

These are the steps `tests/deeplinks-signin.spec.js` automates.

### Part H — Switch authentication on

**Who:** the maintainer and the flow owner. **Blocked by:** the server obligations in [`docs/architecture/AUTHENTICATION_CONTRACT.md`](../architecture/AUTHENTICATION_CONTRACT.md) §2, which the flows must meet. The switch itself is `auth.enabled: true`, via `window.DGO_CONFIG.auth.enabled` (`config/auth.config.js`). README item 2 records it as open (G-04).

Also part of H: give the other platforms production addresses (`prodUrl` in `scripts/platforms.config.mjs`) once they are hosted. No hosts for them are recorded in this branch.

---

## 3. What this branch cannot prove

| Claim | Why it can't be checked here | Where it gets checked |
|---|---|---|
| What is currently published at `https://folio-gateway.rf.gd/` | This environment's network policy blocks the host (`CONNECT tunnel failed, response 403`) | B4 |
| That the flows still match the definitions held | The adopted definitions come from exports and the 2026-10-01 captures | C0, then E |
| Which front-end action starts each flow | Only one trigger is recorded (§2, part D) | D2, run history |
| That the live `OTP_GENERATE`/`OTP_VERIFY` flows answer as the dev server does | They aren't reachable from here | G |
| The owner of each platform | Not recorded anywhere in this branch | F |

---

## 4. Keeping this page true

- `DEEPLINK_AUDIT.md` is generated, so never edit it by hand.
- `npm run test:deeplinks` fails if this page's counts ("**3 flows, 9 actions**", "**4 of those are broken**") stop matching the audit.
- If the Workspace's address changes, change `productionBase` in `config/deeplink.config.js` and `prodUrl` in `scripts/platforms.config.mjs`, then re-run `npm run deeplinks:audit` and `npm run deeplinks:patches`.
