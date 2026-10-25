# Admin Centre provisioning and configuration guide — version 2.1

**Status:** current, version 2.1. Its steps operate the Administration Centre only; estate commissioning steps live in [`docs/deployment/RUNBOOK.md`](../deployment/RUNBOOK.md).

Local provisioning with the actual values, and the precise Microsoft 365 boundary. Supersedes [`source-1.0/03_…docx`](../governance/RETIRED_RECORDS.md).

## 1. Outcome

A loopback Centre on port 8844 with a generated bootstrap token, a database holding **6 platforms** and **32 endpoint records** (18 internal, 7 portal, 7 mailer) read from the repository's registers — each with its tenant flow id and deployment state where the crosswalk and the owner's flow export record them — every setting persisted at version 1, one `system.provision` audit event, and `evidence/provisioning.json` recording the SHA-256 of each source register.

## 2. Values

The full table, with bounds and scope, is in [01-design.md §8](01-design.md#8-runtime-configuration). The identifiers are:

| Parameter | Value |
|---|---|
| Operational URL | http://127.0.0.1:8844 |
| Environment ID | Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1 |
| SharePoint connection ID | 3f1943c5955a4cb8b301e8f22f2b590d |
| Estate sources | `docs/folio-Master-Flows-and-Endpoints/registers/endpoint-workflow-ids.json`, `mailer/flows/flows.catalogue.json` |

## 3. Host prerequisites

- Python 3.9 or later with SQLite (standard on Linux, macOS and python.org Windows builds).
- A checkout of this repository (the estate is read from it; set `FOLIO_ADMIN_REPO` if the package is elsewhere).
- Port 8844 free on loopback. No pip, npm or internet access is needed to run it.

## 4. Provisioning procedure

**From the repository (recommended for workstations):**

```bash
npm run start:centre        # state in <tmp>/folio-admin-centre-<checkout>, created 0700
```

The launcher prints the token file path. With `npm run start:all` the Centre also receives the path of the Vault's bootstrap credentials, so its Vault view works with nothing copied.

**On a governed host:**

```bash
cd tools/admin-centre
export FOLIO_ADMIN_HOME=/srv/folio-admin        # owned by the service account, mode 0700
python3 scripts/verify.py --provision           # provisions on first run, then verifies → PASS
./scripts/start.sh                              # http://127.0.0.1:8844
```

Then, on the same host: open http://127.0.0.1:8844, paste the token from `$FOLIO_ADMIN_HOME/config/admin.token`, enter your accountable name, **Unlock centre**. Confirm the Overview shows 6 platforms and 32 endpoints, and that every view in the navigation loads.

A systemd unit, if wanted:

```ini
[Service]
User=folio-admin
Environment=FOLIO_ADMIN_HOME=/srv/folio-admin
WorkingDirectory=/opt/ECM_DOCS_DEV/tools/admin-centre
ExecStart=/opt/ECM_DOCS_DEV/tools/admin-centre/scripts/start.sh
Restart=on-failure
```

## 5. File permissions

The server enforces 0600 on the token, the database and each backup, and 0700 on the backup directory. The directory itself:

```bash
chmod 700 "$FOLIO_ADMIN_HOME"
```

`scripts/verify.py` and the weekly checklist both fail if the token or the database is not 0600.

## 6. Configuration

Runtime settings change in the **Configuration** view (super administrator) or by API, with a reason, and take effect immediately; each change adds a version and a history row:

```bash
TOKEN=$(cat "$FOLIO_ADMIN_HOME/config/admin.token")
curl -s -X PUT http://127.0.0.1:8844/api/configurations/staleAfterSeconds \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"actor":"portfolio-administrator","reason":"Tighten freshness to 10 minutes after the monitor interval change","value":600}'
```

Restart-bound settings (`bindHost`, `port`, `database`, `adminTokenFile`, `auditHashAlgorithm`, `systemName`, `version`) and the tenant identifiers change only by editing `config/settings.json` under a controlled change and restarting; the API answers 409. `retentionDays` cannot go below 2555.

## 7. Provisioning validation

`python3 scripts/verify.py` checks, and prints PASS only if all hold:

| Check | Required |
|---|---|
| Files | server, settings, client, brand package, scripts |
| Settings | the 13 documented keys; loopback; sha256; retention ≥ 2555; no credential |
| Token | exists, 43 URL-safe characters, mode 0600 |
| Database | mode 0600; `integrity_check` ok; every governed table |
| Counts | 6 platforms; active endpoints = the registers (32); every setting persisted; ≥ 1 audit event |
| Records | every endpoint has key, flow, method and state |
| Chain | recomputes from GENESIS |
| Hygiene | no credential or token in any record |

Initial counts: health 0 (until a probe runs — the monitor's first cycle is at start), alerts 0, incidents 0, changes 0.

## 8. Startup and smoke test

```bash
curl -s http://127.0.0.1:8844/healthz                                   # {"status":"ok",...}, no token needed
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8844/api/summary   # 401
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8844/api/summary   # "platforms": 6, "endpoints": 32
```

## 9. First governed records

```bash
# Issue named operators so maker and checker are different identities
curl -s -X POST http://127.0.0.1:8844/api/operators -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"actor":"portfolio-administrator","reason":"Change manager for the Centre go-live","name":"change-manager","role":"change_manager"}'

# Record the activation as a controlled change
curl -s -X POST http://127.0.0.1:8844/api/changes -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"actor":"portfolio-administrator","reason":"Register the approved transition of the Centre 2.0.0 into local operational use","changeType":"Operational activation","target":"Folio Central Administration Centre 2.0.0","checker":"change-manager","risk":"Low","rollbackPlan":"Stop the service; the prior state is the absence of the Centre"}'
```

The change manager then signs in with their own token and approves it.

## 10. Backup and restore

**Backup** — Operations › *Back up now*, or `POST /api/backups`. A consistent online copy lands in `$FOLIO_ADMIN_HOME/backups/` with mode 0600 and is listed with its SHA-256. Keep the token separately:

```bash
cp "$FOLIO_ADMIN_HOME/config/admin.token" /secure/location/admin_token_$(date -u +%Y%m%dT%H%M%SZ).txt && chmod 600 /secure/location/*
```

**Restore** — offline by design: stop the server, keep the current database aside, copy the chosen backup to `data/folio_admin.db`, `chmod 600`, run `scripts/verify.py` → PASS, start.

## 11. Token rotation

**Live** — Access › *Rotate bootstrap token* (or `POST /api/access/rotate-bootstrap`). The new token is written 0600 and shown once; the old one is refused immediately. Operator tokens rotate the same way from the Access view.

**Offline** — stop, then:

```bash
python3 -c "import secrets,pathlib,os; p=pathlib.Path('$FOLIO_ADMIN_HOME/config/admin.token'); p.write_text(secrets.token_urlsafe(32)+'\n'); os.chmod(p,0o600)"
```

Start, confirm the old token receives 401 and the new one 200, and record the rotation as a controlled change. Never keep the retired token in logs or documents.

## 12. Microsoft 365 and Power Platform boundary

The flows are owned by an ordinary account. The owner's "List My Flows" export of 2026-09-26 (`docs/folio-Master-Flows-and-Endpoints/audits/flow-usage-analysis-2026-09-26.json`, taken as `dgsRegistry@nitda.gov.ng`) lists 37 of the 41 candidate flow ids behind the governed endpoints, every one with *Owner* relation. Four are not in that listing — the single candidates for `BULK_ASSIGNMENT` (`5aab9e61-…`) and `EMAIL_RELATED_TASK` (`2fbb5485-…`), and one of the two candidates each for `FETCH_ALL` and `VERIFY` — so a sync reads each Folio flow the list leaves out by its id, and reports one it still cannot read as *not visible to this account* rather than assuming anything about it. On 2026-10-20 the account read every Folio flow; only the bulk assignment flow needed reading by its id. A flow owner can read and act on their own flows without any tenant administrator, and that is the route the Centre takes. **Nothing that requires tenant administration is used.**

### Connect as the flow owner

1. **Flows › Connect as flow owner** (Super or Platform Administrator), give a reason.
2. The Centre shows a code and `https://microsoft.com/devicelogin`. On any device, open it, enter the code, and sign in **with the account that owns the flows**. Microsoft names the app *Microsoft Azure PowerShell* (or *Power Platform CLI* if the first is refused in this tenant) — Microsoft's own public apps, the same ones the mailer's setup uses.
3. The Flows view turns to *Connected as flow owner* and runs the first sync by itself.

What the sign-in is, and is not:

| Is | Is not |
|---|---|
| A delegated sign-in of the flow owner, scope `https://service.flow.microsoft.com//.default` | An app registration, a service principal or a client secret |
| Calls on `/providers/Microsoft.ProcessSimple/environments/Default-ca6a4b3f-…/flows/…` | Any `/scopes/admin/` call, or an environment-wide admin listing |
| Held in the Centre's memory; gone on sign-out or restart | Written to disk, the database, the audit chain or a log |

### What a sync does

| Step | Call (user-scoped) | Result |
|---|---|---|
| List | `GET …/flows` (with continuation), then `GET …/flows/{id}` for each Folio flow the list leaves out | Every flow the owner lists, and every Folio flow: name, state, dates → `tenant_flows`. The list leaves out a flow shared with the account (the bulk assignment flow, on 2026-10-20), which is why each missing Folio flow is read by its id |
| Identity | `POST …/flows/{id}/triggers/manual/listCallbackUrl` | The workflow id and path the trigger addresses; the signature is discarded inside the call. Confirms each endpoint's flow (the adoption register settles a tie between candidates offline; a tie it leaves open is settled here), fills the mailer's trigger workflow ids and routes, and marks every tie *verified* — or *drift* if the register and the tenant disagree |
| Runs | `GET …/flows/{id}/runs?$top=N` | Run history of every Folio flow → `flow_runs`, endpoint health observations, and a flow-run alert when a flow's newest finished run failed |
| State | (from the list) | Each Folio flow's state against the state the flow catalogue expects → a flow-state alert while they differ, resolved when they agree. The former library intake is expected Stopped |

Syncs run on connection, every `runHistoryIntervalSeconds` (900 s) while connected, and on **Sync now**.

### Owner actions

| Action | Call | Notes |
|---|---|---|
| Turn on / Turn off | `POST …/flows/{id}/start` · `/stop` | Every endpoint the flow backs stops answering while it is off |
| Run steps | `GET …/flows/{id}/runs/{run}/actions` | Status, times and error per step; signed input/output links are not passed on |
| Resubmit | `POST …/triggers/{trigger}/histories/{history}/resubmit` | Replays the original request — requires typing RESUBMIT |
| Cancel | `POST …/flows/{id}/runs/{run}/cancel` | Stops a running instance |

Each is a governed mutation: reason required, role-checked, audited, and refused for any flow that is not a Folio flow (behind a governed endpoint, or named in the flow catalogue).

### If sign-in is refused

Microsoft may refuse a public app in a tenant (AADSTS700016 and similar); the Centre moves to the next and shows a new code. If both are refused, that is a tenant policy the Centre does not work around; the flow owner can still export run history from Power Automate and post observations to `POST /api/health`.

## 13. Readiness checklist

- [ ] `scripts/verify.py` → PASS
- [ ] Bound to 127.0.0.1:8844 only; `/api/summary` without a token → 401
- [ ] Token, database and backups 0600; state directory 0700
- [ ] Overview: 6 platforms, 32 endpoints; the monitor has taken a reading
- [ ] Named operators issued; the bootstrap token reserved for administration
- [ ] Connected as the flow owner; the first sync resolved every identity and shows no drift
- [ ] A backup taken and a restore rehearsed
- [ ] The audit chain verifies after a controlled mutation
- [ ] No signed URL, password, secret or authorization header in documents, settings, records or logs
