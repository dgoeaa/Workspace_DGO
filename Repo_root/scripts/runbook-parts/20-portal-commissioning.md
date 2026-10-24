# Portal tenant runbook — the console steps for portal and endpoint commissioning

> **This document carries the steps for portal and endpoint commissioning, and it is the only
> one that does.** Nine console scripts are run from here. Every other document in this
> repository may name a step and say that it lives here; none of them restates it. There is no
> precedence rule to apply, because there is nothing to have a conflict with.
>
> This part is reached through the one runbook that contains it, on a desktop or a phone
> alike; **Part 1 — the cutover** is the command-line path that gets you here. The open-item
> register is [`PLAN.md`](../../docs/deployment/PLAN.md).

**Every console artifact of this domain, in the order the runbook runs them**

Nothing in this table is typed: the artifacts come from `docs/reference/document-ownership.json`,
the section from the owning runbook's own headings, the verdict from
`PRODUCTION_READINESS_REGISTER.json`. The governance domain has had this view since
`governance/GOVERNANCE-STATUS.md`; the portal domain's equivalent was a join three files wide
that each reader had to make by hand. It stood in `IMPLEMENTATION_WALKTHROUGH.md` until
2026-09-24 and moved here, into the part that actually runs these artifacts, when the
deployment documents were consolidated. `tests/portal-script-status.test.mjs` holds it to all
three sources.

| Artifact | Runbook section | What the register says | Replaces |
|---|---|---|---|
| `harvest-flow-metadata.browser.js` | §0.6 — Capture what is inside each flow, for the audit record | no item names it | reading 39 flow definitions one designer tab at a time |
| `provision-sharepoint-fields.browser.js` | §2.2 — Provision columns | `ITEM-23` APPLIED_UNVERIFIED · `ITEM-39` RESOLVED | a PnP PowerShell session and its app registration |
| `harvest-trigger-urls.browser.js` | §3.2 — Get the worklist | no item names it | opening 20 flows and copying 25 URLs by hand |
| `acceptance-internal-endpoints.browser.js` | §6.3 — The browser acceptance run | no item names it | — |
| `diagnose-deployed-config.browser.js` | §7.4 — Confirm the deployed config is served | no item names it | — |
| `verify-deployed-package.browser.js` | §8.1 — Verify the deployed package is the package that was built | no item names it | — |
| `otp-cutover-tests.browser.js` | §9.0 — The OTP verify patch, and the cutover it belongs to | no item names it | — |
| `set-content-approval.browser.js` | §10 — Content approval — item 6.6 | `ITEM-41` RESOLVED | — |

**Read that third column exactly.** It is the status of the items an artifact serves — never
proof the artifact was run. `APPLIED_UNVERIFIED` is the register's own term for *executed
against the tenant, with a run record naming the evidence*, and deliberately not the same as
resolved. `no item names it` is what a verifier looks like: it closes no item, it tells you
whether one closed.

**Artifacts recorded rather than owned**

| Artifact | Instructed by | What the register says |
|---|---|---|
| `scripts/harvest-trigger-urls.bookmarklet.txt` | **Part 8 of this runbook** | `CFG-1` DISCHARGED_UNTRACKABLE · `CFG-2` DISCHARGED_UNTRACKABLE |

`npm run prove:tenant` is Node in this repository rather than a console artifact. It replaces
six separate manual round-trips, for ITEM-11, ITEM-12, ITEM-6, ITEM-44 and ITEM-56.

Regenerate the generated sets when the register changes:

```bash
npm run harvest:console      # rebuilds the console harvester from the endpoint register
npm run harvest:bookmarklet  # rebuilds the phone harvester from the same register
npm run console:apply        # rebuilds one console snippet per flow package
```

---

**Every remaining open item, in the order they must be done, with the exact command or click for
each.** Nothing here is deferred to a later document. Where a step needs a value only the tenant
can give, the step says how to obtain it rather than leaving a blank.

**Who runs this.** One person with: Power Automate maker access in environment
`Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1`, Site Owner on the four SharePoint sites listed in
§2.1, write access to both GitHub repositories, and a machine with Node 22 or newer (`package.json` sets `engines.node: ">=22"`) and `git`.

**How long.** §1 is ten minutes. §3 is the long one — 39 flows, roughly two minutes each, about
90 minutes with checks. §4–§9 are under an hour. Budget half a day, and do not split §3 across
days: a half-rotated estate has some flows on new URLs and some on old, and the configuration
file cannot describe both at once.

**The one rule.** Never paste a signed trigger URL into a ticket, an email, a chat message, or
any file except `config.local.js`. The `sig=` parameter *is* the authentication. Possession of
the URL alone authorises invoking the flow.

---

## Contents

| § | Phase | Closes |
|---|---|---|
| 1 | Repository lineage | the `main` divergence |
| 2 | SharePoint estate | prerequisite for everything |
| 3 | Rotate 39 trigger URLs | item 6.4, warning in `npm run commission` |
| 4 | Configure both surfaces | item 6.2 |
| 5 | Commissioning gate | blocks §6 until clear |
| 6 | First live invocation | **item 6.1** |
| 7 | Deploy both front ends | item 6.10 |
| 8 | Verify against the deployed host | item 6.9's runtime half |
| 9 | Trigger hardening | item 6.3 |
| 10 | Content approval | item 6.6 |
| 11 | Close-out | the brief's §6 list |

---

## §0 · Prerequisites — five steps that were filed under rationale

These five were the only executable steps in Part 2 of this runbook, a 1,925-line document of which
they were 3%. They are moved here because the steps for this domain belong in one place, and
Part 2 of this runbook is where you go for *why*, not *what to do*.

### 0.1 Grant repository write access and land the pending commit — retired

Retired 2026-10-05. The pending commit carried the `Portal_Verify` (86897b2f) export. `Portal_Verify`
is retired; `VERIFY` runs on `CG_Portal_Verification_Endpoint` (ba47f79b), whose definition is in
`docs/folio-Master-Flows-and-Endpoints/contracts/deployed/`
([`FLOW_ADOPTION.md`](../../docs/folio-Master-Flows-and-Endpoints/reference/FLOW_ADOPTION.md)). Nothing to do.

### 0.2 Prove tenant connectivity with a dry run

```powershell
cd <repository root>
.\scripts\update-flow-definition.ps1 `
    -FlowId "86897b2f-9770-4efa-8486-2642f24bb947" `
    -WhatIf
```

`docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/remediation/patched/README.md` names the environment-id argument and
authentication method your environment needs.

### 0.3 Seed the role catalogue — required before any internal flow works

```bash
npm run seed:roles      # generates role-catalogue-seed.json from config/rbac.config.js
npm run test:roles      # verify it
```

Load the generated rows into `DGO_RoleCatalogue` (`f675598b-271d-4200-8d75-2597aad4057f`, on
`DGO_ECM_GOVERNANCE`). Columns: `Title`, `RoleId`, `Persona`, `PermissionsJson`,
`AllowedRoutesJson`, `Active`, `Version`, `CanAssignRoles`, `CanManageSettings`, `CanViewAudit`.

**`Active` must be `1` for every row you intend to be live** — the gate filters on `Active eq 1`.

### 0.4 `CG_Writeback_Endpoint` — retired

Retired 2026-10-05. `WRITEBACK` runs on `CG_Portal_Writeback_Endpoint` (bde13d27), which exists in the
tenant and is the one flow the endpoint register names. `CG_Writeback_Endpoint` (21d4bfd3) is not to be
created or exported. Nothing to do.

### 0.5 Record the workflow ids

For each of the seven portal flows, open it in Power Automate, open the trigger, and read the
`workflows/<32-hex>/` segment of the HTTP POST URL. Record the pairs.

**Record the id only, never the whole URL.** The full URL carries a `sig=` parameter which is a
bearer credential — anyone holding it can invoke the endpoint. It must not reach the repository, a
ticket, an email or a chat message.

### 0.6 Capture what is inside each flow, for the audit record

§0.5 gets you the identity of each flow. This gets you its contents: the definition, the
properties, the owners and the trigger shape, as datasets an auditor can open in Excel. It is
evidence-gathering, not commissioning — nothing here changes a flow — so it can be run at any
point, and is worth running before §3 so there is a record of each flow as it was before its
trigger was rotated.

1. Sign in to `https://make.powerautomate.com` and open any flow you own, so the tab holds a
   token for the Flow service.
2. Devtools (F12) → Console. Paste `scripts/harvest-flow-metadata.browser.js` entire.
3. **Navigate inside the portal — do not press F5.** Go to My flows and open a flow, or switch
   between two flows. The script does not know which host serves this tenant and will not guess
   one; it reads the hostname off a request the portal itself makes, and navigating is what
   makes the portal make one. It then reports what it would collect and fetches nothing.

   A reload would destroy the script along with the rest of the page's JavaScript, before the
   request it is waiting for is ever made. The portal is a single-page app, so moving around
   inside it calls the API without reloading. If you do reload by accident, just paste again.
4. Type `flowHarvest.run()`. It reads every flow you can see — or set `CONFIG.FLOW_IDS` first for
   a specific list — and downloads one JSON bundle plus a CSV per dataset.

The definition and properties are split across numbered `PartNo` rows because a flow definition
is far longer than the 32,767 characters a spreadsheet cell holds. Sort by `FlowName` then
`PartNo` and concatenate to reassemble one exactly.

**It does not fetch trigger URLs, and you should leave it that way.** `CONFIG.INCLUDE_TRIGGER_URLS`
exists and defaults to `false`. Every other field it collects is ordinary metadata; a `sig=` value
is a bearer credential, and the moment that flag is `true` the downloaded files are credentials
sitting in your Downloads folder, which — unlike `~/dgo-values.txt` — nothing git-ignores. Any
signature already embedded inside a definition is redacted before it reaches a cell. If you need
the trigger URLs, §3.2 is the step that fetches them, into the one file built to hold them.

---

## §1 · Repository lineage — decide once, then never again

### 1.1 The situation, stated exactly

`dgoeaa/ecm_docs_dev` has two lineages that **share no common ancestor**. `git merge-base
origin/main HEAD` returns nothing.

| | `main` | `claude/system-remediation-gaps-ahpmsy` |
|---|---|---|
| tracked files | 679 | 1,052 |
| `docs/deployment/RUNBOOK.md` | absent | present |
| `scripts/verify-portal-wiring.mjs` | absent | present |
| `docs/folio-Master-Flows-and-Endpoints/contracts/deployed/` | absent | present |
| files the other lacks | 34 | 407 |

The working branch carries every remediation in this programme. `main` carries 34 files the
working branch has never had — most importantly `07-portal-provisioning.flow.json` and its
code-view twin, added by PR #24.

### 1.2 The decision, and it is not a coin toss

**Make the working branch the trunk, after porting `main`'s 34 unique files onto it.** The
working branch is a superset of the estate in every direction that matters — it holds the flow
exports, the verifiers, the wiring specification and the review brief, none of which exist on
`main`. Rebasing 62 commits of remediation onto `main` would mean re-deriving all of it against a
tree that cannot even run `npm run wiring`.

### 1.3 Do it

```bash
cd ~/ecm_docs_dev                       # your clone
git fetch origin
git checkout claude/system-remediation-gaps-ahpmsy
git pull --ff-only

# 1. List exactly what main has that this branch does not.
git ls-tree -r --name-only origin/main   | sort > /tmp/main.txt
git ls-tree -r --name-only HEAD          | sort > /tmp/ours.txt
comm -23 /tmp/main.txt /tmp/ours.txt > /tmp/port.txt
wc -l /tmp/port.txt                      # expect 34

# 2. Read the list before porting it. Anything you do not want, delete from /tmp/port.txt now.
cat /tmp/port.txt

# 3. Port them, preserving paths.
while IFS= read -r f; do
  mkdir -p "$(dirname "$f")"
  git show "origin/main:$f" > "$f"
done < /tmp/port.txt

# 4. The gate must still pass with them in.
npm test

git add -A
git commit -m "Port the 34 files unique to main onto the remediation lineage

main and this branch share no common ancestor. This branch is the superset in
every direction that matters, so it becomes the trunk; these 34 files are what
main held that it did not, chiefly 07-portal-provisioning.flow.json from PR #24."
git push -u origin claude/system-remediation-gaps-ahpmsy
```

### 1.4 Promote it to `main`

On GitHub → **Settings → Branches → Default branch** → switch to
`claude/system-remediation-gaps-ahpmsy` → **Update**. Then rename it:
**Branches → ⋯ → Rename** → `main-remediated`, or leave the name and archive the old `main`:

```bash
git push origin origin/main:refs/heads/main-archived-2026-09-04
```

Keep the old `main` as `main-archived-2026-09-04`. Deleting it discards PR #24's review history.

**Verify:** `git ls-tree -r --name-only origin/HEAD | wc -l` returns 1,086 (1,052 + 34).

### 1.5 `internal_platform` — already done

Default branch `claude/internal-platform-package-1x0107` is at `b483d48`. Archive removed,
`.gitignore` added, `package.json` + `tests/verify.mjs` + CI present, `npm test` 13/13.
**No action.** Confirm with:

```bash
git ls-tree -r --name-only origin/claude/internal-platform-package-1x0107 | grep -c '\.zip$'   # 0
```

---

## §2 · SharePoint estate

### 2.1 The four sites

| Site | Holds |
|---|---|
| `https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE` | `DGO_UserDirectory`, `DGO_RoleCatalogue`, `DGO_AuditLog`, `DGO_AccessScopes` |
| `https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre` | Portal Rate Limits, OTP Codes, Verification Proofs, Support Cases, Sequence Counters, Audit Events, Flow Telemetry, Outbox Receipts |
| `https://nitdanigeria.sharepoint.com/sites/NEDMS` | Portal Registry, Portal Attachments, Portal Status Timeline, Portal Upload Tickets, `NITDA_Central_Registry` (library) |
| `https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING` | Global Tracking Queue, DGO Digital Ops, Comments, Categories, Departments, Flow Configuration |

You need **Manage Lists** on all four. Site Owner suffices; tenant admin is not required.

### 2.2 Provision columns

PowerShell path (repeatable, needs PnP.PowerShell + an Entra app registration):

```powershell
./scripts/setup-sharepoint.ps1 -SiteUrl "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE" -WhatIf
./scripts/setup-sharepoint.ps1 -SiteUrl "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE"
```

Browser path (no install, uses the session you are already signed into) — **use this if PnP is
not set up**:

1. Sign in to `https://nitdanigeria.sharepoint.com`, open any page on any of the four sites.
2. F12 → Console.
3. Paste the whole of `scripts/provision-sharepoint-fields.browser.js`, press Enter.
4. It prints a **DRY RUN** table. Read it.
5. Edit `DRY_RUN = false` at the top of the pasted text, paste again.

It never creates a list and never re-types an existing column. All 14 lists already exist and are
addressed by GUID, so a renamed list still resolves.

### 2.3 Seed the role catalogue and directory

```bash
npm run seed:roles          # writes the six DGO_RoleCatalogue rows from config/rbac.config.js
```

Then populate `DGO_UserDirectory` by hand — one row per officer:

| Column | Value |
|---|---|
| `UserId` | any stable id, e.g. `u-1042` |
| `FullName` | officer's name |
| `Email` | their tenant sign-in address, **lower case** |
| `Directorate` / `Department` | free text |
| `Role` | one of the six catalogue values |
| `Status` | `active` — the flows filter on this exact string |
| `AccessScope` | JSON array, e.g. `["Registry"]`, or `["all"]` |

**This is not optional.** Every internal flow resolves its caller against this list. An officer
absent from it, or with `Status` anything but `active`, is refused 401 by every endpoint.

### 2.4 Preflight — retired

Retired 2026-10-06 with the DGO_* replacement packages whose lists it checked
([`registers/flow-retirement.json`](../../docs/folio-Master-Flows-and-Endpoints/registers/flow-retirement.json)). The
identification packages' tests check every column they write against the Phase 1 list check
(`npm run test:idphase3`, `npm run test:idphase4`).

---

## §3 · Rotate all 39 trigger URLs

### 3.1 Why this is first, and why all of it

43 distinct signatures across 28 tracked files are in git history. Anyone who has ever cloned this
repository holds every one. **Deleting a file revokes nothing.** Only regenerating the trigger in
Power Automate does.

**What is already behind you, and what is not.** `npm run rotation` reports **ROTATED** for that
published corpus, and ITEM-22 is RESOLVED on the same evidence: all 25 contract keys now resolve
to workflows other than the ones those signatures belong to, so none of them authenticates an
endpoint the platform calls. What the report states it cannot establish is that a flow *outside*
the 25 was regenerated — and the worklist below is 39 flows. So the 25 keys are not what this
section is for; the other flows are. Do not regenerate a contract key's trigger while §4 is
configuring it: that revokes the URL the configuration is about to carry.

Three of them are worse than the rest: they were inside `Platform frontend review.zip` at the root
of `internal_platform`, which *is* the deployed public site. They are removed from the branch now
but remain in history and in every clone. **Rotate those three first.** They are in
`_ds/nitda-design-system-…/_ds_bundle.js` — open the archive from git history to identify which
flows they belong to:

```bash
cd ~/internal_platform
git show 7ef5e89:"Platform frontend review.zip" > /tmp/pfr.zip
unzip -p /tmp/pfr.zip '_ds/*/_ds_bundle.js' | grep -oE 'workflows/[a-f0-9]{32}' | sort -u
```

### 3.2 Get the worklist

**Harvest the trigger URLs from the tenant rather than transcribing them.** Thirty-nine URLs
copied by hand is thirty-nine chances to transpose a character in a 43-character signature, and a
transposed signature fails as 401 with no indication of which character.

1. Sign in to `https://make.powerautomate.com` and open any flow you own.
2. Devtools (F12) → Console. Paste `scripts/harvest-trigger-urls.browser.js` entire.
3. **Now navigate inside the portal without reloading** — open My flows, or switch between two
   flows. The script reads the API address and the token off the portal's own traffic rather than
   guessing either, so it needs to see one call go past. **Do not press F5**: a reload destroys
   the script before the traffic it is waiting for happens. If you do reload, paste it again.
4. It prints the host and path it observed and the flows it will fetch, and changes nothing. Read
   that, then type `dgoHarvest.run()`.
5. Save the printed block as `~/dgo-values.txt`.

**There is a second route, and it needs no API call at all.** Opening a flow's details page makes
the portal fetch that flow's HTTP POST URL in order to display it — and that answer goes past the
same hook, so the URL is banked without the script asking anyone for anything. It is filed under
the workflow id the URL names and matched to a contract key only by that id, so opening the wrong
flow cannot produce a wrong credential.

That matters because the fast route can be refused outright: a session can be authorised for the
maker UI and refused at the management API, which is what this tenant produced — twenty-five 401s
beside a portal that was working perfectly well. When that happens, no amount of re-observing the
token helps. Run `dgoHarvest.pending()` for the list of flows to open, open each one, and run
`dgoHarvest.run()` again. Every key answered this way is verified exactly as a fetched one is.

`dgoHarvest.status()` says how many keys are already held and how many requests have gone past the
hook. `dgoHarvest.wipe()` drops the banked URLs — they are credentials, and they live on `window`
until the tab is closed.

**Every URL is checked before it is kept.** A flow is addressed by its *tenant flow id* and the
URL that comes back must name the *application workflow id* the register holds for that key —
two different identifiers, and neither is derivable from the other
(`docs/folio-Master-Flows-and-Endpoints/registers/flow-identity-crosswalk.json` is the mapping). A flow that answers for a
different workflow is discarded and named, never written. Seven keys have two candidate flows and
this is how the live one is chosen; two keys have none recorded, and are found by display name and
then verified the same way.

**If any key fails, nothing is printed.** A half-complete values file wires some endpoints and
leaves the rest answering 401 with no pattern to it. `serves workflow X, not Y` is not a
permissions problem — it is the wrong flow, and the register or the crosswalk has moved.

**If EVERY key answers 401, that is one token, not twenty-five permissions problems** — the
script says so rather than leaving you to read a list of 25. The token is read off portal
traffic and can go stale in a long-lived tab. Run `dgoHarvest.forget()`, click into a flow so
the portal calls its API again, then `dgoHarvest.run()`. If it persists, reload the portal, wait
until **My flows** lists, and paste the file again. **If it still persists after that, stop trying
to fix the token** — the session is authorised for the maker UI and refused at the management API,
and the second route above is the answer.

**A `sig=` value is the authentication.** Possession alone authorises invoking the flow. Never
paste a harvested URL into a ticket, an email, a chat message, or any file other than
`config.local.js`.

```bash
cd ~/ecm_docs_dev
npm run rotation
```

39 rows, one per workflow. Rotation is **per flow**, not per file — regenerating one trigger
invalidates every copy of its URL at once. Two rows carry a warning that two *different*
signatures exist on one flow: an older trigger URL is still live, and one regeneration revokes
both.

### 3.3 The loop, per flow

For each of the 39 workflow ids:

1. Power Automate → **My flows** → open the flow. Find it by id:
   `https://make.powerautomate.com/environments/Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1/flows/<workflowId>/details`
2. **Edit** → click the **When an HTTP request is received** trigger.
3. **⋯ → Settings → Regenerate** (or delete and re-add the trigger if your tenant does not offer
   regenerate; re-adding produces a new signature).
4. **Save**.
5. Copy the **HTTP POST URL** shown on the trigger card. Newer designer builds label the same
   field **HTTP URL**. The label is the field's name, not the method: `CG_Upload_Endpoint`
   restricts its trigger to **PUT** and still shows its URL there. Copy the whole string,
   query included — the `sig=` parameter is the credential, and a URL truncated before it is
   not a working endpoint.
6. Paste it into your values file (§4.1) against the right key **immediately** — do not batch,
   and do not keep a list of URLs anywhere else.

**Order matters at the end, not the start.** Do not revoke an old signature until §6 has
confirmed the new one answers. The sequence is: regenerate → configure → confirm → *then* the old
one is already dead, because regenerating replaces it.

### 3.4 Which flows carry which keys

16 flows serve 18 internal keys. Where two keys share a heading they are the **same flow**,
distinguished by the fixed `action` string in the body — rotating that flow rotates both keys.

**Reconciled against `docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json`, the tenant's own export.**
Every id below replaced a different one this repository previously recorded — all 25 keys moved.
Regenerate with `npm run reconcile`; never hand-edit.

| Workflow id | Flow | Serves |
|---|---|---|
| `c4c26f93ba1e4d7db5247536c30cdc11` | `IP_Get_Docs_Endpoint` | `FETCH_ACTIVITIES`, `GET_DOCS` |
| `d5e4b3da41e34819b3f953d2acbc2dd7` | `IP_Dynamic_Global_Actions_Endpoint` | `SUBSIDIARY_ACTIONS`, `DYNAMIC_ACTIONS` |
| `aa662769f13a4666bfadf3039cd8d247` | `FETCH_ALL` | `FETCH_ALL` |
| `885fad5ec91f460490e8c772d5d10cb8` | `IP_Reference_Data_Endpoint` | `REFERENCE_DATA` |
| `d2c773332f6f4fbf97ee4a5baa01f70b` | `IP_Retrieve_Email_Attachment_Endpoint` | `FETCH_EMAIL_ATTACHMENTS` |
| `72acfc6a694f414f9fe39c939ead7f08` | `Single_Task_Assignment` | `SINGLE_ASSIGNMENT` |
| `a705e453f922457c95ca19f32731e4d7` | `BULK OPS DATA RETRIEVAL HTTP` | `BULK_ASSIGNMENT` |
| `378b491ec39a4beca886ddec250e6961` | `IP_SEND_EMAIL` | `EMAIL` |
| `a942d230337c4ddfa9a386e92bbd048b` | `IP_Create_Email_Assignment_Endpoint` | `EMAIL_RELATED_TASK` |
| `3f018fea1031490fb73dff6a8d6341f2` | `AI_Document_Processing` | `AI_EMAIL_ANALYSIS`, `AI_DOC_ANALYSIS`, `AI_CHAT` |
| `b372d45e4b2a47d88b8e8b032da67fcd` | `IP_OTP_VERIFY` | `OTP_GENERATE`, `OTP_VERIFY` |
| `88401ce1f44148539c0da53c9491f8e6` | `IP_SCAN_INTAKE` | `SCAN_INTAKE` |

Portal, 7 keys, 7 flows:

| Flow | Key | Workflow id |
|---|---|---|
| `CG_Submission_Endpoint` | `SUBMISSION` | `1041ed37ce924e3c886d891f23e8142c` |
| `CG_Upload_Endpoint` | `UPLOAD` | `62fe121e5a95416bb91275e43dd0e37e` |
| `CG_Portal_Support_Endpoint` | `SUPPORT` | `052013da80724713a4285edee72ccb4a` |
| `CG_Portal_Verification_Endpoint` | `VERIFY` | `c0d58004c53348539d0d5aeaf49dcded` |
| `CG_Portal_Verification_Confirmation_Endpoint` | `VERIFY_CONFIRM` | `b270894ff410499ebbc090e32ffe899b` |
| `CG_Portal_Status_Check_Endpoint` | `STATUS` | `34dd28b4a5664927b66e581c74a0ab94` |
| `CG_Portal_Writeback_Endpoint` | `WRITEBACK` | `abf3a3ca53e64ba58c9ce5933e4e97e3` |

Every id above is a 32-hex trigger workflow id from the tenant's register — the previous
"internal name (dashed)" ids this document carried, and the note that SUBMISSION, SUPPORT and
UPLOAD had never been captured, are both superseded. All seven are now on record.

### 3.5 Also rotate the API keys

Any AI-provider key used by `AI_CHAT`, `AI_EMAIL_ANALYSIS`, `AI_DOC_ANALYSIS` and
`Instant OpenRouter AI Chat`. These sit in the flows' own actions, not in this repository.
Regenerate at the provider, then update each flow's action.

---

## §4 · Configure both surfaces

### 4.0 The short path: two URLs, one blocker

> **If you want this spelled out command by command — which terminal, which folder, what each
> output should say, what to do when it doesn't — read **Part 1 — the cutover** of this
> runbook instead. It assumes no prior knowledge, covers exactly this section, and is written
> to be followed on a phone as readily as a desktop. The summary below assumes you have done
> this before.**

§3 rotates all 39 flows and is what production needs. It is not what the *current* blocker needs.
`npm run commission` today reports exactly one:

```
Public portal: 2 required endpoint(s) unwired
  Correspondence cannot flow end to end without: SUBMISSION, UPLOAD.
```

Both flows exist and both triggers are already correct. Nothing has to be built, and nothing has
to be regenerated to clear this. What is missing is only their URLs, which are credentials and are
therefore recorded nowhere in this repository — they are copied by hand, once.

| Key | Flow | Open it by id | Trigger method | Trigger auth |
|---|---|---|---|---|
| `SUBMISSION` | `CG_Submission_Endpoint` | `de9ef13b-ae4c-42b0-9afa-20e71a180759` | `POST` | `All` — anonymous |
| `UPLOAD` | `CG_Upload_Endpoint` | `df82e331-b800-4a8d-996e-d2b2ca846c77` | `PUT` | `All` — anonymous |

`All` is correct here and must not be "fixed" to `Tenant`. These are the two flows a member of
the public calls from the portal, with no tenant account; `Tenant` would refuse every real caller.
That also means each flow is the only thing standing between a stranger and your data, which is
what §5's posture choice is about.

**Per flow:**

1. Open
   `https://make.powerautomate.com/environments/Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1/flows/<id>/details`
   with the id from the table. Confirm the flow name matches before copying anything — an id
   pasted one character short opens a different flow, or none.
2. **Edit** → click the **When an HTTP request is received** trigger to expand it.
3. Copy the value of **HTTP POST URL** (newer designer builds label it **HTTP URL**; the label is
   the field's name, not the method — `CG_Upload_Endpoint` is a `PUT` and shows its URL there).
   Take the entire string including everything after `?`. The `sig=` parameter is the credential;
   a URL cut short of it is not an endpoint.
4. Paste it straight into `~/dgo-values.txt` (4.1). Do not stage it in a chat window, a ticket, an
   email or a note first — every one of those is a place the credential then lives permanently.
5. Leave the flow. **Do not** press Regenerate. Regenerating is §3's job; doing it here revokes the
   URL any currently deployed portal is using, for no gain, and you would have to come back and
   copy the new one anyway.

Then go to 4.1 for the file, 4.2 for the command, 4.3 to confirm. The whole of §3 is still owed
before real correspondence — 4.0 gets you a working pilot to test against, not a rotated estate.

### 4.1 Generate the values file

```bash
umask 077
npm run values:template ~/dgo-values.txt
```

It writes all 24 keys, each with its **complete trigger URL already filled in** from
`docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json` and ending at a bare `sig=`. You add the 43-character
signature and nothing else — the host, routing segment and workflow id are already reconciled
against the tenant, and retyping them can only introduce an error.

Per key, without opening an editor:

```bash
npm run values:sign -- ~/dgo-values.txt FETCH_ALL     # paste, Enter, Ctrl-D
```

It accepts a whole URL too and lifts the signature out. It refuses a short paste, an unknown key,
and a re-run over a key already signed (`--replace` overrides). Then:

```bash
npm run check:values -- ~/dgo-values.txt
```

Expected: `✅ 25 value(s), all with a complete 43-character signature.` It prints no URL, host or
signature, so its output is safe to paste anywhere.

**Never commit this file. Delete it when §6 passes.**

### 4.2 Generate both config files

```bash
npm run setup -- --values ~/dgo-values.txt --force
```

Writes `config/config.local.js` and `document-portal/config.local.js`. Both are git-ignored.

**`--force` is not optional here.** `setup` never overwrites an existing `config.local.js`
without it, and if you have ever run `npm run setup` in this tree, both
files already exist — so without `--force` every value you just pasted is discarded. `setup`
now refuses that combination outright: values supplied plus a file it may not write is
**exit 2** with the corrected command. Older revisions of this page omitted `--force` here, and
that command silently changed nothing while exiting 0.

**`--force` replaces the whole file, so the values file must be complete.** A key absent from
`~/dgo-values.txt` is written empty — it is not carried over from the previous file. That is why
§4.1 lists all 24 keys: after rotation the values file is the only source, and anything you leave
out is silently unwired. Check the counts in 4.3 rather than trusting the exit code.

**`--recover` is retired and refuses to run.** It read URLs out of this repository's reference
corpus. The rotation revoked every one of those signatures, and reconciliation against the
register showed the workflows behind them superseded — `npm run check:config` reported 17 of 17
recovered keys as "points at the WRONG FLOW". It produced a config that looked complete and
answered 401 on every call, which is worse than no config at all.

Nothing replaces it because nothing needs to: `npm run values:template` (4.1) writes all 24 keys,
so `--force` alone is correct and there is nothing left for a fallback to supply.

### 4.3 Check them before going further

```bash
npm run check:config            # internal
npm run check:config:portal     # portal
```

These catch an empty value, a placeholder left in, a non-HTTPS URL, a malformed signature, and —
importantly — a URL still carrying a **published** signature, i.e. one you did not actually
rotate. That last check is why §3 comes before §4.

Read the counts, not just the verdict. Expect `17/18` internal after 4.0 (`SCAN_INTAKE` is a new
flow with no URL yet) and `2/7` portal.

**`check:config:portal` will report four problems after 4.0, and that is correct.** `STATUS`,
`VERIFY`, `VERIFY_CONFIRM` and `SUPPORT` come back "empty — the platform cannot call this endpoint
at all", because they are. They are features — status lookup, the verification pair, the support
form — not the correspondence path, so §5 does not treat them as blockers. Each closes later with
one line in the values file and a re-run. What you must not see here is a problem against
`SUBMISSION` or `UPLOAD`; those two are the pilot set, and anything reported against them is the
blocker still standing.

---

## §5 · Commissioning gate

```bash
npm run commission -- --posture pilot
```

Expect **0 blockers** — the gate prints `No automated blocker for pilot usage.` Warnings and
manuals remain and are meant to; they are the published-signature warning, the posture warning,
and the four things only your tenant can do.

If it still reports "not configured", `config.local.js` did not write — re-run §4.2 and read its
output. If it still names `SUBMISSION` or `UPLOAD`, the values file did not reach the config:
check the key spelling, and check that 4.2's command carried `--force`.

The `pilot` posture is the honest one for this estate: authentication is inert, caller identity is
a client-asserted `userEmail` from `localStorage`, and RBAC is advisory. Editing one storage key
escalates a viewer to `systemAdmin`. That gate does not sit between the page and the flows.

**Do not run `--posture enforced` and expect it to clear.** It requires each flow to verify the
bearer proof itself, which is server-side work in Power Automate that this repository cannot do.

---

## §6 · First live invocation — this is item 6.1

**Nothing in this estate has ever been invoked.** Every claim about behaviour is derived from
reading definitions. This section is the only thing that changes that.

### 6.1 Read-only endpoints first

```bash
npm run verify:endpoints
```

Calls every configured read endpoint on both surfaces and reports status, latency, whether the
body parsed, and which top-level keys came back against the shape the contract expects.

Expected: `200` for each, with the contract's keys present. Anything else is a real finding —
record it, do not retry until it passes.

### 6.2 Writes, deliberately

```bash
npm run verify:endpoints -- --include-writes --json ~/endpoint-report.json
```

This creates real rows. Run it once, in a window where you can identify and remove what it
creates.

### 6.3 The browser acceptance run

The above calls from Node. The platform calls from a browser, with the exact envelope
`core/data-client.js` builds. Both matter.

1. `npm start` → open `http://localhost:8080`
2. F12 → Console
3. Paste `scripts/acceptance-internal-endpoints.browser.js`

It reads URLs from `window.DGO_CONFIG.endpoints`, so no signed URL passes through a file. It
reports endpoint **keys** and response shapes only, never a URL.

### 6.4 Exercise SCAN_INTAKE specifically

It is the newest flow and the only one that takes raw bytes.

1. `http://localhost:8080/#/scan-intake`
2. Deposit a small PDF.
3. Expect: a reference of the form `NITDA-2026-00001`, a link into
   `/sites/NEDMS/NITDA_Central_Registry`, and a correspondence record with `channel: 'Registry'`.
4. Confirm in SharePoint: the file is in the library named `<reference>-<filename>`, and a row
   exists in `DGO_AuditLog` with `Event = audit:scan-deposited`.

If it returns 401: the depositing officer is not an `active` row in `DGO_UserDirectory` (§2.3), or
the trigger is not `Tenant`-authenticated.

### 6.5 Exercise the portal end to end

1. `npm run serve:portal` → `http://localhost:8080`
2. Submit a correspondence with one attachment. Expect a `NITDA-` reference, the file in
   `/sites/NEDMS/Shared Documents/Portal Attachments`, and one row in the `Portal Attachments` list
   (a Generic List, not a library, so it cannot hold the file itself).
3. Track it by reference. Expect the public projection only.
4. Request a verification code; confirm the email arrives **with a code in it** — the estate has a
   recorded defect where `CG_Verification_Confirmation_Endpoint`'s `Send_Otp_Email` body was a
   literal empty `<div>`. If the mail is empty, that is the bug, and it is in the flow.
5. Write back with the proof. Expect a timeline row and, for `withdraw`, a status change.

### 6.6 Record what happened

```bash
cp ~/endpoint-report.json docs/folio-Master-Flows-and-Endpoints/deployment/verification/endpoint-verification-$(date +%Y-%m-%d).json
git add docs/folio-Master-Flows-and-Endpoints/deployment/verification/
git commit -m "First live endpoint verification run against the tenant"
```

**This is what closes item 6.1**, and only this. Not a further reading of definitions.

---

## §7 · Deploy both front ends — item 6.10

### 7.1 Build

```bash
npm run package
```

Writes `dist/dgo-internal-platform/` and `dist/dgo-document-portal/`, each with its
`config.local.js`, a `PACKAGE_MANIFEST.json`, a `DEPLOY.md` and a standalone endpoint checker.

```bash
npm run check:package
npm run check:package:portal
```

### 7.2 The internal platform

`dgoeaa/internal_platform` **is** the deployed site (`https://activityweb.page.gd`). Copy the
contents of `dist/dgo-internal-platform/` over the repository working tree, then:

```bash
cd ~/internal_platform
git checkout claude/internal-platform-package-1x0107
# copy files in, then:
npm test                      # must be 13/13 — it will refuse a committed signature
git status --porcelain | grep -i config.local && echo "STOP: config.local.js must not be tracked"
git add -A && git commit -m "Deploy build <date>" && git push
```

`config/config.local.js` is git-ignored by the `.gitignore` added in `b483d48`. **Verify it is not
staged before committing** — the command above does that. If it ever is, `npm test` fails on the
credential check.

### 7.3 The portal

Deploy `dist/dgo-document-portal/` to wherever the portal is hosted. It is static; any web server
serves it. `config.local.js` must sit beside `index.html`.

### 7.4 Confirm the deployed config is served

Item 6.10 exists because a live check returned an **empty endpoint set**. Confirm it is no longer
empty:

1. Open the deployed URL.
2. F12 → Console.
3. Paste `scripts/diagnose-deployed-config.browser.js`.

It reports which keys the deployed page actually resolves. Expect 18 internal / 7 portal, none
empty.

---

## §8 · Verify against the deployed host

```bash
DGO_BASE_URL=https://activityweb.page.gd npm run test:smoke
```

The suite covers boot, accessibility entry points, all 29 routes, themes, and the portal — 150
tests across 10 files. Run it against the deployed hostname, not just locally: deployment is
exactly where `config.local.js` presence differs, so a suite that only ever runs locally cannot
answer whether the deployed build boots.

`DGO_BASE_URL` also suppresses the local web server. Without it Playwright starts `npm run start`
and serves this working tree, which would make a green run say nothing about the host under test.

If Chromium is missing or its version does not match the pinned Playwright build:

```bash
DGO_CHROME_PATH=/path/to/chrome DGO_CHROME_NO_SANDBOX=1 npm run test:smoke
```

Both variables are read by `playwright.config.js`. Combine them freely.

### 8.1 Verify the deployed package is the package that was built

A green smoke suite says the host boots. It does not say the host is serving the bytes the
manifest hashes — a partial upload boots.

1. Open the deployed URL.
2. F12 → Console. Paste `scripts/verify-deployed-package.browser.js`. It **reads only**.
3. Every file should report `matches manifest`. Any row that does not is a byte the host is
   serving that the build did not produce; re-upload before continuing.

---

## §9 · Trigger hardening — item 6.3

`npm run triggerauth` states the current posture of all 27 keys. Four findings, each with a fix.

### 9.0 The OTP verify patch, and the cutover it belongs to

The patch is applied and closed (`ITEM-38` RESOLVED). The flow it patched, `Web - OTP Verify`
(3e201620), is retired with its console patch script: `IP_OTP_VERIFY` (4dbe6dde) carries the same
hardening and serves both `OTP_GENERATE` and `OTP_VERIFY`
([`FLOW_ADOPTION.md`](../../docs/folio-Master-Flows-and-Endpoints/reference/FLOW_ADOPTION.md)).
Nothing is to be patched here.

1. Sign in to `https://make.powerautomate.com` and open `IP_OTP_VERIFY`, so the tab holds a token
   for the Flow service.

Then, in that same console, **paste `scripts/otp-cutover-tests.browser.js`**. Set `A` and `B` at
the top to two different addresses you control before pasting the whole file. It exercises both
the request and the verify legs and reports each. A leg that does not report is a leg that did not
run — do not read silence as a pass.

The record of what changed and why was the fresh-build kit and the security patch for `Web - OTP Verify`. Both were
retired on 2026-10-21 with the flow they served (`registers/flow-retirement.json` gives the commit that still holds
them); `IP_OTP_VERIFY` (4dbe6dde) carries the same hardening. The steps are here.

### 9.1 Four endpoints answer every HTTP verb

`GET_DOCS`, `FETCH_EMAIL_ATTACHMENTS`, `AI_DOC_ANALYSIS`, `AI_CHAT` declare no method, so they
answer `GET`, `DELETE`, anything.

**Fix, per flow:** Edit → trigger → **⋯ → Settings → Method → POST** → Save.

### 9.2 Four declare no request schema

`AI_EMAIL_ANALYSIS`, `SCAN_INTAKE`, `STATUS`, `UPLOAD`.

`SCAN_INTAKE` and `UPLOAD` are **correct as they are** — their bodies are raw bytes, and a JSON
schema on a binary body would reject every valid call. Leave them.

For `AI_EMAIL_ANALYSIS` and `STATUS`, add the schema from the contract:
`docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/portal-data-contract.json` → the key's `request` array gives every
field and type.

### 9.3 Twenty-three declare a schema that still accepts unknown fields

A schema without `"additionalProperties": false` documents the expected body without constraining
it. **Do not read "has a request schema" as "validates its input" anywhere in this estate.**

**Fix, per flow:** Edit → trigger → **Use sample payload to generate schema** is not enough; open
the schema editor and add `"additionalProperties": false` at the top level.

Do this **after** §6 passes. Tightening a schema before you have seen a real request is how you
reject a field the client actually sends.

### 9.4 One key, one definition — resolved 2026-10-06

Seven keys once resolved to more than one definition. Each contract key now names exactly one adopted flow
([`registers/flow-adoption.json`](../../docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json)); every other
definition is retired and removed, recorded with its SHA-256 in
[`registers/flow-retirement.json`](../../docs/folio-Master-Flows-and-Endpoints/registers/flow-retirement.json).
`BULK_ASSIGNMENT_DIRECT` is retired as a key: bulk assignment is `BULK_ASSIGNMENT`. In the tenant, turn off each retired
flow the ledger lists. `npm run test:flowadoption` fails if a retired definition returns.

---

## §10 · Content approval — item 6.6

Content approval was on for the two largest lists, which meant every row the flows created was
invisible to readers while the write reported success — 14,882 hidden rows on one list, 12,079 on
the other. It is off for `DGO DIGITAL OPS`. It is still on for `Global Tracking Queue`, which four internal
flows write to, and the platform owner directed on 2026-10-03 that it be turned off (ITEM-41).

```bash
# In the browser console, on the NITDADGO-EAAACTIVITYTRACKING site:
```

Paste `scripts/set-content-approval.browser.js` once: it only reads, and prints the counts — keep
them. Then set `APPLY` to `true` at the top and paste it again. It **refuses to turn approval off unless it has
first counted every row**, including the hidden ones — a count it cannot take is reported as
unknown and the write is refused. That refusal is deliberate; do not work around it.

Expected: it reports the hidden-row count for `Global Tracking Queue`, then turns approval off.
Confirm afterwards that the previously hidden rows are visible to a non-approver account, and
commit the printed read-back (`EnableModeration: false`) as the ITEM-41 evidence.

---

## §11 · Close-out

Run all four, together, and record the output:

```bash
npm run keyimpl        # expect: 0 no flow, 0 not exported, 0 unreachable, 0 disclosure errors
npm run wiring         # expect: 58/58 operations, 7/7 endpoints
npm run commission -- --posture pilot   # expect: 0 blockers
npm test               # expect: all green
```

Then update the brief's §6 list. Each item and what closes it:

| Item | Closed by |
|---|---|
| 1 · never executed end to end | §6 — and *only* §6 |
| 2 · only 8 of 18 endpoints configured | §4 |
| 3 · trigger posture unverified | §9 |
| 4 · signed URLs pending rotation | §3 |
| 5 · secret scanner scope gap | already closed 2026-09-03 |
| 6 · content approval | §10 |
| 7 · portal endpoint mapping | already closed 2026-09-03 |
| 8 · unimplemented contract keys | already closed 2026-09-04 |
| 9 · front end has no tests/build | already closed 2026-09-03 |
| 10 · deployed platform serves no config | §7.4 |
| 11 · the sanctioned crossing | already withdrawn 2026-09-04 — was an artefact |

### 11.1 What this walkthrough does not make true

Completing every step above gets the estate **live, configured, verified against real responses,
and rotated**. It does not make it *secure* in the sense §5 of the brief asks about:

- Authentication remains inert. Caller identity is client-asserted. Any flow called directly with
  its URL answers whoever calls it.
- `SCAN_INTAKE` does not verify the SHA-256 it is sent. Power Automate cannot compute one over a
  request body. The digest is a custody aid, not an integrity check.
- The `Flow Configuration` read on the internal site is a declared, accepted crossing of the
  portal trust boundary (D16), not an absence of one.

Those are the independent reviewer's subject, and they are why §5 of the brief is written the way
it is. **Finishing this walkthrough is the precondition for that review, not a substitute for it.**
