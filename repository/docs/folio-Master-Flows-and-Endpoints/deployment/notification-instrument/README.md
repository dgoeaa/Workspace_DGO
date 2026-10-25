# The notification instrument

Imported on 2026-09-05 from `dgoeaa/Sytem_Production_Governance`, where it sat under
`NITDA_DGO_Remediated_Repository_Full_Operational_Instrument/`. It is carried here because that
repository is being retired and this is the only copy: 57 files that exist nowhere else in this
estate, checked against every tracked path in this repository before the import.

It is one delivered body of work, kept in the shape it was delivered in rather than
redistributed into this repository's own directories.

## What is here

| Path | What it is |
|---|---|
| `tenant-execution/runbooks/` | The four execution runbooks — baseline and connections, containment, carriers and processor, **cutover, rollback and hypercare** |
| `tenant-execution/evidence/` | Tenant readings taken at delivery: connection verification, notification test results, tenant inventory |
| `tenant-execution/templates/` | Record shapes for a flow inventory and a notification result |
| `tenant-execution/` | `cutover-register.json`, `agency-decisions.json`, and the production-authorisation and risk-acceptance templates |
| `email-templates/deploy/` | 20 built HTML templates — 8 portal (`nitda-dp-*`), 12 internal (`nitda-ip-*`) |
| `email-templates/` | `TOKEN_CONTRACT.md`, `PLATFORM_MAPPING.md`, `DEPLOYMENT.md`, and the built `registry.json` / `tokens.json` |
| `notification-processor/`, `notification-*.json` | The processor specification, acceptance cases and release manifest |
| `*_REPORT.md`, `REMEDIATION_SHA256_MANIFEST.json` | The implementation reports delivered with it, and their manifest |

`config/notification-delivery.config.js`, `scripts/validate-tenant-notification-evidence.mjs`,
`tests/notification-delivery.test.mjs` and `tests/tenant-notification-evidence.test.mjs` came in
with it and are placed in this repository's own directories, because those are the directories
this repository's gates read.

## What was deliberately NOT imported

`docs/folio-Master-Flows-and-Endpoints/contracts/deployed/CG_Upload_Endpoint__df7ddff1-…__full_definition.json`.

It is the corrupted 2026-08-24 capture: the display name `CG_Upload_Endpoint` stamped on
`ECM_DOCS_INTAKE`'s workflow id `df7ddff1-9275-4f23-acf6-e169525f4e2f`. Decision **D5** of the
branch consolidation audit already adjudicated it, on a re-export that proved the corruption.
Importing it made `npm run test:triggerauth` and `npm run test:wiringspec` fail immediately,
each reporting that the single sanctioned crossing into the internal platform had lost its
subject — which is exactly the failure D5 describes. It is excluded, not lost: the governance
repository's own history holds it, and this paragraph records where it went and why.

## What this does not do

Nothing here has been reconciled against this repository's own notification matrix
(`config/notification-matrix.config.js`). The two were built separately and both survive; where
they disagree, neither has been made to defer to the other. The 20 templates in particular are
**not** wired to any flow in this estate — ITEM-48 records that the portal promises citizens
four emails the estate does not send, and these templates are a candidate answer to it, not a
delivered one.
