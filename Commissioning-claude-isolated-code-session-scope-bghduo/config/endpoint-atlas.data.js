/**
 * GENERATED — do not edit. Produced by `npm run reconcile` from
 * docs/reference/endpoint-register.json, the tenant's own export.
 *
 * The endpoint estate as a module the browser can import: all 25 contract keys and all
 * 51 workflow records. Imported by modules/endpoint-console.js, which has no other way to
 * read the register — the platform has no build step and is sometimes opened from file://,
 * where fetching a sibling JSON is blocked.
 *
 * NO SIGNATURE IS PRESENT OR MAY EVER BE. Each urlTemplate ends at a bare `sig=`; the 43
 * characters that follow it are the credential and live only in config.local.js, which is
 * git-ignored. tests/endpoint-console.test.mjs fails if that stops being true.
 */
export const EndpointAtlas = Object.freeze({
  "schema": "dgo-endpoint-atlas/v1",
  "generatedBy": "scripts/reconcile-endpoint-register.mjs",
  "authority": {
    "file": "docs/reference/endpoint-register.json",
    "schemaVersion": "1.0",
    "redistributionStatus": "shareable_credentials_removed",
    "note": "The register is exported from the tenant and is post-rotation. On identity — which workflow a key points at, and its trigger URL — it is correct wherever it and any other artefact in this repository disagree; on first reconciliation all 25 keys disagreed with the previous records. Its `method` annotation is the one exception, and is not authority: `method` below is the verb the browser actually sends, taken from the caller's own transport declaration in scripts/lib/endpoint-surface.mjs, and `registerMethod` preserves what the register said. They differ for the two raw-bytes deposits, whose deployed triggers declare PUT while the register annotates POST."
  },
  "authenticationPosture": {
    "DGO_AUTH_ENABLED": false,
    "DGO_AUTH_ROLE_SOURCE": "verified"
  },
  "keys": [
    {
      "key": "FETCH_ACTIVITIES",
      "surface": "internal",
      "workflowId": "c4c26f93ba1e4d7db5247536c30cdc11",
      "flow": "IP_Get_Docs_Endpoint",
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/11",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/11/workflows/c4c26f93ba1e4d7db5247536c30cdc11/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": [
        "GET_DOCS"
      ]
    },
    {
      "key": "SUBSIDIARY_ACTIONS",
      "surface": "internal",
      "workflowId": "d5e4b3da41e34819b3f953d2acbc2dd7",
      "flow": "IP_Dynamic_Global_Actions_Endpoint",
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/21",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/21/workflows/d5e4b3da41e34819b3f953d2acbc2dd7/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": [
        "DYNAMIC_ACTIONS"
      ]
    },
    {
      "key": "FETCH_ALL",
      "surface": "internal",
      "workflowId": "aa662769f13a4666bfadf3039cd8d247",
      "flow": "FETCH_ALL",
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/20",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/20/workflows/aa662769f13a4666bfadf3039cd8d247/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "REFERENCE_DATA",
      "surface": "internal",
      "workflowId": "885fad5ec91f460490e8c772d5d10cb8",
      "flow": "IP_Reference_Data_Endpoint",
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/15",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/15/workflows/885fad5ec91f460490e8c772d5d10cb8/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "GET_DOCS",
      "surface": "internal",
      "workflowId": "c4c26f93ba1e4d7db5247536c30cdc11",
      "flow": "IP_Get_Docs_Endpoint",
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/11",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/11/workflows/c4c26f93ba1e4d7db5247536c30cdc11/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": [
        "FETCH_ACTIVITIES"
      ]
    },
    {
      "key": "FETCH_EMAIL_ATTACHMENTS",
      "surface": "internal",
      "workflowId": "d2c773332f6f4fbf97ee4a5baa01f70b",
      "flow": "IP_Retrieve_Email_Attachment_Endpoint",
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/06",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/06/workflows/d2c773332f6f4fbf97ee4a5baa01f70b/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "SINGLE_ASSIGNMENT",
      "surface": "internal",
      "workflowId": "72acfc6a694f414f9fe39c939ead7f08",
      "flow": "Single_Task_Assignment",
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/26",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/26/workflows/72acfc6a694f414f9fe39c939ead7f08/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "BULK_ASSIGNMENT",
      "surface": "internal",
      "workflowId": "a705e453f922457c95ca19f32731e4d7",
      "flow": "BULK OPS DATA RETRIEVAL HTTP",
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/30",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/30/workflows/a705e453f922457c95ca19f32731e4d7/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "BULK_ASSIGNMENT_DIRECT",
      "surface": "internal",
      "workflowId": "8f6a40a682bb4e79acd2ac5d42f15705",
      "flow": "IP_Bulk_Assign_Endpoint",
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/30",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/30/workflows/8f6a40a682bb4e79acd2ac5d42f15705/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "DYNAMIC_ACTIONS",
      "surface": "internal",
      "workflowId": "d5e4b3da41e34819b3f953d2acbc2dd7",
      "flow": "IP_Dynamic_Global_Actions_Endpoint",
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/21",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/21/workflows/d5e4b3da41e34819b3f953d2acbc2dd7/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": [
        "SUBSIDIARY_ACTIONS"
      ]
    },
    {
      "key": "EMAIL",
      "surface": "internal",
      "workflowId": "378b491ec39a4beca886ddec250e6961",
      "flow": "IP_SEND_EMAIL",
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/15",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/15/workflows/378b491ec39a4beca886ddec250e6961/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "EMAIL_RELATED_TASK",
      "surface": "internal",
      "workflowId": "a942d230337c4ddfa9a386e92bbd048b",
      "flow": "IP_Create_Email_Assignment_Endpoint",
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/07",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/07/workflows/a942d230337c4ddfa9a386e92bbd048b/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "AI_EMAIL_ANALYSIS",
      "surface": "internal",
      "workflowId": "3f018fea1031490fb73dff6a8d6341f2",
      "flow": "AI_Document_Processing",
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/18",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/18/workflows/3f018fea1031490fb73dff6a8d6341f2/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": [
        "AI_DOC_ANALYSIS",
        "AI_CHAT"
      ]
    },
    {
      "key": "AI_DOC_ANALYSIS",
      "surface": "internal",
      "workflowId": "3f018fea1031490fb73dff6a8d6341f2",
      "flow": "AI_Document_Processing",
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/18",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/18/workflows/3f018fea1031490fb73dff6a8d6341f2/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": [
        "AI_EMAIL_ANALYSIS",
        "AI_CHAT"
      ]
    },
    {
      "key": "AI_CHAT",
      "surface": "internal",
      "workflowId": "3f018fea1031490fb73dff6a8d6341f2",
      "flow": "AI_Document_Processing",
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/18",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/18/workflows/3f018fea1031490fb73dff6a8d6341f2/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": [
        "AI_EMAIL_ANALYSIS",
        "AI_DOC_ANALYSIS"
      ]
    },
    {
      "key": "OTP_GENERATE",
      "surface": "internal",
      "workflowId": "b372d45e4b2a47d88b8e8b032da67fcd",
      "flow": "IP_OTP_VERIFY",
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/29",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/29/workflows/b372d45e4b2a47d88b8e8b032da67fcd/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": [
        "OTP_VERIFY"
      ]
    },
    {
      "key": "OTP_VERIFY",
      "surface": "internal",
      "workflowId": "b372d45e4b2a47d88b8e8b032da67fcd",
      "flow": "IP_OTP_VERIFY",
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/29",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/29/workflows/b372d45e4b2a47d88b8e8b032da67fcd/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": [
        "OTP_GENERATE"
      ]
    },
    {
      "key": "SCAN_INTAKE",
      "surface": "internal",
      "workflowId": "88401ce1f44148539c0da53c9491f8e6",
      "flow": "IP_SCAN_INTAKE",
      "category": "IP",
      "method": "PUT",
      "registerMethod": "POST",
      "routingSegment": "cu/26",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/26/workflows/88401ce1f44148539c0da53c9491f8e6/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "SUBMISSION",
      "surface": "portal",
      "workflowId": "1041ed37ce924e3c886d891f23e8142c",
      "flow": "CG_Submission_Endpoint",
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/24",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/24/workflows/1041ed37ce924e3c886d891f23e8142c/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "UPLOAD",
      "surface": "portal",
      "workflowId": "62fe121e5a95416bb91275e43dd0e37e",
      "flow": "CG_Upload_Endpoint",
      "category": "CG",
      "method": "PUT",
      "registerMethod": "POST",
      "routingSegment": "cu/10",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/10/workflows/62fe121e5a95416bb91275e43dd0e37e/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "SUPPORT",
      "surface": "portal",
      "workflowId": "052013da80724713a4285edee72ccb4a",
      "flow": "CG_Portal_Support_Endpoint",
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/00",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/00/workflows/052013da80724713a4285edee72ccb4a/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "VERIFY",
      "surface": "portal",
      "workflowId": "c0d58004c53348539d0d5aeaf49dcded",
      "flow": "CG_Portal_Verification_Endpoint",
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/25",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/25/workflows/c0d58004c53348539d0d5aeaf49dcded/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "VERIFY_CONFIRM",
      "surface": "portal",
      "workflowId": "b270894ff410499ebbc090e32ffe899b",
      "flow": "CG_Portal_Verification_Confirmation_Endpoint",
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/28",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/28/workflows/b270894ff410499ebbc090e32ffe899b/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "STATUS",
      "surface": "portal",
      "workflowId": "34dd28b4a5664927b66e581c74a0ab94",
      "flow": "CG_Portal_Status_Check_Endpoint",
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/10",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/10/workflows/34dd28b4a5664927b66e581c74a0ab94/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    },
    {
      "key": "WRITEBACK",
      "surface": "portal",
      "workflowId": "abf3a3ca53e64ba58c9ce5933e4e97e3",
      "flow": "CG_Portal_Writeback_Endpoint",
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/24",
      "urlTemplate": "https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/24/workflows/abf3a3ca53e64ba58c9ce5933e4e97e3/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=",
      "sharesFlowWith": []
    }
  ],
  "workflows": [
    {
      "workflowId": "378b491ec39a4beca886ddec250e6961",
      "names": [
        "IP_SEND_EMAIL",
        "EMAIL"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/15",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "EMAIL"
      ],
      "bound": true
    },
    {
      "workflowId": "a942d230337c4ddfa9a386e92bbd048b",
      "names": [
        "IP_Create_Email_Assignment",
        "EMAIL_RELATED_TASK"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/00",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "EMAIL_RELATED_TASK"
      ],
      "bound": true
    },
    {
      "workflowId": "3f018fea1031490fb73dff6a8d6341f2",
      "names": [
        "AI_Document_Processing",
        "AI_EMAIL_ANALYSIS",
        "AI_DOC_ANALYSIS",
        "AI_CHAT"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/18",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "AI_EMAIL_ANALYSIS",
        "AI_DOC_ANALYSIS",
        "AI_CHAT"
      ],
      "bound": true
    },
    {
      "workflowId": "9bca499081814c25a1715054ac8466b2",
      "names": [
        "IP_DGO_OTP_Endpoint",
        "OTP_GENERATE_LEGACY"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/00",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "b372d45e4b2a47d88b8e8b032da67fcd",
      "names": [
        "IP_OTP_VERIFY",
        "OTP_GENERATE",
        "OTP_VERIFY"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/29",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "OTP_GENERATE",
        "OTP_VERIFY"
      ],
      "bound": true
    },
    {
      "workflowId": "df90ba34cb494ba59700ec60f39590a1",
      "names": [
        "IP_Subsidiary_Actions_Endpoint"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/21",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "aa662769f13a4666bfadf3039cd8d247",
      "names": [
        "FETCH_ALL",
        "IP_FETCH_ALL_ENDPOINT"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/20",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "FETCH_ALL"
      ],
      "bound": true
    },
    {
      "workflowId": "885fad5ec91f460490e8c772d5d10cb8",
      "names": [
        "IP_Reference_Data_Endpoint",
        "REFERENCE_DATA"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/15",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "REFERENCE_DATA"
      ],
      "bound": true
    },
    {
      "workflowId": "72acfc6a694f414f9fe39c939ead7f08",
      "names": [
        "Single_Task_Assignment",
        "SINGLE_ASSIGNMENT"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/26",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "SINGLE_ASSIGNMENT"
      ],
      "bound": true
    },
    {
      "workflowId": "c8033987b2d94fa3bec8c71f609cd71e",
      "names": [
        "DOC INFO UPDATE"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/17",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "27272c09bb4a4cc2985134310c080bab",
      "names": [
        "IP_Single_Assignment_Endpoint"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/05",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "9464c917ef7c409a882736464a66da6b",
      "names": [
        "IP_Bulk_Assignment_Endpoint"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/30",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "90235520ba464495bbd81871055408f4",
      "names": [
        "IP_Global_Actions_Endpoint",
        "IP_Fetch_All_Endpoint"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/02",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "d5e4b3da41e34819b3f953d2acbc2dd7",
      "names": [
        "IP_Dynamic_Global_Actions_Endpoint",
        "DYNAMIC_ACTIONS",
        "SUBSIDIARY_ACTIONS"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/21",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "SUBSIDIARY_ACTIONS",
        "DYNAMIC_ACTIONS"
      ],
      "bound": true
    },
    {
      "workflowId": "c4c26f93ba1e4d7db5247536c30cdc11",
      "names": [
        "IP_Get_Docs_Endpoint",
        "FETCH_ACTIVITIES",
        "GET_DOCS"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/11",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "FETCH_ACTIVITIES",
        "GET_DOCS"
      ],
      "bound": true
    },
    {
      "workflowId": "cf1e66eb8ac2460794b7f683d9aa8ac0",
      "names": [
        "CG_Status_Check_Endpoint",
        "STATUS"
      ],
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/13",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "ee627334d2e34ba7ac1b899bdb3ff2d0",
      "names": [
        "CG_Verification_Endpoint",
        "VERIFY"
      ],
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/12",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "2569134db3514e838594319ea8e2a4a9",
      "names": [
        "CG_Verification_Confirmation_Endpoint",
        "VERIFY_CONFIRM"
      ],
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/27",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "91292a0347d443619316b3d0118462f2",
      "names": [
        "CG_Writeback_Endpoint",
        "WRITEBACK"
      ],
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/14",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "8f948e0a298b493b8c56fae2b37397bf",
      "names": [
        "CG_Support_Endpoint",
        "SUPPORT"
      ],
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/11",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "1041ed37ce924e3c886d891f23e8142c",
      "names": [
        "CG_Submission_Endpoint",
        "SUBMISSION",
        "INTAKE_SUBMISSION"
      ],
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/24",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "SUBMISSION"
      ],
      "bound": true
    },
    {
      "workflowId": "62fe121e5a95416bb91275e43dd0e37e",
      "names": [
        "CG_Upload_Endpoint",
        "UPLOAD"
      ],
      "category": "CG",
      "method": "PUT",
      "registerMethod": "POST",
      "routingSegment": "cu/10",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "UPLOAD"
      ],
      "bound": true
    },
    {
      "workflowId": "20e6340941ce4b1bbb87b43c9102a777",
      "names": [
        "IP_Fetch_Email_Attachment",
        "FETCH_EMAIL_ATTACHMENTS"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/13",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "6b3bad3005b44bf6bced0f8074d3f2ed",
      "names": [
        "IP_Create_Task",
        "Deployed Create task",
        "Flag Document Action",
        "Update Task"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/06",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "0c2497d2b9884412b4ead9eb94f8da0d",
      "names": [
        "RE-ALIGNMENT-DOCUMENT_INCOMING_CORRESPONDENCE_PROCESSING"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/10",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "84f062159fe9422eb0195c251ca285b8",
      "names": [
        "EDTMS NITDA_Update_Task (Resolution)"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/17",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "3bd7208d65b541539b2c206239e7790a",
      "names": [
        "HtTP_Create_New_Document_metadata_and_watermark",
        "new_document_watermark"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/04",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "a705e453f922457c95ca19f32731e4d7",
      "names": [
        "BULK OPS DATA RETRIEVAL HTTP",
        "BULK_ASSIGNMENT"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/30",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "BULK_ASSIGNMENT"
      ],
      "bound": true
    },
    {
      "workflowId": "c43388639d14452faef4ca3042a95b23",
      "names": [
        "Deployed Bulk Task Assignment_Create Task",
        "BULK_ASSIGNMENT_DIRECT"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/20",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "62b0802c45a7477da46e05278fcd7f2f",
      "names": [
        "Fetch_Users_Categories_Departments_Data_Sync"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/28",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "88401ce1f44148539c0da53c9491f8e6",
      "names": [
        "IP_SCAN_INTAKE",
        "SCAN_INTAKE"
      ],
      "category": "IP",
      "method": "PUT",
      "registerMethod": "POST",
      "routingSegment": "cu/26",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "SCAN_INTAKE"
      ],
      "bound": true
    },
    {
      "workflowId": "ff455c68e9ac493e858fb984bcfd01fb",
      "names": [
        "Fetch_References_and_Lookups_Data"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": null,
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "818ec4053f1e4f0b87845114241d8b74",
      "names": [
        "Get Docs"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": null,
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "37642ba3597f4cf58288cc71b5e6b519",
      "names": [
        "fetch tasks"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": null,
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "3931e2ff995242b6b2c920c8b2209797",
      "names": [
        "get emails"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": null,
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "7e71fffe770a45ccb93bf216bb53786e",
      "names": [
        "bulk Assign direct"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": null,
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "1154b50e1d17420dadb3b012e7e2a02c",
      "names": [
        "optimized bulk assign"
      ],
      "category": "Other",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": null,
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "d2c773332f6f4fbf97ee4a5baa01f70b",
      "names": [
        "IP_Retrieve_Email_Attachment_Endpoint",
        "DGO_ENDPOINT_FETCH_EMAIL_ATTACHMENTS"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/06",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "FETCH_EMAIL_ATTACHMENTS"
      ],
      "bound": true
    },
    {
      "workflowId": "8f6a40a682bb4e79acd2ac5d42f15705",
      "names": [
        "IP_Bulk_Assign_Endpoint",
        "DGO_ENDPOINT_BULK_ASSIGNMENT_DIRECT"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/30",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "BULK_ASSIGNMENT_DIRECT"
      ],
      "bound": true
    },
    {
      "workflowId": "a942d230337c4ddfa9a386e92bbd048b",
      "names": [
        "IP_Create_Email_Assignment_Endpoint",
        "DGO_ENDPOINT_EMAIL_RELATED_TASK"
      ],
      "category": "IP",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/07",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "EMAIL_RELATED_TASK"
      ],
      "bound": true
    },
    {
      "workflowId": "052013da80724713a4285edee72ccb4a",
      "names": [
        "CG_Portal_Support_Endpoint",
        "PF_ENDPOINT_SUPPORT"
      ],
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/00",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "SUPPORT"
      ],
      "bound": true
    },
    {
      "workflowId": "c0d58004c53348539d0d5aeaf49dcded",
      "names": [
        "CG_Portal_Verification_Endpoint",
        "PF_ENDPOINT_VERIFY"
      ],
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/25",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "VERIFY"
      ],
      "bound": true
    },
    {
      "workflowId": "b270894ff410499ebbc090e32ffe899b",
      "names": [
        "CG_Portal_Verification_Confirmation_Endpoint",
        "PF_ENDPOINT_VERIFY_CONFIRM"
      ],
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/28",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "VERIFY_CONFIRM"
      ],
      "bound": true
    },
    {
      "workflowId": "34dd28b4a5664927b66e581c74a0ab94",
      "names": [
        "CG_Portal_Status_Check_Endpoint",
        "PF_ENDPOINT_STATUS"
      ],
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/10",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "STATUS"
      ],
      "bound": true
    },
    {
      "workflowId": "abf3a3ca53e64ba58c9ce5933e4e97e3",
      "names": [
        "CG_Portal_Writeback_Endpoint",
        "PF_ENDPOINT_WRITEBACK"
      ],
      "category": "CG",
      "method": "POST",
      "registerMethod": "POST",
      "routingSegment": "cu/24",
      "hasEndpoint": true,
      "endpointStatus": "available_credentials_removed",
      "serves": [
        "WRITEBACK"
      ],
      "bound": true
    },
    {
      "workflowId": "85c556f10b8244ba9d839a2ebe240b91",
      "names": [
        "FETCH_ACTIVITIES",
        "SUBSIDIARY_ACTIONS"
      ],
      "category": "Other",
      "method": null,
      "registerMethod": null,
      "routingSegment": null,
      "hasEndpoint": false,
      "endpointStatus": "endpoint_not_shared",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "bc83d98acf474a088832d78f50085388",
      "names": [
        "DYNAMIC_ACTIONS",
        "EMAIL"
      ],
      "category": "Other",
      "method": null,
      "registerMethod": null,
      "routingSegment": null,
      "hasEndpoint": false,
      "endpointStatus": "endpoint_not_shared",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "fe794e0139784ac694768e5a716e0be7",
      "names": [
        "AI_EMAIL_ANALYSIS"
      ],
      "category": "Other",
      "method": null,
      "registerMethod": null,
      "routingSegment": null,
      "hasEndpoint": false,
      "endpointStatus": "endpoint_not_shared",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "a13c8b577bd44f8787c50d095ea3faf9",
      "names": [
        "AI_CHAT"
      ],
      "category": "Other",
      "method": null,
      "registerMethod": null,
      "routingSegment": null,
      "hasEndpoint": false,
      "endpointStatus": "endpoint_not_shared",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "314aaf27593147089b38322e5ca25936",
      "names": [
        "OTP_GENERATE"
      ],
      "category": "Other",
      "method": null,
      "registerMethod": null,
      "routingSegment": null,
      "hasEndpoint": false,
      "endpointStatus": "endpoint_not_shared",
      "serves": [],
      "bound": false
    },
    {
      "workflowId": "c5e314c768b54bdc89350954ef6a256d",
      "names": [
        "OTP_VERIFY"
      ],
      "category": "Other",
      "method": null,
      "registerMethod": null,
      "routingSegment": null,
      "hasEndpoint": false,
      "endpointStatus": "endpoint_not_shared",
      "serves": [],
      "bound": false
    }
  ],
  "totals": {
    "keys": 25,
    "internalKeys": 18,
    "portalKeys": 7,
    "distinctWorkflows": 20,
    "keysWithUrlTemplate": 25,
    "keysWithoutWorkflowId": 0,
    "methodDisagreements": 2,
    "workflowRecords": 51,
    "workflowsWithEndpoint": 45,
    "workflowsBound": 21
  }
});
export default EndpointAtlas;
