/* GENERATED FILE — do not edit by hand.
 * Built from docs/reference/sharepoint-provisioning-spec.json by
 * scripts/build-column-verifier.mjs. Edit the specification and re-run.
 */
/*
 * READ-ONLY. Changes nothing. EXECUTION-AGENT-BRIEF.md WP-0.
 *
 * Confirm that every column the specification declares exists on the tenant under the internal
 * name the specification declares, across all 10 governance lists
 * (98 columns in total) on
 *   https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE
 *
 * WHY THIS FILE IS GENERATED
 *   Its predecessor was hand-written with five checks hardcoded, two of which asserted column
 *   names — CatalogueVersion and EndpointVersion — that were WITHDRAWN the next day when the
 *   tenant proved 'Version' is an ordinary custom column on both lists, populated and working.
 *   The script was not reverted with the specification, so it went on reporting two correct
 *   columns as WRONG INTERNAL NAME. A checker that outlives the decision it checks produces a
 *   gate that can never go green, and a gate that can never go green teaches people to ignore
 *   gates.
 *
 *   Every name below is read from the specification at build time. Withdraw a rename and this
 *   file stops asserting it, in the same commit.
 *
 * WHAT EACH VERDICT MEANS
 *   present            the column exists as a custom column under the specified internal name
 *   MISSING            the specification declares it and the tenant does not have it
 *   RESERVED NAME      a field of that name exists but is SharePoint's own, not the estate's
 *   OLD NAME PRESENT   a withdrawn or superseded name is still on the list — see the note it prints
 *
 * HOW TO RUN
 *   1. Sign in and open any page on https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE
 *   2. F12 → Console. Paste. Nothing is written.
 */

const SITE = "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE";
const LISTS = [
  {
    "listTitle": "DGO_UserDirectory",
    "listGuid": "3d591f5b-3f2f-409c-983a-a77b5c174834",
    "fields": [
      {
        "internalName": "UserId",
        "displayName": "UserId",
        "indexed": false
      },
      {
        "internalName": "FullName",
        "displayName": "FullName",
        "indexed": false
      },
      {
        "internalName": "Email",
        "displayName": "Email",
        "indexed": true
      },
      {
        "internalName": "Directorate",
        "displayName": "Directorate",
        "indexed": false
      },
      {
        "internalName": "Department",
        "displayName": "Department",
        "indexed": false
      },
      {
        "internalName": "Unit",
        "displayName": "Unit",
        "indexed": false
      },
      {
        "internalName": "JobTitle",
        "displayName": "JobTitle",
        "indexed": false
      },
      {
        "internalName": "Phone",
        "displayName": "Phone",
        "indexed": false
      },
      {
        "internalName": "Role",
        "displayName": "Role",
        "indexed": false
      },
      {
        "internalName": "Persona",
        "displayName": "Persona",
        "indexed": false
      },
      {
        "internalName": "Status",
        "displayName": "Status",
        "indexed": false
      },
      {
        "internalName": "AccessScope",
        "displayName": "AccessScope",
        "indexed": false
      },
      {
        "internalName": "PilotCohort",
        "displayName": "PilotCohort",
        "indexed": false
      },
      {
        "internalName": "CreatedAt",
        "displayName": "CreatedAt",
        "indexed": false
      },
      {
        "internalName": "CreatedBy",
        "displayName": "CreatedBy",
        "indexed": false
      },
      {
        "internalName": "UpdatedAt",
        "displayName": "UpdatedAt",
        "indexed": false
      },
      {
        "internalName": "UpdatedBy",
        "displayName": "UpdatedBy",
        "indexed": false
      },
      {
        "internalName": "DisabledReason",
        "displayName": "DisabledReason",
        "indexed": false
      },
      {
        "internalName": "LastSeenAt",
        "displayName": "LastSeenAt",
        "indexed": false
      },
      {
        "internalName": "LastResolvedRole",
        "displayName": "LastResolvedRole",
        "indexed": false
      },
      {
        "internalName": "LastResolvedPersona",
        "displayName": "LastResolvedPersona",
        "indexed": false
      }
    ]
  },
  {
    "listTitle": "DGO_RoleCatalogue",
    "listGuid": "f675598b-271d-4200-8d75-2597aad4057f",
    "fields": [
      {
        "internalName": "RoleId",
        "displayName": "RoleId",
        "indexed": true
      },
      {
        "internalName": "Persona",
        "displayName": "Persona",
        "indexed": false
      },
      {
        "internalName": "PermissionsJson",
        "displayName": "PermissionsJson",
        "indexed": false
      },
      {
        "internalName": "AllowedRoutesJson",
        "displayName": "AllowedRoutesJson",
        "indexed": false
      },
      {
        "internalName": "CanAssignRoles",
        "displayName": "CanAssignRoles",
        "indexed": false
      },
      {
        "internalName": "CanManageSettings",
        "displayName": "CanManageSettings",
        "indexed": false
      },
      {
        "internalName": "CanViewAudit",
        "displayName": "CanViewAudit",
        "indexed": false
      },
      {
        "internalName": "Active",
        "displayName": "Active",
        "indexed": false
      },
      {
        "internalName": "Version",
        "displayName": "Version",
        "indexed": false
      }
    ]
  },
  {
    "listTitle": "DGO_UserRoleHistory",
    "listGuid": "9fe1872f-3ae0-4b5f-96fc-5d3331c1d07c",
    "fields": [
      {
        "internalName": "UserEmail",
        "displayName": "UserEmail",
        "indexed": true
      },
      {
        "internalName": "PreviousRole",
        "displayName": "PreviousRole",
        "indexed": false
      },
      {
        "internalName": "NewRole",
        "displayName": "NewRole",
        "indexed": false
      },
      {
        "internalName": "PreviousPersona",
        "displayName": "PreviousPersona",
        "indexed": false
      },
      {
        "internalName": "NewPersona",
        "displayName": "NewPersona",
        "indexed": false
      },
      {
        "internalName": "ChangedBy",
        "displayName": "ChangedBy",
        "indexed": false
      },
      {
        "internalName": "ChangedAt",
        "displayName": "ChangedAt",
        "indexed": false
      },
      {
        "internalName": "Reason",
        "displayName": "Reason",
        "indexed": false
      },
      {
        "internalName": "RequestId",
        "displayName": "RequestId",
        "indexed": false
      }
    ]
  },
  {
    "listTitle": "DGO_AuditLog",
    "listGuid": "be0c7af1-b21d-4efe-8c30-53fc55598d95",
    "fields": [
      {
        "internalName": "AuditId",
        "displayName": "AuditId",
        "indexed": true
      },
      {
        "internalName": "RequestId",
        "displayName": "RequestId",
        "indexed": false
      },
      {
        "internalName": "Event",
        "displayName": "Event",
        "indexed": false
      },
      {
        "internalName": "Module",
        "displayName": "Module",
        "indexed": false
      },
      {
        "internalName": "Action",
        "displayName": "Action",
        "indexed": false
      },
      {
        "internalName": "ActorEmail",
        "displayName": "ActorEmail",
        "indexed": false
      },
      {
        "internalName": "ActorRole",
        "displayName": "ActorRole",
        "indexed": false
      },
      {
        "internalName": "ActorPersona",
        "displayName": "ActorPersona",
        "indexed": false
      },
      {
        "internalName": "EntityType",
        "displayName": "EntityType",
        "indexed": false
      },
      {
        "internalName": "EntityId",
        "displayName": "EntityId",
        "indexed": false
      },
      {
        "internalName": "Ref",
        "displayName": "Ref",
        "indexed": false
      },
      {
        "internalName": "MetaJson",
        "displayName": "MetaJson",
        "indexed": false
      },
      {
        "internalName": "Severity",
        "displayName": "Severity",
        "indexed": false
      },
      {
        "internalName": "CreatedAt",
        "displayName": "CreatedAt",
        "indexed": false
      }
    ]
  },
  {
    "listTitle": "DGO_PendingWrites",
    "listGuid": "ad1df270-21c7-4b78-99e7-fb18efd02cd2",
    "fields": [
      {
        "internalName": "PendingId",
        "displayName": "PendingId",
        "indexed": true
      },
      {
        "internalName": "Operation",
        "displayName": "Operation",
        "indexed": false
      },
      {
        "internalName": "QueueType",
        "displayName": "QueueType",
        "indexed": false
      },
      {
        "internalName": "PayloadJson",
        "displayName": "PayloadJson",
        "indexed": false
      },
      {
        "internalName": "ErrorMessage",
        "displayName": "ErrorMessage",
        "indexed": false
      },
      {
        "internalName": "RetryCount",
        "displayName": "RetryCount",
        "indexed": false
      },
      {
        "internalName": "Status",
        "displayName": "Status",
        "indexed": false
      },
      {
        "internalName": "CreatedAt",
        "displayName": "CreatedAt",
        "indexed": false
      },
      {
        "internalName": "LastRetryAt",
        "displayName": "LastRetryAt",
        "indexed": false
      },
      {
        "internalName": "ResolvedAt",
        "displayName": "ResolvedAt",
        "indexed": false
      }
    ]
  },
  {
    "listTitle": "DGO_DepartmentDirectory",
    "listGuid": "eed0ba42-ece1-40e2-bf66-79827de02766",
    "fields": [
      {
        "internalName": "DepartmentId",
        "displayName": "DepartmentId",
        "indexed": true
      },
      {
        "internalName": "Directorate",
        "displayName": "Directorate",
        "indexed": false
      },
      {
        "internalName": "Department",
        "displayName": "Department",
        "indexed": false
      },
      {
        "internalName": "Unit",
        "displayName": "Unit",
        "indexed": false
      },
      {
        "internalName": "DsuCode",
        "displayName": "DsuCode",
        "indexed": false
      },
      {
        "internalName": "Active",
        "displayName": "Active",
        "indexed": false
      }
    ]
  },
  {
    "listTitle": "DGO_AccessScopes",
    "listGuid": "f2ffd2fa-901e-4f28-8f28-957da0fe05e4",
    "fields": [
      {
        "internalName": "AccessScopeId",
        "displayName": "Access Scope Id",
        "indexed": true
      },
      {
        "internalName": "ScopeName",
        "displayName": "ScopeName",
        "indexed": false
      },
      {
        "internalName": "Description",
        "displayName": "Description",
        "indexed": false
      },
      {
        "internalName": "RoutesJson",
        "displayName": "RoutesJson",
        "indexed": false
      },
      {
        "internalName": "DirectoratesJson",
        "displayName": "DirectoratesJson",
        "indexed": false
      },
      {
        "internalName": "Active",
        "displayName": "Active",
        "indexed": false
      }
    ]
  },
  {
    "listTitle": "DGO_PilotCohorts",
    "listGuid": "ecc4ac65-1804-4f67-ad3e-eacb1a3a4dc2",
    "fields": [
      {
        "internalName": "CohortId",
        "displayName": "CohortId",
        "indexed": true
      },
      {
        "internalName": "CohortName",
        "displayName": "CohortName",
        "indexed": false
      },
      {
        "internalName": "StartDate",
        "displayName": "StartDate",
        "indexed": false
      },
      {
        "internalName": "EndDate",
        "displayName": "EndDate",
        "indexed": false
      },
      {
        "internalName": "OwnerEmail",
        "displayName": "OwnerEmail",
        "indexed": false
      },
      {
        "internalName": "Status",
        "displayName": "Status",
        "indexed": false
      },
      {
        "internalName": "Notes",
        "displayName": "Notes",
        "indexed": false
      }
    ]
  },
  {
    "listTitle": "DGO_EndpointRegistry",
    "listGuid": "08c6e1c4-f2b1-4810-933d-69b4327fb6af",
    "fields": [
      {
        "internalName": "EndpointKey",
        "displayName": "EndpointKey",
        "indexed": true
      },
      {
        "internalName": "FlowName",
        "displayName": "FlowName",
        "indexed": false
      },
      {
        "internalName": "EndpointRedacted",
        "displayName": "Endpoint (redacted)",
        "indexed": false
      },
      {
        "internalName": "OwnerEmail",
        "displayName": "OwnerEmail",
        "indexed": false
      },
      {
        "internalName": "Environment",
        "displayName": "Environment",
        "indexed": false
      },
      {
        "internalName": "Status",
        "displayName": "Status",
        "indexed": false
      },
      {
        "internalName": "Version",
        "displayName": "Version",
        "indexed": false
      },
      {
        "internalName": "LastValidatedAt",
        "displayName": "LastValidatedAt",
        "indexed": false
      },
      {
        "internalName": "EndpointFingerprint",
        "displayName": "Endpoint fingerprint",
        "indexed": false
      }
    ]
  },
  {
    "listTitle": "DGO_AccessEvents",
    "listGuid": "a40d5f57-859c-426c-826c-bfee090137ad",
    "fields": [
      {
        "internalName": "EventId",
        "displayName": "EventId",
        "indexed": true
      },
      {
        "internalName": "UserEmail",
        "displayName": "UserEmail",
        "indexed": false
      },
      {
        "internalName": "Route",
        "displayName": "Route",
        "indexed": false
      },
      {
        "internalName": "EventType",
        "displayName": "EventType",
        "indexed": false
      },
      {
        "internalName": "Message",
        "displayName": "Message",
        "indexed": false
      },
      {
        "internalName": "MetaJson",
        "displayName": "MetaJson",
        "indexed": false
      },
      {
        "internalName": "CreatedAt",
        "displayName": "CreatedAt",
        "indexed": false
      }
    ]
  }
];
const SUPERSEDED = [
  {
    "list": "DGO_AccessScopes",
    "oldName": "ScopeId",
    "newName": "AccessScopeId"
  },
  {
    "list": "DGO_EndpointRegistry",
    "oldName": "FlowUrl",
    "newName": "EndpointRedacted"
  }
];

(async () => {
  const NOMETA = 'application/json;odata=nometadata';

  const send = async (url, attempt = 0) => {
    const res = await fetch(url, { credentials: 'include', headers: { Accept: NOMETA } });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const wait = (Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000;
      console.warn(`  throttled, waiting ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      return send(url, attempt + 1);
    }
    return res;
  };

  /* A field inherited from the base type is SharePoint's, not the estate's. Counting one as
     present is the false positive that cost the 2026-09-09 run — recorded as GOV-08. */
  const isCustom = (f) => f && f.FromBaseType !== true && f.CanBeDeleted !== false;

  const ledger = [];
  let present = 0, missing = 0, reserved = 0, stale = 0, unreadable = 0;

  console.log(`%cWP-0 column verification — ${LISTS.length} lists, ${LISTS.reduce((n, l) => n + l.fields.length, 0)} columns`,
    'font-weight:bold;font-size:13px');
  console.log(`%c${SITE}`, 'color:#888');

  for (const l of LISTS) {
    let live;
    try {
      const res = await send(
        `${SITE}/_api/web/lists(guid'${l.listGuid}')/fields?$select=InternalName,Title,Indexed,FromBaseType,CanBeDeleted&$top=500`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      live = new Map(((await res.json()).value || []).map((f) => [f.InternalName, f]));
    } catch (err) {
      unreadable++;
      ledger.push({ list: l.listTitle, column: '(whole list)', action: 'UNREADABLE', detail: err.message });
      continue;
    }

    for (const f of l.fields) {
      const got = live.get(f.internalName);
      if (!got) {
        missing++;
        ledger.push({ list: l.listTitle, column: f.internalName, action: 'MISSING', detail: `display '${f.displayName}'` });
      } else if (!isCustom(got)) {
        reserved++;
        ledger.push({
          list: l.listTitle, column: f.internalName, action: 'RESERVED NAME',
          detail: `FromBaseType=${got.FromBaseType}, CanBeDeleted=${got.CanBeDeleted} — SharePoint's own field, not the estate's`,
        });
      } else {
        present++;
      }
    }

    /* A superseded name still on the list is a correction the tenant has not received, or one
       the repository reverted without the tenant. Either way it is worth naming, and it is NOT
       a failure of the columns above. */
    for (const s of SUPERSEDED) {
      if (s.list !== l.listTitle) continue;
      const old = live.get(s.oldName);
      if (old && isCustom(old)) {
        stale++;
        ledger.push({
          list: l.listTitle, column: s.oldName, action: 'OLD NAME PRESENT',
          detail: `superseded by '${s.newName}'. Not an error on its own — it holds data on some lists. Report it; do not delete it here.`,
        });
      }
    }
  }

  console.table(ledger.length ? ledger : [{ list: '(all)', column: '(all)', action: 'present', detail: 'every specified column found' }]);
  console.log(
    `%c${present} present · ${missing} missing · ${reserved} reserved-name · ${stale} superseded-name still present · ${unreadable} list(s) unreadable`,
    (missing || reserved || unreadable) ? 'color:#b00;font-weight:bold' : 'color:#080;font-weight:bold',
  );

  if (!missing && !reserved && !unreadable) {
    console.log('%cWP-0 PASSES: every specified column exists under its specified name.', 'color:#080;font-weight:bold');
  } else {
    console.log('%cWP-0 DOES NOT PASS. Report under §9 before proceeding.', 'color:#b00;font-weight:bold');
  }

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
      script: "verify-governance-columns.browser.js",
      mode: 'read-only',
      site: SITE,
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
