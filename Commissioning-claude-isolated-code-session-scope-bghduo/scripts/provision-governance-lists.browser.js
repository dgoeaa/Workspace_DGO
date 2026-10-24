/* GENERATED FILE — do not edit by hand.
 * Built from docs/reference/sharepoint-provisioning-spec.json by
 * scripts/build-governance-browser-provisioner.mjs. Edit the specification and re-run.
 */
/*
 * Provision the ten DGO governance lists — every column and seed row they require but do not
 * yet have — from a browser devtools console, using the SharePoint session you are already
 * signed into.
 *
 * DECISION GOV-01. https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE
 * is the single authoritative site for all ten. Every address below is a list GUID captured
 * from the tenant, so a renamed list still resolves and a typo cannot produce a duplicate.
 *
 * HOW TO RUN
 *   1. Sign in to https://nitdanigeria.sharepoint.com and open any page on
 *      https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE
 *   2. Open devtools (F12) → Console.
 *   3. Paste this entire file and press Enter. It reports what it WOULD do and changes nothing.
 *   4. Read the DRY RUN table. When it is right, set DRY_RUN to false below and paste again.
 *
 * PERMISSION REQUIRED
 *   Manage Lists on DGO_ECM_GOVERNANCE.
 *   Site Owner is enough. Tenant administrator is not needed.
 *
 * WHAT IT WILL NOT DO
 *   It never creates a list — all ten exist. It never modifies, renames or re-types a column
 *   that is already live: each list is read first and only genuinely absent columns are
 *   created. It never duplicates a seed row: each list's own key field is checked first.
 *   Running it twice is safe; the second run creates nothing.
 *
 *   Where a column is absent under the specification's internal name but the list already
 *   carries a custom column under the same DISPLAY name, that column is ADOPTED — used as-is,
 *   with the seeds rewritten onto its real internal name — rather than a second column being
 *   created beside it. DGO_AccessScopes carries 'Access Scope Id' exactly this way.
 *
 * WHAT IT DOES NOT TOUCH — the 17 duplicate instances to retire.
 *   This script writes ONLY to the GUIDs listed in its specification. The duplicates below are
 *   left exactly as they are; retiring them is a separate, deliberate act.
 *     b9b522c6-1219-4fb1-ad01-b54b40416bba  DGO_UserDirectory          NITDADGO-EAAACTIVITYTRACKING
 *     55c0daae-8b46-4db7-8c03-be54e3fc536f  DGO_RoleCatalogue          NITDADGO-EAAACTIVITYTRACKING
 *     4fdb8379-9f48-466e-a503-a59912be5015  DGO_UserRoleHistory        NITDADGO-EAAACTIVITYTRACKING
 *     74153ee5-e6dd-4347-b1fe-a51d7fd47521  DGO_AuditLog               NITDADGO-EAAACTIVITYTRACKING
 *     7ac06ab8-9754-4578-be86-87c809c8deea  DGO_AuditLog_2             NITDADGO-EAAACTIVITYTRACKING
 *     66e19c2a-877b-4537-8247-2351d6374cf9  DGO_PendingWrites          NITDADGO-EAAACTIVITYTRACKING
 *     673b687d-5e07-4cd2-89c0-411d10238752  DGO_PendingWrites_2        NITDADGO-EAAACTIVITYTRACKING
 *     db2f8e1a-69e4-4c8a-a2ee-4f2a29d85f4b  DGO_DepartmentDirectory    NITDADGO-EAAACTIVITYTRACKING
 *     ed850c51-79e6-4f7e-a725-f8ca9f42ff01  DGO_DepartmentDirectory_2  NITDADGO-EAAACTIVITYTRACKING
 *     3bd611eb-0391-47ee-9dfa-e4520a18787b  DGO_AccessScopes           NITDADGO-EAAACTIVITYTRACKING
 *     cccc57f9-1091-4e9c-9826-e46918b057f0  DGO_AccessScopes_2         NITDADGO-EAAACTIVITYTRACKING
 *     146c6162-7bea-4ecb-9b1d-254c1e979e12  DGO_PilotCohorts_2         NITDADGO-EAAACTIVITYTRACKING
 *     22925b7d-9ea7-497f-9c01-70a32bcb6f2f  DGO_PilotCohorts           NITDADGO-EAAACTIVITYTRACKING
 *     89ac07db-f7d0-43b4-b508-2479580fae18  DGO_EndpointRegistry_2     NITDADGO-EAAACTIVITYTRACKING
 *     dbc0abbd-51c5-4002-8786-3ebc866a8c35  DGO_EndpointRegistry       NITDADGO-EAAACTIVITYTRACKING
 *     4411f921-2a76-4dea-823d-03f1daf1df6d  DGO_AccessEvents           NITDADGO-EAAACTIVITYTRACKING
 *     c107a54f-3f38-4f71-8a47-38c75f047186  DGO_AccessEvents_2         NITDADGO-EAAACTIVITYTRACKING
 */

const DRY_RUN = true;

const SPEC = {
  "generatedFrom": "docs/reference/sharepoint-provisioning-spec.json",
  "decision": "GOV-01",
  "siteUrl": "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE",
  "totals": {
    "lists": 10,
    "fields": 98,
    "seeds": 10,
    "indexed": 10
  },
  "lists": [
    {
      "listOrder": 1,
      "listTitle": "DGO_UserDirectory",
      "listGuid": "3d591f5b-3f2f-409c-983a-a77b5c174834",
      "purpose": "Authoritative pilot identity, enrollment, status, role and persona register.",
      "fields": [
        {
          "internalName": "UserId",
          "displayName": "UserId",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='UserId' StaticName='UserId' Name='UserId' Required='TRUE' />"
        },
        {
          "internalName": "FullName",
          "displayName": "FullName",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='FullName' StaticName='FullName' Name='FullName' Required='TRUE' />"
        },
        {
          "internalName": "Email",
          "displayName": "Email",
          "fieldType": "Text",
          "required": true,
          "indexed": true,
          "schemaXml": "<Field Type='Text' DisplayName='Email' StaticName='Email' Name='Email' Required='TRUE' Indexed='TRUE' />"
        },
        {
          "internalName": "Directorate",
          "displayName": "Directorate",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Directorate' StaticName='Directorate' Name='Directorate' Required='TRUE' />"
        },
        {
          "internalName": "Department",
          "displayName": "Department",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Department' StaticName='Department' Name='Department' />"
        },
        {
          "internalName": "Unit",
          "displayName": "Unit",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Unit' StaticName='Unit' Name='Unit' />"
        },
        {
          "internalName": "JobTitle",
          "displayName": "JobTitle",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='JobTitle' StaticName='JobTitle' Name='JobTitle' />"
        },
        {
          "internalName": "Phone",
          "displayName": "Phone",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Phone' StaticName='Phone' Name='Phone' />"
        },
        {
          "internalName": "Role",
          "displayName": "Role",
          "fieldType": "Choice",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Choice' DisplayName='Role' StaticName='Role' Name='Role' Required='TRUE' Format='Dropdown'><CHOICES><CHOICE>systemAdmin</CHOICE><CHOICE>userAdmin</CHOICE><CHOICE>executive</CHOICE><CHOICE>director</CHOICE><CHOICE>operator</CHOICE><CHOICE>viewer</CHOICE></CHOICES></Field>"
        },
        {
          "internalName": "Persona",
          "displayName": "Persona",
          "fieldType": "Choice",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Choice' DisplayName='Persona' StaticName='Persona' Name='Persona' Required='TRUE' Format='Dropdown'><CHOICES><CHOICE>admin</CHOICE><CHOICE>executive</CHOICE><CHOICE>registry</CHOICE><CHOICE>general</CHOICE></CHOICES></Field>"
        },
        {
          "internalName": "Status",
          "displayName": "Status",
          "fieldType": "Choice",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Choice' DisplayName='Status' StaticName='Status' Name='Status' Required='TRUE' Format='Dropdown'><CHOICES><CHOICE>staged</CHOICE><CHOICE>active</CHOICE><CHOICE>disabled</CHOICE><CHOICE>unregistered</CHOICE></CHOICES></Field>"
        },
        {
          "internalName": "AccessScope",
          "displayName": "AccessScope",
          "fieldType": "Note",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='AccessScope' StaticName='AccessScope' Name='AccessScope' NumLines='6' RichText='FALSE' />"
        },
        {
          "internalName": "PilotCohort",
          "displayName": "PilotCohort",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='PilotCohort' StaticName='PilotCohort' Name='PilotCohort' />"
        },
        {
          "internalName": "CreatedAt",
          "displayName": "CreatedAt",
          "fieldType": "DateTime",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='DateTime' DisplayName='CreatedAt' StaticName='CreatedAt' Name='CreatedAt' Format='DateTime' />"
        },
        {
          "internalName": "CreatedBy",
          "displayName": "CreatedBy",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='CreatedBy' StaticName='CreatedBy' Name='CreatedBy' />"
        },
        {
          "internalName": "UpdatedAt",
          "displayName": "UpdatedAt",
          "fieldType": "DateTime",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='DateTime' DisplayName='UpdatedAt' StaticName='UpdatedAt' Name='UpdatedAt' Format='DateTime' />"
        },
        {
          "internalName": "UpdatedBy",
          "displayName": "UpdatedBy",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='UpdatedBy' StaticName='UpdatedBy' Name='UpdatedBy' />"
        },
        {
          "internalName": "DisabledReason",
          "displayName": "DisabledReason",
          "fieldType": "Note",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='DisabledReason' StaticName='DisabledReason' Name='DisabledReason' NumLines='6' RichText='FALSE' />"
        },
        {
          "internalName": "LastSeenAt",
          "displayName": "LastSeenAt",
          "fieldType": "DateTime",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='DateTime' DisplayName='LastSeenAt' StaticName='LastSeenAt' Name='LastSeenAt' Format='DateTime' />"
        },
        {
          "internalName": "LastResolvedRole",
          "displayName": "LastResolvedRole",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='LastResolvedRole' StaticName='LastResolvedRole' Name='LastResolvedRole' />"
        },
        {
          "internalName": "LastResolvedPersona",
          "displayName": "LastResolvedPersona",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='LastResolvedPersona' StaticName='LastResolvedPersona' Name='LastResolvedPersona' />"
        }
      ],
      "seeds": [
        {
          "seedId": 7,
          "keyField": "Email",
          "keyValue": "dgsregistry@nitda.gov.ng",
          "fields": {
            "Title": "Registry Bootstrap Administrator",
            "UserId": "bootstrap-registry-admin",
            "FullName": "Registry",
            "Email": "dgsregistry@nitda.gov.ng",
            "Directorate": "Registry",
            "Department": "Office of the Director-General",
            "Unit": "Digital Operations",
            "JobTitle": "Bootstrap Administrator",
            "Role": "systemAdmin",
            "Persona": "admin",
            "Status": "active",
            "AccessScope": "[\"all\"]",
            "PilotCohort": "bootstrap",
            "CreatedAt": "2026-07-23T00:00:00Z",
            "CreatedBy": "system-provisioning",
            "UpdatedAt": "2026-07-23T00:00:00Z",
            "UpdatedBy": "system-provisioning"
          }
        }
      ]
    },
    {
      "listOrder": 2,
      "listTitle": "DGO_RoleCatalogue",
      "listGuid": "f675598b-271d-4200-8d75-2597aad4057f",
      "purpose": "Canonical RBAC role, persona, permissions and allowed route catalogue.",
      "fields": [
        {
          "internalName": "RoleId",
          "displayName": "RoleId",
          "fieldType": "Text",
          "required": true,
          "indexed": true,
          "schemaXml": "<Field Type='Text' DisplayName='RoleId' StaticName='RoleId' Name='RoleId' Required='TRUE' Indexed='TRUE' />"
        },
        {
          "internalName": "Persona",
          "displayName": "Persona",
          "fieldType": "Choice",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Choice' DisplayName='Persona' StaticName='Persona' Name='Persona' Required='TRUE' Format='Dropdown'><CHOICES><CHOICE>admin</CHOICE><CHOICE>executive</CHOICE><CHOICE>registry</CHOICE><CHOICE>general</CHOICE></CHOICES></Field>"
        },
        {
          "internalName": "PermissionsJson",
          "displayName": "PermissionsJson",
          "fieldType": "Note",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='PermissionsJson' StaticName='PermissionsJson' Name='PermissionsJson' Required='TRUE' NumLines='10' RichText='FALSE' />"
        },
        {
          "internalName": "AllowedRoutesJson",
          "displayName": "AllowedRoutesJson",
          "fieldType": "Note",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='AllowedRoutesJson' StaticName='AllowedRoutesJson' Name='AllowedRoutesJson' Required='TRUE' NumLines='10' RichText='FALSE' />"
        },
        {
          "internalName": "CanAssignRoles",
          "displayName": "CanAssignRoles",
          "fieldType": "Boolean",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Boolean' DisplayName='CanAssignRoles' StaticName='CanAssignRoles' Name='CanAssignRoles' />"
        },
        {
          "internalName": "CanManageSettings",
          "displayName": "CanManageSettings",
          "fieldType": "Boolean",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Boolean' DisplayName='CanManageSettings' StaticName='CanManageSettings' Name='CanManageSettings' />"
        },
        {
          "internalName": "CanViewAudit",
          "displayName": "CanViewAudit",
          "fieldType": "Boolean",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Boolean' DisplayName='CanViewAudit' StaticName='CanViewAudit' Name='CanViewAudit' />"
        },
        {
          "internalName": "Active",
          "displayName": "Active",
          "fieldType": "Boolean",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Boolean' DisplayName='Active' StaticName='Active' Name='Active' />"
        },
        {
          "internalName": "Version",
          "displayName": "Version",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Version' StaticName='Version' Name='Version' Required='TRUE' />"
        }
      ],
      "seeds": [
        {
          "seedId": 1,
          "keyField": "RoleId",
          "keyValue": "systemAdmin",
          "fields": {
            "Title": "systemAdmin",
            "RoleId": "systemAdmin",
            "Persona": "admin",
            "PermissionsJson": "[\"user:view\",\"user:create\",\"user:update\",\"user:disable\",\"role:assign\",\"role:view\",\"settings:manage\",\"audit:view\",\"dispatch:approve\",\"bulk:assign\",\"route:manage\",\"executive:view\",\"executive:export\"]",
            "AllowedRoutesJson": "[\"*\"]",
            "CanAssignRoles": true,
            "CanManageSettings": true,
            "CanViewAudit": true,
            "Active": true,
            "Version": "R11.6-PILOT"
          }
        },
        {
          "seedId": 2,
          "keyField": "RoleId",
          "keyValue": "userAdmin",
          "fields": {
            "Title": "userAdmin",
            "RoleId": "userAdmin",
            "Persona": "admin",
            "PermissionsJson": "[\"user:view\",\"user:create\",\"user:update\",\"user:disable\",\"role:assign\",\"role:view\",\"audit:view\"]",
            "AllowedRoutesJson": "[\"home\",\"settings\",\"user-admin\",\"diagnostics\",\"operator-hud\"]",
            "CanAssignRoles": true,
            "CanManageSettings": true,
            "CanViewAudit": true,
            "Active": true,
            "Version": "R11.6-PILOT"
          }
        },
        {
          "seedId": 3,
          "keyField": "RoleId",
          "keyValue": "executive",
          "fields": {
            "Title": "executive",
            "RoleId": "executive",
            "Persona": "executive",
            "PermissionsJson": "[\"executive:view\",\"executive:export\",\"audit:view\"]",
            "AllowedRoutesJson": "[\"home\",\"executive\",\"response-tracking\",\"approvals\",\"reports\",\"statistics\",\"lookup\",\"assistant\",\"archive\"]",
            "CanAssignRoles": false,
            "CanManageSettings": false,
            "CanViewAudit": true,
            "Active": true,
            "Version": "R11.6-PILOT"
          }
        },
        {
          "seedId": 4,
          "keyField": "RoleId",
          "keyValue": "director",
          "fields": {
            "Title": "director",
            "RoleId": "director",
            "Persona": "registry",
            "PermissionsJson": "[\"executive:view\",\"route:manage\",\"dispatch:approve\",\"bulk:assign\"]",
            "AllowedRoutesJson": "[\"home\",\"activities\",\"correspondence\",\"response-tracking\",\"orchestrator\",\"approvals\",\"dispatch\",\"reports\",\"statistics\",\"lookup\",\"assistant\"]",
            "CanAssignRoles": false,
            "CanManageSettings": false,
            "CanViewAudit": false,
            "Active": true,
            "Version": "R11.6-PILOT"
          }
        },
        {
          "seedId": 5,
          "keyField": "RoleId",
          "keyValue": "operator",
          "fields": {
            "Title": "operator",
            "RoleId": "operator",
            "Persona": "registry",
            "PermissionsJson": "[\"route:manage\",\"bulk:assign\"]",
            "AllowedRoutesJson": "[\"home\",\"activities\",\"correspondence\",\"response-tracking\",\"orchestrator\",\"single-assignment\",\"bulk-assignment\",\"registry\",\"comments\",\"dispatch\",\"correspondence-email\",\"lookup\",\"assistant\"]",
            "CanAssignRoles": false,
            "CanManageSettings": false,
            "CanViewAudit": false,
            "Active": true,
            "Version": "R11.6-PILOT"
          }
        },
        {
          "seedId": 6,
          "keyField": "RoleId",
          "keyValue": "viewer",
          "fields": {
            "Title": "viewer",
            "RoleId": "viewer",
            "Persona": "general",
            "PermissionsJson": "[]",
            "AllowedRoutesJson": "[\"home\",\"response-tracking\",\"reports\",\"statistics\",\"lookup\"]",
            "CanAssignRoles": false,
            "CanManageSettings": false,
            "CanViewAudit": false,
            "Active": true,
            "Version": "R11.6-PILOT"
          }
        }
      ]
    },
    {
      "listOrder": 3,
      "listTitle": "DGO_UserRoleHistory",
      "listGuid": "9fe1872f-3ae0-4b5f-96fc-5d3331c1d07c",
      "purpose": "Immutable change history for role/persona assignment events.",
      "fields": [
        {
          "internalName": "UserEmail",
          "displayName": "UserEmail",
          "fieldType": "Text",
          "required": true,
          "indexed": true,
          "schemaXml": "<Field Type='Text' DisplayName='UserEmail' StaticName='UserEmail' Name='UserEmail' Required='TRUE' Indexed='TRUE' />"
        },
        {
          "internalName": "PreviousRole",
          "displayName": "PreviousRole",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='PreviousRole' StaticName='PreviousRole' Name='PreviousRole' />"
        },
        {
          "internalName": "NewRole",
          "displayName": "NewRole",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='NewRole' StaticName='NewRole' Name='NewRole' Required='TRUE' />"
        },
        {
          "internalName": "PreviousPersona",
          "displayName": "PreviousPersona",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='PreviousPersona' StaticName='PreviousPersona' Name='PreviousPersona' />"
        },
        {
          "internalName": "NewPersona",
          "displayName": "NewPersona",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='NewPersona' StaticName='NewPersona' Name='NewPersona' Required='TRUE' />"
        },
        {
          "internalName": "ChangedBy",
          "displayName": "ChangedBy",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='ChangedBy' StaticName='ChangedBy' Name='ChangedBy' Required='TRUE' />"
        },
        {
          "internalName": "ChangedAt",
          "displayName": "ChangedAt",
          "fieldType": "DateTime",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='DateTime' DisplayName='ChangedAt' StaticName='ChangedAt' Name='ChangedAt' Required='TRUE' Format='DateTime' />"
        },
        {
          "internalName": "Reason",
          "displayName": "Reason",
          "fieldType": "Note",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='Reason' StaticName='Reason' Name='Reason' NumLines='6' RichText='FALSE' />"
        },
        {
          "internalName": "RequestId",
          "displayName": "RequestId",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='RequestId' StaticName='RequestId' Name='RequestId' Required='TRUE' />"
        }
      ],
      "seeds": []
    },
    {
      "listOrder": 4,
      "listTitle": "DGO_AuditLog",
      "listGuid": "be0c7af1-b21d-4efe-8c30-53fc55598d95",
      "purpose": "Central audit trail for governed platform activity and provisioning events.",
      "fields": [
        {
          "internalName": "AuditId",
          "displayName": "AuditId",
          "fieldType": "Text",
          "required": true,
          "indexed": true,
          "schemaXml": "<Field Type='Text' DisplayName='AuditId' StaticName='AuditId' Name='AuditId' Required='TRUE' Indexed='TRUE' />"
        },
        {
          "internalName": "RequestId",
          "displayName": "RequestId",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='RequestId' StaticName='RequestId' Name='RequestId' />"
        },
        {
          "internalName": "Event",
          "displayName": "Event",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Event' StaticName='Event' Name='Event' Required='TRUE' />"
        },
        {
          "internalName": "Module",
          "displayName": "Module",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Module' StaticName='Module' Name='Module' />"
        },
        {
          "internalName": "Action",
          "displayName": "Action",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Action' StaticName='Action' Name='Action' />"
        },
        {
          "internalName": "ActorEmail",
          "displayName": "ActorEmail",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='ActorEmail' StaticName='ActorEmail' Name='ActorEmail' />"
        },
        {
          "internalName": "ActorRole",
          "displayName": "ActorRole",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='ActorRole' StaticName='ActorRole' Name='ActorRole' />"
        },
        {
          "internalName": "ActorPersona",
          "displayName": "ActorPersona",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='ActorPersona' StaticName='ActorPersona' Name='ActorPersona' />"
        },
        {
          "internalName": "EntityType",
          "displayName": "EntityType",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='EntityType' StaticName='EntityType' Name='EntityType' />"
        },
        {
          "internalName": "EntityId",
          "displayName": "EntityId",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='EntityId' StaticName='EntityId' Name='EntityId' />"
        },
        {
          "internalName": "Ref",
          "displayName": "Ref",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Ref' StaticName='Ref' Name='Ref' />"
        },
        {
          "internalName": "MetaJson",
          "displayName": "MetaJson",
          "fieldType": "Note",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='MetaJson' StaticName='MetaJson' Name='MetaJson' NumLines='10' RichText='FALSE' />"
        },
        {
          "internalName": "Severity",
          "displayName": "Severity",
          "fieldType": "Choice",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Choice' DisplayName='Severity' StaticName='Severity' Name='Severity' Required='TRUE' Format='Dropdown'><CHOICES><CHOICE>info</CHOICE><CHOICE>warning</CHOICE><CHOICE>error</CHOICE><CHOICE>security</CHOICE></CHOICES></Field>"
        },
        {
          "internalName": "CreatedAt",
          "displayName": "CreatedAt",
          "fieldType": "DateTime",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='DateTime' DisplayName='CreatedAt' StaticName='CreatedAt' Name='CreatedAt' Required='TRUE' Format='DateTime' />"
        }
      ],
      "seeds": [
        {
          "seedId": 10,
          "keyField": "AuditId",
          "keyValue": "provision-pilot",
          "fields": {
            "Title": "SharePoint schema provisioned",
            "AuditId": "provision-pilot",
            "RequestId": "provision-pilot",
            "Event": "audit:sharepoint-schema-provisioned",
            "Module": "provisioning",
            "Action": "create-sharepoint-structures",
            "ActorEmail": "system-provisioning",
            "ActorRole": "systemAdmin",
            "ActorPersona": "admin",
            "EntityType": "sharepoint-schema",
            "EntityId": "pilot",
            "Ref": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
            "MetaJson": "{\"environment\":\"pilot\",\"lists\":10,\"model\":\"manifest-driven-original-structure\"}",
            "Severity": "info",
            "CreatedAt": "2026-07-23T00:00:00Z"
          }
        }
      ]
    },
    {
      "listOrder": 5,
      "listTitle": "DGO_PendingWrites",
      "listGuid": "ad1df270-21c7-4b78-99e7-fb18efd02cd2",
      "purpose": "Offline, failed, or retryable write queue for platform persistence operations.",
      "fields": [
        {
          "internalName": "PendingId",
          "displayName": "PendingId",
          "fieldType": "Text",
          "required": true,
          "indexed": true,
          "schemaXml": "<Field Type='Text' DisplayName='PendingId' StaticName='PendingId' Name='PendingId' Required='TRUE' Indexed='TRUE' />"
        },
        {
          "internalName": "Operation",
          "displayName": "Operation",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Operation' StaticName='Operation' Name='Operation' Required='TRUE' />"
        },
        {
          "internalName": "QueueType",
          "displayName": "QueueType",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='QueueType' StaticName='QueueType' Name='QueueType' Required='TRUE' />"
        },
        {
          "internalName": "PayloadJson",
          "displayName": "PayloadJson",
          "fieldType": "Note",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='PayloadJson' StaticName='PayloadJson' Name='PayloadJson' Required='TRUE' NumLines='10' RichText='FALSE' />"
        },
        {
          "internalName": "ErrorMessage",
          "displayName": "ErrorMessage",
          "fieldType": "Note",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='ErrorMessage' StaticName='ErrorMessage' Name='ErrorMessage' NumLines='6' RichText='FALSE' />"
        },
        {
          "internalName": "RetryCount",
          "displayName": "RetryCount",
          "fieldType": "Number",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Number' DisplayName='RetryCount' StaticName='RetryCount' Name='RetryCount' />"
        },
        {
          "internalName": "Status",
          "displayName": "Status",
          "fieldType": "Choice",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Choice' DisplayName='Status' StaticName='Status' Name='Status' Required='TRUE' Format='Dropdown'><CHOICES><CHOICE>pending</CHOICE><CHOICE>retrying</CHOICE><CHOICE>resolved</CHOICE><CHOICE>failed</CHOICE></CHOICES></Field>"
        },
        {
          "internalName": "CreatedAt",
          "displayName": "CreatedAt",
          "fieldType": "DateTime",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='DateTime' DisplayName='CreatedAt' StaticName='CreatedAt' Name='CreatedAt' Required='TRUE' Format='DateTime' />"
        },
        {
          "internalName": "LastRetryAt",
          "displayName": "LastRetryAt",
          "fieldType": "DateTime",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='DateTime' DisplayName='LastRetryAt' StaticName='LastRetryAt' Name='LastRetryAt' Format='DateTime' />"
        },
        {
          "internalName": "ResolvedAt",
          "displayName": "ResolvedAt",
          "fieldType": "DateTime",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='DateTime' DisplayName='ResolvedAt' StaticName='ResolvedAt' Name='ResolvedAt' Format='DateTime' />"
        }
      ],
      "seeds": []
    },
    {
      "listOrder": 6,
      "listTitle": "DGO_DepartmentDirectory",
      "listGuid": "eed0ba42-ece1-40e2-bf66-79827de02766",
      "purpose": "Directorate, department, unit and DSU reference catalogue.",
      "fields": [
        {
          "internalName": "DepartmentId",
          "displayName": "DepartmentId",
          "fieldType": "Text",
          "required": true,
          "indexed": true,
          "schemaXml": "<Field Type='Text' DisplayName='DepartmentId' StaticName='DepartmentId' Name='DepartmentId' Required='TRUE' Indexed='TRUE' />"
        },
        {
          "internalName": "Directorate",
          "displayName": "Directorate",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Directorate' StaticName='Directorate' Name='Directorate' Required='TRUE' />"
        },
        {
          "internalName": "Department",
          "displayName": "Department",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Department' StaticName='Department' Name='Department' Required='TRUE' />"
        },
        {
          "internalName": "Unit",
          "displayName": "Unit",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Unit' StaticName='Unit' Name='Unit' />"
        },
        {
          "internalName": "DsuCode",
          "displayName": "DsuCode",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='DsuCode' StaticName='DsuCode' Name='DsuCode' />"
        },
        {
          "internalName": "Active",
          "displayName": "Active",
          "fieldType": "Boolean",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Boolean' DisplayName='Active' StaticName='Active' Name='Active' />"
        }
      ],
      "seeds": []
    },
    {
      "listOrder": 7,
      "listTitle": "DGO_AccessScopes",
      "listGuid": "f2ffd2fa-901e-4f28-8f28-957da0fe05e4",
      "purpose": "Controlled access scope definitions for route/directorate scoping.",
      "fields": [
        {
          "internalName": "AccessScopeId",
          "displayName": "Access Scope Id",
          "fieldType": "Text",
          "required": true,
          "indexed": true,
          "schemaXml": "<Field Type='Text' DisplayName='Access Scope Id' StaticName='AccessScopeId' Name='AccessScopeId' Required='TRUE' Indexed='TRUE' />"
        },
        {
          "internalName": "ScopeName",
          "displayName": "ScopeName",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='ScopeName' StaticName='ScopeName' Name='ScopeName' Required='TRUE' />"
        },
        {
          "internalName": "Description",
          "displayName": "Description",
          "fieldType": "Note",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='Description' StaticName='Description' Name='Description' NumLines='6' RichText='FALSE' />"
        },
        {
          "internalName": "RoutesJson",
          "displayName": "RoutesJson",
          "fieldType": "Note",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='RoutesJson' StaticName='RoutesJson' Name='RoutesJson' NumLines='10' RichText='FALSE' />"
        },
        {
          "internalName": "DirectoratesJson",
          "displayName": "DirectoratesJson",
          "fieldType": "Note",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='DirectoratesJson' StaticName='DirectoratesJson' Name='DirectoratesJson' NumLines='10' RichText='FALSE' />"
        },
        {
          "internalName": "Active",
          "displayName": "Active",
          "fieldType": "Boolean",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Boolean' DisplayName='Active' StaticName='Active' Name='Active' />"
        }
      ],
      "seeds": [
        {
          "seedId": 9,
          "keyField": "AccessScopeId",
          "keyValue": "all",
          "fields": {
            "Title": "All",
            "AccessScopeId": "all",
            "ScopeName": "All",
            "Description": "Full platform scope.",
            "RoutesJson": "[\"*\"]",
            "DirectoratesJson": "[\"all\"]",
            "Active": true
          }
        }
      ]
    },
    {
      "listOrder": 8,
      "listTitle": "DGO_PilotCohorts",
      "listGuid": "ecc4ac65-1804-4f67-ad3e-eacb1a3a4dc2",
      "purpose": "Pilot cohort register, ownership and lifecycle tracking.",
      "fields": [
        {
          "internalName": "CohortId",
          "displayName": "CohortId",
          "fieldType": "Text",
          "required": true,
          "indexed": true,
          "schemaXml": "<Field Type='Text' DisplayName='CohortId' StaticName='CohortId' Name='CohortId' Required='TRUE' Indexed='TRUE' />"
        },
        {
          "internalName": "CohortName",
          "displayName": "CohortName",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='CohortName' StaticName='CohortName' Name='CohortName' Required='TRUE' />"
        },
        {
          "internalName": "StartDate",
          "displayName": "StartDate",
          "fieldType": "DateTime",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='DateTime' DisplayName='StartDate' StaticName='StartDate' Name='StartDate' Format='DateTime' />"
        },
        {
          "internalName": "EndDate",
          "displayName": "EndDate",
          "fieldType": "DateTime",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='DateTime' DisplayName='EndDate' StaticName='EndDate' Name='EndDate' Format='DateTime' />"
        },
        {
          "internalName": "OwnerEmail",
          "displayName": "OwnerEmail",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='OwnerEmail' StaticName='OwnerEmail' Name='OwnerEmail' />"
        },
        {
          "internalName": "Status",
          "displayName": "Status",
          "fieldType": "Choice",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Choice' DisplayName='Status' StaticName='Status' Name='Status' Required='TRUE' Format='Dropdown'><CHOICES><CHOICE>planned</CHOICE><CHOICE>active</CHOICE><CHOICE>paused</CHOICE><CHOICE>closed</CHOICE></CHOICES></Field>"
        },
        {
          "internalName": "Notes",
          "displayName": "Notes",
          "fieldType": "Note",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='Notes' StaticName='Notes' Name='Notes' NumLines='6' RichText='FALSE' />"
        }
      ],
      "seeds": [
        {
          "seedId": 8,
          "keyField": "CohortId",
          "keyValue": "COHORT-1",
          "fields": {
            "Title": "Cohort 1",
            "CohortId": "COHORT-1",
            "CohortName": "Controlled Pilot Cohort 1",
            "Status": "active",
            "OwnerEmail": "dgsregistry@nitda.gov.ng",
            "Notes": "Initial controlled pilot enrollment cohort."
          }
        }
      ]
    },
    {
      "listOrder": 9,
      "listTitle": "DGO_EndpointRegistry",
      "listGuid": "08c6e1c4-f2b1-4810-933d-69b4327fb6af",
      "purpose": "Power Automate endpoint inventory, URL, owner, environment and validation status.",
      "fields": [
        {
          "internalName": "EndpointKey",
          "displayName": "EndpointKey",
          "fieldType": "Text",
          "required": true,
          "indexed": true,
          "schemaXml": "<Field Type='Text' DisplayName='EndpointKey' StaticName='EndpointKey' Name='EndpointKey' Required='TRUE' Indexed='TRUE' />"
        },
        {
          "internalName": "FlowName",
          "displayName": "FlowName",
          "fieldType": "Text",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='FlowName' StaticName='FlowName' Name='FlowName' Required='TRUE' />"
        },
        {
          "internalName": "EndpointRedacted",
          "displayName": "Endpoint (redacted)",
          "fieldType": "Note",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='Endpoint (redacted)' StaticName='EndpointRedacted' Name='EndpointRedacted' NumLines='6' RichText='FALSE' />"
        },
        {
          "internalName": "EndpointFingerprint",
          "displayName": "Endpoint fingerprint",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Endpoint fingerprint' StaticName='EndpointFingerprint' Name='EndpointFingerprint' MaxLength='255' />"
        },
        {
          "internalName": "OwnerEmail",
          "displayName": "OwnerEmail",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='OwnerEmail' StaticName='OwnerEmail' Name='OwnerEmail' />"
        },
        {
          "internalName": "Environment",
          "displayName": "Environment",
          "fieldType": "Choice",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Choice' DisplayName='Environment' StaticName='Environment' Name='Environment' Required='TRUE' Format='Dropdown'><CHOICES><CHOICE>dev</CHOICE><CHOICE>test</CHOICE><CHOICE>pilot</CHOICE><CHOICE>production</CHOICE></CHOICES></Field>"
        },
        {
          "internalName": "Status",
          "displayName": "Status",
          "fieldType": "Choice",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Choice' DisplayName='Status' StaticName='Status' Name='Status' Required='TRUE' Format='Dropdown'><CHOICES><CHOICE>planned</CHOICE><CHOICE>active</CHOICE><CHOICE>disabled</CHOICE><CHOICE>retired</CHOICE></CHOICES></Field>"
        },
        {
          "internalName": "Version",
          "displayName": "Version",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Version' StaticName='Version' Name='Version' />"
        },
        {
          "internalName": "LastValidatedAt",
          "displayName": "LastValidatedAt",
          "fieldType": "DateTime",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='DateTime' DisplayName='LastValidatedAt' StaticName='LastValidatedAt' Name='LastValidatedAt' Format='DateTime' />"
        }
      ],
      "seeds": []
    },
    {
      "listOrder": 10,
      "listTitle": "DGO_AccessEvents",
      "listGuid": "a40d5f57-859c-426c-826c-bfee090137ad",
      "purpose": "Access-denied, disabled-user, unregistered-user and session diagnostic event log.",
      "fields": [
        {
          "internalName": "EventId",
          "displayName": "EventId",
          "fieldType": "Text",
          "required": true,
          "indexed": true,
          "schemaXml": "<Field Type='Text' DisplayName='EventId' StaticName='EventId' Name='EventId' Required='TRUE' Indexed='TRUE' />"
        },
        {
          "internalName": "UserEmail",
          "displayName": "UserEmail",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='UserEmail' StaticName='UserEmail' Name='UserEmail' />"
        },
        {
          "internalName": "Route",
          "displayName": "Route",
          "fieldType": "Text",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Text' DisplayName='Route' StaticName='Route' Name='Route' />"
        },
        {
          "internalName": "EventType",
          "displayName": "EventType",
          "fieldType": "Choice",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='Choice' DisplayName='EventType' StaticName='EventType' Name='EventType' Required='TRUE' Format='Dropdown'><CHOICES><CHOICE>access-denied</CHOICE><CHOICE>disabled-user</CHOICE><CHOICE>unregistered-user</CHOICE><CHOICE>session-start</CHOICE><CHOICE>session-end</CHOICE><CHOICE>current-user-resolved</CHOICE></CHOICES></Field>"
        },
        {
          "internalName": "Message",
          "displayName": "Message",
          "fieldType": "Note",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='Message' StaticName='Message' Name='Message' NumLines='6' RichText='FALSE' />"
        },
        {
          "internalName": "MetaJson",
          "displayName": "MetaJson",
          "fieldType": "Note",
          "required": false,
          "indexed": false,
          "schemaXml": "<Field Type='Note' DisplayName='MetaJson' StaticName='MetaJson' Name='MetaJson' NumLines='10' RichText='FALSE' />"
        },
        {
          "internalName": "CreatedAt",
          "displayName": "CreatedAt",
          "fieldType": "DateTime",
          "required": true,
          "indexed": false,
          "schemaXml": "<Field Type='DateTime' DisplayName='CreatedAt' StaticName='CreatedAt' Name='CreatedAt' Required='TRUE' Format='DateTime' />"
        }
      ],
      "seeds": []
    }
  ]
};

(async () => {
  const VERBOSE = 'application/json;odata=verbose';
  const NOMETA = 'application/json;odata=nometadata';
  const site = SPEC.siteUrl;

  /* SharePoint answers 429 and 503 with Retry-After under load. Honouring it is the whole of
     the throttling story at this volume; anything that retries blind turns a slow run into a
     banned one. */
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

  /* SharePoint reports an error under `odata.error` when the Accept header asks for
     nometadata and under `error` otherwise, and the message is sometimes an object with a
     `value` and sometimes a bare string. Handling only one shape is why a real diagnostic —
     "List does not exist. It may have been deleted by another user." — reached an operator as
     a truncated JSON blob with the sentence they needed cut off by the table renderer. */
  const detail = async (res) => {
    const text = await res.text();
    let msg = text;
    try {
      const body = JSON.parse(text);
      const err = body['odata.error'] || body.error || body;
      msg = err?.message?.value ?? err?.message ?? err?.Message ?? text;
      if (err?.code) msg = `${msg} [${err.code}]`;
    } catch { /* keep the raw body */ }
    return `${res.status} ${String(msg).trim()}`;
  };

  const digestFor = async () => {
    const res = await send(`${site}/_api/contextinfo`, { method: 'POST', headers: { Accept: VERBOSE } });
    if (!res.ok) throw new Error(`contextinfo ${res.status} — are you signed in, and a member of this site?`);
    return (await res.json()).d.GetContextWebInformation.FormDigestValue;
  };

  /* FromBaseType and CanBeDeleted are read, not just InternalName, and the reason is a false
     positive that cost a live run.
     
     `ScopeId` is a SharePoint SYSTEM field: every list carries a hidden one holding the item's
     security scope. Asking only "is there a field called ScopeId?" answered yes — SharePoint's
     own — so the provisioner reported the column present, never created the real one, and then
     failed on both operations that touched it. Indexing a system field returns 500 'Cannot
     complete this action.'; filtering a Guid-typed system field against the string 'all'
     returns 500 'List does not exist.' The tenant's actual custom column is called
     'Access Scope Id', which is what an operator sees in the list view, and it is a different
     field entirely.
     
     A field inherited from the base type is not the field the specification asked for. Treating
     it as one is the same defect this estate keeps producing: a check whose shape is right while
     its meaning is wrong. */
  const liveFields = async (guid) => {
    const res = await send(
      `${site}/_api/web/lists(guid'${guid}')/fields?$select=InternalName,Title,Indexed,FromBaseType,Hidden,CanBeDeleted&$top=500`,
      { headers: { Accept: VERBOSE } });
    if (!res.ok) throw new Error(`reading fields: ${await detail(res)}`);
    const rows = (await res.json()).d.results;
    const byName = new Map(rows.map((f) => [f.InternalName, f]));
    /* Title is what an operator sees and types; InternalName is what SharePoint minted when the
       column was created. They diverge whenever a column was made by hand, and the first custom
       match wins because a list may carry several system fields under one display name. */
    const byTitle = new Map();
    for (const f of rows) {
      if (!isCustom(f)) continue;
      if (!byTitle.has(f.Title)) byTitle.set(f.Title, f);
    }
    return { byName, byTitle };
  };

  /** A field the specification can own: created on this list, not inherited from the base type. */
  const isCustom = (f) => f && f.FromBaseType !== true && f.CanBeDeleted !== false;

  const createField = async (guid, digest, xml) => {
    const res = await send(`${site}/_api/web/lists(guid'${guid}')/fields/createfieldasxml`, {
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
    if (!res.ok) throw new Error(await detail(res));
  };

  const setIndexed = async (guid, name, digest) => {
    const res = await send(
      `${site}/_api/web/lists(guid'${guid}')/fields/getbyinternalnameortitle('${encodeURIComponent(name)}')`,
      {
        method: 'POST',
        headers: {
          Accept: VERBOSE, 'Content-Type': VERBOSE, 'X-RequestDigest': digest,
          'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*',
        },
        body: JSON.stringify({ __metadata: { type: 'SP.Field' }, Indexed: true }),
      },
    );
    if (!res.ok) throw new Error(await detail(res));
  };

  /* A seed is identified by the list's own key field, never by Title, because two of these
     lists legitimately carry repeating titles. Checking the key first is what makes a re-run
     create nothing rather than a second copy. */
  const seedExists = async (guid, keyField, keyValue) => {
    const filter = encodeURIComponent(`${keyField} eq '${String(keyValue).replace(/'/g, "''")}'`);
    const res = await send(`${site}/_api/web/lists(guid'${guid}')/items?$select=Id&$filter=${filter}&$top=1`,
      { headers: { Accept: NOMETA } });
    if (!res.ok) throw new Error(`checking seed: ${await detail(res)}`);
    return ((await res.json()).value || []).length > 0;
  };

  const createSeed = async (guid, digest, fields) => {
    const res = await send(`${site}/_api/web/lists(guid'${guid}')/items`, {
      method: 'POST',
      headers: { Accept: NOMETA, 'Content-Type': NOMETA, 'X-RequestDigest': digest },
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error(await detail(res));
  };

  /* ── run ─────────────────────────────────────────────────────────────────────────────── */

  const ledger = [];
  let createdFields = 0, presentFields = 0, indexedNow = 0, createdSeeds = 0, presentSeeds = 0, failed = 0;

  console.log(
    `%c${DRY_RUN ? 'DRY RUN — ' : ''}${SPEC.totals.fields} columns and ${SPEC.totals.seeds} seed rows across ${SPEC.totals.lists} lists`,
    'font-weight:bold',
  );
  console.log(`%c${site}`, 'color:#888');

  let digest = null;
  try {
    digest = DRY_RUN ? 'dry-run' : await digestFor();
  } catch (err) {
    console.error(err.message);
    return;
  }

  for (const list of SPEC.lists.sort((a, b) => a.listOrder - b.listOrder)) {
    console.group(`${list.listTitle}  (${list.listGuid})`);
    let live;
    try {
      live = await liveFields(list.listGuid);
    } catch (err) {
      console.error(err.message);
      failed += list.fields.length + list.seeds.length;
      ledger.push({ list: list.listTitle, item: '(whole list)', action: 'UNREACHABLE', detail: err.message });
      console.groupEnd();
      continue;
    }

    /* specification internal name → the internal name the tenant actually carries. Empty unless
       a column was adopted by display name below; everything downstream reads through it. */
    const adopted = new Map();
    const specNames = new Set(list.fields.map((f) => f.internalName));

    for (const f of list.fields) {
      let existing = live.byName.get(f.internalName);

      /* ADOPTION. The specification's internal name is absent, but a custom column on this list
         already carries its display name — someone created it by hand, and SharePoint minted a
         different internal name.

         DGO_AccessScopes is the case that forced this: its view shows 'Access Scope Id' because
         an operator hit the ScopeId reserved-name collision and worked around it. Creating the
         specification's column beside that one would give the list two columns for one fact, and
         the seeds would populate the empty one. Adopting is the only outcome that leaves the list
         with a single column holding the data.

         A live column is only adoptable if no other specification field claims its internal name,
         or adoption would silently steal a column this run is about to check on its own terms. */
      if (!existing) {
        const byTitle = live.byTitle.get(f.displayName);
        if (byTitle && !specNames.has(byTitle.InternalName)) {
          existing = byTitle;
          adopted.set(f.internalName, byTitle.InternalName);
          ledger.push({
            list: list.listTitle,
            item: f.internalName,
            action: 'ADOPTED',
            detail:
              `the tenant already carries this column as '${byTitle.InternalName}' under the display name `
              + `'${f.displayName}'. Using it; no second column is created. Seeds are rewritten onto it.`,
          });
        }
      }

      /* Name collision with a SharePoint system field. The specification cannot own this name,
         and creating it would fail, so this is reported rather than attempted — and NOT counted
         as present, which is what hid it before. */
      if (existing && !isCustom(existing)) {
        failed++;
        ledger.push({
          list: list.listTitle,
          item: f.internalName,
          action: 'RESERVED NAME',
          detail:
            `'${f.internalName}' is a SharePoint system field on this list (FromBaseType=${existing.FromBaseType}, `
            + `CanBeDeleted=${existing.CanBeDeleted}). The specification's column was never created; any custom `
            + `column holding this data has a different internal name. Rename it in the specification.`,
        });
        continue;
      }

      if (existing) {
        presentFields++;
        /* Index the column SharePoint actually has. An adopted column's internal name is not the
           specification's, and getbyinternalnameortitle would 404 on the specification's. */
        const liveName = existing.InternalName;
        if (f.indexed && existing.Indexed !== true) {
          if (DRY_RUN) {
            ledger.push({ list: list.listTitle, item: liveName, action: 'WOULD INDEX', detail: 'present but not indexed' });
          } else {
            try { await setIndexed(list.listGuid, liveName, digest); indexedNow++;
              ledger.push({ list: list.listTitle, item: liveName, action: 'INDEXED', detail: '' }); }
            catch (err) { failed++; ledger.push({ list: list.listTitle, item: liveName, action: 'INDEX FAILED', detail: err.message }); }
          }
        } else if (!adopted.has(f.internalName)) {
          ledger.push({ list: list.listTitle, item: f.internalName, action: 'present', detail: '' });
        }
        continue;
      }
      if (DRY_RUN) {
        ledger.push({ list: list.listTitle, item: f.internalName, action: 'WOULD CREATE', detail: f.fieldType });
        continue;
      }
      try {
        await createField(list.listGuid, digest, f.schemaXml);
        createdFields++;
        ledger.push({ list: list.listTitle, item: f.internalName, action: 'CREATED', detail: f.fieldType });
        if (f.indexed) {
          try { await setIndexed(list.listGuid, f.internalName, digest); indexedNow++; }
          catch (err) { failed++; ledger.push({ list: list.listTitle, item: f.internalName, action: 'INDEX FAILED', detail: err.message }); }
        }
      } catch (err) {
        failed++;
        ledger.push({ list: list.listTitle, item: f.internalName, action: 'FAILED', detail: err.message });
      }
    }

    for (const s of list.seeds) {
      /* Read and write through the adoption map. A seed that filters or writes on the
         specification's internal name after a column was adopted under a different one either
         500s on the filter or writes into a column that does not exist. */
      const keyField = adopted.get(s.keyField) ?? s.keyField;
      const fields = {};
      for (const [k, v] of Object.entries(s.fields)) fields[adopted.get(k) ?? k] = v;

      let exists;
      try {
        exists = await seedExists(list.listGuid, keyField, s.keyValue);
      } catch (err) {
        failed++;
        ledger.push({ list: list.listTitle, item: `seed ${s.seedId}`, action: 'CHECK FAILED', detail: err.message });
        continue;
      }
      if (exists) {
        presentSeeds++;
        ledger.push({ list: list.listTitle, item: `seed ${keyField}=${s.keyValue}`, action: 'present', detail: '' });
        continue;
      }
      if (DRY_RUN) {
        ledger.push({ list: list.listTitle, item: `seed ${keyField}=${s.keyValue}`, action: 'WOULD SEED', detail: '' });
        continue;
      }
      try {
        await createSeed(list.listGuid, digest, fields);
        createdSeeds++;
        ledger.push({ list: list.listTitle, item: `seed ${keyField}=${s.keyValue}`, action: 'SEEDED', detail: '' });
      } catch (err) {
        failed++;
        ledger.push({ list: list.listTitle, item: `seed ${keyField}=${s.keyValue}`, action: 'SEED FAILED', detail: err.message });
      }
    }
    console.groupEnd();
  }

  console.table(ledger);
  console.log(
    `%c${DRY_RUN ? 'DRY RUN. Nothing was changed. ' : ''}` +
    `fields: ${createdFields} created, ${presentFields} already present, ${indexedNow} indexed  ·  ` +
    `seeds: ${createdSeeds} created, ${presentSeeds} already present  ·  ${failed} failed`,
    failed ? 'color:#b00;font-weight:bold' : 'font-weight:bold',
  );

  /* WHICH list failed, not just how many rows. A count at the end of a 107-row table sends the
     operator hunting; naming the list and quoting the server's own words does not. Every
     failure observed so far has been one list failing every operation that touches its item
     store, which is a tenant condition — so the summary says that plainly rather than leaving
     it to look like a script fault. */
  const failing = ledger.filter((r) => /FAILED|UNREACHABLE/.test(r.action));
  if (failing.length) {
    const byList = new Map();
    for (const r of failing) {
      if (!byList.has(r.list)) byList.set(r.list, []);
      byList.get(r.list).push(r);
    }
    console.group('%cLists with failures — read this before re-running', 'color:#b00;font-weight:bold');
    for (const [list, rows] of byList) {
      const spec = SPEC.lists.find((l) => l.listTitle === list);
      console.group(`${list}  (${spec ? spec.listGuid : 'unknown guid'})`);
      for (const r of rows) console.log(`${r.action}: ${r.item} — ${r.detail}`);
      const itemStore = rows.every((r) => /INDEX FAILED|CHECK FAILED|SEED FAILED|UNREACHABLE/.test(r.action));
      if (itemStore) {
        console.log(
          '%cEvery failure here touches the list\'s ITEM STORE, and its columns read back fine. '
          + 'That is a broken list in the tenant, not a fault in this script — re-running will not '
          + 'change it. Open the list in the browser and check whether it loads at all.',
          'color:#b00',
        );
      }
      console.groupEnd();
    }
    console.groupEnd();
    console.log(
      `%c${byList.size} of ${SPEC.totals.lists} list(s) failed. The other ${SPEC.totals.lists - byList.size} are complete.`,
      'font-weight:bold',
    );
  }
  if (DRY_RUN) console.log('%cSet DRY_RUN = false at the top of this file and paste again to apply.', 'font-weight:bold');
  else if (!failed) console.log('%cRe-run this file to verify: everything should report "present".', 'color:#080');

  /* ── relay block ─────────────────────────────────────────────────────────────────────────
     One line of JSON, between two markers. Copy the line, not the table: a console.table copies
     as one unbroken string with its header repeated, and a whole-console paste also contains this
     script, whose source mentions every verdict the ledger can produce. */
  try {
    const _rows = (typeof ledger !== 'undefined' && Array.isArray(ledger)) ? ledger
      : (typeof summary !== 'undefined' && Array.isArray(summary)) ? summary : [];
    const _tally = {};
    for (const _r of _rows) {
      const _k = String(_r.action ?? _r.verdict ?? 'row');
      _tally[_k] = (_tally[_k] || 0) + 1;
    }
    const _payload = {
      script: "provision-governance-lists.browser.js",
      mode: DRY_RUN ? 'dry-run' : 'apply',
      site: site,
      utc: new Date().toISOString(),
      rows: _rows.length,
      tally: _tally,
      ledger: _rows,
    };
    console.log('%c───────── RELAY: COPY THE SINGLE LINE BELOW ─────────', 'font-weight:bold');
    console.log(JSON.stringify(_payload));
    console.log('%c───────── END RELAY ─────────', 'font-weight:bold');
  } catch (_e) {
    /* Never let the relay turn a completed run into an apparent failure. */
    console.warn('relay block failed:', _e && _e.message);
  }

})();
