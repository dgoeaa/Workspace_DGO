# Source-only closure register

Review date: **2026-10-25**. Release decision: **NO-GO**.

That line records the prior review's position, not a new decision by the upload
reconciliation. The addendum in the [inventory](offline-remediation-inventory.txt)
examines the supplied package at `b60f9e0e177d092279f87c6f79be2e2a78ef1a8b`
against canonical source. Package claims and verified observations are separated;
the classification label is not evidence of credential exposure.

This register assigns accountable **roles**, not confirmed individual assignees or
approvals. The owner must nominate people and independent reviewers. OPEN means
work/evidence remains; BLOCKED means a prerequisite is unavailable; VERIFIED means
only the stated source observation was reproduced. No human/external item is
closed by this PR. Historical `approved` labels are not current approval.

Paths in the [offline inventory](offline-remediation-inventory.txt) are relative
to `Repo_root/` unless stated otherwise. That inventory records every inherited
hygiene group, all 20 large-file entries and all 56 unresolved reference
occurrences. It is **not** the missing governance evidence register.

For every row, the private-evidence locator is **`<private-evidence-locator: pending>`**,
with no actual location or credential recorded here. Reviewers below are required
roles, not claims that review occurred. Acceptance must identify a dated source
commit/artifact and scope; do not paste sensitive evidence into this repository.

| ID / blocker | Accountable role | Status | Precise acceptance evidence required | Required reviewer | Next action |
| --- | --- | --- | --- | --- | --- |
| E1 Exposure containment | Repository owner + incident lead | OPEN | Dated access/visibility decision; private inventory of affected snapshots, containers, caches, forks and artifacts; documented containment coverage and gaps | Independent security reviewer | Restrict distribution as appropriate; nominate incident owner |
| E2 History and rotation | Credential/tenant owner | OPEN | Private full-history/artifact investigation; revocation/rotation scope and dated rejection evidence for old capabilities, replacement-distribution controls; separately reviewed history-cleanup plan | Incident lead + independent security reviewer | Inventory privately and revoke/rotate through authorized process; do not probe credentials here |
| H1 Duplicate ratchet | Platform engineering | VERIFIED (source only) | Seven narrowed groups are strict subsets of inherited groups; all 16 current groups hash-identical; five focused regressions and hygiene duplicate assertion pass | Maintainer (review pending) | Review diff; do not add new allowances or restore redundant copies merely to match history |
| H2 Historical runtime ratchet | Platform architecture + governance and assurance | BLOCKED | Disposition for each of 36 absent harvest records: provenance-backed retention/recovery or explicit reviewed retirement, with no new runtime violations | Governance reviewer | Review supplied exact-path EXCLUDE rows for all 36 and decide canonical adoption/retention; do not run wholesale baseline writer |
| H3 Large-file governance | Platform operations + governance and assurance | BLOCKED | Disposition for each of 20 absent entries, verified byte sizes/hashes for any recovered files, authenticated approval provenance or reviewed retirement; no approval inferred from labels | Governance reviewer + security reviewer | Review 17 supplied exclusions and retained L03/L04/L19 with verified hashes/sizes; do not recover release ZIP or tenant evidence into source |
| H4 Evidence-register reconciliation | Governance and assurance | VERIFIED (inventory recovery only) | Genuine `Repo_root/docs/governance/evidence-register.yaml` recovered unchanged; single-file source/final hash pinned in `folio-recovery-manifest.json`; 317 external-storage inventory records, not approvals or recovered payloads | Governance reviewer (external assertions remain unverified) | Review any external record needed for acceptance separately; no repeat request for the supplied package and no current approval inferred from historical metadata |
| R1 Reference recovery | Documentation owners + platform architecture | OPEN (partial recovery) | Every inventory R01–R56 resolved by authorized pinned nonsecret recovery, demonstrably moved target, or reviewed stale-link retirement; hashes/license/screening for recovery; `test:refs` passes unchanged semantics | Documentation reviewer + security reviewer | R06 resolved; 55 occurrences/31 targets remain. Screen the other 25 retained candidates and their dependencies; owners decide only contested claims and the six excluded targets' retention/link dispositions |
| V1 Complete offline/browser checks | QA + platform engineering | OPEN | Reproducible zero-failure required offline gates and isolated browser results on identified commit/environment; individually record later tests after interrupted chains | Independent QA reviewer | Repeat after H/R disposition; current source gates still fail |
| V2 Security and exposure checks | Security lead | OPEN | Reviewed tracked/decoded/container and full-history findings; complete supported static/dependency checks with limitations and dispositions; no heuristic or skipped analysis treated as clearance | Independent security reviewer | Use the addendum's bounded upload scan separately from the whole-checkout audit (61 flagged files at ae0e468, not 61 verified credentials); review those flags in scope and record unperformed static analysis |
| T1 Tenant identity and authorization | Tenant administrator + service owner | OPEN | Owner-authorized server-side identity validation and record-level authorization, deny-by-default and cross-user/role/record negative tests, direct endpoint bypass/replay tests in isolated environment | Tenant security reviewer | Design and authorize tests separately; client-side/unit auth is not tenant evidence |
| S1 Isolated staging | Service owner + QA | OPEN | Explicit environment authorization, isolation proof, approved nonsecret inputs, dated acceptance and negative-test results | Owner-nominated acceptance reviewer | Establish authorized isolated staging separately; no wiring/deployment in this PR |
| P1 Packaging | Release maintainer | OPEN | Separately authorized artifact built from reviewed commit, secret/container inspection and hashes, manifest/license review; no private config or signed endpoints | Security + release reviewer | Wait for source/security gates; do not build release package here |
| B1 Rollback | Operations owner | OPEN | Named rollback owner, approved restoration procedure and isolated rehearsal evidence for exact candidate | Operations reviewer | Define and review rollback before any authorized deployment |
| O1 Dated owner decision | Named repository/service owner | OPEN | Explicit dated decision tied to exact reviewed source/artifact and all preceding evidence, scope and unresolved risks; no implied approval | Named owner + independent security reviewer | Keep NO-GO until separate, explicit decision; this PR cannot grant approval |

## Safe verification

Use the absolute-path commands and restrictions in the repository-root `README`.
`release:check` remains deliberately nonzero even if source checks eventually pass.
The source inventory and fresh results do not establish containment, tenant
acceptance, security clearance, deployment readiness or owner approval.

## Follow-up decision requests

`docs/folio-source-dispositions.json` records individual pending decisions for
all 36 runtime IDs, all 20 large-file IDs, and the six excluded reference targets
(nine occurrences). IDs resolve to exact paths in the existing inventory and
are checked against the supplied curation register by
`tests/test_folio_dispositions.py`. No retirement, retention approval, or link
replacement has been inferred. Ordinary screened documentation recovery remains
engineering work; owner decisions are reserved for contested historical claims
and dispositions. The external rows record the specific authorization/evidence
dependency, not a request to repeat the uploaded package.

The existing locked test dependencies were installed with
`npm ci --ignore-scripts --no-audit --no-fund`, with browser downloads disabled.
No tracked dependency files changed. The existing isolated browser suite passed
all three cases using `/usr/bin/chromium`; no remote-capable suite, setup,
packaging, tenant probe or deployment was run. Named-commit follow-up results
are recorded in the inventory after recovery verification.
