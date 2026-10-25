# NITDA Folio Handbook

The consolidated documentation for NITDA Folio: what it is, how it is built, how its data and processes
work, how to take it live, and how to develop, administer and use it.

Every statement here was taken from the code, configuration and registers in this repository, or read from
the live tenant on the date given, on **2026-10-10** (register version 1.12.41), and brought up to the commissioning of **2026-10-19** and the live set read on **2026-10-20** by the [commissioning report](11-COMMISSIONING-REPORT.md). Where a fact comes from
a register or a generated record, the chapter links to it. **If this handbook and a register disagree, the
register wins**; tell the platform team so the handbook is corrected.

## Chapters

| # | Chapter | For | What it answers |
| --- | --- | --- | --- |
| 1 | [Go-live walkthrough](01-GO-LIVE-WALKTHROUGH.md) | Owner, platform team | Every step from today to a declared go-live: who, what, expected result, evidence, item closed |
| 2 | [Architecture](02-ARCHITECTURE.md) | Everyone technical | The shape of the system, sign-in, authorisation, configuration, limits |
| 3 | [Components](03-COMPONENTS.md) | Developers, administrators | Every screen, core service, surface, tool and flow, and what each does |
| 4 | [Data model](04-DATA-MODEL.md) | Developers, administrators | Every SharePoint list, its key columns, identifiers, roles, status vocabularies |
| 5 | [Processes](05-PROCESSES.md) | Everyone | The correspondence lifecycle end to end, sign-in, access, support, scheduled work |
| 6 | [Service contracts](06-SERVICE-CONTRACTS.md) | Developers | Request and reply formats, headers, timeouts, retries, status codes |
| 7 | [Developer guide](07-DEVELOPER-GUIDE.md) | Developers | Set up, run, test, change a screen or a flow, build and deliver, debug |
| 8 | [Administrator guide](08-ADMINISTRATOR-GUIDE.md) | Administrators | People and roles, settings, monitoring, deployment, security operations |
| 9 | [User guide](09-USER-GUIDE.md) | Staff | Signing in, finding your way, tasks by role, messages, getting help |
| 10 | [Troubleshooting](10-TROUBLESHOOTING.md) | Administrators, platform team | Diagnosing sign-in and data problems from evidence; known gaps at go-live |
| 11 | [Commissioning report](11-COMMISSIONING-REPORT.md) | Owner, everyone | What was commissioned on 2026-10-19, the proof for each part, and the declaration |

## Reading paths

| You are | Read |
| --- | --- |
| The owner preparing go-live | 1, then 10.6 |
| New to the platform team | 2, 3, 4, 7 |
| An administrator | 8, 9, 10 |
| A member of staff | 9 |

## How this handbook relates to the other records

| Record | Kind | Kept true by |
| --- | --- | --- |
| [`docs/deployment/PRODUCTION_READINESS_REGISTER.json`](../deployment/PRODUCTION_READINESS_REGISTER.json) | The register of record for open and closed work | `npm run outstanding`; register revisions |
| [`docs/PLATFORM.md`](../PLATFORM.md) | Generated estate description | `npm run platform` (see the stale points in chapter 10.6) |
| [`docs/deployment/RUNBOOK.md`](../deployment/RUNBOOK.md), [`PLAN.md`](../deployment/PLAN.md) | Cutover and standing procedures; the plan | hand-maintained, checked by tests |
| [`docs/process/`](../process/00-README.md) | The full process catalogue | `npm run process:docs` |
| [`docs/folio-Master-Flows-and-Endpoints/`](../folio-Master-Flows-and-Endpoints/README.md) | **Every** flow and endpoint record: definitions, packages, captures, evidence, registers | its generators and `npm run test:masterflows` |
| [`docs/reference/identification/`](../reference/identification/IDENTIFICATION_SYSTEM.md) | The identification system | `npm run test:node` |
| This handbook | The consolidated, readable view | maintained by hand; `npm run test:links` checks its links |

Flow and endpoint records are kept only in the master folder (owner rule, 2026-10-03). This handbook
describes and links to them; it does not copy them.
