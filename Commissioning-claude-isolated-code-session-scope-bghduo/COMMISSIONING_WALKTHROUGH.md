# Commissioning walkthrough — every required action, in order

> ## ⛔ DO NOT COMMISSION FROM THIS DOCUMENT
>
> **This is a historical audit, not the commissioning path.** It has the most obvious filename
> in the repository, which is why this banner is here: an operator who opens it and follows it
> will run `npm run recover` at step 3.1, and `recover` is **retired and exits 2** because it
> wires a superseded estate — a config that looks complete and answers 401 on every call.
>
> **The commissioning path is
> [`docs/deployment/CLEAR-THE-LAST-BLOCKER.md`](docs/deployment/CLEAR-THE-LAST-BLOCKER.md)**
> (on a phone: [`CLEAR-THE-LAST-BLOCKER-TERMUX.md`](docs/deployment/CLEAR-THE-LAST-BLOCKER-TERMUX.md)).
> That document is the only one that describes the current estate — 25 keys across 20 workflows,
> from `docs/reference/endpoint-register.json`.
>
> Everything below is retained for one reason: its standing credential-exposure finding is
> carried by no other branch. **Read it as evidence about a tree that no longer exists. Run
> nothing from it.**

> **Consolidation note, 5 September 2026.** This document audits a 679-file snapshot of
> `main` (`63d79ee`), reached through `dgoeaa/ecm_repo_clean`. It is kept because its standing
> credential finding is carried by no other branch. Its measurements are not measurements of the
> tree it now sits in: the consolidated tree tracks 1,110 files and runs 70 Node stages green.
> Read the exposure finding as standing and every count, file total and suite result as a
> reading of `main` at `63d79ee`. Its "55 signed trigger URLs" is one of those: the
> consolidated tree counts 43 across the same 28 files, because the counters were matching
> greedily and indexing one credential under several strings (README §1). The exposure did
> not shrink; the count was wrong. Branch of record: `claude/operational-parameters-audit-nieb71` (`e03fbc5`).

**Written 3 September 2026.** Steps marked **[VERIFIED]** were executed against a recovered
copy of the corpus and the observed output is quoted. Steps marked **[YOURS]** cannot be
executed from a repository session — they need your tenant, your infrastructure, or a decision
by a named person.

Environment used for the verified steps: Linux x86_64, Node v22.22.2, npm 10.9.7.

---

## Phase 0 · Where the code is — **the archive is not being restored**

`dgoeaa/ecm_repo_clean` holds only a two-byte stub. Commit `45b002d`, titled as a rename,
deleted the 6,756,295-byte export and committed a 1-line text file in its place. **By the
repository owner's decision of 3 September 2026 this is not being reversed: what is deleted
stays deleted.** Nothing in this document should be read as proposing otherwise.

Consequence: **no command in this walkthrough can be run from `ecm_repo_clean`.** It contains
no code. It never did — it was a container for an export snapshot.

**0.1** The platform's own documentation names the repository of record.
`PLATFORM_DOCUMENTATION.md` header: *"Repository `dgoeaa/Commissioning`"*. That repository is
present and reachable, and is where every command below is run:

```bash
git clone https://github.com/dgoeaa/Commissioning.git
cd Commissioning
```

**0.2** A clone is already a git work tree, so the failure mode described in Phase 2.4 does
not arise. It arises only when working from an unpacked archive.

> ### 🔴 0.3 — LIVE EXPOSURE. All 55 signatures are public right now.
>
> Verified 4 September 2026 by cloning and scanning every public repository on this account.
>
> `ECM_DOCS_DEV` was made private on 3 September. **That closed nothing.**
> `dgoeaa/Sytem_Production_Governance` is public and carries the **same 55 signatures**,
> byte-for-byte — the sorted, deduplicated signature sets of the two repositories hash
> identically (`sha256 5a97cee5af9581c4`). 1,108 files, with the production host
> `defaultca6a4b3f912349bcbcb927085ebbf1` present in 46 of them.
>
> | Repository | Visibility | Live signatures | Tenant host |
> |---|---|---|---|
> | **Sytem_Production_Governance** | **public** | **55** | 46 files |
> | **DGO_OPS** | **public** | **3** | present |
> | INTERNAL_PLATFORM | public | 0 | 0 |
> | BESPOKE_DSIGN_SYSTEM | public | 0 | 0 |
> | ECM_DOCS_DEV | private | 55 | — |
>
> `DGO_OPS` carries three more under `intelhub.page.gd/htdocs/` — `submit.html`,
> `support.html`, `track.html` — a deployed-site directory committed 2026-07-30, pointing at
> the same production environment.
>
> `INTERNAL_PLATFORM` is clean: its `sig=ROTATE_ME` values against `YOUR_ENV` are placeholders
> that the project's own `tests/check-secrets.mjs` is explicitly written to skip.
>
> **Two actions, in this order:**
>
> 1. Make `Sytem_Production_Governance` and `DGO_OPS` private. This stops new copies being
>    taken. It revokes nothing.
> 2. Rotate all 55 in Power Automate — `npm run rotation` produces the worklist: 55 signatures
>    resolving to **39 distinct flows**, 14 of them carrying two live signatures each.
>
> Rotation is not remediation of a closed window. The window is open, and has been since at
> least 30 July 2026 for `DGO_OPS`. Anyone can read all 55 today. Treat every one of the 39
> flows as having been callable by anyone for that entire period.
>
> Re-verify with the project's own pattern, per repository:
>
> ```bash
> git grep -hoE 'sig=[A-Za-z0-9_-]{20,}' -- . | grep -v ROTATE_ME | sort -u | wc -l
> ```

## Phase 1 · Environment

**1.1** Node **≥ 22** is required. Not 20 — `linkinator` pulls `undici@8`, which declares
`node: >=22.19.0`; npm installs it anyway with only an `EBADENGINE` warning and the link
check then dies with `TypeError: webidl.util.markAsUncloneable is not a function`, an error
naming neither the package nor the constraint.

```bash
node --version    # must be v22 or higher
```

**1.2** Choose where to run it:

| Target | Works | Notes |
|---|---|---|
| Codespace | Best supported | `.devcontainer` pins `javascript-node:22`, runs `npm install && npm run setup`, forwards 8080 |
| Any Linux/macOS with Node 22 | Yes | What the verified steps below used |
| **Termux on Android** | **Partly** | `commission`, `start`, `recover`, `verify:endpoints` are pure Node and work. `test:smoke` does **not** — Playwright ships no Android browser. The two `.ps1` SharePoint scripts need PowerShell |
| CI | Yes | `.github/workflows/ci.yml`, Node 22 |

The delivered platform needs **no Node at all** — it is static files. Node is the tooling
floor, not the product's.

---

## Phase 2 · Install and prove the tree

**2.1** Install:

```bash
npm install
```

**[VERIFIED]** `added 98 packages in 5s`, exit 0. Zero runtime dependencies; the four
devDependencies are `@playwright/test`, `http-server`, `linkinator`, `puppeteer-core`.

**2.2** Scaffold config in demo mode — supply no values:

```bash
npm run setup
```

**[VERIFIED]** Writes `config/config.local.js` and `document-portal/config.local.js`, both
empty, and reports:

> `0/18 endpoints wired` · `0/6 endpoints wired` · *"The platform will boot and run in DEMO
> MODE — nothing is transmitted. That is the correct state for a fresh clone or a Codespace."*

**2.3** Run the gate for the first time:

```bash
npm run commission
```

**[VERIFIED]** Exit 1. Three blockers: internal runtime unwired (4 endpoints), public portal
unwired (2 endpoints), secret ratchet failing.

**2.4 — do not skip if you are working from an unpacked archive rather than a clone.** The
tree **must be a git work tree**. A `git clone` already satisfies this. Three tools shell out
to `git ls-files`:

| Tool | Outside a work tree |
|---|---|
| `npm run commission` | Degrades gracefully — reports *"rotation could not be verified — this is not a git work tree. This is not a pass."* |
| `tests/check-secrets.mjs` | Fails, and the gate reports it as a **blocker** that looks like a real leak but is not |
| `npm run recover` | **Crashes with a raw Node stack trace** — `Error: Command failed: git ls-files -z docs/reference/`. It does not fail gracefully |

**[VERIFIED]** After `git init && git add -A` in the unpacked tree, the secret ratchet
**passes** and `recover` runs cleanly. If you unzip the archive and run the commands without
initialising git, you will chase a phantom third blocker and a stack trace.

**2.5** Run the Node suites. All 28:

```bash
for t in imports refs governance encoding tokens breakpoints statuses hardening references \
         categories filenames portability packaging register normalizer flags entrypoints \
         triage assignment-messages visual architecture auth identity roles commissioning \
         verification devserver exposure; do npm run "test:$t"; done
```

**[VERIFIED]** 26 pass outright. The two that fail do so **only as artefacts of running the
sequence above**, and both pass on a clean tree:

- `test:devserver` — *"config/config.local.js exists on disk — something is writing config
  into the checkout."* That file is what step 2.2 just created. The suite asserts the dev
  server never writes config into the checkout.
- `test:visual` — *"docs/visual/platform-data.js is stale."* All five differing lines are
  environmental: three are git metadata (`commit`, `branch`, `commitDate` → `unknown` in a
  repo with no commits) and two are a portal file count of 42 instead of 41, the extra file
  being the `document-portal/config.local.js` step 2.2 created. **Do not run `npm run visual`
  to "fix" this** — on a real clone with commits it already passes, and regenerating will
  commit your local git metadata into the dataset.

---

## Phase 3 · Wiring — read the warning before you run it

> **`npm run recover` is retired and exits 2.** Everything in this phase is a record of what it
> did when it worked, against an estate that has since been replaced — all 25 keys now point at
> different workflows, so the config it built would look complete and answer 401 on every call.
> **Do not run any command in this phase.** The current wiring path is
> [`docs/deployment/CLEAR-THE-LAST-BLOCKER.md`](docs/deployment/CLEAR-THE-LAST-BLOCKER.md), which
> wires all 25 keys, not 22 of 24.

**3.1** `npm run recover` wired 22 of the 24 endpoints from the documented estate — retired, do
not run:

```
npm run recover      # retired: exits 2
```

**[VERIFIED]** Exit 0. `17/18` internal, `5/6` portal. Two cannot be wired because no flow for
them exists anywhere in the corpus:

- `SCAN_INTAKE` — no flow accepts a raw-bytes PUT with `X-DGO-Filename` / `X-DGO-Size` /
  `X-DGO-Sha256`. Registry Scan Intake reports itself unconfigured, which is correct.
- `UPLOAD` — no ticket-redeeming flow exists. The legacy submission flow takes bytes inline
  as base64, which is the 4 MB ceiling the ticket design replaced. **It must be built, not
  rotated.**

`SUBMISSION` is wired with a recorded contract mismatch: the flow takes the file inline and
answers `{ trackingId, referenceId, … }`; the portal expects `{ referenceId, uploads: [ticket,
…] }`. It is wired so the difference is provable rather than assumed.

> ### ⚠ What `recover` actually connects you to
>
> The signatures it wires are the **55 published ones committed to this repository** — live
> bearer credentials for NITDA's production Power Automate environment.
>
> **[VERIFIED]** After `recover`, simply booting the app in the browser test suite generated
> **609 outbound connection attempts**, sixteen of them directly to
> `defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443`. They were
> denied only because an egress proxy blocked them. On an unrestricted network they would have
> reached the live tenant.
>
> After `recover`, *any* command that boots the app — including the test suite — talks to
> production. Run it only on a machine and network where you intend that.

**3.2** Re-gate:

```bash
npm run commission
```

**[VERIFIED]** Exit 1, but three blockers become **one**: `UPLOAD` unwired. Six checks now
pass, including the secret ratchet. Four warnings stand, two of which are *"17 endpoint(s)
wired to a PUBLISHED signature"* and *"5 endpoint(s) wired to a PUBLISHED signature"*.

**3.3** Serve it:

```bash
npm start        # http://localhost:8080
```

**[VERIFIED]** Both applications serve: `/index.html` → 200, title *DGO Digital Operations*;
`/document-portal/index.html` → 200, title *NITDA Intelligent Portal*. Unknown paths → 404.

**3.4** Browser suite — 150 tests. It manages its own server on 8080, so **stop any
`npm start` first** or the run collapses to 3 passed.

```bash
npm run test:smoke
```

On a sandbox or image whose Chromium does not match Playwright's pinned build, point it at
the installed browser rather than downloading one:

```bash
DGO_CHROME_PATH=/path/to/chrome DGO_CHROME_NO_SANDBOX=1 npx playwright test
```

**[NOT COMPLETED]** Deliberately abandoned in the verifying session once it became clear the
run was generating calls to the live tenant (see 3.1). Run it yourself only where that is
acceptable — ideally against a demo-mode config, or after the estate is rebuilt.

**3.5** Probe the endpoints:

```bash
npm run verify:endpoints
```

**[YOURS]** **Not executed.** This calls every wired flow. With `recover`'s configuration
those are NITDA's live production flows, and invoking a third party's government tenant is not
an action a repository session should take unprompted. Run it deliberately, from a network you
control, once you accept what it touches. Add `--include-writes` to exercise all 39 routes.

---

## Phase 4 · The tenant — **[YOURS]**, none of it closable in the repository

**4.1 Rotate all 55 published signatures.** They are committed here across 28 files and
resolve to **39 distinct flows**; 14 of those carry two live signatures each, so an older
trigger URL stays valid alongside the newer one. Deleting a file revokes nothing. Rewriting
history revokes nothing.

```bash
npm run rotation      # produces the exact worklist
```

Do this **after** live testing concludes, not before — minting a fresh estate before the
platform has been exercised means regenerating triggers again after each contract adjustment.

**4.2 Build the two missing flows.** `UPLOAD` (ticket-redeeming) and `SCAN_INTAKE`
(raw-bytes PUT). See `docs/deployment/FLOW-BUILD-PLAN.md`. Neither exists anywhere in the
corpus; there is nothing to rotate.

**4.3 Make each flow enforce its own callers.** This is gap **G-04**, and it is the one that
matters most. Because the browser calls each flow directly with no intermediary, every one of
these lives inside the individual flow and nowhere else:

- token validation
- role derivation from `DGO_UserDirectory` — never from the request body
- per-action authorisation
- rate limiting
- reference minting
- upload ticketing
- filename policy

Until these exist, **every control in the repository is advisory**. `npm run commission`
reports the server half as unverifiable in every posture, never as done.

**4.4 Fix the four critical contract failures** in `docs/reference/flow-contracts/REMEDIATION_PLAN.md`:

| # | Flow | Fault |
|---|---|---|
| 1 | `FETCH_ALL` | Trigger signature rejected (401). Regenerate and redeploy |
| 2 | `STATUS` | Anti-oracle contract not implemented — must answer a byte-identical 404 for unknown reference, wrong email, and expired/replayed proof |
| 3 | `OTP_GENERATE` / `VERIFY` | Response contract not implemented |
| 4 | `OTP_VERIFY` / `VERIFY_CONFIRM` | No proof is ever minted — no token, no claims |

#3 and #4 are one root cause across both apps: fixing the two OTP flows closes four rows.

**4.5 Provision SharePoint.** `scripts/setup-sharepoint.ps1` and
`scripts/setup-sharepoint-portal.ps1`. Requires PowerShell — this is the step Termux cannot do.

**4.6 Clear test records** from the `Correspondence` list before real correspondence arrives.
A reference sequence that has issued test numbers keeps issuing from there.

**4.7 Delete `~/dgo-values.txt`** when finished. It holds the signed flow URLs, and each one
is a bearer credential.

---

## Phase 5 · Decisions — **[YOURS]**, no command exists for any of these

Nineteen of the twenty-one operational parameters are blank. See
`OPERATIONAL_PARAMETERS_AUDIT.md` for the evidence behind each.

**5.1 Sign the instrument.** `docs/reference/business_requirements_functional_requirements_hybrid.txt`
§16 — six roles, twenty-four cells, every one empty. Business Owner, Product Owner, Technical
Lead, Architecture Reviewer, Security Reviewer, Delivery Lead.

**5.2 Approve the routing table.** `docs/deployment/MINIMAL-PILOT.md` §8 decides which desk
each of eleven correspondence kinds lands on. `npm run commission` reports it as unsigned on
every run. Confirm each row with whoever owns registry policy, then:

```bash
node tests/categories.test.mjs    # fails if any kind is left without a routing rule
```

Also confirm which kinds the public may choose — currently seven of the eleven.

**5.3 Decide the operational parameters** that have no repository answer: administrator and
intake targets, recurrence frequency and interval, retry ceiling and delays in minutes,
permanent-failure threshold, claim expiry, processor concurrency, deployment window, rollback
window, hypercare period and its exit condition.

Note when deciding retries: four different retry families already exist in the code — 5
(portal outbox), 3 (acknowledgement queue), 4 (SharePoint audit spec), and 1/0 per endpoint
(fetch policy) — governing four unrelated subsystems. **No delay anywhere is expressed in
minutes.** No permanent-failure alert exists at any threshold; the portal outbox reaches five
attempts and drops silently.

**5.4 Confirm the target environment.** The repository records
`Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1`, but only inside the corpus its own
`docs/README.md` classifies as *"Untrusted. Prefer the contract over the sample."* No
environment **display name** is recorded anywhere — both build documents use the placeholder
`ENVIRONMENTID`. Get both from the tenant.

**5.5 Address the data-protection finding.** R-01: personal data of ~785 individuals is in
scope, plus department heads' personal addresses. The repository being private closed the
exposure; live usage reopens the question under whichever enforcement posture you choose.
`docs/audits/REPOSITORY_AUDIT.md:209` says the assessment of notification duties is your data
protection officer's, not the repository's.

---

## Phase 6 · Go live — **[YOURS]**

**6.1** `npm run commission` exits 0 with no blockers.
**6.2** `npm run verify:endpoints -- --include-writes` returns a clean transcript across all 39 routes.
**6.3** `npm run test:smoke` passes **against the deployed hostname**, not localhost — deployment is where `config.local.js` presence differs.
**6.4** Rotate any signature exposed during testing, rebuild the packages, redeploy.
**6.5** Gate who may load the internal page. Nothing in the repository does this; it is your infrastructure's job.

---

## Summary of state

| | |
|---|---|
| Archive | ⛔ **not restored, by owner's decision** — work from `dgoeaa/ECM_DOCS_DEV` instead |
| Credential exposure | 🔴 **LIVE** — all 55 signatures public in `Sytem_Production_Governance`, 3 more in `DGO_OPS`. Privatising `ECM_DOCS_DEV` closed nothing |
| Rotation | 🔴 **first action, ahead of everything in this document** — 55 signatures, 39 flows |
| Toolchain installs | ✅ 98 packages, exit 0 |
| Node test suites | ✅ 26/28 clean; the 2 failures are artefacts of the setup sequence, not defects |
| Both apps serve | ✅ HTTP 200, correct titles |
| Endpoints wire | ✅ 22 of 24; 2 have no flow to wire to |
| Gate | ⛔ 1 blocker after wiring (`UPLOAD`), 4 warnings, 5 manual obligations |
| Live flow probe | ⏸ not run — calls a production government tenant |
| Tenant work | ❌ 7 items, none closable in this repository |
| Decisions | ❌ 19 parameters blank, sign-off instrument empty |
