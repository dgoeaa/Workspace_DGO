# Platform independence and the shared boundary

**Status:** Specification. Per [`../README.md`](../README.md) that means binding — change the
code to match it, or change this and say why.
**Document ID** `DOC-2017` · **Written** 15 September 2026
**Applies to** every platform in the DGO Digital Operations estate
**Carries no commands.** Nothing here is a procedure; it states a property and how to check it.

---

## Why this document exists

This is the most consequential architectural fact about the system, and until now it was
written down nowhere. A reader deduced it from 1,871 files or did not.

The cost of not knowing it is not confusion — it is a specific, tempting, wrong change. The
estate contains two design systems, two response shapes, two error vocabularies and several
near-duplicate directory names. Every one of those looks like duplication to be tidied away.
Most of them are not. A maintainer who unifies them without knowing why they are separate
converts seven independently deployable things into one, and the failure does not appear at
the keyboard; it appears the first time somebody needs to ship the portal without shipping
the runtime.

## The property

**The platforms are complementary parts of one system. They are not dependent on, and not
directly integrated with, each other.** They meet in the tenant — the same SharePoint
estate, reached through separate Power Automate flows — and nowhere else.

Each is a **standalone deployable**: installed somewhere of its own, with its own lifecycle,
upgradable and rollback-able without anything else being touched.

| Platform | Class | Lives in | Operated by |
|---|---|---|---|
| Internal platform (DGO runtime) | Day-to-day | `index.html`, `core/`, `modules/`, `shared/`, `styles/`, `config/`, `assets/` | Officers, executives, administrators — daily |
| Document portal | Day-to-day | `document-portal/` | Citizens — occasionally, unaided |
| Flow capsule | Specialised | `tools/flow-capsule/` | A named custodian |
| Admin console | Specialised | `tools/admin-console.html` (generated) | Operators, during commissioning and incidents |
| Flow workbench | Specialised | `tools/flow-workbench/` | Whoever authors flows |
| Correspondence mailer | Day-to-day | `mailer/` | The Office of the Director-General/CEO, when sending letters |
| Central Administration Centre | Specialised | `tools/admin-centre/` | Portfolio administrators — monitoring, alerts, incidents, changes |

That is seven. The eighth thing `npm run start:all` starts, the **Platform Hub**
(`scripts/hub-server.mjs`), is a local front page that lists and probes the seven; it is not
deployed and is not counted here. Two of the seven read something from outside their own
directory at run time, and neither is an import: the Administration Centre reads the estate
registers from the repository (`ESTATE_SOURCES` in `tools/admin-centre/server.py`, or the
checkout named by `FOLIO_ADMIN_REPO`), and probes the other six on their loopback ports;
the Admin console is generated from those same registers by `npm run console`.

The class distinction is not seniority and not "product versus tool". It is **frequency and
expectation**: a day-to-day platform is used by people who did not choose it, who will not
read a manual first, and whose work stops when it stops. A specialised platform is opened
deliberately by someone who already knows why, and its absence delays an operation rather
than halting the business. The distinction decides what documentation each needs, not how
much either matters.

## How to check the property, today

It is measurable, not aspirational.

**No cross-imports.** The portal imports nothing from the internal platform's tree, and the
internal platform imports nothing from the portal's. The only mentions of `document-portal/`
in internal configuration are an entry-point label in `config/entry-points.config.js` and a
set of `file:line` evidence citations in `config/notification-matrix.config.js` — references
*about* the portal, not imports *from* it.

**Two package surfaces, not one.** `scripts/package.mjs` defines exactly two:
`runtime` and `portal`. The portal's is re-rooted (`strip: 'document-portal/'`) because it
"is deployed at the root of its own site". Either can be built, delivered and deployed
alone.

**The extraction test.** Every platform must be extractable to its own repository by
`git mv` alone, with no import left dangling. This holds today. It is the single check that
matters, and any change that breaks it has introduced a dependency the architecture does not
have.

## What is genuinely shared, and how

Shared does not mean imported. Where two platforms must agree, the agreement is a
**specification each satisfies independently, and a test that says so**. Four such
agreements exist and all four are enforced:

| Agreement | Held by | What it asserts |
|---|---|---|
| Design tokens — 8 files | `tests/design-tokens.test.mjs` | Byte-for-byte identical in both trees. `tokens.portal.css` is the portal's declared own layer and may not redefine a shared token |
| Breakpoint scale | `tests/breakpoint-scale.test.mjs` | One scale, so the same component reflows at the same width in both |
| Status vocabulary | `tests/status-vocabulary.test.mjs` | One published list of states across both platforms |
| Filename policy | `tests/filename-policy.test.mjs` | One naming standard on both intake routes |

Each platform keeps **its own copy** in its own tree. That is what preserves independence: a
platform that reached outside its directory for a stylesheet would no longer be
independently deployable. The copies do not drift because a test fails when they do, not
because anyone remembers.

## What is deliberately NOT shared

These look like duplication and are not. Unifying any of them is a product decision for the
platforms' owners, not a tidy-up.

**Component stylesheets.** `reset`, `base`, `layout`, `components` and `colors_and_type`
differ between the two trees by 2, 26, 2, 39 and 236 lines. A public single-purpose intake
portal and a 31-route internal operator runtime do not have the same components. This
divergence is two products behaving correctly.

**The response shape.** The two clients do not agree, and are not meant to.
`core/contracts.js` `assertEnvelope()` reads an envelope — `ok`, `status.http`, `errors`,
`request{}`, `timing{}`, `meta{}`. `document-portal/js/core.js` `readJson()` unwraps nothing
and reads every field at the top level, as `portal-data-contract.json` records.
`scripts/verify-response-contract.mjs` verifies each package against **its own** client,
which is the correct shape for this architecture and would be the wrong shape for a shared
one.

**The error vocabulary.** `ErrorClass` in `core/errors.js` is fifteen frozen classes used by
four internal-platform modules and by nothing in the portal, which reports failures as
ad-hoc strings. `tests/error-taxonomy.test.mjs` holds the internal platform to its own
declaration and states in its header that the portal is out of scope for this reason.

## The capsule looks coupled and is not

`core/capsule-client.js` and the Admin Suite's capsule section administer a **deployed
instance** of the flow capsule. That is a run-time relationship over HTTP, not a source
dependency — the same kind the platforms already have with the flow estate. The capsule's
own README is explicit that the platform still calls flows directly and that adopting the
capsule is a separate deployment decision with its own cost: a server, a service account, a
backup regime.

**The internal platform builds, boots and serves with no capsule deployed anywhere.** Under
the extraction test, that is the whole question, and it passes.

## One platform, two names

`CG_` means Correspondence Gateway, and **Correspondence Gateway means Document Portal** —
always, without exception. It is a naming convention for that platform's flow tier, not a
second system. All eight `CG_*` flow definitions are portal flows.

Four workflow ids are filed under both conventions, which is how the equivalence can be
checked rather than taken on trust:

| Tenant flow id | Filed as | And as |
|---|---|---|
| `de9ef13b-ae4c-42b0-9afa-20e71a180759` | `CG_Submission_Endpoint` | `SUBMISSION_ECM_DOCS_PORTAL` |
| `badb65d8-f472-407e-8975-c29d77b855d7` | `CG_Status_Check_Endpoint` | `Portal_Status_Enquiry` |
| `86897b2f-9770-4efa-8486-2642f24bb947` | `CG_Verification_Endpoint` | `Portal_Verify` |
| `1b2c2e53-6c07-46a3-80b2-c43be1ef69db` | `CG_Support_Endpoint` | `Portal_ECM_DOCS_SUPPORT` |

A third generation, `CG_Portal_*` — which the register also names `PF_ENDPOINT_*` — exists
in the tenant register with no exported definition in this repository. That gap is GOV-06,
and `tests/flow-definition-coverage.test.mjs` holds it from widening.

## Consequences a maintainer should expect

- **Separate release histories.** A portal release does not need a runtime release. One
  changelog across both would imply a release train that does not exist.
- **Separate documentation.** Per-platform user guides, runbooks, configuration references
  and operations manuals — not one of each for the estate.
- **Separate incidents.** A portal outage and a capsule outage have different symptoms,
  different users and different responders.
- **A shared change is a coordinated change.** Altering a design token, a status word or the
  filename policy changes both platforms. The gates will tell you; they will not do it for
  you, and the copy is deliberate so that the decision is deliberate.

## What would falsify this document

An import crossing a platform boundary; a third package surface that bundles two platforms;
a shared module both import; or any platform that can no longer be `git mv`'d out on its
own. If one of those lands, this document is wrong and should be changed to say what
replaced it — not quietly left standing.
