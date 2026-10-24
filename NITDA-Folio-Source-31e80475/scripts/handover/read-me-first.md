# Read Me First

## 1. Purpose of this pack

This pack hands over NITDA Folio as commissioned on 19 October 2026. It holds the Commissioning Report and the
records behind it, the complete documentation, the Power Automate flows and their packages, and the full source of
every application and tool. It contains no signed flow address, so it may be shared within the Agency.

Two companion packages go with it (section 6): the confidential **Deployment Kit**, which holds the two site uploads,
and the **Administrator Toolkit**, which holds the platform team's tools ready to run.

## 2. Position at handover

| Area | Position |
| --- | --- |
| Readiness registers | {{OPEN}} open, {{CLOSED}} closed across the three registers |
| Deployed applications | Browser suite against the deployed Workspace and Portal: 159 passed, 0 failed |
| Notifications | All {{NOTICES}} notifications Folio sends passed, each with its run and delivery record |
| Power Automate flows | {{FLOWS}} Folio flows in the tenant: {{RUNNING}} running, and the former library intake, which was replaced, off by design |
| Flow packages | All {{PACKAGES}} packages of release {{RELEASE}} running in the tenant at their released version |
| Administrator tools | One suite, the Central Administration Centre with the Folio Vault, watching every Folio flow; the defects found were corrected |

## 3. Two actions for the owner

1. **Upload the Workspace build** in the Deployment Kit to folio-platform.page.gd, as its instructions describe. This
   brings the site to the commissioned build and publishes the Correspondence Mailer.
2. **Switch staff notifications on** when your testing is finished. Until then every automated notice for staff goes
   to the registry mailbox. The steps are in the Commissioning Report, section 13.

## 4. Contents of this pack

Each item carries a reference. Its number is its place in the pack: 1.1 is the first item in folder 01.

{{CONTENTS}}

## 5. Where to start

| If you are | Read |
| --- | --- |
| The owner or management | 1.1 Commissioning Report: the declaration (section 2) and the actions after handover (section 13) |
| An auditor | 1.1 Commissioning Report, then 1.2 Folio Registers and 1.3 Supporting Evidence |
| A member of staff | 2.2 Folio User Guide |
| An administrator | 2.3 Folio Administrator Guide, then 4.1 Running the Administrator Tools and the Administrator Toolkit |
| A developer or the platform team | 2.4 Folio Developer Guide, 3.1 Folio Flow Catalogue and 3.2 Folio Flow Package Guide, then 4.2 the source code |

2.1, the Folio Handbook, holds all of the documentation in one volume; 2.2 to 2.4 are drawn from it for each reader.

## 6. Companion packages

| Package | Classification | Holds |
| --- | --- | --- |
| NITDA Folio Deployment Kit | **Confidential** | The two site uploads, their deployment instructions and their checksums. The uploads carry signed flow addresses, which work like passwords for their flows: keep the kit private, and delete its files once the uploads are done. |
| NITDA Folio Administrator Toolkit | Internal | The platform team's suite, the Central Administration Centre with the Folio Vault, ready to run on a platform-team computer, with one start command and its guide (the same guide as 4.1). It holds no signed address or credential: the tools create their own on first start. |

## 7. Conventions

- Times are in UTC unless marked WAT (West Africa Time, UTC+1).
- Register items are named by their identifiers (for example ITEM-91 or MANUAL-3), as in 1.2 Folio Registers.
- The master copy of every record is the repository `dgoeaa/ECM_DOCS_DEV`, branch `{{BRANCH}}`. This pack was built
  from commit `{{COMMIT}}`. Where a document links to a file not in this pack, the link opens that file in the
  repository at this commit.
- To confirm a file is complete and unaltered, compare its SHA-256 checksum with the one in Checksums.txt.
