# Flow package provenance

> **Frozen record (2026-10-21).** The twenty supplied packages this page assesses, and the script that built it, were
> retired: the branch keeps only the latest version of every package (owner direction). `registers/flow-retirement.json`
> names the commit that still holds the archive. What this page found still stands; none of these packages is to be imported.

<!-- Built by scripts/build-flow-package-provenance.mjs until 2026-10-21 (retired with the archive; see the note above). Earlier note: run
     `npm run flowpackages` and commit the result. `npm run test:flowpackages` fails on drift. -->

Twenty Power Automate export packages are committed under
`docs/folio-Master-Flows-and-Endpoints/artifacts/matched-flow-packages/2026-09-24/` (retired 2026-10-21).
This is what each one turns out to be.

A package carries a full flow definition in the platform’s own export format, which makes it
look like a description of what is deployed. It is not. It is a snapshot of whatever flow was
open when somebody exported, and this estate has several flows per endpoint — renamed
predecessors, parallel rebuilds, versioned successors that never went live. The question this
page answers is the narrow one that decides whether a package is safe to act on: **is it an
export of a flow that a wired endpoint actually resolves to?**

Of 20, **14 are**. 6 are not.

## The three readings

| | what it is | where it comes from |
| --- | --- | --- |
| as built | the package’s own `definition.json` | the committed archive |
| as deployed | a live read through the Flow Management API, 2026-09-18 | [`docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-18-tenant-flow-inventory.json`](../../../docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-18-tenant-flow-inventory.json) |
| as recorded | this repository’s dated exports | [`docs/folio-Master-Flows-and-Endpoints/contracts/deployed/`](../../../docs/folio-Master-Flows-and-Endpoints/contracts/deployed/) |

They join on the dashed Power Automate flow id, the only identifier all three carry. Not one
of the 20 packages carries a workflow id that a wired endpoint addresses — that is open item
GOV-06, measured rather than assumed: they do contain 32-hex tokens, but those are environment
and connection ids, and `fullResourceId` restates the dashed flow id in resource form rather
than resolving it. So the wired estate reaches these packages only through the tenant
reading’s registry, which carries both identifiers.

## What the tenant says

> Twenty of twenty flows read live in this tenant on 2026-09-18 carried triggerAuthenticationType = All. Not one carried Tenant. See laterReadings: one of them, IP_SCAN_INTAKE, was restored to Tenant on 2026-09-24.

That is 20 flows read on 2026-09-18, all in state `Started`. Against that,
no workflows’ recorded posture is no longer the deployed one:

_None._

## Packages that are exports of a deployed flow

| package | flow id | contract keys | as built | as deployed | agree |
| --- | --- | --- | --- | --- | --- |
| `CG_Portal_Status_Check_Endpoint_20260906045148.zip` | `60042a2e-dadb-4ad8-a672-38b4132d299f` | STATUS | All / POST | All / POST | yes |
| `CG_Portal_Support_Endpoint_20260906044318.zip` | `4873c936-a2be-4726-8e69-426edb8f70e6` | SUPPORT | All / POST | All / POST | yes |
| `CG_Portal_Verification_Confirmation_Endpoint_20260906044511.zip` | `f96e3448-3c79-4d42-b224-825258a552ba` | VERIFY_CONFIRM | All / POST | All / POST | yes |
| `CG_Portal_Writeback_Endpoint_20260906044535.zip` | `bde13d27-73b3-4e1a-9687-eb289b039c7a` | WRITEBACK | All / POST | All / POST | yes |
| `CG_Submission_Endpoint_20260903050323.zip` | `de9ef13b-ae4c-42b0-9afa-20e71a180759` | SUBMISSION | All / POST | All / POST | yes |
| `CG_Upload_Endpoint_20260904032403.zip` | `df82e331-b800-4a8d-996e-d2b2ca846c77` | UPLOAD | All / PUT | All / PUT | yes |
| `CG_Verification_Endpoint.READY.zip` | `86897b2f-9770-4efa-8486-2642f24bb947` | VERIFY | All / POST | not in the reading | — |
| `IP_OTP_Endpoint_20260905062238.zip` | `913bd078-5411-404f-85ac-507c10fe1a09` | OTP_GENERATE, OTP_VERIFY | All / POST | All / POST | yes |
| `IP_OTP_VERIFY_20260905184729.zip` | `4dbe6dde-37d5-47b4-ba32-d4ae5c9f8b61` | OTP_GENERATE, OTP_VERIFY | All / POST | All / POST | yes |
| `IP_Reference_Data_Endpoint_20260918173247.zip` | `9a4dea8e-15f2-42b6-904d-3655056fa3c2` | REFERENCE_DATA | All / POST | All / POST | yes |
| `IP_Retrieve_Email_Attachment_Endpoint_20260906045907 (1).zip` | `5bc87cf3-7a99-4259-b6a2-315fbc794d9b` | FETCH_EMAIL_ATTACHMENTS | All / POST | All / POST | yes |
| `IP_SEND_EMAIL_20260905184716.zip` | `df59a69f-92ca-4554-ae68-6b464aa73ef7` | EMAIL | All / (any verb — none declared) | All / (any verb — none declared) | yes |
| `IP_Single_Assignment_Endpoint.READY.zip` | `05825db0-c806-4974-807c-c062f386cc41` | SINGLE_ASSIGNMENT | All / POST | All / POST | yes |
| `IP_Subsidiary_Actions_Endpoint_20260905193834.zip` | `08da1783-927f-4662-a429-45e1249a989f` | DYNAMIC_ACTIONS, SUBSIDIARY_ACTIONS | All / POST | All / POST | yes |

## Packages that are not

No wired endpoint resolves to any of these flow ids. Each is a real export of a real flow —
the point is only that it is not the flow its name will be taken for.

| package | flow id | as built | in the tenant reading |
| --- | --- | --- | --- |
| `IP_Create_Email_Assignment_Endpoint_20260906043757.zip` | `2fbb5485-6244-46eb-8a38-48e443a1d9fb` | All / POST | no |
| `IP_Dynamic_Global_Actions_EndpointFlow_20260917230439.zip` | `31c0aaf0-ddbb-478c-9a98-bc013265c4c7` | All / (any verb — none declared) | no |
| `IP_FETCH_ALL__EXTENDED_ENDPOINTFlow_20260911003936.zip` | `ce2cbed8-d180-4160-a0c7-f552101bc412` | All / POST | no |
| `IP_Get_Docs_Endpoint_20260917225825.zip` | `28f6e62a-fea8-437c-a61a-47aec706c4e2` | All / (any verb — none declared) | no |
| `IP_SCAN_INTAKE_Endpoint_v2.1_NOTIFICATIONS_REPORTS_20260913.zip` | `12b6e690-a065-468d-b470-fcfba015f1f8` | Tenant / PUT | no |
| `IP_Bulk_Assignment_Endpoint_20260901023331.zip` | `f96399c6-31d9-493a-a304-3fa8efda6ef8` | All / (any verb — none declared) | no |

### Import hazard — 3 of them answer every verb

These declare no HTTP method, so the trigger accepts any. Importing one over the flow its
name suggests would replace a method-constrained trigger with an unconstrained one.

- `IP_Dynamic_Global_Actions_EndpointFlow_20260917230439.zip` (`31c0aaf0-ddbb-478c-9a98-bc013265c4c7`)
- `IP_Get_Docs_Endpoint_20260917225825.zip` (`28f6e62a-fea8-437c-a61a-47aec706c4e2`)
- `IP_Bulk_Assignment_Endpoint_20260901023331.zip` (`f96399c6-31d9-493a-a304-3fa8efda6ef8`)

## Contract keys the archive does not cover

Read out of the archive’s own `manifests/contract_to_package_mapping.csv`. The archive
declares these itself rather than substituting something else for them, which is the right
behaviour and is recorded here as such.

- **AI_CHAT** — SOURCE_COLLECTION_NOT_ATTACHED; expected from `OTH__FULL_EMBEDDED_CONTENTS.json`
- **AI_DOC_ANALYSIS** — SOURCE_COLLECTION_NOT_ATTACHED; expected from `OTH__FULL_EMBEDDED_CONTENTS.json`
- **AI_EMAIL_ANALYSIS** — SOURCE_COLLECTION_NOT_ATTACHED; expected from `OTH__FULL_EMBEDDED_CONTENTS.json`
- **BULK_ASSIGNMENT** — SOURCE_COLLECTION_NOT_ATTACHED; expected from `OTH__FULL_EMBEDDED_CONTENTS.json`. A related package, `IP_Bulk_Assignment_Endpoint_20260901023331.zip`, is included separately and is **not** a substitute for it.
- **BULK_ASSIGNMENT_DIRECT** — SOURCE_COLLECTION_NOT_ATTACHED; expected from `OTH__FULL_EMBEDDED_CONTENTS.json`

## What this does not establish

- **That a package agreeing with the tenant is safe to import.** It agrees on trigger posture,
  which is what is compared here. Nothing below the trigger is compared.
- **That the six are wrong.** They are exports of flows no wired endpoint resolves to. Whether
  one of them is the intended successor is a decision for whoever built it, not a reading.
- **That the tenant reading is the whole estate.** It is 20 flows found of 26 requested;
  6 were requested and not returned, each with the API error that produced it.

