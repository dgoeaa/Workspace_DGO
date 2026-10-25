# Remediation Execution Plan

## Phase 0: freeze and identify

1. Preserve this ZIP and verify `SHA256SUMS.txt`.
2. Select and record the exact `workspace-source` commit proposed for remediation.
3. Obtain a complete exact export or clone with Git history for that commit.
4. Do not modify baselines, registers, references, or release checks before recording the initial failure state.

## Phase 1: authority and evidence assignment

1. Assign named authorised people to the roles in the closure matrix.
2. Replace every pending private-evidence locator only with an actual controlled locator.
3. Record per-entry decisions for 36 runtime records and 20 large-file entries.
4. Record the authorised source or disposition for the evidence register and each missing reference target.

## Phase 2: exposure response

1. Contain access as directed by the owner or tenant authority.
2. Review source history, snapshots, artifacts, caches, and distributions.
3. Revoke or rotate affected capabilities.
4. Prove old capabilities fail without reproducing confidential values in the public report.

## Phase 3: engineering remediation

1. Implement only approved per-entry recoveries, retirements, sanitizations, replacements, or reference corrections.
2. Restore `evidence-register.yaml` only from an authorised provenance-checked source.
3. Do not invent missing records or substitute unrelated documents.
4. Preserve test strength and governance ratchets.

## Phase 4: verification

1. Run hygiene and reference checks against the exact named commit.
2. Run all required offline checks.
3. Run isolated-browser checks with production egress blocked.
4. Record commands, exit codes, logs, environment, commit, and failures.
5. Review source, decoded artifacts, containers, and scan limitations.

## Phase 5: tenant and staging evidence

1. Use authorised isolated staging.
2. Prove server-side identity and record-level authorization on all five intended surfaces.
3. Include denial tests for missing, forged, expired, and wrong-role proofs.
4. Preserve tenant evidence privately and reference it through controlled locators.

## Phase 6: artifact and rollback

1. Build the exact proposed artifact from the exact verified commit.
2. Record artifact hashes.
3. Independently inspect for private configuration and signed endpoints.
4. Approve and rehearse rollback.

## Phase 7: human release decision

1. Obtain dated security, tenant, operations, and owner sign-offs from named authorised people.
2. Re-run the release check without weakening it.
3. Issue a separate evidence-backed release decision. Until then, the status remains NO-GO.
