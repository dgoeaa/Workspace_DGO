/* NITDA Folio — internal platform endpoint configuration.
 *
 * PROVISIONED INTO THIS PACKAGE by scripts/package.mjs.
 *   build f4e797added9eea9   posture demo   2026-01-01T00:00:00.000Z
 *
 * Every URL below is a signed Power Automate trigger, and a signed trigger URL is a bearer
 * credential: possession alone authorises invoking the flow. This file is delivered
 * verbatim to every browser that loads the platform, so treat each URL as public from the
 * moment you deploy.
 *
 * There is no proxy in the request path, by decision. The flow behind each URL is the only
 * place authentication, authorisation, validation and rate limiting can happen, and it
 * must do all four itself.
 *
 * Rotation is the only revocation. Regenerate the signature in Power Automate, rebuild the
 * package, redeploy. Rebuilding changes the build id above, which is how a deployment can
 * be told apart from the one it replaced.
 *
 * MERGED, NOT ASSIGNED — injecting window.DGO_CONFIG before this file loads is a supported
 * way to supply endpoints, so anything already set must win.
 */
window.DGO_CONFIG = window.DGO_CONFIG || {};
window.DGO_CONFIG.endpoints = Object.assign({
    FETCH_ALL:               "",
    DYNAMIC_ACTIONS:         "",
    USER_ADMIN:              "",
    ACTIVITY_LIFECYCLE:      "",
    SINGLE_ASSIGNMENT:       "",
    BULK_ASSIGNMENT:         "",
    FETCH_ACTIVITIES:        "",
    REFERENCE_DATA:          "",
    GET_DOCS:                "",
    FETCH_EMAIL_ATTACHMENTS: "",
    EMAIL:                   "",
    EMAIL_RELATED_TASK:      "",
    AI_EMAIL_ANALYSIS:       "",
    AI_DOC_ANALYSIS:         "",
    AI_CHAT:                 "",
    OTP_GENERATE:            "",
    OTP_VERIFY:              "",
    SUBSIDIARY_ACTIONS:      "",
    SCAN_INTAKE:             "",
}, window.DGO_CONFIG.endpoints);
