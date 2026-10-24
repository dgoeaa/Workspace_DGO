/* GENERATED FILE — do not edit by hand.
 * Built from docs/deployment/sharepoint/portal-field-spec.json (specVersion 2.0.0)
 * by scripts/build-sharepoint-browser-provisioner.mjs. Edit the specification and re-run.
 */
/*
 * Creates every SharePoint column the document portal and internal governance estates
 * require but do not yet have — from a browser devtools console, using the SharePoint
 * session you are already signed into.
 *
 * WHY THIS EXISTS
 *   The PowerShell runner (scripts/provision-sharepoint-fields.ps1) is the repeatable path,
 *   but it needs PnP.PowerShell installed and, since PnP 2.x, an Entra app registration to
 *   sign in interactively. This file needs neither. It is the same specification, executed
 *   against the same REST endpoints, by the browser that is already authenticated.
 *
 * HOW TO RUN
 *   1. Sign in to https://nitdanigeria.sharepoint.com and open any page on any of the
 *      4 sites listed below. They share one origin, so one paste reaches all of
 *      them — but only for sites you can already write to, so check the permission note.
 *   2. Open devtools (F12) → Console.
 *   3. Paste this entire file and press Enter. It reports what it would do first.
 *   4. Read the DRY RUN table. When it looks right, set DRY_RUN to false at the top of this
 *      file and paste again.
 *
 *   SITES REACHED — you need Manage Lists on EVERY one of them. Site Owner is enough; tenant
 *   admin is not needed. Missing the permission on one site fails only that site's lists, and
 *   the run reports it rather than stopping.
 *     https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE
 *       DGO_AccessScopes
 *     https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre
 *       Portal Rate Limits, Portal OTP Codes, Portal Verification Proofs, Portal Support Cases, Portal Sequence Counters, Portal Audit Events, Portal Flow Telemetry, Portal Outbox Receipts
 *     https://nitdanigeria.sharepoint.com/sites/NEDMS
 *       Portal Registry, Portal Attachments, Portal Status Timeline, Portal Upload Tickets
 *     https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING
 *       Flow Configuration, OTP_Transactions
 *
 * WHAT IT WILL NOT DO
 *   It never creates a list. All 15 already exist and are addressed by the GUID
 *   captured from the tenant, so a renamed list still resolves and a typo cannot produce a
 *   duplicate. It never modifies, renames or re-types a column that is already live: every
 *   list is read first and only genuinely absent columns are created. Running it twice is
 *   safe — the second run reports everything present and creates nothing.
 */

const DRY_RUN = true;

const SPEC = {
  "specVersion": "2.0.0",
  "lists": [
    {
      "listOrder": 1,
      "site": "NEDMS",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NEDMS",
      "listTitle": "Portal Registry",
      "listGuid": "4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667",
      "fields": [
        {
          "internalName": "ReferenceId",
          "displayName": "Reference ID",
          "fieldType": "Text",
          "required": true,
          "indexed": true,
          "enforceUnique": true
        },
        {
          "internalName": "SenderEmail",
          "displayName": "Sender Email",
          "fieldType": "Text",
          "required": true,
          "indexed": true
        },
        {
          "internalName": "Status",
          "displayName": "Status",
          "fieldType": "Choice",
          "required": true,
          "indexed": true,
          "choices": [
            "received",
            "validation",
            "review",
            "action-required",
            "approved",
            "declined",
            "withdrawn"
          ],
          "defaultValue": "received",
          "choiceFormat": "Dropdown"
        },
        {
          "internalName": "Subject",
          "displayName": "Subject",
          "fieldType": "Text"
        },
        {
          "internalName": "Category",
          "displayName": "Category",
          "fieldType": "Text"
        },
        {
          "internalName": "CorrespondenceType",
          "displayName": "Correspondence Type",
          "fieldType": "Text"
        },
        {
          "internalName": "Channel",
          "displayName": "Channel",
          "fieldType": "Text"
        },
        {
          "internalName": "SenderName",
          "displayName": "Sender Name",
          "fieldType": "Text"
        },
        {
          "internalName": "SenderPhone",
          "displayName": "Sender Phone",
          "fieldType": "Text"
        },
        {
          "internalName": "SenderOrganisation",
          "displayName": "Sender Organisation",
          "fieldType": "Text"
        },
        {
          "internalName": "SenderOrganisationType",
          "displayName": "Sender Organisation Type",
          "fieldType": "Text"
        },
        {
          "internalName": "EventDate",
          "displayName": "Event Date",
          "fieldType": "Text"
        },
        {
          "internalName": "Description",
          "displayName": "Description",
          "fieldType": "Note",
          "numLines": 6
        },
        {
          "internalName": "AttachmentCount",
          "displayName": "Attachment Count",
          "fieldType": "Number"
        },
        {
          "internalName": "SubmittedAtUtc",
          "displayName": "Submitted At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "UpdatedAtUtc",
          "displayName": "Updated At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "AcknowledgedAtUtc",
          "displayName": "Acknowledged At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "ClosedAtUtc",
          "displayName": "Closed At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "StatusLabel",
          "displayName": "Status Label",
          "fieldType": "Text"
        },
        {
          "internalName": "ActionRequired",
          "displayName": "Action Required",
          "fieldType": "Boolean"
        },
        {
          "internalName": "VerifiedSubmission",
          "displayName": "Verified Submission",
          "fieldType": "Boolean"
        },
        {
          "internalName": "SourceIp",
          "displayName": "Source IP",
          "fieldType": "Text"
        },
        {
          "internalName": "LocalId",
          "displayName": "Local ID",
          "fieldType": "Text"
        }
      ]
    },
    {
      "listOrder": 2,
      "site": "NEDMS",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NEDMS",
      "listTitle": "Portal Attachments",
      "listGuid": "ecf2ba9b-968f-4fbc-ac9c-7b5e36d5099e",
      "fields": [
        {
          "internalName": "SubmissionRef",
          "displayName": "Submission Reference",
          "fieldType": "Text",
          "indexed": true
        },
        {
          "internalName": "DeclaredName",
          "displayName": "Declared Name",
          "fieldType": "Text"
        },
        {
          "internalName": "StoredName",
          "displayName": "Stored Name",
          "fieldType": "Text"
        },
        {
          "internalName": "DeclaredSizeBytes",
          "displayName": "Declared Size (bytes)",
          "fieldType": "Number"
        },
        {
          "internalName": "DeclaredSha256",
          "displayName": "Declared SHA-256",
          "fieldType": "Text"
        },
        {
          "internalName": "AttachmentLink",
          "displayName": "Attachment Link",
          "fieldType": "Text"
        },
        {
          "internalName": "CreatedAtUtc",
          "displayName": "Created At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "Status",
          "displayName": "Status",
          "fieldType": "Text"
        }
      ]
    },
    {
      "listOrder": 3,
      "site": "NEDMS",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NEDMS",
      "listTitle": "Portal Status Timeline",
      "listGuid": "5b486a5e-0ce7-46d7-a159-d84c77f3d1fd",
      "fields": [
        {
          "internalName": "SubmissionRef",
          "displayName": "Submission Reference",
          "fieldType": "Text",
          "indexed": true
        },
        {
          "internalName": "AtUtc",
          "displayName": "At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "Status",
          "displayName": "Status",
          "fieldType": "Text"
        },
        {
          "internalName": "Label",
          "displayName": "Label",
          "fieldType": "Text"
        },
        {
          "internalName": "Actor",
          "displayName": "Actor",
          "fieldType": "Text"
        },
        {
          "internalName": "Note",
          "displayName": "Note",
          "fieldType": "Note",
          "numLines": 4
        }
      ]
    },
    {
      "listOrder": 4,
      "site": "NEDMS",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NEDMS",
      "listTitle": "Portal Upload Tickets",
      "listGuid": "d777f3cd-0696-426e-8096-ffc860e7c0d4",
      "fields": [
        {
          "internalName": "SubmissionRef",
          "displayName": "Submission Reference",
          "fieldType": "Text",
          "indexed": true
        },
        {
          "internalName": "DeclaredName",
          "displayName": "Declared Name",
          "fieldType": "Text"
        },
        {
          "internalName": "StoredName",
          "displayName": "Stored Name",
          "fieldType": "Text"
        },
        {
          "internalName": "DeclaredSizeBytes",
          "displayName": "Declared Size (bytes)",
          "fieldType": "Number"
        },
        {
          "internalName": "DeclaredSha256",
          "displayName": "Declared SHA-256",
          "fieldType": "Text"
        },
        {
          "internalName": "ExpiresAtUtc",
          "displayName": "Expires At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "CreatedAtUtc",
          "displayName": "Created At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "Redeemed",
          "displayName": "Redeemed",
          "fieldType": "Boolean"
        },
        {
          "internalName": "Status",
          "displayName": "Status",
          "fieldType": "Text"
        }
      ]
    },
    {
      "listOrder": 5,
      "site": "Global_Digital_Documents_Centre",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "listTitle": "Portal Rate Limits",
      "listGuid": "d6b97198-489c-4bd7-8647-1133c55efdf9",
      "fields": [
        {
          "internalName": "WindowStartUtc",
          "displayName": "Window Start (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "UpdatedAtUtc",
          "displayName": "Updated At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "RequestCount",
          "displayName": "Request Count",
          "fieldType": "Number"
        }
      ]
    },
    {
      "listOrder": 6,
      "site": "Global_Digital_Documents_Centre",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "listTitle": "Portal OTP Codes",
      "listGuid": "3f85213c-1fdc-4be0-8c0c-e28aa77fbe56",
      "fields": [
        {
          "internalName": "OTP_Code",
          "displayName": "OTP Code",
          "fieldType": "Text",
          "required": true
        },
        {
          "internalName": "Expires_At",
          "displayName": "Expires At",
          "fieldType": "DateTime",
          "required": true,
          "indexed": true
        },
        {
          "internalName": "Email",
          "displayName": "Email",
          "fieldType": "Text",
          "indexed": true
        },
        {
          "internalName": "Attempts",
          "displayName": "Attempts",
          "fieldType": "Number"
        },
        {
          "internalName": "Consumed",
          "displayName": "Consumed",
          "fieldType": "Boolean"
        },
        {
          "internalName": "SourceIp",
          "displayName": "Source IP",
          "fieldType": "Text"
        },
        {
          "internalName": "CreatedAtUtc",
          "displayName": "Created At (UTC)",
          "fieldType": "DateTime"
        }
      ]
    },
    {
      "listOrder": 7,
      "site": "Global_Digital_Documents_Centre",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "listTitle": "Portal Verification Proofs",
      "listGuid": "f5c9698e-4b6c-4ec7-97ee-dc540efab8a9",
      "fields": [
        {
          "internalName": "Email",
          "displayName": "Email",
          "fieldType": "Text"
        },
        {
          "internalName": "Purpose",
          "displayName": "Purpose",
          "fieldType": "Text"
        },
        {
          "internalName": "ExpiresAtUtc",
          "displayName": "Expires At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "CreatedAtUtc",
          "displayName": "Created At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "Consumed",
          "displayName": "Consumed",
          "fieldType": "Boolean"
        }
      ]
    },
    {
      "listOrder": 8,
      "site": "Global_Digital_Documents_Centre",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "listTitle": "Portal Support Cases",
      "listGuid": "b984645b-8e3a-457f-a305-b95650fd3f23",
      "fields": [
        {
          "internalName": "Name",
          "displayName": "Name",
          "fieldType": "Text"
        },
        {
          "internalName": "Email",
          "displayName": "Email",
          "fieldType": "Text"
        },
        {
          "internalName": "Topic",
          "displayName": "Topic",
          "fieldType": "Text"
        },
        {
          "internalName": "AboutReference",
          "displayName": "About Reference",
          "fieldType": "Text"
        },
        {
          "internalName": "Message",
          "displayName": "Message",
          "fieldType": "Note",
          "numLines": 6
        },
        {
          "internalName": "Status",
          "displayName": "Status",
          "fieldType": "Text"
        },
        {
          "internalName": "SubmittedAtUtc",
          "displayName": "Submitted At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "SourceIp",
          "displayName": "Source IP",
          "fieldType": "Text"
        }
      ]
    },
    {
      "listOrder": 9,
      "site": "Global_Digital_Documents_Centre",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "listTitle": "Portal Sequence Counters",
      "listGuid": "d95409a4-2b48-4d34-9f60-da5d27db862d",
      "fields": [
        {
          "internalName": "CurrentSequence",
          "displayName": "Current Sequence",
          "fieldType": "Number",
          "required": true
        },
        {
          "internalName": "LastIssuedAt",
          "displayName": "Last Issued At",
          "fieldType": "DateTime"
        },
        {
          "internalName": "LastReferenceId",
          "displayName": "Last Reference ID",
          "fieldType": "Text"
        },
        {
          "internalName": "LockToken",
          "displayName": "Lock Token",
          "fieldType": "Text"
        },
        {
          "internalName": "ModifiedByFlowRun",
          "displayName": "Modified By Flow Run",
          "fieldType": "Text"
        },
        {
          "internalName": "Prefix",
          "displayName": "Prefix",
          "fieldType": "Text",
          "required": true
        },
        {
          "internalName": "Year",
          "displayName": "Year",
          "fieldType": "Text",
          "required": true,
          "indexed": true,
          "enforceUnique": true
        }
      ]
    },
    {
      "listOrder": 10,
      "site": "Global_Digital_Documents_Centre",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "listTitle": "Portal Audit Events",
      "listGuid": "f59026cc-9fd7-4322-b681-73c599b852c6",
      "fields": [
        {
          "internalName": "Flow",
          "displayName": "Flow",
          "fieldType": "Text"
        },
        {
          "internalName": "EventType",
          "displayName": "Event Type",
          "fieldType": "Text"
        },
        {
          "internalName": "AtUtc",
          "displayName": "At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "Reference",
          "displayName": "Reference",
          "fieldType": "Text"
        },
        {
          "internalName": "SourceIp",
          "displayName": "Source IP",
          "fieldType": "Text"
        },
        {
          "internalName": "Detail",
          "displayName": "Detail",
          "fieldType": "Note",
          "numLines": 6
        }
      ]
    },
    {
      "listOrder": 11,
      "site": "Global_Digital_Documents_Centre",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "listTitle": "Portal Flow Telemetry",
      "listGuid": "726c210d-09d5-45d9-952d-7a506b644b13",
      "fields": [
        {
          "internalName": "Flow",
          "displayName": "Flow",
          "fieldType": "Text"
        },
        {
          "internalName": "RunId",
          "displayName": "Run ID",
          "fieldType": "Text"
        },
        {
          "internalName": "StartedAtUtc",
          "displayName": "Started At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "CompletedAtUtc",
          "displayName": "Completed At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "Outcome",
          "displayName": "Outcome",
          "fieldType": "Text"
        },
        {
          "internalName": "DurationMs",
          "displayName": "Duration (ms)",
          "fieldType": "Number"
        },
        {
          "internalName": "ErrorMessage",
          "displayName": "Error Message",
          "fieldType": "Note",
          "numLines": 6
        },
        {
          "internalName": "RunRecordJson",
          "displayName": "Run Record (JSON)",
          "fieldType": "Note",
          "numLines": 6
        }
      ]
    },
    {
      "listOrder": 12,
      "site": "Global_Digital_Documents_Centre",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "listTitle": "Portal Outbox Receipts",
      "listGuid": "88a81ca1-319a-45f5-8409-f91a24538ffa",
      "fields": [
        {
          "internalName": "MessageType",
          "displayName": "Message Type",
          "fieldType": "Text"
        },
        {
          "internalName": "RecipientEmail",
          "displayName": "Recipient Email",
          "fieldType": "Text"
        },
        {
          "internalName": "Reference",
          "displayName": "Reference",
          "fieldType": "Text"
        },
        {
          "internalName": "SentAtUtc",
          "displayName": "Sent At (UTC)",
          "fieldType": "DateTime"
        },
        {
          "internalName": "Status",
          "displayName": "Status",
          "fieldType": "Text"
        },
        {
          "internalName": "Attempts",
          "displayName": "Attempts",
          "fieldType": "Number"
        },
        {
          "internalName": "LastError",
          "displayName": "Last Error",
          "fieldType": "Note",
          "numLines": 4
        }
      ]
    },
    {
      "listOrder": 13,
      "site": "DGO_ECM_GOVERNANCE",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE",
      "listTitle": "DGO_AccessScopes",
      "listGuid": "f2ffd2fa-901e-4f28-8f28-957da0fe05e4",
      "fields": [
        {
          "internalName": "AccessScopeId",
          "displayName": "Access Scope Id",
          "fieldType": "Text"
        }
      ]
    },
    {
      "listOrder": 14,
      "site": "NITDADGO-EAAACTIVITYTRACKING",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "listTitle": "Flow Configuration",
      "listGuid": "9bc168c3-06e5-4d58-982b-0df06205fd35",
      "fields": [
        {
          "internalName": "ConfigValue",
          "displayName": "Config Value",
          "fieldType": "Note",
          "numLines": 3
        }
      ]
    },
    {
      "listOrder": 15,
      "site": "NITDADGO-EAAACTIVITYTRACKING",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "listTitle": "OTP_Transactions",
      "listGuid": "9421d473-8906-43b7-a41f-a213046683c1",
      "fields": [
        {
          "internalName": "Attempts",
          "displayName": "Attempts",
          "fieldType": "Number"
        },
        {
          "internalName": "OTP_Code",
          "displayName": "OTP Code",
          "fieldType": "Text"
        },
        {
          "internalName": "Expires_At",
          "displayName": "Expires At",
          "fieldType": "DateTime"
        },
        {
          "internalName": "Is_Verified",
          "displayName": "Is Verified",
          "fieldType": "Boolean"
        }
      ]
    }
  ],
  "indexTargets": [
    {
      "site": "Global_Digital_Documents_Centre",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "listTitle": "Portal Rate Limits",
      "listGuid": "d6b97198-489c-4bd7-8647-1133c55efdf9",
      "internalName": "Title",
      "itemsAtCapture": 0
    },
    {
      "site": "Global_Digital_Documents_Centre",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "listTitle": "Portal Verification Proofs",
      "listGuid": "f5c9698e-4b6c-4ec7-97ee-dc540efab8a9",
      "internalName": "Title",
      "itemsAtCapture": 0
    },
    {
      "site": "Global_Digital_Documents_Centre",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "listTitle": "Portal Support Cases",
      "listGuid": "b984645b-8e3a-457f-a305-b95650fd3f23",
      "internalName": "Title",
      "itemsAtCapture": 0
    },
    {
      "site": "NITDADGO-EAAACTIVITYTRACKING",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "listTitle": "Global Tracking Queue",
      "listGuid": "ee82725a-c408-45e2-a8e8-facf7a092047",
      "internalName": "RefIDD",
      "itemsAtCapture": 15804
    },
    {
      "site": "NITDADGO-EAAACTIVITYTRACKING",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "listTitle": "DGO DIGITAL OPS",
      "listGuid": "1f1cb303-3fd2-43c8-8f24-c409b6c2fde3",
      "internalName": "RefIDD",
      "itemsAtCapture": 21249
    },
    {
      "site": "NITDADGO-EAAACTIVITYTRACKING",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "listTitle": "Global Tracking Queue",
      "listGuid": "ee82725a-c408-45e2-a8e8-facf7a092047",
      "internalName": "DueDate",
      "itemsAtCapture": 15804
    },
    {
      "site": "NITDADGO-EAAACTIVITYTRACKING",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "listTitle": "Global Tracking Queue",
      "listGuid": "ee82725a-c408-45e2-a8e8-facf7a092047",
      "internalName": "Acknowledgement_x0020_Due_x0020_",
      "itemsAtCapture": 15804
    },
    {
      "site": "NITDADGO-EAAACTIVITYTRACKING",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "listTitle": "Global Tracking Queue",
      "listGuid": "ee82725a-c408-45e2-a8e8-facf7a092047",
      "internalName": "Modified",
      "itemsAtCapture": 15804
    },
    {
      "site": "NITDADGO-EAAACTIVITYTRACKING",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "listTitle": "DGO DIGITAL OPS",
      "listGuid": "1f1cb303-3fd2-43c8-8f24-c409b6c2fde3",
      "internalName": "Modified",
      "itemsAtCapture": 21249
    }
  ]
};

(async () => {
  const ORIGIN = new URL(SPEC.lists[0].siteUrl).origin;
  if (location.origin !== ORIGIN) {
    console.error(`Run this from a page on ${ORIGIN}. You are on ${location.origin}.`);
    return;
  }

  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/'/g, '&apos;').replace(/"/g, '&quot;');

  /* One formula turns the spec's stated type/required/indexed into the exact XML SharePoint
   * accepts. Name and StaticName are both set, and Options carries AddFieldInternalNameHint:
   * without them SharePoint derives the internal name from the display name, and
   * "Sender Name" lands as Sender_x0020_Name, which no flow reads. */
  const fieldXml = (f) => {
    const display = esc(f.displayName);
    const internal = esc(f.internalName);
    const required = f.required ? "Required='TRUE'" : "Required='FALSE'";
    const indexed = f.indexed ? " Indexed='TRUE'" : '';
    const unique = f.enforceUnique ? " EnforceUniqueValues='TRUE'" : '';
    const common = `DisplayName='${display}' Name='${internal}' StaticName='${internal}' ${required}${indexed}${unique}`;

    switch (f.fieldType) {
      case 'Text':
        return `<Field Type='Text' ${common} MaxLength='255' />`;
      case 'Number':
        return `<Field Type='Number' ${common} />`;
      case 'Boolean':
        return `<Field Type='Boolean' DisplayName='${display}' Name='${internal}' StaticName='${internal}' ${required} />`;
      case 'DateTime':
        return `<Field Type='DateTime' ${common} Format='DateTime' />`;
      case 'Note': {
        const lines = f.numLines || 6;
        const rich = f.richText ? 'TRUE' : 'FALSE';
        return `<Field Type='Note' DisplayName='${display}' Name='${internal}' StaticName='${internal}' ${required} NumLines='${lines}' RichText='${rich}' />`;
      }
      case 'Choice': {
        if (!f.choices) throw new Error(`Choice field '${f.internalName}' has no choices in the spec`);
        const opts = f.choices.map((c) => `<CHOICE>${esc(c)}</CHOICE>`).join('');
        const def = f.defaultValue ? `<Default>${esc(f.defaultValue)}</Default>` : '';
        return `<Field Type='Choice' ${common} Format='${f.choiceFormat || 'Dropdown'}'>${def}<CHOICES>${opts}</CHOICES></Field>`;
      }
      default:
        throw new Error(`Unknown fieldType '${f.fieldType}' for ${f.internalName} — extend fieldXml, don't guess a mapping`);
    }
  };

  const VERBOSE = 'application/json;odata=verbose';

  /* SharePoint answers 429 and 503 with Retry-After under load. Honouring it is the whole
   * of the throttling story at this volume — ninety-seven sequential writes is nothing, and
   * anything that retries blind turns a slow run into a banned one. */
  const send = async (url, init, attempt = 0) => {
    const res = await fetch(url, { credentials: 'include', ...init });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const wait = (Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000;
      console.warn(`  throttled, waiting ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      return send(url, init, attempt + 1);
    }
    return res;
  };

  const digestFor = async (siteUrl) => {
    const res = await send(`${siteUrl}/_api/contextinfo`, {
      method: 'POST',
      headers: { Accept: VERBOSE },
    });
    if (!res.ok) throw new Error(`contextinfo ${res.status} for ${siteUrl} — are you signed in and a member of that site?`);
    return (await res.json()).d.GetContextWebInformation.FormDigestValue;
  };

  const liveFields = async (siteUrl, guid) => {
    const res = await send(
      `${siteUrl}/_api/web/lists(guid'${guid}')/fields?$select=InternalName&$top=500`,
      { headers: { Accept: VERBOSE } },
    );
    if (!res.ok) throw new Error(`reading fields: ${res.status} ${await res.text()}`);
    return new Set((await res.json()).d.results.map((f) => f.InternalName));
  };

  /* INDEXING AN EXISTING COLUMN.
     The pass above only ever indexes columns it creates. The columns that actually threaten the
     estate are the ones already on the adopted lists — `RefIDD` on a 15,804-item queue and a
     21,249-item ops list, `Title` on three portal lists that grow a row per request — because an
     unindexed equality filter FAILS past 5,000 items rather than slowing. Those were three
     tracked items asking an operator to click through five column settings pages. They are this
     instead. Reading Indexed first keeps the pass idempotent and keeps a re-run honest. */
  const fieldState = async (siteUrl, guid, name) => {
    const res = await send(
      `${siteUrl}/_api/web/lists(guid'${guid}')/fields/getbyinternalnameortitle('${encodeURIComponent(name)}')?$select=Indexed,InternalName`,
      { headers: { Accept: VERBOSE } },
    );
    if (!res.ok) throw new Error(`reading ${name}: ${res.status}`);
    return (await res.json()).d;
  };

  const setIndexed = async (siteUrl, guid, name, digest) => {
    const res = await send(
      `${siteUrl}/_api/web/lists(guid'${guid}')/fields/getbyinternalnameortitle('${encodeURIComponent(name)}')`,
      {
        method: 'POST',
        headers: {
          Accept: VERBOSE, 'Content-Type': VERBOSE, 'X-RequestDigest': digest,
          'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*',
        },
        body: JSON.stringify({ __metadata: { type: 'SP.Field' }, Indexed: true }),
      },
    );
    if (!res.ok) {
      let detail = await res.text();
      try { detail = JSON.parse(detail).error.message.value; } catch { /* keep the raw body */ }
      throw new Error(`${res.status} ${detail}`);
    }
  };

  const createField = async (siteUrl, guid, digest, xml) => {
    const res = await send(`${siteUrl}/_api/web/lists(guid'${guid}')/fields/createfieldasxml`, {
      method: 'POST',
      headers: { Accept: VERBOSE, 'Content-Type': VERBOSE, 'X-RequestDigest': digest },
      body: JSON.stringify({
        parameters: {
          __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' },
          SchemaXml: xml,
          /* 8 = AddFieldInternalNameHint (honour Name as the internal name),
             16 = AddFieldToDefaultView */
          Options: 24,
        },
      }),
    });
    if (!res.ok) {
      let detail = await res.text();
      try { detail = JSON.parse(detail).error.message.value; } catch { /* keep the raw body */ }
      throw new Error(`${res.status} ${detail}`);
    }
  };

  const ledger = [];
  let created = 0, present = 0, failed = 0, planned = 0;

  const bySite = new Map();
  for (const list of SPEC.lists) {
    if (!bySite.has(list.siteUrl)) bySite.set(list.siteUrl, []);
    bySite.get(list.siteUrl).push(list);
  }

  const total = SPEC.lists.reduce((n, l) => n + l.fields.length, 0);
  console.log(
    `%c${DRY_RUN ? 'DRY RUN — ' : ''}${total} columns across ${SPEC.lists.length} lists (spec ${SPEC.specVersion})`,
    'font-weight:bold',
  );

  for (const [siteUrl, lists] of bySite) {
    console.group(siteUrl);
    let digest = null;
    try {
      digest = DRY_RUN ? 'dry-run' : await digestFor(siteUrl);
    } catch (err) {
      console.error(err.message);
      for (const l of lists) {
        for (const f of l.fields) {
          failed++;
          ledger.push({ site: l.site, list: l.listTitle, field: f.internalName, type: f.fieldType, result: `SITE UNREACHABLE: ${err.message}` });
        }
      }
      console.groupEnd();
      continue;
    }

    for (const list of lists.sort((a, b) => a.listOrder - b.listOrder)) {
      console.group(list.listTitle);
      let live;
      try {
        live = await liveFields(siteUrl, list.listGuid);
      } catch (err) {
        console.error(`list ${list.listGuid} — ${err.message}`);
        for (const f of list.fields) {
          failed++;
          ledger.push({ site: list.site, list: list.listTitle, field: f.internalName, type: f.fieldType, result: `LIST NOT READABLE: ${err.message}` });
        }
        console.groupEnd();
        continue;
      }

      for (const f of list.fields) {
        const row = { site: list.site, list: list.listTitle, field: f.internalName, type: f.fieldType, result: '' };

        if (live.has(f.internalName)) {
          present++;
          row.result = 'present';
          console.log(`= ${f.internalName}`);
        } else if (DRY_RUN) {
          planned++;
          row.result = 'would create';
          console.log(`%c? ${f.internalName} (${f.fieldType}) — would create`, 'color:#b58900');
        } else {
          try {
            await createField(siteUrl, list.listGuid, digest, fieldXml(f));
            created++;
            row.result = 'created';
            console.log(`%c+ ${f.internalName} (${f.fieldType})`, 'color:#268bd2');
          } catch (err) {
            failed++;
            row.result = `FAILED: ${err.message}`;
            console.error(`! ${f.internalName} — ${err.message}`);
          }
        }
        ledger.push(row);
      }
      console.groupEnd();
    }
    console.groupEnd();
  }

  /* ---- second pass: index the columns the flows filter on ---- */
  const INDEX_TARGETS = SPEC.indexTargets || [];
  let indexed = 0, alreadyIndexed = 0, indexFailed = 0;
  if (INDEX_TARGETS.length) {
    console.group(`Indexing ${INDEX_TARGETS.length} filtered column(s)`);
    const digests = new Map();
    for (const t of INDEX_TARGETS) {
      const row = { site: t.site, list: t.listTitle, field: t.internalName, type: 'index', result: '' };
      try {
        const state = await fieldState(t.siteUrl, t.listGuid, t.internalName);
        if (state.Indexed) {
          alreadyIndexed++; row.result = 'present';
          console.log(`= ${t.listTitle}.${t.internalName} already indexed`);
        } else if (DRY_RUN) {
          row.result = 'would index';
          console.log(`%c? ${t.listTitle}.${t.internalName} — would index (${t.itemsAtCapture} items at capture)`, 'color:#b58900');
        } else {
          if (!digests.has(t.siteUrl)) digests.set(t.siteUrl, await digestFor(t.siteUrl));
          await setIndexed(t.siteUrl, t.listGuid, t.internalName, digests.get(t.siteUrl));
          indexed++; row.result = 'created';
          console.log(`%c+ ${t.listTitle}.${t.internalName} indexed`, 'color:#268bd2');
        }
      } catch (err) {
        indexFailed++; row.result = `FAILED: ${err.message}`;
        console.error(`! ${t.listTitle}.${t.internalName} — ${err.message}`);
      }
      ledger.push(row);
    }
    console.groupEnd();
  }

  console.log('%c────────────────────────────────────', 'color:#888');
  if (INDEX_TARGETS.length) {
    console.log(DRY_RUN
      ? `Indexes: ${INDEX_TARGETS.length - alreadyIndexed - indexFailed} to set, ${alreadyIndexed} already indexed, ${indexFailed} unreadable.`
      : `Indexes set: ${indexed}   Already indexed: ${alreadyIndexed}   Failed: ${indexFailed}`);
  }
  if (DRY_RUN) {
    console.log(`%cDRY RUN: ${planned} to create, ${present} already present, ${failed} unreachable.`, 'font-weight:bold');
    console.log('Set DRY_RUN = false at the top of this file and paste again to apply.');
  } else {
    console.log(`%cCreated: ${created}   Already present: ${present}   Failed: ${failed}`, 'font-weight:bold');
    if (failed === 0) console.log(`%cEstate complete: ${created + present}/${total} columns present.`, 'color:#859900;font-weight:bold');
    else console.log('%cRe-run to retry — this script is idempotent and will skip what already exists.', 'color:#dc322f');
  }

  console.table(ledger.filter((r) => r.result !== 'present'));
  /* Kept on window so the run can be exported as evidence for the provisioning gate:
   *   copy(JSON.stringify(spLedger, null, 2)) */
  window.spLedger = ledger;
})();
