/**
 * The probe table — one definition, two callers.
 *
 * Each probe is the smallest request that exercises a flow's routing without asking it to
 * do anything it would not do in normal use. `expect` lists the top-level response keys the
 * reference corpus documents for that flow; where the corpus documents none, it is left out
 * and the caller reports what came back rather than judging it.
 *
 * WHY IT IS ITS OWN MODULE. Two things now probe these endpoints — `scripts/verify-endpoints.mjs`
 * from a terminal, and the `ENDPOINT-CHECK.html` page each delivered package carries, which
 * runs in the browser on the operator's own machine. Those are the same question asked from
 * two places, and the second is the one that matters: the browser is where the real request
 * path is, and it is the only place that can answer "do these flows work from where I am?"
 * Two copies of a probe table is two chances for the terminal and the browser to disagree
 * about what was tested, which would make the disagreement itself the finding.
 *
 * `__probe` and the `__DGO_PROBE__` markers travel on every request so anything a probe
 * creates can be found and deleted afterwards.
 */

/**
 * @param {object} opts
 * @param {string} opts.probeEmail  the address probes identify themselves with
 * @param {string} opts.runId       a per-run marker, written into anything a write probe creates
 */
export function probeTables({ probeEmail, runId }) {
  const PROBE_EMAIL = probeEmail;
  const RUN_ID = runId;

  const RUNTIME_PROBES = {
    FETCH_ALL: { body: { action: 'fetchAll', userEmail: PROBE_EMAIL }, expect: ['tasks', 'docs', 'emails'] },
    GET_DOCS: { body: { action: 'getDocs', userEmail: PROBE_EMAIL }, expect: ['docs'] },
    REFERENCE_DATA: { body: { action: 'lookups', userEmail: PROBE_EMAIL }, expect: ['users', 'categories', 'departments'] },
    FETCH_ACTIVITIES: { body: { action: 'LIST-ACTIVITIES', userEmail: PROBE_EMAIL } },
    FETCH_EMAIL_ATTACHMENTS: { body: { action: 'fetchEmailAttachments', userEmail: PROBE_EMAIL } },

    SUBSIDIARY_ACTIONS: { body: { action: 'GET_BOOTSTRAP', name: 'GET_BOOTSTRAP', userEmail: PROBE_EMAIL } },
    DYNAMIC_ACTIONS: { body: { action: 'dynamicGlobalAction', operation: 'noop', userEmail: PROBE_EMAIL } },
    SINGLE_ASSIGNMENT: { body: { action: 'singleassignment', operation: 'create', userEmail: PROBE_EMAIL } },
    BULK_ASSIGNMENT: { body: { action: 'bulkassignment', operation: 'create', userEmail: PROBE_EMAIL } },
    BULK_ASSIGNMENT_DIRECT: { body: { action: 'bulkassignment', operation: 'create', userEmail: PROBE_EMAIL } },
    EMAIL: { body: { action: 'dispatchEmail', userEmail: PROBE_EMAIL } },
    EMAIL_RELATED_TASK: { body: { action: 'emailtotaskassignment', userEmail: PROBE_EMAIL } },
    AI_EMAIL_ANALYSIS: { body: { action: 'aiAnalyseEmail', userEmail: PROBE_EMAIL } },
    AI_DOC_ANALYSIS: { body: { action: 'aiAnalyseEventDocs', userEmail: PROBE_EMAIL } },
    AI_CHAT: { body: { action: 'aiChat', userEmail: PROBE_EMAIL, message: '__DGO_PROBE__' }, expect: ['reply'] },
    OTP_GENERATE: { body: { action: 'generate', identifier: PROBE_EMAIL, userEmail: PROBE_EMAIL } },
    OTP_VERIFY: { body: { action: 'verify', identifier: PROBE_EMAIL, otp_code: '000000', userEmail: PROBE_EMAIL } },

    /* Two contracts, one URL. DISPATCH_OUTBOUND and ARCHIVE_REFERENCE both post to the
       DYNAMIC_ACTIONS trigger and are distinguished only by `action`, so provisioning that
       one URL commissions three obligations rather than one. Until these were added, the
       verifier exercised the first and reported the surface green — a flow whose switch had
       no `dispatchOutbound` case would have been discovered by the first officer who tried
       to dispatch a decision, in production. `via` names the key whose URL to use. */
    DISPATCH_OUTBOUND: {
      via: 'DYNAMIC_ACTIONS',
      body: { action: 'dispatchOutbound', ref: '__DGO_PROBE__', channel: 'email', recipients: [PROBE_EMAIL], userEmail: PROBE_EMAIL },
    },
    ARCHIVE_REFERENCE: {
      via: 'DYNAMIC_ACTIONS',
      body: { action: 'archiveReference', ref: '__DGO_PROBE__', userEmail: PROBE_EMAIL },
    },

    /* Not a JSON contract: core/scan-intake-service.js PUTs the raw bytes of a scanned
       document with the filename, size and digest in headers, because base64-in-JSON is what
       produced the 4 MB ceiling this replaced. Probing it with a POSTed envelope would prove
       nothing about the path the platform actually uses. */
    SCAN_INTAKE: { transport: 'bytes', filename: '__DGO_PROBE__.txt' },
  };

  /* THE PORTAL PROBES CARRY THE CONTRACT'S FIELD NAMES, NOT AN APPROXIMATION OF THEM.
     Every field below appears in portal-data-contract.json (status: AUTHORITATIVE) for that
     endpoint, and `npm run test:probecontract` fails if one does not. This table previously
     carried the pre-reconciliation names — `SubmitterName`, `EmailAddress`, `DocumentType`,
     `subject` for SUPPORT's `topic` — and sent an explicit `action` to VERIFY and
     VERIFY_CONFIRM. A correct flow answers 400 to that, so the probe reported a defect on a
     flow that was working and would have reported success on one that was not. */
  const PORTAL_PROBES = {
    STATUS: {
      write: false,
      body: { referenceId: '__DGO_PROBE__', email: PROBE_EMAIL },
      expect: ['record'],
      flat: true,
      /* The register must not confirm that a reference exists, so an unknown pair and a wrong
         address answer identically. __DGO_PROBE__ is by construction unknown: 404 is the
         correct answer and the evidence the uniform denial is implemented. */
      expectStatus: [404],
      expectStatusWhy: 'the uniform denial — the flow refuses to say whether the reference exists',
    },

    SUBMISSION: {
      write: true,
      flat: true,
      body: {
        localId: RUN_ID,
        channel: 'Portal',
        correspondenceType: 'General Correspondence',
        subject: '__DGO_PROBE__',
        category: 'General Correspondence',
        sender: { name: '__DGO_PROBE__' },
        senderEmail: PROBE_EMAIL,
        description: RUN_ID,
        submittedAt: new Date().toISOString(),
        attachments: [],
      },
      expect: ['referenceId'],
    },

    SUPPORT: {
      write: true,
      flat: true,
      /* `topic` is the contract's name and it is the topic's LABEL, not an internal key. */
      body: { name: '__DGO_PROBE__', email: PROBE_EMAIL, topic: '__DGO_PROBE__', message: RUN_ID, aboutReference: '' },
      expect: ['caseRef'],
    },

    /* NO `action` FIELD. document-portal/js/core.js sends none on either call — verifyRequest
       posts { email }, verifyConfirm posts { email, code } — and the flow routes on the
       presence of `code`. Sending an explicit action here would exercise a path the portal
       never takes, and an action outside {generate, verify} is refused. */
    VERIFY: {
      write: true, flat: true,
      body: { email: PROBE_EMAIL },
      expect: ['sent', 'expiresAt'],
    },

    VERIFY_CONFIRM: {
      write: true, flat: true,
      body: { email: PROBE_EMAIL, code: '000000' },
      /* A code of six zeros will not match a real challenge. The pass is the refusal: a flow
         that returns a proof for an unmatched code mints proofs for anyone. */
      expectStatus: [401, 404, 410],
      expectStatusWhy: 'refused a code that matches no live challenge — the comparison is live',
    },

    /* WRITEBACK requires a proof on every call and the probe holds none. A refusal is the
       pass, and it is the only control on this endpoint: a proof is the sole authentication,
       so a WRITEBACK that accepts a call without one accepts a call from anyone. */
    WRITEBACK: {
      write: true, flat: true,
      body: { referenceId: '__DGO_PROBE__', verification: '__DGO_PROBE__', action: 'note', body: RUN_ID },
      expectStatus: [401, 403, 404],
      expectStatusWhy: 'refused a write-back carrying no valid proof — the proof check is live',
    },

    /* The ticket-redeeming attachment PUT. A deposit without a ticket should be REFUSED —
       that refusal is the evidence that the flow validates its own callers, which on a public
       channel is the whole control. */
    UPLOAD: {
      write: true, transport: 'bytes', filename: '__DGO_PROBE__.txt', flat: true,
      expectStatus: [401, 403],
      expectStatusWhy: 'refused a deposit carrying no upload ticket — the ticket check is live',
    },
  };

  return { RUNTIME_PROBES, PORTAL_PROBES };
}
