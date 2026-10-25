# Folio Central Administration Centre — documentation suite 2.0

The Centre is the administration, management and monitoring plane for every platform in the Folio portfolio. It is built at [`tools/admin-centre/`](../../tools/admin-centre/) and started with `npm run start:centre` (http://127.0.0.1:8844).

| Document | For |
|---|---|
| [01 · Design](01-design.md) | Architecture, data model, lifecycles, every API route, security, configuration, acceptance |
| [02 · Developer guide](02-developer-guide.md) | Layout, request flow, adding reads and mutations, client rules, testing, release |
| [03 · Provisioning and configuration](03-provisioning-and-configuration.md) | Installing, verifying, configuring, backing up, rotating, and the Microsoft 365 boundary |
| [04 · User guides](04-user-guides.md) | Procedures for each role, the views, messages and checklists |
| [05 · Assessment](05-assessment.md) | What the 1.0 suite specified, what was missing, what 2.0 adds, and what remains a tenant boundary |
| [`source-1.0/`](../governance/RETIRED_RECORDS.md) | The supplied 1.0 suite (four `.docx`, its README and MANIFEST), unchanged, as the record it was assessed against |

Where a document and the code disagree, the code and its tests govern: `npm run test:admincentre` holds the Centre to the launcher registry, the settings, the security rules and this suite's route table.
