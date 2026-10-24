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
 *   Keys naming the same workflow id below are the SAME flow, told apart by the request's `action`, so
 *   rotating that flow's URL rotates every one of those keys at once.
 *
 * Each key's flow, flow id and workflow id below are as read from the tenant on 2026-10-07 (Flow Management API,
 * listCallbackUrl; docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json). Workflow ids only; no URL is
 * recorded in this repository.
 */
window.DGO_CONFIG = {
  endpoints: {
    /* IP_Get_Docs_Endpoint (28f6e62a-fea8-437c-a61a-47aec706c4e2), workflow c4c26f93ba1e4d7db5247536c30cdc11. action "LIST-ACTIVITIES". */
    FETCH_ACTIVITIES:         "",

    /* IP_Dynamic_Global_Actions_Endpoint (31c0aaf0-ddbb-478c-9a98-bc013265c4c7), workflow d5e4b3da41e34819b3f953d2acbc2dd7. action "INIT". */
    SUBSIDIARY_ACTIONS:       "",

    /* IP_FETCH_ALL_BOOTSTRAP (b79e6707-df4d-4ae7-8a65-738aa45e9a73), workflow aa662769f13a4666bfadf3039cd8d247. action "fetchAll". */
    FETCH_ALL:                "",

    /* IP_Reference_Data_Endpoint (9a4dea8e-15f2-42b6-904d-3655056fa3c2), workflow 885fad5ec91f460490e8c772d5d10cb8. action "lookups". */
    REFERENCE_DATA:           "",

    /* IP_Get_Docs_Endpoint (28f6e62a-fea8-437c-a61a-47aec706c4e2), workflow c4c26f93ba1e4d7db5247536c30cdc11. action "getDocs". */
    GET_DOCS:                 "",

    /* IP_Retrieve_Email_Attachment_Endpoint (5bc87cf3-7a99-4259-b6a2-315fbc794d9b), workflow d2c773332f6f4fbf97ee4a5baa01f70b. action "fetchEmailAttachments". */
    FETCH_EMAIL_ATTACHMENTS:  "",

    /* Single_Task_Assignment (3caf9458-8d95-4740-a01b-6803dad97d34), workflow 72acfc6a694f414f9fe39c939ead7f08. action "singleassignment". */
    SINGLE_ASSIGNMENT:        "",

    /* BULK_OPS_DATA_RETRIEVAL_HTTP (5aab9e61-ab9f-4af1-9f2b-eaba23a1bf06), workflow a705e453f922457c95ca19f32731e4d7. action "bulkassignment". */
    BULK_ASSIGNMENT:          "",

    /* IP_Dynamic_Global_Actions_Endpoint (31c0aaf0-ddbb-478c-9a98-bc013265c4c7), workflow d5e4b3da41e34819b3f953d2acbc2dd7. action "dynamicGlobalAction".
       Keys also served by this URL, no entry needed: DISPATCH_OUTBOUND, ARCHIVE_REFERENCE. */
    DYNAMIC_ACTIONS:          "",
    USER_ADMIN:               "",
    ACTIVITY_LIFECYCLE:       "",

    /* IP_SEND_EMAIL (df59a69f-92ca-4554-ae68-6b464aa73ef7), workflow 378b491ec39a4beca886ddec250e6961. action "dispatchEmail". */
    EMAIL:                    "",

    /* IP_Create__Task__for_received_Email_Endpoint (ab1a3555-7fce-4bfe-a193-b8b84654b0a4), workflow 8fbf2896fceb4567afe9ebf47628c3a1. action "emailtotaskassignment". */
    EMAIL_RELATED_TASK:       "",

    /* AI_Document_Processing (fefa43c6-fb9d-4337-8b65-7fd19fa09b6d), workflow 3f018fea1031490fb73dff6a8d6341f2. action "aiAnalyseEmail". */
    AI_EMAIL_ANALYSIS:        "",

    /* AI_Document_Processing (fefa43c6-fb9d-4337-8b65-7fd19fa09b6d), workflow 3f018fea1031490fb73dff6a8d6341f2. action "aiAnalyseEventDocs". */
    AI_DOC_ANALYSIS:          "",

    /* AI_Document_Processing (fefa43c6-fb9d-4337-8b65-7fd19fa09b6d), workflow 3f018fea1031490fb73dff6a8d6341f2. action "aiChat". */
    AI_CHAT:                  "",

    /* IP_OTP_GENERATE (e5632336-641f-4b9b-bd93-99185b5eb975), workflow 741465e483714d48a07e336eb4571b89. action "generate". Owner decision 2026-10-07 (ITEM-82): generation has its own flow. */
    OTP_GENERATE:             "",

    /* IP_OTP_VERIFY (4dbe6dde-37d5-47b4-ba32-d4ae5c9f8b61), workflow b372d45e4b2a47d88b8e8b032da67fcd. action "verify". */
    OTP_VERIFY:               "",

    /* IP_SCAN_INTAKE (5504d7f9-cc96-470c-be79-217582faf415), workflow 88401ce1f44148539c0da53c9491f8e6. PUT of raw bytes, not a JSON contract (endpoints.config.js). Its trigger is tenant-authenticated: the URL carries no signature and needs a Microsoft Entra token the browser does not hold (ITEM-85). */
    SCAN_INTAKE:              "",
  }
};
