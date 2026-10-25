# 8 · Administrator guide

> **Status:** handbook chapter, 2026-10-10. It carries steps, and owns none: tenant procedures are owned by [`docs/deployment/RUNBOOK.md`](../deployment/RUNBOOK.md) and [`PLATFORM_ACCESS_RUNBOOK.md`](../deployment/PLATFORM_ACCESS_RUNBOOK.md).

For **System Administrators** and **User Administrators** of the Workspace, and for whoever looks after
its SharePoint lists, flows and hosting. Day-to-day use of the screens is in the [User guide](09-USER-GUIDE.md).

## 8.1 Who administers what

| Role | Can |
| --- | --- |
| System Administrator (`systemAdmin`) | Everything, including granting System Administrator |
| User Administrator (`userAdmin`) | Add, change and disable people; assign roles (not System Administrator); view audit; open Administration, User Administration, System Health, Operator HUD and Admin Suite |
| Flow owner (dgsregistry@nitda.gov.ng) | Owns the Power Automate flows and their connections; needed to read run history or apply packages |
| SharePoint site owner | Edits lists directly (for example `Flow Configuration`) |

## 8.2 People and access

### Add a person

1. **Administration › User Administration › add**.
2. Fill in at least: full name, work e-mail (it must be the address they receive mail at), directorate,
   department, **role** (see the table below), status **active**.
3. Save. They can sign in at once with their e-mail and a code.

| If the person… | Give them |
| --- | --- |
| registers, classifies and assigns incoming correspondence | **Operator** |
| leads a directorate and approves or dispatches | **Director** |
| reviews and decides at executive level | **Executive** |
| only needs to see their own assigned work | **Read-only Viewer** |
| manages people | **User Administrator** |
| administers the whole platform | **System Administrator** (only another System Administrator can grant it) |

What each role can open is in [Data model §4.7](04-DATA-MODEL.md#47-roles-personas-and-statuses). What each role
**receives** is decided by the server: Operators, Executives and administrators get every record; others
get their own tasks only.

### Change or remove access

- Change the role, or set the status to **disabled** and give a reason. A disabled person's next request is
  refused (401). Their open sign-in proof stops working at that request.
- Statuses: `staged` (prepared, not yet allowed), `active`, `disabled`, `unregistered`. Only `active` works.
- Every change made through the screen is written to `DGO_AuditLog` by the USER_ADMIN service.
  (The USER_ADMIN package does not write `DGO_UserRoleHistory`.)

The form's fields: full name, e-mail, phone, job title, directorate, department, unit, role, persona,
access scope, pilot cohort, status and, when disabling, a reason.

### Direct list edits

`DGO_UserDirectory` can be edited in SharePoint, but the USER_ADMIN service applies the checks: valid
role and status values, no duplicate e-mail, and only a System Administrator granting System
Administrator. A direct edit skips them and writes no audit row. Prefer the screen.

## 8.3 Server-side settings: `Flow Configuration`

The SharePoint list `Flow Configuration` (activity-tracking site) holds settings the flows read at run time.
`Title` is the key, `ConfigValue` the value. Change it to change behaviour without changing a flow.

| Key | Read by | Effect |
| --- | --- | --- |
| `IDENTITY_PROOF_REQUIRED` | every internal service (11 packages) | `true`: a valid sign-in proof is required. **Keep it `true` in production.** |
| `ALLOWED_ORIGIN…` (any key starting so) | 17 packages | Origins the flows name in their CORS reply (the gateway answers `*` regardless; see ITEM-56) |
| `NOTIFY_…`, `NOTIFY_REGISTRY_TO` | notification sends | Who receives registry notices |
| `DATASET_<NAME>_SITE_URL`, `DATASET_<NAME>_LIST_ID` | FETCH_ALL and others | Where the intake register, briefs, meetings, projects, approvals and registry files live |
| `ENVIRONMENT_CODE` | identification | `prd`, `uat` or `dev` (non-production references start with Z) |
| `STATUS_REQUIRE_VERIFICATION` | Portal STATUS | Whether tracking a submission needs a verified e-mail |
| `OPENROUTER_API_KEY` | AI document processing | The AI provider key (AI is off at go-live). Restrict who can read the list. |

Change one value at a time, note the old value, and check the next run of the flows that read it.

## 8.4 Monitoring

| Daily check | Where | Healthy |
| --- | --- | --- |
| Failed runs | Power Automate › My flows › flow › Run history (kept 28 days) | No `Failed` run, or each one explained |
| Mail actually sent | SharePoint `Portal Outbox Receipts` | A receipt for each notice |
| Run records | SharePoint `Portal Flow Telemetry` | No error outcomes |
| Scans picked up | Run history of `Folio_Incoming_Correspondence_Scan_Processing_Flow` | Runs each minute; a file → a record |
| Sweep | Run history of `AUTO_SCHEDULED_SWEEP` | Runs on schedule |

In the Workspace (System Administrator):

- **System Health** (`#/diagnostics`): runtime checks (booted, routes, services configured, last data load),
  collections, the endpoint table and readiness panels.
- **Endpoint Console** (via Administration): a **probe** sends each read service a request **without a sign-in
  proof**. With sign-in enforced, **401 is the healthy answer**: the service is up and refusing anonymous calls.
  A non-JSON answer means the service was not reached at all.
- **Operator HUD**: integration health at a glance.
- **Admin Suite**: the service estate, flow catalogue, live checks, commissioning and audit trail.

## 8.5 Deploying a new Workspace build

You receive `FOLIO-WORKSPACE-v<version>-upload-to-site-root.zip` privately from the platform team, for example
`FOLIO-WORKSPACE-v2026.10.20-1-upload-to-site-root.zip`. The version in its name is the build's identity: use the
newest you were sent, and never mix files from two versions.

1. Unzip it on your computer.
2. Upload **all** its contents to the root of `folio-platform.page.gd`, replacing what is there. Make sure the
   hidden file **`.htaccess`** is uploaded; some file managers hide files starting with a dot.
3. In a private window, open the site, sign in, and wait about 20 seconds: the Command Center shows counts.
4. Open your profile (top right). It reads **Build v…**: check it is the version in the zip's name. If it shows an
   older version, the upload did not replace every file.
5. Tell the platform team which version is deployed, so they delete the private copy.

Because of `.htaccess`, browsers fetch the new files on their next load. Users do not need to clear anything.
(Before 2026-10-09 the host kept JavaScript for 30 days, and a browser holding old files could sign in
but never load data. If someone still sees that, clearing the site's data once fixes it.)

The Portal zip goes to the Portal host (`CG/` folder) and the Mailer file to the Mailer, the same way.

**Rollback:** upload the previous zip. The flows are not affected.

## 8.6 Security operations

| Task | How |
| --- | --- |
| A signed address leaked | Regenerate that flow's trigger key in Power Automate. The platform team runs `npm run config:drift` (it reports the change) and `npm run config:rebuild`; you deploy the new zip. The old address stops working at once. See [`docs/architecture/ROTATION_REGISTER.md`](../architecture/ROTATION_REGISTER.md). |
| Remove someone's access now | Set their status to `disabled`. |
| A proof must stop working before its 4 hours | Set `Consumed` to yes on their row in `DGO_SessionProofs`, or disable the person. |
| Handling build zips | They contain signed addresses. Send them privately, delete them after deployment, and never commit them. |
| Hosting | The Workspace and Portal are on folio-platform.page.gd and folio-portal.page.gd. The host's browser check runs once every 6 hours per browser and drops a `#/` part of a link on that first visit; Folio's e-mails link to `/acknowledge.html` and query addresses (`?TaskID=`), which survive it. |

## 8.7 Test data

Commissioning creates test rows. The owner approved their removal (2026-10-08, MANUAL-2). The platform team
removes them after the last commissioning test, and records the reference sequence counter's starting value
(`Portal Sequence Counters`). When you create test data yourself, give it a recognisable name (for example a
`ZTEST` prefix) and tell the platform team.

## 8.8 Related procedures

| Need | Document |
| --- | --- |
| Every cutover step, standing procedures | [`docs/deployment/RUNBOOK.md`](../deployment/RUNBOOK.md) |
| Access setup and checks | [`docs/deployment/PLATFORM_ACCESS_RUNBOOK.md`](../deployment/PLATFORM_ACCESS_RUNBOOK.md) |
| Portal operations | [`docs/deployment/DOCUMENT_PORTAL_LIVE_OPERATIONS.md`](../deployment/DOCUMENT_PORTAL_LIVE_OPERATIONS.md) |
| The Central Administration Centre | [`docs/admin-centre/`](../admin-centre/README.md) |
| RBAC in depth | [`docs/architecture/AUTH_RBAC_GUIDE.md`](../architecture/AUTH_RBAC_GUIDE.md) |
