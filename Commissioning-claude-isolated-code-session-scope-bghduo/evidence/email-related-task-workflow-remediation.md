# Email Related Task Workflow Remediation

## Date

2026-09-13

## Issue

The endpoint register referenced the retired application workflow ID:

`35656042412340f2840ab1fb6fd22296`

The active `IP_Create_Email_Assignment_Endpoint` serves application workflow ID:

`a942d230337c4ddfa9a386e92bbd048b`

## Tenant Validation

- Flow display name: `IP_Create_Email_Assignment_Endpoint`
- Active application workflow ID: `a942d230337c4ddfa9a386e92bbd048b`
- Trigger URL signature length: 43 characters
- Tenant flow ID: recorded in the flow identity crosswalk but omitted from this evidence note

## Repository Remediation

All active endpoint identity records were updated from the retired workflow ID to:

`a942d230337c4ddfa9a386e92bbd048b`

Primary remediation commit:

`bb992f4` — `Replace retired Email Related Task workflow ID`

Generated harvester synchronization commit:

`b186a2a` — `chore: regenerate endpoint harvester build`

## Verification

The generated harvester reported:

- 25 contract keys
- 36 candidate records
- 36 addressable records
- Build `86fd49c296f4`

Automated results:

- Harvester tests: 46 passed, 0 failed
- Fetch-values tests: 31 passed, 0 failed
- Harvested values: 25
- Complete signatures: 25 of 25
- Internal runtime configuration: 18 of 18
- Public portal configuration: 7 of 7
- Automated commissioning blockers: 0

The retired workflow ID is retained in this evidence note only as historical remediation context.

## Deployment Outcome

- Updated harvester scope deployed successfully
- All 25 endpoint values harvested successfully
- Runtime configurations generated and validated
- Temporary endpoint harvester deleted
- Transient values file removed
- Changes pushed successfully

## Status

Complete.
