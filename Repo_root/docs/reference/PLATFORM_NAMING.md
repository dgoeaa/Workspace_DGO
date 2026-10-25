# Platform naming

The estate is **NITDA Folio**. Its seven deployable platforms are named for what they do, under
that one name. The eighth thing the launcher starts, the Platform Hub, is a local front page and
is not deployed. The single source is [`config/brand.config.js`](../../config/brand.config.js);
the platform register page is [`PLATFORM_REGISTER.html`](PLATFORM_REGISTER.html).

## The names

| id | Name | Replaced |
|---|---|---|
| *(estate)* | **NITDA Folio** | DGO Digital Operations · DGO Digital OPS · DGO Digital Ops · DGO OPS |
| `runtime` | **Folio Workspace** | DGO R11.6 Runtime · DGO App Shell |
| `portal` | **NITDA Document Portal** | Document Portal · NITDA Intelligent Portal |
| `console` | **Folio Estate Console** | Admin Console · DGO Endpoint Administration |
| `workbench` | **Folio Flow Workbench** | NITDA Flow Operations Workbench |
| `capsule` | **Folio Vault** | Flow Capsule Registry · flowcapsule |
| `mailer` | **DGO Correspondence Mailer** | — (named when added) |
| `centre` | **Folio Central Administration Centre** | — (named when added) |

## The brand these names sit under

| Level | Name | Where |
|---|---|---|
| Master brand | **NITDA** | every surface |
| Internal sub-brand | **DGO Digital Ops**: the operational technology of the Director-General's Office, shown as its lockup beside the NITDA logo | staff-facing surfaces only |
| Products | the names above: **NITDA Folio** and the **Folio** platforms | page and product titles |

Anything that leaves the Agency (the Document Portal, public email, letters to other institutions)
carries NITDA alone. The rule and the lockup are recorded in
[`styles/dgo-design-system/README.md`](../../styles/dgo-design-system/README.md) (RX-01) and
enforced by `npm run test:brand`.

## Why these names

- **"DGO" named an office, not a system.** The Director-General's Office coordinates the
  platform, but `config/product-definition.config.json` describes an Agency-wide system
  used by departments, customer service and IT.
- **"Folio" is the registry's own word.** A file is made of folios and officers minute on
  them. The product definition's core purpose is "digital-traditional registry-minutes".
- **The public surface carries the agency brand and a plain description.** The public
  knows NITDA. "Intelligent" described nothing the portal does.
- **Release numbers are not names.** R11.6 lives in `package.json` and the release tags.

## What was deliberately not renamed

Machine identifiers keep their `dgo` spelling. Renaming them changes nothing a person
sees, and some of them would break working systems:

| Identifier | Why it stays |
|---|---|
| `dgo.r11.viewport.runtime.state` storage key | Renaming it discards every user's saved state |
| `--dgo-*` design tokens, `<dgo-shell>`, `.dgo-*` classes | ~900 identifiers across the tree, no visible effect |
| `window.DGO_CONFIG`, `config.local.js` shape | Deployed configuration files depend on it |
| Platform ids `runtime`, `portal`, `console`, `workbench`, `capsule`, `mailer`, `centre`, `hub` | The launcher, CLI and tests key on them |
| Power Automate flow names, SharePoint list names | The 25 wired contracts resolve against them in the tenant. A flow created or rebuilt from 2026-10-03 is named by the rule in `docs/reference/identification/IDENTIFICATION_SYSTEM.md` §17; existing names stay |
| Record field values such as `channel: 'Document Portal'` | Stored data; changing the vocabulary would split the registry |
| Repository name `ECM_DOCS_DEV`, package name `dgo-r11-ui-contracts` | Out of scope for a display change; rename separately if wanted |

## Before external use

"FOLIO" is also the name of an open-source library services platform. It is a different
field, but have the name cleared before it appears on external correspondence. If it is
rejected, change `config/brand.config.js`, the static strings in `index.html`, and the
portal's own copy; nothing else needs to move.
