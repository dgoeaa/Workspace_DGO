/* NITDA DGO — internal platform endpoint configuration.
 *
 * Copy to  config/config.local.js  and paste one rotated trigger URL per line.
 * A filled value looks like  https://<env>.environment.api.powerplatform.com/powerautomate/
 * automations/direct/workflows/<workflowId>/triggers/manual/paths/invoke?...&sig=<signature>
 * config.local.js is git-ignored. Never commit one, and never paste one into a ticket,
 * an email or a chat message: the sig= parameter IS the authentication, so possession of
 * the URL alone authorises invocation of the flow.
 *
 * ROTATION ORDER — the old key is revoked LAST
 *   1. In Power Automate, open the flow named below and regenerate its trigger URL.
 *   2. Paste the new URL here and reload the platform.
 *   3. Confirm the endpoint answers (scripts/acceptance-internal-endpoints.browser.js).
 *   4. Only then revoke the old signature.
 *   Reversing 3 and 4 takes the endpoint down between the revoke and the confirm.
 *
 * KEYS THAT SHARE A URL
 *   16 flows serve 18 contract keys. Where two keys sit under one heading below they
 *   are the SAME flow, distinguished by the fixed `action` string in the request body — so
 *   rotating that flow's URL rotates every key under that heading at once.
 *
 * Generated from config/endpoints.config.js and docs/reference/internal-flow-register.json.
 * Workflow ids only; no URL has ever been recorded in this repository.
 */
window.DGO_CONFIG = {
  endpoints: {
    /* Supplementary / subsidiary actions — workflow 85c556f10b8244ba9d839a2ebe240b91
       2 keys, one URL. Actions: FETCH_ACTIVITIES="LIST-ACTIVITIES", SUBSIDIARY_ACTIONS="INIT" */
    FETCH_ACTIVITIES:         "",
    SUBSIDIARY_ACTIONS:       "",

    /* Get all data — workflow aa662769f13a4666bfadf3039cd8d247
       action "fetchAll". IP_FETCH_ALL_ENDPOINT, verified against the package. Note its FLOW id
       is a different GUID (b79e6707df4d4ae78a65738aa45e9a73) — the value here is the one its
       trigger URL carries, which is what this config is checked against. */
    FETCH_ALL:                "",

    /* Get references (users, categories, departments) — workflow 885fad5ec91f460490e8c772d5d10cb8
       action "lookups". IP_Reference_Data_Endpoint — installed and verified in the tenant on
       2026-09-04: 51/51 actions, every variable write carrying its value, Method = POST. */
    REFERENCE_DATA:           "",

    /* Get docs — workflow 818ec4053f1e4f0b87845114241d8b74
       action "getDocs" */
    GET_DOCS:                 "",

    /* Fetch email attachments — workflow 20e6340941ce4b1bbb87b43c9102a777
       action "fetchEmailAttachments". IP_Fetch_Email_Attachment. */
    FETCH_EMAIL_ATTACHMENTS:  "",

    /* Single assign / create task and update activity — workflow id UNDECIDED
       action "singleassignment". Two candidates, held open pending review:
       IP_Single_Assignment_Endpoint is built from the package (63/63) and is now serviceable —
       installed and verified in the tenant on 2026-09-04. IP_Create_Task
       (6b3bad3005b44bf6bced0f8074d3f2ed) is what the deployed config calls, but is not the flow
       the package builds. */
    SINGLE_ASSIGNMENT:        "",

    /* Bulk assign — workflow id UNRESOLVED — read it from the flow itself
       action "bulkassignment" */
    BULK_ASSIGNMENT:          "",

    /* Bulk assign (direct) — workflow id UNRESOLVED — read it from the flow itself
       action "bulkassignment" */
    BULK_ASSIGNMENT_DIRECT:   "",

    /* Dynamic global endpoint interface — workflow bc83d98acf474a088832d78f50085388
       2 keys, one URL. Actions: DYNAMIC_ACTIONS="dynamicGlobalAction", EMAIL="dispatchEmail" */
    DYNAMIC_ACTIONS:          "",
    EMAIL:                    "",
    /* also served by this URL, no entry needed: DISPATCH_OUTBOUND, ARCHIVE_REFERENCE */

    /* Create task for email — workflow a942d230337c4ddfa9a386e92bbd048b
       action "emailtotaskassignment" */
    EMAIL_RELATED_TASK:       "",

    /* AI email analysis — workflow id UNRESOLVED — read it from the flow itself
       action "aiAnalyseEmail" */
    AI_EMAIL_ANALYSIS:        "",

    /* AI document analysis — workflow 3f018fea1031490fb73dff6a8d6341f2
       action "aiAnalyseEventDocs". AI_Document_Processing (flow id
       fefa43c6fb9d43378b657fd19fa09b6d — a different GUID for the same flow). */
    AI_DOC_ANALYSIS:          "",

    /* AI chat — workflow id UNRESOLVED — read it from the flow itself
       action "aiChat" */
    AI_CHAT:                  "",

    /* Web - OTP Generate — workflow 314aaf27593147089b38322e5ca25936
       action "generate" */
    OTP_GENERATE:             "",

    /* Web - OTP Verify — workflow 43879c5165de439680055ab4258b3f27
       action "verify" */
    OTP_VERIFY:               "",

    /* Scan intake (PUT, non-JSON) — workflow 88401ce1f44148539c0da53c9491f8e6
       IP_SCAN_INTAKE. Raw PUT of scanned bytes — not a JSON contract, see endpoints.config.js */
    SCAN_INTAKE:              "",
  }
};
