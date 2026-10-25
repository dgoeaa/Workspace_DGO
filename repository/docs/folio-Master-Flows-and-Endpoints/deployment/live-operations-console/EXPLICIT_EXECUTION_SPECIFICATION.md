# Explicit Execution Specification

## OP-001: Approve operational parameters

**Issue:** Required tenant and institutional values are absent from repository evidence.

**Required action:** Populate and approve every mandatory parameter before tenant modification.

**Parameters:** serviceMailbox, releaseId, recurrenceTimeZone, targetEnvironment, environmentId, authoritativeCommit, administratorTarget, intakeTarget, recurrenceFrequency, recurrenceInterval, retryMaxAttempts, retryDelayMinutes, permanentFailureThreshold, claimExpiryMinutes, processorConcurrency, businessOwner, technicalOwner, securityPrivacyOwner, deploymentWindow, rollbackWindow, hypercarePeriod

**Dependencies:** None

### Steps
1. Enter actual values under Parameters.
2. Record named business, technical, and security/privacy owners.
3. Record approval evidence and applicable environment/release.
4. Do not use examples, defaults, demonstrations, or inferred values.
5. Resolve only after the parameter validator reports zero missing values.

**Expected result:** One approved decision record applicable to the target environment and release.

### Validation
- All 21 required parameters present
- Repository-supported values unchanged
- Approval evidence recorded
- No synthetic values

## OP-002: Capture authoritative tenant inventory

**Issue:** Supplied exports cannot prove current tenant state.

**Required action:** Export and classify every active flow, endpoint, connection reference, environment variable, owner, trigger, and definition hash.

**Parameters:** targetEnvironment, environmentId, authoritativeCommit

**Dependencies:** OP-001

### Steps
1. Open the approved target Power Platform environment.
2. Export complete flow inventory through the platform UI.
3. For each flow record ID, display name, solution, owner, enabled state, trigger, connections, modification time, last success/failure, and SHA-256.
4. Classify each flow as authoritative, duplicate, superseded, orphaned, or unknown.
5. Record repository/tenant divergence without suppressing it.
6. Block progression while any active flow is unknown.

**Expected result:** A complete live baseline with no unclassified active flow.

### Validation
- Every active flow classified exactly once
- Every definition hashed
- Authoritative commit or divergence recorded

## OP-003: Prove endpoint-to-flow routing

**Issue:** Multiple candidate flows exist and live routing is unverified.

**Required action:** Map every endpoint operation to exactly one enabled authoritative flow.

**Parameters:** targetEnvironment, environmentId

**Dependencies:** OP-002

### Steps
1. Generate a unique non-sensitive correlation ID.
2. Invoke the endpoint through the normal client or approved platform test interface.
3. Locate the tenant run containing the correlation ID.
4. Record contract key, masked endpoint identifier, workflow ID, operation, authentication type, response and run ID.
5. Confirm no second flow processed the correlation ID.
6. Repeat for every portal and internal endpoint operation.

**Expected result:** One active intended carrier per endpoint operation.

### Validation
- No duplicate processing
- Response contract valid
- No unmapped endpoint

## OP-004: Verify Outlook service identity

**Issue:** Connection references do not prove authenticated account or Exchange authority.

**Required action:** Verify every production mail carrier uses the approved durable Agency identity.

**Parameters:** targetEnvironment, serviceMailbox

**Dependencies:** OP-002

### Steps
1. Open Connections and Connection References in the target environment.
2. Identify every Office 365 Outlook connection used by in-scope flows.
3. Confirm authenticated account equals dgsregistry@nitda.gov.ng.
4. Verify approved send-as or send-on-behalf authority.
5. Send controlled internal and external messages.
6. Execute an approved rejection test.
7. Capture masked headers, message trace IDs, rejection evidence, and reply routing.

**Expected result:** All mail carriers use the approved service identity.

### Validation
- Account matches service mailbox
- Permission proven
- Internal/external delivery proven
- Rejection traceable

## OP-005: Correct citizen verification and officer OTP

**Issue:** Code-generation paths contain fixed registry recipients.

**Required action:** Bind recipient to the validated requesting person and remove codes from subjects.

**Parameters:** serviceMailbox

**Dependencies:** OP-003, OP-004

### Steps
1. Normalize and validate the current citizen request email.
2. Bind citizen verification To to that validated value.
3. Bind officer OTP To to the authenticated active officer.
4. Remove fixed registry recipients from generation paths.
5. Set subject to Your NITDA verification code.
6. Preserve expiry, single use, attempt cap and no-code logging.
7. Test requester, unrelated recipient, expiry, reuse and excessive attempts.

**Expected result:** Codes reach only the requesting person.

### Validation
- Requester receives code
- Registry mailbox does not
- Code absent from subject/logs
- Expiry/single-use/attempt cap pass

## OP-006: Correct bulk, correspondence, report and intake recipients

**Issue:** Fixed or discarded recipient values misroute operational mail.

**Required action:** Replace fixed recipients with validated dynamic audiences or approved role targets.

**Parameters:** administratorTarget, intakeTarget, serviceMailbox

**Dependencies:** OP-001, OP-003, OP-004

### Steps
1. Group bulk-assigned records by resolved assignee.
2. Send each officer only records assigned to that officer.
3. Use validated correspondent address for outward official correspondence.
4. Preserve the reporting module recipient list.
5. Use the approved intake target for new submissions.
6. Remove the empty-recipient and empty-subject action.
7. Remove personal fixed recipients from required notifications.

**Expected result:** Each message reaches its intended and authorized audience.

### Validation
- No personal fixed recipient
- No empty To/Subject
- Data segregation passes
- Correspondence reaches intended addressee

## OP-007: Protect RN-009 and RN-025

**Issue:** Replacement packages remove assignment notification and upload/writeback observability.

**Required action:** Block replacement until equivalent or better capabilities pass acceptance.

**Parameters:** authoritativeCommit, releaseId

**Dependencies:** OP-002, OP-004

### Steps
1. Add a dynamic assignee carrier to the single-assignment replacement.
2. Retain current upload/writeback visibility or implement structured telemetry first.
3. Record flow ID, run ID, request ID, action, times, status, outcome, error, reference and retry count.
4. Execute before-and-after regression tests.
5. Prove rollback before route change.

**Expected result:** No loss of assignment delivery or operational visibility.

### Validation
- RN-009 passes
- RN-025 searchable
- Rollback proven

## OP-008: Implement immediate event carriers

**Issue:** Submission acknowledgement, support closure, supporting assignee and copy/inform delivery are incomplete.

**Required action:** Implement transactional carriers at authoritative event boundaries.

**Parameters:** serviceMailbox, releaseId

**Dependencies:** OP-005, OP-006, OP-007

### Steps
1. Send submission acknowledgement only after durable reference minting.
2. Send support response/closure from the controlled case event.
3. Consume resolved supporting-assignee and approved copy/inform audiences.
4. Validate recipient, mandatory tokens, template/version and event version.
5. Compute idempotency key.
6. Record attempt, outcome and failure evidence.

**Expected result:** One correct notification per required recipient and event version.

### Validation
- Correct event/recipient
- No duplicate
- Failure recorded
- No false delivery claim

## OP-009: Implement lifecycle carriers

**Issue:** Action-required, decision, withdrawal, approval, reassignment, comment and delegation events lack complete carriers.

**Required action:** Create controlled lifecycle events and one delivery per event version.

**Parameters:** serviceMailbox, releaseId

**Dependencies:** OP-008

### Steps
1. Separate workflow state from notification and delivery state.
2. Create event record with requirement ID, entity, event version, recipient source, template and source run.
3. Re-read authoritative state before send.
4. Cancel or supersede stale events.
5. Prevent duplicate delivery when the same state is saved again.
6. Test approved and declined separately.

**Expected result:** Lifecycle changes notify required parties exactly once.

### Validation
- Return reaches originator
- New holder notified
- Comment audience approved
- No same-version duplicate

## OP-010: Implement governed dispatch

**Issue:** dispatch and dispatchoutbound are recognized but reach 501.

**Required action:** Implement one canonical authorized dispatch operation or map supported aliases.

**Parameters:** serviceMailbox, releaseId

**Dependencies:** OP-004, OP-006, OP-007

### Steps
1. Validate actor authority and role.
2. Resolve the approved final document and attachment set.
3. Validate recipient, subject, correspondence type, channel and transmittal reference.
4. Send through the approved Outlook connection.
5. Record attempt, result, state transition and failure class.
6. Queue only approved retryable failures.

**Expected result:** Authorized dispatch completes with evidence and no released 501 path.

### Validation
- Success/denial pass
- Missing document blocked
- Invalid recipient blocked
- Failure/retry pass
- No released 501

## OP-011: Build scheduled notification processor

**Issue:** No recurrence or record-change carrier handles due and failed notification work.

**Required action:** Create a governed recurrence processor using only approved timing and retry values.

**Parameters:** recurrenceFrequency, recurrenceInterval, recurrenceTimeZone, retryMaxAttempts, retryDelayMinutes, permanentFailureThreshold, claimExpiryMinutes, processorConcurrency, administratorTarget

**Dependencies:** OP-001, OP-004, OP-008, OP-009, OP-010

### Steps
1. Query indexed eligible acknowledgement, due, reminder, escalation and failed-send rows.
2. Claim one row atomically and set claim expiry.
3. Re-read authoritative state and cancel stale events.
4. Validate recipient and mandatory tokens.
5. Compute idempotency key from requirement, entity, event version and recipient.
6. Check for prior success.
7. Send and record attempt.
8. Schedule approved retry or permanent failure.
9. Alert approved administrator target.
10. Finalize claim and audit result.

**Expected result:** Automatic, auditable processing of due and failed work.

### Validation
- Concurrent claim safe
- Crash recovery safe
- No ambiguous duplicate
- Attempt maximum enforced
- Permanent failure alert works

## OP-012: Execute all 38 requirement acceptance cases

**Issue:** Repository tests cannot prove live delivery, failure, retry, rendering or accessibility.

**Required action:** Complete evidence for every RN row and repository-defined mail-client scenario.

**Parameters:** targetEnvironment, releaseId

**Dependencies:** OP-005, OP-006, OP-007, OP-008, OP-009, OP-010, OP-011

### Steps
1. Execute success and failure tests for every required carrier.
2. Capture flow/run/idempotency/masked recipient/sender/template/trace/receipt/retry/tester/date.
3. Test invalid and empty recipient, unauthorized caller, disabled user, missing token, timeout, rejection, duplicate, concurrency, crash recovery, retry and rollback.
4. Test supported Outlook, Gmail, mobile, dark mode, images disabled, narrow viewport, long content, row volume, keyboard and screen-reader scenarios.
5. Do not mark a result passed without evidence references.

**Expected result:** Thirty-eight complete acceptance records and client results.

### Validation
- Every RN has result
- Critical rows pass or accepted
- Failure/retry evidence complete
- Accessibility recorded

## OP-013: Execute cutover and rollback rehearsal

**Issue:** Safe production replacement requires staged routing, reconciliation and proven restoration.

**Required action:** Deploy in dependency order and rehearse full rollback.

**Parameters:** deploymentWindow, rollbackWindow, releaseId

**Dependencies:** OP-012

### Steps
1. Freeze related changes.
2. Export and hash current flows.
3. Deploy lists/fields, connections, immediate carriers, lifecycle carriers, processor, then clients.
4. Bind approved connections and environment variables.
5. Test one flow before changing its route.
6. Reconcile in-flight queue and receipt rows.
7. Disable but do not delete superseded flows.
8. Restore prior route during rehearsal.
9. Confirm endpoint continuity and no duplicate delivery.

**Expected result:** A controlled and recoverable cutover.

### Validation
- No duplicate processing
- Endpoint continuity
- Rollback within approved window
- In-flight work reconciled

## OP-014: Activate hypercare and authorize production

**Issue:** Live operation requires accountable ownership, residual-risk treatment and formal approval.

**Required action:** Establish hypercare and approve the exact release and evidence.

**Parameters:** businessOwner, technicalOwner, securityPrivacyOwner, hypercarePeriod, authoritativeCommit, releaseId

**Dependencies:** OP-013

### Steps
1. Name business, technical and security/privacy owners.
2. Configure daily review, trace access, incident route, emergency correction, rollback authority and exit criteria.
3. Create one risk record for every unresolved requirement.
4. Approve commit, packages, flow IDs, sender identity, acceptance evidence, rollback evidence, window and operator.
5. Record approval time and applicable environment.

**Expected result:** A formally authorized, supported and monitored production release.

### Validation
- No critical item unresolved without acceptance
- Hypercare active
- Authorization complete
- Exact release recorded

