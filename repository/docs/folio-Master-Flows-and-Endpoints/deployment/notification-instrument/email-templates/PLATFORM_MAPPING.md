# Platform mapping and disposition of the previous library

Two platforms carry email in `ECM_OPS_CLOSURE`. Every notification event either has a
canonical template below, or is not an email event.

## NITDA Document Portal — external channel

Source: `Document_Portal_Closure/` (README endpoint contract, `config.local.js` flow keys).
The portal is anonymous and holds no accounts, so email is the only channel it has to a
submitter. Recipients are citizens and organisations.

| Template | Event | Flow endpoint that fires it |
|---|---|---|
| DP-01 Submission Received | `SUBMISSION` mints a registry reference | `SUBMISSION` |
| DP-02 Email Verification Code | one-time code issued | `VERIFY` |
| DP-03 Status — Under Review | record enters governed status `review` | registry write-back |
| DP-04 Request for Information | record enters `action-required` | registry write-back |
| DP-05 Decision Issued | `approved` / `declined` decision | internal approvals module |
| DP-06 Matter Closed | closure and archive, incl. `withdrawn` | registry closure |
| DP-07 Helpdesk Case Acknowledged | `CASE-` reference issued | `SUPPORT` |
| DP-08 Acknowledgement Overdue | 3 working-day clock breached | scheduled clock check |

Not email events: `UPLOAD`, `STATUS`, `WRITEBACK`, `VERIFY_CONFIRM` — request/response
only. Status read-back deliberately returns a byte-identical 404 for unknown reference,
wrong address and expired proof, so no template may confirm or deny a reference's
existence; DP-02 is the only place expiry is ever reported.

## DGO Digital Ops (Folio Workspace) — internal platform

Source: `Internal_-Platform_Closure/` (`modules/`, `config/`). Recipients are officers of
the Agency; every template carries the internal classification bar and a do-not-forward line.

| Template | Event | Module that fires it |
|---|---|---|
| IP-01 Single Task Assignment | one matter to one officer | `modules/single-assignment.js` |
| IP-02 Bulk Consolidated Dispatch | batch to a unit | `modules/bulk-assignment.js`, `modules/dispatch.js` |
| IP-03 Email-to-Task Assignment | mailbox item registered as a task | `core/intake-triage.js` |
| IP-04 Portal Intake Alert | public submission awaiting triage | `core/entry-point-feeds.js` |
| IP-05 Document Submitted for Review | routed for review and recommendation | `modules/correspondence.js` |
| IP-06 Action Required — Overdue Escalation | due date passed without disposal | `config/action-routing.config.js` |
| IP-07 Daily Task Digest | scheduled standing position | `modules/activities.js` |
| IP-08 Approval / Decision Request | matter before a deciding authority | `modules/approvals.js` |
| IP-09 Dispatch / Transmittal Confirmation | outward transmission recorded | `modules/dispatch.js`, `modules/response-tracking.js` |
| IP-10 Internal Support Request | staff support request to IT | `config/support-routing.config.js` |
| IP-11 Official Correspondence (letterhead) | outbound agency correspondence | `core/correspondence-email-service.js` |

IP-11 carries all six variants configured in
`config/correspondence-email-templates.config.js` — official correspondence, request for
information / documents, document transmittal, meeting invitation, circular / notice, and
closure / final response — through `Compose_Correspondence_Type`, `Compose_Body_Html` and
the two conditional clause slots. One letterhead, six tones; the config remains the source
of truth for subject patterns and section copy.

## Disposition of the 38 previous candidate templates

Every candidate in `approved_template_release_manifest.yaml` receives a final disposition.
No candidate is left unclassified, deferred or pending.

| Previous candidate | Disposition | Canonical replacement |
|---|---|---|
| nitda-assignment-single-task-v1 | superseded | IP-01 |
| nitda-assignment-single-task-standard-v1 | superseded | IP-01 |
| nitda-internal-assignment-v1 | superseded | IP-01 |
| nitda-universal-task-card-1-v1 | superseded | IP-01 |
| nitda-01-scope-assignment-email-compose-nitda-assignment-notification-v1 | superseded | IP-01 |
| nitda-03-scope-2-1-nitda-assignment-notification-v1 | superseded | IP-01 |
| nitda-new-document-assigned-v01 | superseded | IP-01 |
| nitda-new-document-assigned-v02 | superseded | IP-01 |
| nitda-assignment-bulk-v1 | superseded | IP-02 |
| nitda-assignment-bulk-v2 | superseded (also fixed the unquoted dynamic `href`) | IP-02 |
| nitda-assignment-bulk-standard-v1 | superseded | IP-02 |
| nitda-assignment-email-derived-task-v1 | superseded | IP-03 |
| nitda-assignment-email-task-standard-v1 | superseded | IP-03 |
| nitda-new-submission-internal-v1 | superseded | IP-04 |
| nitda-new-submission-alert-v01 | superseded | IP-04 |
| nitda-new-document-submitted-for-review-v01 | superseded | IP-05 |
| nitda-new-document-submitted-for-review-v02 | superseded | IP-05 |
| nitda-new-document-submitted-for-review-v03 | superseded | IP-05 |
| nitda-02-scope-2-6-action-required-nitda-v1 | superseded | IP-06 |
| nitda-04-scope-2-3-action-required-nitda-v1 | superseded | IP-06 |
| nitda-05-scope-2-4-action-required-nitda-v1 | superseded | IP-06 |
| nitda-universal-task-digest-wrapper-1-v1 | superseded | IP-07 |
| nitda-internal-support-request-v1 | superseded | IP-10 |
| nitda-universal-task-letter-1-v1 | superseded | IP-11 |
| nitda-submission-confirmation-v1 | superseded | DP-01 |
| nitda-submission-received-v1 | superseded | DP-01 |
| nitda-status-update-in-review-v1 | superseded | DP-03 |
| nitda-status-under-review-v1 | superseded | DP-03 |
| nitda-status-update-awaiting-response-v1 | superseded | DP-04 |
| nitda-status-actioned-v1 | superseded | DP-05 |
| nitda-status-update-actioned-v1 | superseded | DP-05 |
| nitda-status-closed-v01 | superseded | DP-06 |
| nitda-status-update-closed-v1 | superseded | DP-06 |
| nitda-support-ticket-acknowledgment-v1 | superseded | DP-07 |
| nitda-design-option1-reconfigured-accentrail-v1 | retired — design exploration | accent rail resolved into the priority spine of the master shell |
| nitda-design-option2-reconfigured-herotiles-v1 | retired — design exploration | hero tiles resolved into the stat strip (IP-02, IP-07, DP-08) |
| nitda-design-option3-reconfigured-minimalchips-v1 | retired — design exploration | chips resolved into the governed priority/status chip |
| nitda-design-option4-reconfigured-patternreceipt-v1 | retired — design exploration | receipt pattern resolved into the reference slab (DP-01, DP-02, DP-07) |

Also dispositioned: the nine `html_templates/templates/*.html` variants
(Single / Bulk / EmailTask × DashboardCard / Minimal / Document) are superseded by
IP-01 / IP-02 / IP-03 respectively — the three visual directions are collapsed into the one
master shell. `html_templates/uploads/*` remain as the historical originals and are not
part of the release. `Master Shell Reference.html`, `NITDA Design System Extended.html`,
`Template Gallery.html` and `index.html` are documentation and preview artefacts, excluded
from the sendable set exactly as the previous release manifest excluded them.

## New coverage added

Four events had no template at all in the previous set and now do: **DP-02** (email
verification — the portal's `VERIFY` endpoint had no mail template despite being required
for tracking), **DP-08** (acknowledgement clock overdue — the portal commits to 3 working
days and had no way to say it had missed), **IP-08** (approval / decision request — the
`approvals` module had no notification), **IP-09** (dispatch / transmittal confirmation —
the `dispatch` and `response-tracking` modules had no proof-of-dispatch notice).
