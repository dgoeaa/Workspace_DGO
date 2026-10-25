# Staff e-mail links: Folio platforms in place of SharePoint lists

Owner direction, 2026-10-20: an e-mail that linked straight to a SharePoint list or list item now links to the Folio
platform that handles it. Administrative and governance notices go to the **Admin Suite**, the central administrative
platform. The Admin Suite has no screen that works these lists, so it shows what the notice is about and the
administrator decides whether to open the list or the record in SharePoint. Portal Registry notices go to the
Workspace's **Portal submissions**, where the Registry works them.

Links to stored documents (files) and external links are not changed.

## The link formats

| Link | Opens | Handled by |
|---|---|---|
| `https://folio-platform.page.gd/?portal=<reference>` | Intake › Portal submissions, with that submission listed first and marked | `modules/correspondence.js` |
| `https://folio-platform.page.gd/?portal=all` | Intake › Portal submissions | `modules/correspondence.js` |
| `https://folio-platform.page.gd/?notice=<key>&record=<id>` | Admin Suite, with a panel for the notice, offering the record and the list in SharePoint | `modules/admin-suite.js` |

The keys, their lists and their SharePoint addresses are in [`config/notice-links.config.js`](../../../config/notice-links.config.js).
An e-mail carries only a key and a numeric item id. An unknown key opens nothing, and a `record` that is not a number is
ignored. The links use query parameters, not a `#/route`, because the host's browser check drops the fragment
(release 41). `config/deeplink.config.js` routes `portal` and `notice`.

## The ten templates

| # | Register | Flow | Send step | Was | Now |
|---|---|---|---|---|---|
| 1 | TR-014 | CG_Submission_Endpoint | `Send_Registry_Alert_Email` | Open record in SharePoint (new Portal Registry item) | Open in the Folio Workspace: `?portal=<reference>` |
| 2 | TR-029 | CG_Portal_Writeback_Endpoint | `Send_Writeback_Alert_Email` | Open the record in SharePoint (Portal Registry item) | Open in the Folio Workspace: `?portal=<reference>` |
| 3 | TR-018 | CG_Portal_Support_Endpoint | `Send_Helpdesk_Alert_Email` | Open the case in SharePoint (Portal Support Cases item) | Open in the Folio Admin Suite: `?notice=portal-support-case&record=<ID>` |
| 4–8 | TR-058 to TR-062 | 04 - GOV - Audit HTTP Flow Registry | the five sends below | Open registry record / Review exception now (DGO_HTTPFlowRegistry item) | `?notice=http-flow-registry&record=<ID>` |
| 9 | TR-002 | CG_Portal_Daily_Sweep | `Send_Registry_Digest_Email` | Open the Portal Registry · Open the upload tickets (two lists) | Open Portal submissions: `?portal=all` · Open the upload tickets: `?notice=portal-upload-tickets` |
| 10 | TR-043 | AUTO_SCHEDULED_SWEEP | `Send_Undeliverable_Alert_Email` | Open Portal Outbox Receipts (list) | Review in the Folio Admin Suite: `?notice=portal-outbox-receipts`; the panel also opens System Health's failed-notice view |
| 11 | TR-066 | 06 - GOV - Registry Exception Notification | `Send_Exception_Email` | No link | Open in the Folio Admin Suite: `?notice=http-flow-registry-exception&record=<ID>` (e-mail template package, GV-Registry-Exception; written by `npm run govmail:update`) |

Templates 1, 2, 3, 9 and 10 are e-mail catalogue templates; their packages are rebuilt from them and released together
(identification release 42). Templates 4 to 8 are inline in the GOV-04 flow, which is not built from a package, so the
change is made in the tenant as follows.

## Changing 04 - GOV - Audit HTTP Flow Registry in the tenant

Release 42 reached the tenant on 2026-10-20 (`../evidence/2026-10-20-flows-check.json`), and the owner reported GOV-04 updated on 2026-10-21 (`../evidence/2026-10-21-gov04-notice-links.json`). All ten templates are done. The command below stays to check the live flow (its dry run reads `applied`) or to re-apply after a restore.

**GOV-04 is applied (2026-10-21).** The owner pasted the corrected scope into the designer; the flow was saved at
01:52 UTC, and a read-back from the tenant shows it carries every change of `scripts/lib/gov04-fix.mjs`. Nothing
below needs doing again. Both commands read an applied flow as up to date.

**`npm run gov04:update -- apply`** (`scripts/gov04-update.mjs`, `npm run test:gov04`) makes the full change. It signs in
like `flows:update`, backs GOV-04 up, writes it, reads it back, and restores the backup if the write did not land:

1. the five registry links below;
2. `Filter_Failure_Config` selected the `StaleAfterDays` row, so the consecutive-failure audit used the stale-days
   number as its threshold; it now selects `ConsecutiveFailureThreshold`;
3. `If_Exception_Recovered` tested `"" equals ""`, always true, so every daily run closed every open exception and sent
   its owner "[CLEARED]", in the same run that had just sent a reminder for it (run of 2026-10-20 01:19 UTC). It now
   closes an exception only when the registry record is no longer Active, a stale flow has been seen within
   `StaleAfterDays`, or a failing flow is back under the threshold;
4. the two configuration filters read `Get_Stale_Threshold` through four stray Compose actions, two calling `item()`
   outside a loop; the designer refused to save the flow with them. The filters now read the result directly.

**`npm run gov04:noticelinks -- --yes`** (`scripts/write-gov04-notice-links.mjs`) changes only the five links and three
labels. Run on the flow as it is now, it reads as `applied`.

**By hand**, if neither command can be used: open the flow, choose **Edit**, and in each of these five **Send an email** actions open the body in code view:

- `Send_Stale_Owner_And_Governance_Alert`
- `Send_Stale_Reminder_Or_Escalation`
- `Send_Failure_Owner_And_Governance_Alert`
- `Send_Failure_Reminder_Or_Escalation`
- `Send_Recovery_Notification`

In each, make these changes and nothing else:

| Find | Replace with |
|---|---|
| `https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE/Lists/DGO_HTTPFlowRegistry/DispForm.aspx?ID=` | `https://folio-platform.page.gd/?notice=http-flow-registry&record=` |
| `'Open registry record'` (in three of the five) | `'Open in the Folio Admin Suite'` |

The expression after the address (`string(item()?['Id'])`, or the recovery record's `Id` in
`Send_Recovery_Notification`) stays as it is. `Review exception now` stays as it is.

**Check:** save, then let the hourly run send one alert (or wait for the next). The button opens the Admin Suite with
the HTTP flow registry panel naming the record's number, and **Open the record in SharePoint** opens that record.
The flow's capture in `captures/` stays as the tenant export it is until the next tenant read.
