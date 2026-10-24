# Endpoint provisioning — Internal operations platform

**Build** `f4e797added9eea9` · **posture** demo · **built** 2026-01-01T00:00:00.000Z

This package calls each Power Automate flow **directly**. There is no proxy, broker or
other intermediary in the request path, and none is required to deploy or run it. Every
URL below is delivered to the browser and is readable by anyone who can fetch a static
asset from this deployment, so **each flow must authenticate and authorise its own
callers, validate its own input, and return only what that caller is entitled to see.**
Nothing else in the request path can do it for them.

## What is wired

| Key | Transport | Pilot set | State | Flow |
|---|---|---|---|---|
| `FETCH_ALL` | json | yes | not provisioned | — |
| `DYNAMIC_ACTIONS` | json | yes | not provisioned | — |
| `USER_ADMIN` | json | — | not provisioned | — |
| `ACTIVITY_LIFECYCLE` | json | — | not provisioned | — |
| `SINGLE_ASSIGNMENT` | json | yes | not provisioned | — |
| `BULK_ASSIGNMENT` | json | yes | not provisioned | — |
| `FETCH_ACTIVITIES` | json | — | not provisioned | — |
| `REFERENCE_DATA` | json | — | not provisioned | — |
| `GET_DOCS` | json | — | not provisioned | — |
| `FETCH_EMAIL_ATTACHMENTS` | json | — | not provisioned | — |
| `EMAIL` | json | — | not provisioned | — |
| `EMAIL_RELATED_TASK` | json | — | not provisioned | — |
| `AI_EMAIL_ANALYSIS` | json | — | not provisioned | — |
| `AI_DOC_ANALYSIS` | json | — | not provisioned | — |
| `AI_CHAT` | json | — | not provisioned | — |
| `OTP_GENERATE` | json | — | not provisioned | — |
| `OTP_VERIFY` | json | — | not provisioned | — |
| `SUBSIDIARY_ACTIONS` | json | — | not provisioned | — |
| `SCAN_INTAKE` | bytes | — | not provisioned | — |

Each wired key names the flow it reached and the reference document that establishes the
mapping in **`FLOW_CATALOGUE.json`**, which also carries **every URL in full, unredacted** —
this table redacts, because it travels.

## Not provisioned — 19

Each of these reports itself unconfigured at runtime rather than failing mid-action:

- `FETCH_ALL` — the register itself — officers see nothing without it
- `DYNAMIC_ACTIONS` — every governed write: register, triage, treat, approve, dispatch, close, archive
- `USER_ADMIN` — User Administration: add a person, change their role, disable them (IP_User_Admin_Endpoint, ITEM-25)
- `ACTIVITY_LIFECYCLE` — Activities: archive an activity, or route it to SIWES or NYSC (IP_Activity_Lifecycle_Endpoint, ITEM-25)
- `SINGLE_ASSIGNMENT` — assign one correspondence to one officer
- `BULK_ASSIGNMENT` — assign many at once
- `FETCH_ACTIVITIES` — activity feed
- `REFERENCE_DATA` — lookups and reference data
- `GET_DOCS` — document retrieval
- `FETCH_EMAIL_ATTACHMENTS` — email attachment retrieval
- `EMAIL` — outward correspondence email
- `EMAIL_RELATED_TASK` — email-to-task assignment
- `AI_EMAIL_ANALYSIS` — AI analysis of inbound email
- `AI_DOC_ANALYSIS` — AI analysis of event documents
- `AI_CHAT` — AI chat
- `OTP_GENERATE` — one-time passcode issue
- `OTP_VERIFY` — one-time passcode check
- `SUBSIDIARY_ACTIONS` — multi-route subsidiary action flow
- `SCAN_INTAKE` — registry counter scan deposit (raw-bytes PUT, not a JSON contract)

## Flows available but not called

The documented estate contains 0 flows with complete trigger
URLs. 0 of them are reached
by no contract key on either platform — GET EMAILS, GET TASKS, BULK OPS GET DOCS and
"get correspondence (flat response)" among them — because the platform routes those reads
through `SUBSIDIARY_ACTIONS` and `FETCH_ALL` rather than calling dedicated flows.

They are **not** omitted. All of them are listed in `FLOW_CATALOGUE.json` with their
complete URLs and the documents that name them, so if a live probe shows a route is not
implemented on the shared flow, repointing a key at the dedicated flow is one line in a
values file and a rebuild.

## Flow routes reached from this package

One URL can carry several routes: the flow switches on `action`, so provisioning a URL
commissions every obligation listed against it. A flow implementing only the first of them
fails at a desk, not at the gate.

- `DYNAMIC_ACTIONS` — `dynamicGlobalAction`, `dispatchOutbound`, `archiveReference`, `transitionStatus`, `logAuditEvent`
- `SUBSIDIARY_ACTIONS` — `INIT`, `REFRESH_EMAILS`, `LOAD_EMAIL_DETAILS`, `AI_ANALYSE_EMAIL`, `CREATE_TASK`, `UPDATE_TASK`, `LOAD_EVENT_INFO`, `AI_CHAT`, `TRACK`, `ACKNOWLEDGE`, `GET_ALL`, `GET_BOOTSTRAP`, `LISTDOCS`, `GETDOC`, `BULKASSIGN`, `CREATESUPPORTREQUEST`, `GETREFERENCES`, `LIST-ACTIVITIES`

## Rotation

Rotation is the only revocation. A signed trigger URL cannot be retired, only regenerated.

1. Regenerate the signature in Power Automate.
2. Rebuild: `npm run package -- --values <file> --posture demo`.
3. Redeploy. The build id changes, which is how this deployment is told apart from the one
   it replaces.

## Verify before deploying

```
npm run package:verify -- --verify <this directory>   # bytes match the manifest
npm run verify:endpoints                              # the flows answer, live
npm run commission                                    # readiness obligations
```
