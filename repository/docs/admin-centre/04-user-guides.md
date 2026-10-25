# Admin Centre user guides — version 2.1

**Status:** current, version 2.1. Its steps operate the Administration Centre only; estate commissioning steps live in [`docs/deployment/RUNBOOK.md`](../deployment/RUNBOOK.md).

Role-based operating procedures. The same guidance, condensed, is in the Centre under **Guide**. Supersedes [`source-1.0/04_…docx`](../governance/RETIRED_RECORDS.md).

## 1. Accessing the Centre

1. On the administration host, open **http://127.0.0.1:8844**.
2. **Access token** — paste your operator token, or (super administrators) the bootstrap token from `config/admin.token`. *Show* reveals it while you check it.
3. **Your accountable name** — required with the bootstrap token; it is recorded as the actor on everything you do. Operator tokens carry their own name and ignore this field.
4. Select **Unlock centre**. A refused token says *401 unauthorized*; twenty refusals in five minutes from one host pause sign-in for the rest of the window.
5. When you finish, select **Lock**. The Centre also locks itself after the configured idle time (15 minutes by default, with a one-minute warning), when your token stops working, and when the browser session ends.

## 2. Finding your way

| Area | View | Use |
|---|---|---|
| Monitor | **Overview** | Counts, platform health strip, *Needs attention*, the live daily checklist, recent activity |
| | **Portfolio** | One card per platform: state, trend, entry point, port, start command, owner, 24 h uptime and latency; *Probe now*, *Open*, *Endpoints*, *Set status*, *Raise alert* |
| | **Health** | Effective state per asset with trend, and the observation log; *Probe all*, *Record observation* |
| | **Flows** | Connect as the flow owner; every governed flow's live state, identity, newest run and 24 h results; per flow: run history, run steps, *Turn on/off*, *Resubmit*, *Cancel* |
| Operate | **Alerts** · **Incidents** · **Changes** | Registers with state chips, filters and search; select a row for its record sheet |
| Govern | **Flow & Endpoint Estate** | All 32 endpoints with data-quality findings; select a row for detail and actions |
| | **Configuration** | Every setting, its version and history; edit runtime settings |
| | **Audit & Evidence** | The hash-chained trail; *Verify chain*; export |
| | **Vault** | Vault reachability and which endpoint aliases it holds; *Verify* |
| Administer | **Access** | Operators and roles (super administrator only) |
| | **Operations** | Daily and weekly checklists, runtime metrics, backups, retention |
| | **Guide** | This guide in brief, messages, keyboard shortcuts |

The header search (press **/**) finds platforms, endpoints, alerts, incidents, changes and settings. **g** then a letter jumps to a view (o overview, p portfolio, h health, f flows, a alerts, i incidents, c changes, e estate, u audit, v vault, s configuration, x operations); **r** refreshes; **?** opens the guide; **Esc** closes a dialog or sheet. Every record has its own address (for example `#/changes/12`) that you can share with a colleague on the same host.

**Reading states.** *Healthy* means a current observation says so. *Stale* means the last observation is older than the freshness threshold. *Unknown* means nothing has been observed. Neither Stale nor Unknown is ever healthy, and *Registered* on an endpoint is inventory, not health.

**Feedback.** Every action asks for a reason and confirms with a message; a field that needs attention is marked and says why; anything that looks like a signed URL, token or password is refused before it is sent. If the Centre stops answering, a banner says so and the view keeps retrying.

## 3. Super administrator

1. After every start: Overview shows **6** platforms and **32** endpoints; the daily checklist is mostly green.
2. **Access › Issue operator token** for each person, with the least role they need. The token is shown once — deliver it through an approved channel. Keep the bootstrap token for administration.
3. Rotate tokens from Access (operators) or *Rotate bootstrap token*; record the rotation as a change.
4. **Configuration** — change runtime settings with a reason; restart-bound settings need a controlled change and a restart.
5. **Operations** — *Back up now* at least weekly; *Apply retention* if the monitor has been off; watch the weekly checklist.
6. Run `python3 scripts/verify.py` after any maintenance on the host.

## 4. Operations controller

**Watch health.**
1. Open **Health**. Filter to *Unavailable*, *Degraded*, *Stale* or *Unknown*.
2. *Probe all platforms* for a fresh reading. The monitor also probes every 5 minutes.
3. When a platform goes Unavailable or Degraded the monitor raises one alert and resolves it when the platform recovers — you do not need to raise a duplicate.

**Raise an alert** for anything the monitor cannot see: **Alerts › New alert** — severity, owner, affected asset, what is wrong, and the reason. Or by API:

```bash
curl -s -X POST http://127.0.0.1:8844/api/alerts -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"reason":"Endpoint health observation exceeded the authorised stale threshold of 900 seconds","severity":"High","asset":"Folio Workspace endpoint estate","message":"No current endpoint health observation is available","owner":"platform-administrator"}'
```

**Record an observation** from a flow run or a manual test: Health › *Record observation* (asset `portal:SUBMISSION`, state, latency, what you saw, and its source).

**Acknowledge** alerts you are working; **Escalate to incident** when impact needs coordination.

**Watch flow runs.** Open **Flows**. The *Newest run failed* tile and the nav badge count governed flows whose newest finished run failed; each raises one alert (source *flow-runs*) that the next successful run resolves. Select a flow for its run history and **Steps** to see which action failed and why. *Sync now* reads the latest runs on demand (operations controllers may sync; acting on a flow is for platform administrators).

## 5. Incident manager

1. Open the alert and select **Escalate to incident** — severity, owner and title are carried over; describe impact and scope.
2. Move it on: **Start investigating** → **Mark mitigated** → **Resolve** (a resolution note is required) → **Close** (a closing note is required). *Reassign* hands it over with a reason.
3. **Add note** as you go; the timeline interleaves notes with the audit events for the record.
4. Use one correlation ID for related API calls (`"correlationId": "INC-2026-09-29-01"`).
5. Keep containment details free of credentials — the Centre refuses them.

## 6. Change manager

1. **Changes › Submit change** — type, target, risk, the **checker** (a different accountable identity; you cannot name yourself), date, reason, rollback plan.
2. The checker opens the change and **Approves** or **Rejects** (with a reason). The maker's buttons are disabled with an explanation; the server enforces it too.
3. After the real-world action: **Mark implemented**, then **Verify** with the evidence, or **Record rollback** with what was reversed. A maker may **Withdraw** until implementation.
4. The Overview's *Needs attention* lists changes waiting on you as checker.

## 7. Auditor

1. **Audit & Evidence › Verify chain** — the result names the head hash, or the first event that does not recompute.
2. Filter by result (*Succeeded*, *Failed*, *Denied*) or search by actor, action, target, reason or correlation ID; page with *Older* / *Newer*.
3. Every alert, incident and change links to its audit events from its timeline, and the audit trail links back to the record.
4. **Export evidence bundle** (JSON: every table, the chain verification, who exported it — the export itself is audited) or **Export CSV** per register. Retain according to the configured retention (2555 days) and organisational controls.
5. On the host, `python3 scripts/verify.py` recomputes the chain independently of the server.

## 8. Platform administrator

1. **Flow & Endpoint Estate** — filter by scope, state, method or health, or search by key, flow, workflow ID, route or Vault alias. The findings at the top say how many endpoints are tied to exactly one tenant flow (and which still have two candidates, or have drifted from the register), whether every tied flow is Started, which keys share a flow, and where the register's method differs from what callers send. The *Tenant flow* and *Deployed* columns show each endpoint's flow and its state as last seen.
2. Select an endpoint: **Change state** (Registered, Commissioned, Suspended, Retired) and set its Vault alias; **Verify through Vault**; **Record observation**; **Propose change**.
3. **Reconcile with registers** after `docs/folio-Master-Flows-and-Endpoints/registers/endpoint-workflow-ids.json` or the mailer catalogue changes: new keys are added, changed ones updated, vanished ones marked *Retired*.
4. **Portfolio › Set status** to *Maintenance* before planned work so the monitor does not raise alerts; set it back afterwards.
5. **Vault** — shows which endpoint aliases Vault holds and any alias no endpoint maps to. Verification calls the flow's non-destructive `verify` operation; the signed URL never leaves Vault.
6. **Flows — connect as the flow owner.** *Connect as flow owner* shows a code; on any device open microsoft.com/devicelogin, enter it, and sign in with the account that owns the flows. No administrator is involved and nothing is registered in the tenant. The first sync then:
   - settles the endpoints that have two candidate flows, by comparing each candidate's live trigger workflow with the register;
   - fills in the mailer flows' trigger workflow ids and routes;
   - marks each tie *verified*, or *drift* where the register and the tenant disagree — treat drift as a finding and raise a change to correct the register;
   - lists anything *not visible to this account*.
7. **Act as the owner.** In a flow's sheet: **Turn off** before planned work on what it writes to, **Turn on** after; **Steps** on a run to see the failing action; **Resubmit** a failed run once its cause is fixed (it replays the original request, so for a sending flow it sends again — type RESUBMIT to confirm); **Cancel** a run that is stuck. Every action asks for a reason and is audited.
8. **Sign out** when you finish; the session is held in memory only and ends on a restart anyway.
9. Never paste a signed flow URL into the Centre.

## 9. Viewer and executive

- The Overview's six tiles give estate size, open risk, work awaiting decision and the size of the audit trail; each opens its register.
- *Needs attention* is the short list; the daily checklist shows how many controls pass right now.
- A zero alert count is not proof of health unless the health strip shows current Healthy observations.

## 10. Messages

| Message | Meaning and action |
|---|---|
| 401 unauthorized | The token is missing, wrong, rotated or disabled. Re-read it locally or ask a super administrator. |
| too many failed attempts | Twenty refused tokens from this host in five minutes. Wait. |
| reason required · actor required | Every change needs an accountable reason (and, with the bootstrap token, your name). |
| credential-like content refused | Remove the signed URL, token, password or secret from the text. |
| forbidden | Your role may not do this; the attempt is recorded as *Denied*. |
| maker and checker must differ · maker cannot decide · only the named checker may decide | Maker–checker is in force. |
| transition not allowed | The record's state cannot move there; the dialog lists what is allowed. |
| note required | Resolving, closing, rejecting, verifying or rolling back needs a note. |
| flow owner not signed in · flow owner session expired | Connect as the flow owner under Flows. |
| not an owner of this flow | The signed-in account does not own (or co-own) that flow; sign in with the owner. |
| not a governed flow | The Centre acts only on Folio flows: those behind a governed endpoint and those the flow catalogue names. |
| confirmation required | Resubmitting replays the original request; type RESUBMIT to confirm. |
| restart-bound setting | Change it in `config/settings.json` under a controlled change, then restart. |
| host not allowed | You reached the Centre by a name other than 127.0.0.1 or localhost. |
| No records | An empty register. For Health it means nothing has been observed — not that everything is healthy. |
| Connection lost banner | The server is not answering. Run `npm run start:centre` or `./scripts/start.sh` and check the process. |

## 11. Daily checklist (computed live in Overview and Operations)

Centre answering · 6 platforms · estate matches the registers · every platform currently healthy · no open Critical/High alerts · no incidents in progress · no changes awaiting decision · audit chain verifies · flow owner connected and runs synced · no governed flow failed its newest run · every endpoint tied to exactly one tenant flow. Lock the Centre when you finish.

## 12. Weekly checklist (Operations)

Backup in the last 7 days · token 0600 · database 0600 · retention ≥ seven years · loopback-only listener. Also: review operators and their last-seen times under Access, and overdue alerts, incidents and changes.

## 13. Never

- Expose the Centre beyond loopback without an approved hosting design.
- Share a token by email, chat, ticket or screenshot.
- Put signed trigger URLs, passwords or secrets in any record.
- Edit audit rows, or change the database with other tools while the server runs.
- Treat inventory registration as evidence of live health.
