export const FetchPolicy = Object.freeze({
  // Bounded UI-facing timeouts: a sync against an unreachable endpoint must surface its failure
  // toast promptly rather than spinning for up to 45-120s. Values still accommodate Power Automate
  // manual-trigger cold starts (typically <10s).
  defaults: { timeoutMs:15000, retry:1, dedupe:true, staleWhileRevalidate:true, cacheTtlMs:300000, backgroundRefresh:false },
  endpoints: {
    /* 90s, matching EndpointContracts.FETCH_ALL — NOT the 20s bound below.
       core/data-client.js resolves `policy.timeoutMs || contract.timeoutMs`, so a value here
       always wins and the contract's 90000 was dead code. At 20s the boot load was aborted
       client-side before the flow answered: the deployed FETCH_ALL reads seven SharePoint
       lists plus an Entra user search in one request, so the note above — "cold starts
       typically <10s" — does not describe this endpoint. The abort produces no console
       network error (an aborted request is not a failed response), so the only visible
       symptom was the FETCH_ACTIVITIES fallback firing, and the platform booting with no
       data and no explanation. */
    FETCH_ALL: { timeoutMs:90000, retry:1, dedupe:true, staleWhileRevalidate:true, cacheTtlMs:600000, payloadBudgetBytes:6500000 },
    FETCH_ACTIVITIES: { timeoutMs:15000, retry:1, dedupe:true, staleWhileRevalidate:true, cacheTtlMs:300000, payloadBudgetBytes:2500000 },
    AI_CHAT: { timeoutMs:30000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0, payloadBudgetBytes:500000 },
    /* Writes: 90 s and no automatic retry (tenant defect 2026-10-10). SINGLE_ASSIGNMENT took about 14 s of flow time
       for TASK-2026-00002, so at 15 s the client gave up while the flow was still sending the e-mail: the officer saw a
       failure for an assignment that had succeeded, and with retry 1 a second attempt could have created a second task
       (only DYNAMIC_ACTIONS de-duplicates a repeated request). A write is now waited for, never repeated by the client,
       and never cached. */
    DYNAMIC_ACTIONS: { timeoutMs:90000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0, payloadBudgetBytes:1000000 },
    SUBSIDIARY_ACTIONS: { timeoutMs:90000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0 },
    SINGLE_ASSIGNMENT: { timeoutMs:90000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0 },
    BULK_ASSIGNMENT: { timeoutMs:90000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0 },
    USER_ADMIN: { timeoutMs:90000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0 },
    ACTIVITY_LIFECYCLE: { timeoutMs:90000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0 },
    EMAIL: { timeoutMs:90000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0 },
    EMAIL_RELATED_TASK: { timeoutMs:90000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0 },
    SCAN_INTAKE: { timeoutMs:90000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0 },
    DISPATCH_OUTBOUND: { timeoutMs:90000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0 },
    ARCHIVE_REFERENCE: { timeoutMs:90000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0 },
    OTP_GENERATE: { timeoutMs:20000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0 },
    OTP_VERIFY: { timeoutMs:20000, retry:0, dedupe:false, staleWhileRevalidate:false, cacheTtlMs:0 }
  }
});
export function fetchPolicyFor(key){ return Object.freeze({ ...FetchPolicy.defaults, ...(FetchPolicy.endpoints[key]||{}) }); }
