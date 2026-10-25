# 11 · Commissioning report

| | |
| --- | --- |
| System | NITDA Folio: the Folio Workspace, the NITDA Document Portal, the DGO Correspondence Mailer, their Power Automate flows and the platform team's tools |
| Commissioned | 19 October 2026; live set read and built 20 October 2026 |
| Prepared for | Office of the Director-General/CEO, NITDA |
| Prepared by | Folio commissioning, for DGO Platform Engineering |

## 1. Purpose

This report records the commissioning of NITDA Folio: what was commissioned, how each part was verified, the
defects found and corrected, and the position at handover. Every statement cites the committed record that proves
it. Where a statement and a register disagree, the register prevails.

## 2. Declaration

Within the scope in section 3, NITDA Folio is production-ready, fully commissioned, and declared ready for live
operation.

| Basis | Position at handover | Section |
| --- | --- | --- |
| Readiness registers | **0 open, 122 closed**: 81 readiness items, 12 governance findings and 29 flow truth findings | 9 |
| Deployed applications | Browser suite against the deployed Workspace and Portal: **159 passed, 0 failed** | 6 |
| Power Automate flows | **43** Folio flows in the tenant, 42 running and 1 off by design; all **27** released packages running at release 41 | 7 |
| Notifications | **38 of 38** passed, each with its run and delivery record | 8 |
| Applications and tools | **3** applications and **6** tools verified; the **4** tool defects found were corrected | 5, 10 |
| Full check | `npm run test:node`, the repository's full gate, passes on the committed state | — |

Two actions remain with the owner after handover (section 13): uploading the Workspace build of 20 October 2026,
which also publishes the Mailer, and switching automated staff notifications on once the owner's own testing is
finished.

## 3. Scope

| In scope | Out of scope (owner direction, 19 October 2026) |
| --- | --- |
| The Folio Workspace and NITDA Document Portal builds, the DGO Correspondence Mailer, the Folio Power Automate flows and their packages, Flow Configuration, the SharePoint lists Folio uses, every notification, the platform team's tools, and the registers that record them | The licence of the account the flows run under, the web hosting, and the account's flow limit |

## 4. The system as commissioned

### 4.1 Applications

| Application | Used by | Address | Build at handover |
| --- | --- | --- | --- |
| Folio Workspace | Staff | https://folio-platform.page.gd/ | Build of 20 October 2026: 16 signed flow addresses, sign-in enforced, staff notices held. It replaces the build of 19 October 2026, from which it differs in three data files used by the administration screens and the added `mailer.html`. |
| NITDA Document Portal | The public | https://folio-portal.page.gd/ | Build of 19 October 2026: 7 signed flow addresses. Already deployed. |
| DGO Correspondence Mailer | DGO staff sending official letters | https://folio-platform.page.gd/mailer.html | Version 2.1.5: one file holding its 7 flow addresses, delivered inside the Workspace build of 20 October 2026 |

What each delivered build holds is recorded, as digests only, in the
[config build ledger](../folio-Master-Flows-and-Endpoints/registers/config-build-ledger.json). `npm run config:drift`
reports any address that has moved since; none had at handover.

### 4.2 Power Automate flows

| Group | Flows | Running |
| --- | --- | --- |
| Folio Workspace | 15 | 15 |
| Document Portal | 7 | 7 |
| Scheduled and event-driven | 6 | 5 |
| Correspondence Mailer | 7 | 7 |
| Governance flow registry | 8 | 8 |
| **Total** | **43** | **42** |

The one flow not running is the former library intake, `DGSO INCOMING AI PROCESSING`, replaced by the scan
processing flow and turned off by design on 16 October 2026. Every flow was read live from the tenant on
20 October 2026 ([final live set](../folio-Master-Flows-and-Endpoints/evidence/2026-10-20-final-live-set.json)).

### 4.3 The platform team's tools

The Folio Estate Console, the Folio Central Administration Centre, the Folio Flow Workbench, the Folio Vault, the
Platform Hub and the provisioning console. They are not published to a website: they hold or read the estate's
signed flow addresses, so they run on a platform-team computer, where those addresses are kept, by design. They are
handed over as one suite, the Central Administration Centre with the Folio Vault beside it: the Centre hosts the Estate
Console and the provisioning console, its Portfolio replaces the Platform Hub, and its Test a flow replaces the Flow
Workbench. The suite is ready to run in the Folio Administrator Toolkit.

## 5. Verification of each application and tool

| Application or tool | Where it runs | How it was verified |
| --- | --- | --- |
| Folio Workspace | folio-platform.page.gd | Browser suite against the deployed build, signed in (section 6); every governed flow live (sections 7 and 8) |
| NITDA Document Portal | folio-portal.page.gd | Browser suite against the deployed build, 17 passed (section 6); the Portal's flows and notices live (sections 7 and 8) |
| DGO Correspondence Mailer | folio-platform.page.gd/mailer.html | `npm run test:mailer`: 392 and 78 passed (flows, package, setup and the one-file build). Its seven flows were moved to the Workspace's address and each answered its health check live on 19 October 2026 ([record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-mailer-origin-move.json)). The browser check at its address follows the owner's upload. |
| Folio Estate Console | Opened from a file | Browser specification run from a file, 7 passed (section 6); opened from its local server with no error |
| Folio Central Administration Centre | A platform-team computer | Started and signed in: all 14 screens open with no error. Its installation check passed all of its checks: database integrity, an unbroken audit chain, and no credential stored. Browser specification, 3 passed. On 20 October 2026, extended to watch every Folio flow in the flow catalogue and run read-only against the tenant: all 43 flows watched, 33 of 33 endpoint identities verified, no flow out of its expected state ([record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-20-centre-flow-watch-live.json)). It probes only the tools on its own computer; the published sites are not probed. |
| Folio Flow Workbench | A platform-team computer, at http://127.0.0.1:8765/ | Started and driven with no error; its relay forwarded a request. One defect corrected (section 10). Its flow catalogue predates the current estate: of its 50 flows, 2 are live Folio flows. |
| Folio Vault | A platform-team computer | Run end to end against the tenant: a Mailer flow was registered after its live identity check, its address was never returned, and it was invoked through the Vault; the administration routes refused the invocation token. One defect corrected (section 10). Its own tests, 8 passed. |
| Platform Hub | A platform-team computer | Started: it lists all eight platforms and whether each is running, and reports one that is stopped |
| Provisioning console | Opened from a file | Opened: 102 packages, search works, no error |

On 19 October 2026 every tool was started as an administrator starts it, opened in a browser and used
([record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-tools-commissioning.json)). Each tool's own test
suite is part of the full check.

## 6. Tests against the deployed applications

The browser suite ran signed in against https://folio-platform.page.gd and https://folio-portal.page.gd
([record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-live-browser-suite-pagegd.json)): **159 passed,
0 failed**, and 19 not applicable to a deployment (demonstration sign-in paths and the Portal's local-only test
fixtures).

| Specification | Result | Specification | Result |
| --- | --- | --- | --- |
| smoke | 7 passed | containment | 18 passed |
| admin-centre | 3 passed | document-flags | 10 passed |
| admin-console | 7 passed | dual-spine | 9 passed |
| admin-suite | 12 passed | endpoint-console | 2 passed |
| in-app-notices | 4 passed | lookup-commits | 10 passed |
| audit-remediation | 29 passed | scan-intake | 8 passed |
| closure | 23 passed | portal | 17 passed |

The run found one defect on the deployment, corrected by release 41 (section 10).

## 7. Flows and packages

### 7.1 Releases applied during commissioning

| Release | Date | What it changed | Applied and read back |
| --- | --- | --- | --- |
| 38 | 19 Oct 2026 | Telemetry mail (RN-025), task reminders (RN-035) and the directorate view (ITEM-91): 8 flows | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-flows-apply.json) |
| 39 | 19 Oct 2026 | Links and images moved to folio-platform.page.gd and folio-portal.page.gd: 21 flows | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-flows-apply-2.json) |
| 40 | 19 Oct 2026 | The New E-Scan notice goes to dgs@nitda.gov.ng, as the owner set it in the designer: 1 flow | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-flows-apply-3.json) |
| 41 | 19 Oct 2026 | Digest, reminder and bulk-failure e-mail links go to `/acknowledge.html`: 2 flows | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-flows-apply-4.json) |

### 7.2 Packages

The packages are frozen at release 41 ([release register](../folio-Master-Flows-and-Endpoints/registers/identification-release.json)).
What the tenant runs is recorded by fingerprint in the
[paste ledger](../folio-Master-Flows-and-Endpoints/registers/identification-paste-ledger.json): all 27 packages are
running at their released version. The Mailer's seven flows are installed from their own import packages.

### 7.3 Flows without a run at their current version

- **Single_Task_Assignment** assigns a record to one officer. Its last run, at 01:30 UTC on 10 October 2026, created
  task TASK-2026-00002, updated the document and sent the assignment notice, whose acknowledgement link was opened on
  12 October 2026 (recorded with RN-009, section 8). The run is marked Failed only because its reply to the caller
  timed out: 2 of its 214 steps failed, the reply and the scope that holds it
  ([record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-20-centre-flow-watch-live.json)). That definition was
  replaced at 16:22 UTC the same day. The current package passes the offline flow simulator and is running in the
  tenant; it has not run since. Its first assignment after go-live is the first run of the current definition, and
  should be checked in the flow's run history.
- **AI_Document_Processing** runs only when AI analysis is switched on in the Workspace. It is switched off by
  decision (ITEM-88), so the flow is not called.
- **03, 05 and 07 - GOV** (record an execution, retire a flow, and the self-registration template) run on request
  and have not been needed.

### 7.4 The governance flow registry

`01 - GOV - Provision HTTP Flow Registry` had a defect that stopped every run before its report (section 10). It was
corrected and read back on 19 October 2026, and the owner's run then validated its 7 lists, 101 fields, 7 unique
keys, 12 seed rows and 7 views with 0 errors
([record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-rn027-rn028-runs.json)).

## 8. Notifications

**All 38 notifications Folio sends have passed**, each with its run and, where it sends mail, its Portal Outbox
Receipts row ([results](../folio-Master-Flows-and-Endpoints/deployment/notification-instrument/tenant-execution/evidence/notification-test-results.json)).
The [notification matrix](../../config/notification-matrix.config.js) describes each one. SMS (RN-033) was withdrawn
by the owner and is not part of Folio.

The last to pass, on 19 October 2026:

| Notification | How it was proven | Record |
| --- | --- | --- |
| RN-020 comment notice, RN-022 Email dispatch | Sent from the live Workspace | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-rn020-rn022-live.json) |
| RN-023, RN-030, RN-031, RN-032 in-app notices | Shown on the live Workspace | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-live-browser-suite-pagegd.json) |
| RN-027 abandoned message reported | One sweep run: a message that failed three times was marked abandoned and reported | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-rn027-rn028-runs.json) |
| RN-028 provisioning report | The owner's run of the governance registry flow | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-rn027-rn028-runs.json) |

## 9. Readiness registers

Every item is RESOLVED, ACCEPTED or DISCHARGED_UNTRACKABLE, each with the evidence it cites
([readiness register](../deployment/PRODUCTION_READINESS_REGISTER.json); `npm run outstanding` totals all three
registers). The last to close:

| Item | Closed | Record |
| --- | --- | --- |
| ITEM-91 A director receives their directorate's tasks | 19 Oct 2026 | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-release-38-proofs.json) |
| MANUAL-2 Test records cleared | 19 Oct 2026 | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-test-record-cleanup-3.json) |
| MANUAL-3 Browser suite against the deployed build | 19 Oct 2026 | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-live-browser-suite-pagegd.json) |

CFG-1 and CFG-2, the deployed `config.local.js` files, are DISCHARGED_UNTRACKABLE: the owner holds them outside the
repository by design. They are closed.

## 10. Defects found during commissioning and corrected

The final commissioning runs found four defects, and the handover work two more. Each was corrected and the correction
verified. Defects found earlier are recorded with the register items they closed.

| Defect | Found by | Correction | Record |
| --- | --- | --- | --- |
| A first visit through the link in a digest, reminder or bulk-failure e-mail opened the Command Center, not the acknowledgment queue: the host's browser check drops the `#/` route | Browser suite against the deployment | Release 41: the links go to `/acknowledge.html`, which opens the acknowledgment queue | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-flows-apply-4.json) |
| `01 - GOV - Provision HTTP Flow Registry` stopped before its report: a filter returned text instead of true or false | The owner's run | Filter expression corrected and read back; the owner's next run passed | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-rn027-rn028-runs.json) |
| The Flow Workbench opened at `localhost`, where its relay refuses every call | Tools commissioning | It now opens at `127.0.0.1` | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-tools-commissioning.json) |
| The Folio Vault refused the Mailer flows' contract version (`dgo-mail/2.0`) | Tools commissioning | Contract versions are checked by their own rule; the Mailer flows register | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-tools-commissioning.json) |
| The Administration Centre watched only the flows in the flow owner's own list; that list leaves out the bulk assignment flow, so it was not watched | The Centre run live, 20 Oct 2026 | Each Folio flow the list leaves out is read by its id; all 43 are watched | [Record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-20-centre-flow-watch-live.json) |
| The first issue of the Administrator Toolkit turned off the Centre's health monitor, which also runs its scheduled flow sync | Review of the toolkit, 20 Oct 2026 | The monitor stays on; the toolkit names the tools that run on the computer, and only those are probed | The Administrator Toolkit of 20 Oct 2026, second issue |

## 11. Security

- The deployed Workspace enforces sign-in. Roles come from the verified sign-in, and every governed flow checks the
  session proof itself. Calls without a proof were refused throughout the commissioning runs.
- Power Automate's gateway allows any calling page for HTTP flows, whatever a flow sets, so access is decided by
  sign-in (the Workspace's session proof, the Mailer's operator sign-in), not by the calling page's address.
- No signed address, sign-in code or session proof is in the repository. The build ledger keeps digests only, and the
  build files are handed over privately in the Deployment Kit.

## 12. Test records removed

With the owner's approval, the commissioning test records were removed: Portal records NITDA-2026-00001 to 00018, and
Portal Support Cases items 1 to 87 and 92
([first pass](../folio-Master-Flows-and-Endpoints/evidence/2026-10-18-test-record-cleanup.json),
[second pass](../folio-Master-Flows-and-Endpoints/evidence/2026-10-18-test-record-cleanup-2.json),
[third pass](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-test-record-cleanup-3.json)). Production numbering
continues at NITDA-2026-00021 and TASK-2026-00006. Portal Outbox Receipts, the delivery audit trail, is kept.

## 13. Actions for the owner after handover

1. **Upload the Workspace build** of 20 October 2026 to folio-platform.page.gd, as the Deployment Kit's instructions
   describe. This brings the site to the commissioned build and publishes the Correspondence Mailer.
2. **Switch staff notifications on** when your testing is finished. By the owner's instruction of 19 October 2026, no
   automated notice reaches staff yet: each goes to the registry mailbox, marked for the officer it is meant for
   ([record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-staff-notice-hold.json)). Notices to citizens
   are not held. To switch staff notices on:
   1. In `config/notification-delivery.config.js`, set `StaffNoticeDelivery.recipients` to `'staff'`, rebuild with
      `npm run config:rebuild`, and upload the Workspace build.
   2. In Flow Configuration, set `NOTIFY_SWEEP_RECIPIENTS` to `staff`.

## 14. Operating notes

- Every Workspace load reads the registry through FETCH_ALL. Under the test load of 18 and 19 October 2026, Power
  Automate held that flow back twice, and it recovered without intervention
  ([record](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-flow-throttling-incident.json)). If the Workspace
  loads slowly, that record says what to look at.
- After go-live, check the run history of Single_Task_Assignment after its first assignment (section 7.3).
- The Administration Centre, connected as the flow owner, watches every Folio flow and raises an alert for a failed
  run or a flow out of its expected state. It runs from the Administrator Toolkit on a platform-team computer.
- Live browser runs read FETCH_ALL at most once per run and refuse every other flow call, so they leave no record.

## 15. Related documents

| Need | Where |
| --- | --- |
| The complete documentation | The [Folio Handbook](README.md): architecture, components, data model, processes, service contracts, the developer, administrator and user guides, troubleshooting, and this report |
| Every item, open or closed | The [readiness register](../deployment/PRODUCTION_READINESS_REGISTER.json); `npm run outstanding` |
| The commissioning steps and checks | The [runbook](../deployment/RUNBOOK.md); `npm run commission` |
| Every flow, endpoint, package and record | [The master flows folder](../folio-Master-Flows-and-Endpoints/README.md) |
| Every e-mail Folio sends | [The e-mail catalogue](../folio-Master-Flows-and-Endpoints/email-catalogue/README.md) |
