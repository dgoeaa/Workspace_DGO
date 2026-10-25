# `docs/folio-Master-Flows-and-Endpoints/` — every flow and endpoint record in Folio

Owner direction, 3 October 2026: every register, detail, document, capture and piece of evidence
about a flow or an endpoint lives in this one folder, and nowhere else. `npm run test:masterflows`
fails if a record of that kind appears outside it, or if a subfolder here is missing from this index.

**Start here:** [`reference/FLOW_REQUIREMENTS.md`](./reference/FLOW_REQUIREMENTS.md) — every flow and
endpoint Folio requires, read from the code that calls it, with what is available and what is not.
[`FLOW_CATALOGUE.md`](./FLOW_CATALOGUE.md) describes each flow that exists: trigger, request
properties, lists touched, action tree.

## What each subfolder holds

The kinds are the four that [`docs/README.md`](../README.md) classifies documents as.

| Subfolder | Kind | What it is |
|---|---|---|
| [`reference/`](./reference/) | Specification | The registers of record: flow requirements, `endpoints.json`, the estate register, contract-key ↔ flow maps, registry decisions, authorisation gates, the health contract, the connector and out-of-band references. |
| [`contracts/`](./contracts/) | Specification | What each endpoint's request and response **must** be, traced to the client call site that reads it. Binding. |
| [`architecture/`](./architecture/) | Specification | How a flow is built (`FLOW_BUILD_SPEC.md`). |
| [`registers/`](./registers/) | Record | Endpoint ↔ workflow id for every endpoint the front ends call (the Workspace and Portal contract keys, and the Correspondence Mailer's seven in `mailer_configuration`), flow ↔ list, trigger authentication posture, the identity crosswalk, the registry seed, and the plain-English flow catalogue the handover packs print. |
| [`surfaces/`](./surfaces/) | Procedure | Designer-paste packages by owning surface: [`internal/`](./surfaces/internal/), [`governance/`](./surfaces/governance/). The portal flows' packages are the identification release, [`packages/identification-phase3/`](./packages/identification-phase3/). |
| [`packages/`](./packages/) | Record | Flow definitions as Power Automate exported them, plus their code view. |
| [`provisioning/`](./provisioning/README.md) | Record | What every flow and endpoint is actually configured with, and the provisioning console. Generated — `npm run provisioning`. |
| [`deployment/`](./deployment/) | Procedure | Applying the estate: estate apply, provisioning console guide, notification matrix, deep-link audit, portal factsheet, and the internal, governance, rotation, verification, notification-instrument, live-operations-console and SharePoint deployment sets. |
| [`patches/`](./patches/) | Procedure | Generated patches to apply to live flows (deep links, flows-in-use). |
| [`exports/`](./exports/) | Harvest | Raw flow exports from the tenant, kept as they arrived. |
| [`email-catalogue/`](./email-catalogue/README.md) | Source | One template per message the identification packages send (ITEM-68); the packages' e-mail bodies are generated from it, with its acceptance report. |
| [`email-templates/`](./email-templates/README.md) | Source | The Folio e-mail template production package of 2026-10-20 ([what is in service](./email-templates/IMPLEMENTATION.md)): 59 send-ready templates, their plain-text parts, the 29 IP_SEND_EMAIL body fragments the Workspace sends (compiled into `config/email-fragments.generated.js` by `npm run emailfragments`), hero schemes, registers, validation and the tenant change set. |
| [`captures/`](./captures/) | Harvest | Flow definitions captured from the tenant (formerly the top-level `flows/` folder). Read by the requirements and identification-conformance generators. [`build-sources/`](./captures/build-sources/README.md) holds five later builds the conformance stage starts from: build inputs, never pasted. |
| [`evidence/`](./evidence/) | Record | Endpoint runs and provisioning runs on the day they were captured. Proof a run happened — not a specification. |
| [`audits/`](./audits/) | Record | Dated reviews of flows: usage analysis, flow-truth persistence, the scan-intake review. |
| [`cutover/`](./cutover/) | Procedure | Which flows are decommissioned at cutover. |

Records of fact (evidence, captures, exports, dated audits) were moved here unchanged. Paths they
quote are the paths as they stood on the day they were written.

## What stays outside, and why

`tests/master-flows-folder.test.mjs` names each of these with its reason; adding one is a visible
change to that list, not a quiet drift.

- **Platform code** — `config/`, `core/`, `modules/`, `shared/`, `mailer/`, `document-portal/`,
  `tools/`, `scripts/`, `tests/`, `releases/`, `styles/`, `assets/`. What a platform needs to run, and
  the tooling that builds and checks these records, stays with its platform (owner decision, 3 October
  2026). That includes `mailer/flows/`, which the Mailer package ships.
- **`docs/reference/foundational/`** — the harvest the estate was derived from (decision D5). It
  holds flow captures, but `tests/check-secrets.mjs` quarantines it by this exact path:

  ```js
  const REFERENCE_CORPUS = 'docs/reference/foundational/';
  const trackedFiles = allTracked.filter(f => !f.startsWith(REFERENCE_CORPUS));
  ```

  That prefix keeps the dead signed URLs it contains out of the secret ratchet. Moving it would move
  them into the scanned tree and weaken a security control as a side effect of filing. Where it and
  this folder disagree, this folder is right — `docs/README.md` classifies the harvest as untrusted.
- **`.github/workflows/`** — GitHub Actions CI, not Power Automate flows.
- **`docs/reference/correspondence-email-templates/partials/flow-attachment-section.html`** — an
  e-mail template partial rendered by `core/correspondence-email-service.js`.

## What holds this folder together

`npm run test:refs` fails if any relative reference in the repository stops resolving, which is what
makes a move like this one provable. `npm run test:masterflows` keeps the records here.
`scripts/lib/provisioning-model.mjs` refuses to build if a package directory is attributed to an
estate by its tree and no prefix names it.
