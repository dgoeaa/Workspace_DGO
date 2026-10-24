/* GENERATED FILE — do not edit by hand.
 * Built from the seven internal designer-paste packages and the tenant capture by
 * scripts/build-internal-preflight.mjs. Change the packages and re-run.
 */
/*
 * PRE-PASTE PREFLIGHT for the seven internal endpoint flows.
 *
 * Answers one question: if I paste these packages now, will they work?
 *
 * WHY IT IS NEEDED
 *   A package pastes cleanly and then fails on the first real call for reasons the designer
 *   cannot show you — a column that was never provisioned, a directory with no active row, a
 *   role catalogue whose permissions do not carry the capability the gate tests for. Each of
 *   those surfaces as a 401, a 403 or a rejected write long after the paste, and is attributed
 *   to the wrong thing. This reads the tenant and says so first.
 *
 * HOW TO RUN
 *   1. Sign in to https://nitdanigeria.sharepoint.com and open any page on any of the sites.
 *   2. Open devtools (F12) → Console.
 *   3. Paste this entire file and press Enter.
 *
 *   It only ever READS. There is no dry-run switch because there is nothing to switch off.
 *   You need read access to the three sites; Site Member is enough.
 *
 * WHAT IT CANNOT TELL YOU
 *   Whether the two connection references resolve in your Power Automate environment. A
 *   connection is an environment resource, not a SharePoint one, and this runs against
 *   SharePoint. Check those in the designer on the first paste — every action should arrive
 *   already bound, with no connection picker shown.
 */
(async () => {
  const SPEC = {
  "flows": [
    "DGO_BULK_ASSIGNMENT",
    "DGO_DYNAMIC_GLOBAL_ACTIONS",
    "DGO_FETCH_ALL",
    "DGO_GET_DOCS",
    "DGO_OTP",
    "DGO_REFERENCE_DATA",
    "DGO_SCAN_INTAKE",
    "DGO_SCHEDULED_SWEEP",
    "DGO_SEND_EMAIL",
    "DGO_SINGLE_ASSIGNMENT"
  ],
  "lists": [
    {
      "guid": "1f1cb303-3fd2-43c8-8f24-c409b6c2fde3",
      "title": "DGO DIGITAL OPS",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "itemsAtCapture": 21249,
      "writes": [
        "Marked_Item",
        "Status",
        "Title"
      ],
      "optionalWrites": [],
      "filters": [
        "Modified",
        "RefIDD"
      ],
      "mustIndex": [
        "Modified",
        "RefIDD"
      ],
      "usedBy": [
        "DGO_DYNAMIC_GLOBAL_ACTIONS",
        "DGO_FETCH_ALL",
        "DGO_GET_DOCS"
      ]
    },
    {
      "guid": "be0c7af1-b21d-4efe-8c30-53fc55598d95",
      "title": "DGO_AuditLog",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE",
      "itemsAtCapture": 1,
      "writes": [
        "Action",
        "ActorEmail",
        "ActorPersona",
        "ActorRole",
        "AuditId",
        "CreatedAt",
        "EntityId",
        "EntityType",
        "Event",
        "MetaJson",
        "Module",
        "Ref",
        "RequestId",
        "Severity",
        "Title"
      ],
      "optionalWrites": [],
      "filters": [],
      "mustIndex": [],
      "usedBy": [
        "DGO_BULK_ASSIGNMENT",
        "DGO_DYNAMIC_GLOBAL_ACTIONS",
        "DGO_SCAN_INTAKE",
        "DGO_SINGLE_ASSIGNMENT"
      ]
    },
    {
      "guid": "f675598b-271d-4200-8d75-2597aad4057f",
      "title": "DGO_RoleCatalogue",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE",
      "itemsAtCapture": 6,
      "writes": [],
      "optionalWrites": [],
      "filters": [
        "Active",
        "RoleId"
      ],
      "mustIndex": [],
      "usedBy": [
        "DGO_BULK_ASSIGNMENT",
        "DGO_DYNAMIC_GLOBAL_ACTIONS",
        "DGO_FETCH_ALL",
        "DGO_GET_DOCS",
        "DGO_REFERENCE_DATA",
        "DGO_SCAN_INTAKE",
        "DGO_SINGLE_ASSIGNMENT"
      ]
    },
    {
      "guid": "3d591f5b-3f2f-409c-983a-a77b5c174834",
      "title": "DGO_UserDirectory",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE",
      "itemsAtCapture": 1,
      "writes": [],
      "optionalWrites": [],
      "filters": [
        "Email",
        "Status"
      ],
      "mustIndex": [],
      "usedBy": [
        "DGO_BULK_ASSIGNMENT",
        "DGO_DYNAMIC_GLOBAL_ACTIONS",
        "DGO_FETCH_ALL",
        "DGO_GET_DOCS",
        "DGO_OTP",
        "DGO_REFERENCE_DATA",
        "DGO_SCAN_INTAKE",
        "DGO_SEND_EMAIL",
        "DGO_SINGLE_ASSIGNMENT"
      ]
    },
    {
      "guid": "9bc168c3-06e5-4d58-982b-0df06205fd35",
      "title": "Flow Configuration",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "itemsAtCapture": 1,
      "writes": [],
      "optionalWrites": [],
      "filters": [
        "Title"
      ],
      "mustIndex": [],
      "usedBy": [
        "DGO_BULK_ASSIGNMENT",
        "DGO_DYNAMIC_GLOBAL_ACTIONS",
        "DGO_FETCH_ALL",
        "DGO_GET_DOCS",
        "DGO_OTP",
        "DGO_REFERENCE_DATA",
        "DGO_SCAN_INTAKE",
        "DGO_SEND_EMAIL",
        "DGO_SINGLE_ASSIGNMENT"
      ]
    },
    {
      "guid": "ee82725a-c408-45e2-a8e8-facf7a092047",
      "title": "Global Tracking Queue",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "itemsAtCapture": 15804,
      "writes": [
        "Assigned",
        "AssignedBy",
        "AssignedTo",
        "Comments",
        "DueDate",
        "Priority",
        "Progress",
        "StartDate",
        "Title"
      ],
      "optionalWrites": [],
      "filters": [
        "Acknowledgement_x0020_Due_x0020_",
        "DueDate",
        "Modified",
        "RefIDD"
      ],
      "mustIndex": [
        "Acknowledgement_x0020_Due_x0020_",
        "DueDate",
        "Modified",
        "RefIDD"
      ],
      "usedBy": [
        "DGO_BULK_ASSIGNMENT",
        "DGO_DYNAMIC_GLOBAL_ACTIONS",
        "DGO_FETCH_ALL",
        "DGO_SCHEDULED_SWEEP",
        "DGO_SINGLE_ASSIGNMENT"
      ]
    },
    {
      "guid": "9421d473-8906-43b7-a41f-a213046683c1",
      "title": "OTP_Transactions",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "itemsAtCapture": 84,
      "writes": [
        "Expires_At",
        "Is_Verified",
        "OTP_Code",
        "Title"
      ],
      "optionalWrites": [],
      "filters": [
        "Created",
        "Is_Verified",
        "Title"
      ],
      "mustIndex": [],
      "usedBy": [
        "DGO_OTP"
      ]
    },
    {
      "guid": "8aab9c4e-001f-4e32-862c-8a50e750f04e",
      "title": "Organizaitonal_Departments_Information",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "itemsAtCapture": 50,
      "writes": [],
      "optionalWrites": [],
      "filters": [],
      "mustIndex": [],
      "usedBy": [
        "DGO_FETCH_ALL",
        "DGO_REFERENCE_DATA"
      ]
    },
    {
      "guid": "f64c8b65-c921-46e9-8814-a8cef61f6016",
      "title": "Organizational_Categories_Matrix",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "itemsAtCapture": 45,
      "writes": [],
      "optionalWrites": [],
      "filters": [],
      "mustIndex": [],
      "usedBy": [
        "DGO_FETCH_ALL",
        "DGO_REFERENCE_DATA"
      ]
    },
    {
      "guid": "726c210d-09d5-45d9-952d-7a506b644b13",
      "title": "Portal Flow Telemetry",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "itemsAtCapture": 0,
      "writes": [
        "CompletedAtUtc",
        "DurationMs",
        "ErrorMessage",
        "Flow",
        "Outcome",
        "RunId",
        "RunRecordJson",
        "StartedAtUtc",
        "Title"
      ],
      "optionalWrites": [
        "RunRecordJson"
      ],
      "filters": [],
      "mustIndex": [],
      "usedBy": [
        "DGO_BULK_ASSIGNMENT",
        "DGO_DYNAMIC_GLOBAL_ACTIONS",
        "DGO_FETCH_ALL",
        "DGO_GET_DOCS",
        "DGO_OTP",
        "DGO_REFERENCE_DATA",
        "DGO_SCAN_INTAKE",
        "DGO_SCHEDULED_SWEEP",
        "DGO_SEND_EMAIL",
        "DGO_SINGLE_ASSIGNMENT"
      ]
    },
    {
      "guid": "88a81ca1-319a-45f5-8409-f91a24538ffa",
      "title": "Portal Outbox Receipts",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "itemsAtCapture": 0,
      "writes": [
        "Attempts",
        "LastError",
        "MessageType",
        "RecipientEmail",
        "Reference",
        "SentAtUtc",
        "Status",
        "Title"
      ],
      "optionalWrites": [],
      "filters": [
        "Attempts",
        "SentAtUtc",
        "Status",
        "Title"
      ],
      "mustIndex": [],
      "usedBy": [
        "DGO_SCHEDULED_SWEEP",
        "DGO_SEND_EMAIL"
      ]
    },
    {
      "guid": "d6b97198-489c-4bd7-8647-1133c55efdf9",
      "title": "Portal Rate Limits",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "itemsAtCapture": 0,
      "writes": [
        "RequestCount",
        "Title",
        "UpdatedAtUtc",
        "WindowStartUtc"
      ],
      "optionalWrites": [],
      "filters": [
        "Title"
      ],
      "mustIndex": [
        "Title"
      ],
      "usedBy": [
        "DGO_OTP",
        "DGO_SCAN_INTAKE"
      ]
    },
    {
      "guid": "4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667",
      "title": "Portal Registry",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NEDMS",
      "itemsAtCapture": 0,
      "writes": [],
      "optionalWrites": [],
      "filters": [
        "Modified",
        "Status"
      ],
      "mustIndex": [],
      "usedBy": [
        "DGO_SCHEDULED_SWEEP"
      ]
    },
    {
      "guid": "d95409a4-2b48-4d34-9f60-da5d27db862d",
      "title": "Portal Sequence Counters",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "itemsAtCapture": 1,
      "writes": [
        "CurrentSequence",
        "LockToken",
        "ModifiedByFlowRun",
        "Prefix",
        "Title",
        "Year"
      ],
      "optionalWrites": [],
      "filters": [
        "Prefix",
        "Year"
      ],
      "mustIndex": [],
      "usedBy": [
        "DGO_SCAN_INTAKE"
      ]
    },
    {
      "guid": "b984645b-8e3a-457f-a305-b95650fd3f23",
      "title": "Portal Support Cases",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre",
      "itemsAtCapture": 0,
      "writes": [],
      "optionalWrites": [],
      "filters": [
        "Modified",
        "Status"
      ],
      "mustIndex": [],
      "usedBy": [
        "DGO_SCHEDULED_SWEEP"
      ]
    },
    {
      "guid": "1932d687-e77a-4929-9047-a1f544c68a0b",
      "title": "Task_Comments",
      "siteUrl": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
      "itemsAtCapture": 3,
      "writes": [],
      "optionalWrites": [],
      "filters": [
        "Created"
      ],
      "mustIndex": [],
      "usedBy": [
        "DGO_FETCH_ALL"
      ]
    }
  ],
  "seeds": [
    {
      "guid": "3d591f5b-3f2f-409c-983a-a77b5c174834",
      "title": "DGO_UserDirectory",
      "query": "$filter=Status eq 'active'&$top=100",
      "need": "at least one row with Status = active",
      "because": "every flow resolves the caller here; with none, every call answers 401"
    },
    {
      "guid": "f675598b-271d-4200-8d75-2597aad4057f",
      "title": "DGO_RoleCatalogue",
      "query": "$filter=Active eq 1&$top=20&$select=RoleId,PermissionsJson,AllowedRoutesJson",
      "need": "rows with Active = yes, and PermissionsJson carrying 'bulk:assign' and 'user:view'",
      "because": "the gate tests these strings; without them a known caller answers 403"
    },
    {
      "guid": "9bc168c3-06e5-4d58-982b-0df06205fd35",
      "title": "Flow Configuration",
      "query": "$filter=startswith(Title,'ALLOWED_ORIGIN')&$top=20&$select=Title,ConfigValue",
      "need": "at least one row whose ConfigValue is the portal origin",
      "because": "CORS fails closed — with no row a browser refuses every response"
    }
  ]
};
  const VERBOSE = 'application/json;odata=verbose';
  const rows = [];
  let blocking = 0, warnings = 0;   /* reassigned when a run turns out to have measured nothing */

  /* `fetch` rejects with TypeError: Failed to fetch when the request never leaves the page —
     a wrong origin, a blocking extension, no network. SharePoint answering 403 or 404 is a
     different thing entirely, and the two must not read the same in the report: one is a fact
     about the tenant, the other is a fact about where this is running. */
  let networkFailures = 0;
  const send = async (url, attempt = 0) => {
    let res;
    try {
      res = await fetch(url, { credentials: 'include', headers: { Accept: VERBOSE } });
    } catch (err) {
      networkFailures++;
      const e = new Error('the request never left the page (' + err.message + ')');
      e.isNetwork = true;
      throw e;
    }
    if ((res.status === 429 || res.status === 503) && attempt < 3) {
      const wait = (Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      return send(url, attempt + 1);
    }
    return res;
  };

  const record = (severity, area, detail, fix) => {
    rows.push({ severity, area, detail, fix });
    if (severity === 'BLOCKS PASTE') blocking++;
    else if (severity === 'warn') warnings++;
    const colour = severity === 'BLOCKS PASTE' ? 'color:#dc322f;font-weight:bold'
      : severity === 'warn' ? 'color:#b58900' : 'color:#859900';
    console.log(`%c${severity === 'ok' ? '✓' : '✗'} ${area} — ${detail}`, colour);
  };

  console.log('%cPre-paste preflight — seven internal endpoint flows', 'font-weight:bold;font-size:14px');
  console.log(`Checking ${SPEC.lists.length} lists and ${SPEC.seeds.length} seed conditions.\n`);

  /* WHERE THIS IS RUNNING DECIDES WHETHER ANYTHING IT SAYS IS TRUE.
     Every request is same-origin and relies on the signed-in session of the page it runs from.
     Run it anywhere else — a data: URL, a blank tab, another site — and all 15 checks fail with
     "Failed to fetch", which the report rendered as twelve unreadable lists and three unqueryable
     seeds: fifteen alarming statements about the tenant, none of them about the tenant. So the
     origin is checked first, and a wrong one stops the run rather than producing a result that
     looks like findings. */
  const expected = new URL(SPEC.lists[0].siteUrl).origin;
  const here = (() => { try { return location.origin; } catch { return null; } })();
  if (here !== expected) {
    const msg = here
      ? `This is running on ${here}, and every check needs ${expected}.`
      : 'This is running somewhere with no usable origin (a data: URL, or a sandboxed frame).';
    record('BLOCKS PASTE', 'Wrong page',
      msg + ' Nothing was checked.',
      `Open ${expected} — any page on any of the sites — and run this from THAT tab's console. `
      + 'In devtools, confirm the context selector at the top of the Console panel names the '
      + 'SharePoint page and not a data: URL, an extension, or an embedded frame.');
    console.log('%c✗ Nothing was checked — see the panel.', 'color:#dc322f;font-weight:bold');
    window.preflight = { checkedUtc: new Date().toISOString(), blocking, warnings, rows, ranNothing: true };
    renderPanel();
    return;
  }

  /* ---- 1. every list is reachable, and carries every column the flows touch ---- */
  const liveByGuid = new Map();
  for (const list of SPEC.lists) {
    console.group(`${list.title}  (${list.usedBy.length} flow${list.usedBy.length > 1 ? 's' : ''})`);
    let fields;
    try {
      const res = await send(`${list.siteUrl}/_api/web/lists(guid'${list.guid}')/fields?$select=InternalName,Indexed,Required,TypeAsString,Hidden,ReadOnlyField,Sealed&$top=500`);
      if (!res.ok) throw new Error(`${res.status}`);
      fields = (await res.json()).d.results;
    } catch (err) {
      record('BLOCKS PASTE', list.title, `list not readable (${err.message})`,
        `Confirm the list exists at ${list.siteUrl} and that you have read access.`);
      console.groupEnd();
      continue;
    }
    const live = new Map(fields.map((f) => [f.InternalName, f]));
    liveByGuid.set(list.guid, live);

    const optional = new Set(list.optionalWrites || []);
    const missingWrites = list.writes.filter((c) => c !== 'Title' && !optional.has(c) && !live.has(c));
    const missingOptional = list.writes.filter((c) => optional.has(c) && !live.has(c));
    const missingFilters = list.filters.filter((c) => !live.has(c));
    if (missingWrites.length) {
      record('BLOCKS PASTE', `${list.title} columns`,
        `written but absent: ${missingWrites.join(', ')}`,
        `SharePoint rejects the whole item for one unknown column, so every write from ${list.usedBy.join(', ')} fails. Provision these before pasting.`);
    }
    if (missingFilters.length) {
      record('BLOCKS PASTE', `${list.title} columns`,
        `filtered but absent: ${missingFilters.join(', ')}`,
        `A $filter on a column that does not exist returns an error, not an empty set.`);
    }
    if (missingOptional.length) {
      record('warn', `${list.title} columns`,
        `absent but not blocking: ${missingOptional.join(', ')}`,
        `A fallback write covers this, so the flow runs and only that column's content is lost. Provision it when convenient.`);
    }

    /* Required columns nothing writes — the same fault the audit row had.
       A COLUMN THE FLOW CANNOT WRITE IS NOT A COLUMN THE FLOW FAILED TO WRITE.
       This asked only for `Required`, so it reported `_ModerationStatus` — SharePoint's own
       content-approval field, hidden and read-only, which SharePoint sets and no caller may
       supply — as a blocker against DGO DIGITAL OPS and Global Tracking Queue on a real run.
       Two false blockers on the two largest lists in the estate, and the advice attached to them
       ("the flow must supply them") is impossible to follow. Only a field a create could actually
       carry counts: not hidden, not read-only, not sealed. */
    const mustSupply = (f) => f.Required && !f.Hidden && !f.ReadOnlyField && !f.Sealed
      && f.InternalName !== 'Title' && !list.writes.includes(f.InternalName);
    const unwrittenRequired = fields.filter(mustSupply).map((f) => f.InternalName);
    /* A required column only bites on a CREATE. Where no package writes to the list at all, the
       flows read it and a required column costs them nothing — but it was silently dropped
       before, taking the list's whole result line with it (see below). Say it, and say it is not
       blocking, rather than leaving the operator to guess which of the two happened. */
    if (unwrittenRequired.length) {
      if (list.writes.length) {
        record('BLOCKS PASTE', `${list.title} required columns`,
          `the list requires ${unwrittenRequired.join(', ')}, which no flow writes`,
          `Either the flow must supply them or the column must stop being required — SharePoint rejects the row otherwise.`);
      } else {
        record('warn', `${list.title} required columns`,
          `requires ${unwrittenRequired.join(', ')}, and no package writes to this list at all`,
          `Not blocking: these flows only read here. It would block anything that creates a row.`);
      }
    }

    /* CONTENT APPROVAL TURNS A SUCCESSFUL WRITE INTO AN INVISIBLE ONE.
       With moderation on, a row a flow creates lands Pending: the write returns 201 and the item
       does not appear to readers until someone approves it. An assignment nobody can see is the
       same outcome as an assignment that failed, reached by a path where every check passed. The
       presence of a Required `_ModerationStatus` is what put this question here; the list itself
       answers it definitively. */
    if (list.writes.length) {
      try {
        const mr = await send(`${list.siteUrl}/_api/web/lists(guid'${list.guid}')?$select=EnableModeration`);
        if (mr.ok) {
          const on = (await mr.json()).d.EnableModeration === true;
          if (on) {
            record('warn', `${list.title} content approval`,
              'content approval is ON, so a row a flow creates lands Pending and is not visible until approved',
              `${list.usedBy.join(', ')} write here. Either turn content approval off for this list, or accept that every created row needs approval before anyone sees it.`);
          }
        }
      } catch { /* the verdict does not depend on this; a failure to read it is not a blocker */ }
    }

    /* Indexes, where a filter meets a list big enough for it to matter. */
    for (const col of list.mustIndex) {
      const f = live.get(col);
      if (f && !f.Indexed) {
        record('BLOCKS PASTE', `${list.title}.${col}`,
          `filtered but NOT indexed, on a list of ${list.itemsAtCapture} items at capture`,
          `Past 5,000 items an unindexed equality filter fails rather than slows. Run scripts/provision-sharepoint-fields.browser.js, which sets this.`);
      } else if (f) {
        record('ok', `${list.title}.${col}`, 'filtered and indexed', '');
      }
    }

    /* EVERY LIST GETS A LINE. This was gated on `unwrittenRequired` being empty, while the
       blocking record above was gated on `list.writes.length` too — so a read-only list with any
       required column printed NOTHING: no tick, no cross. On a real run DGO_RoleCatalogue and
       DGO_UserDirectory, which six and seven of the seven flows depend on, produced no output at
       all, and silence reads as "not checked". Their filter columns HAD been checked and were
       present; nothing said so. A list that was examined always says what was found. */
    const blockedHere = missingWrites.length || missingFilters.length || missingOptional.length
      || (list.writes.length && unwrittenRequired.length);
    if (!blockedHere) {
      record('ok', list.title,
        `all ${list.writes.length + list.filters.length} column requirement(s) present`
        + (list.writes.length ? '' : ' — read-only for these flows'), '');
    }
    console.groupEnd();
  }

  /* ---- 2. the seed rows the authorisation gate depends on ---- */
  console.group('Seed data');
  for (const seed of SPEC.seeds) {
    /* A seed whose GUID is not among the lists is a BUILD fault, not something to paper over.
       This used to fall back to `SPEC.lists[0].siteUrl` — the first list in the file, which is
       DGO DIGITAL OPS on the activity-tracking site — so a mis-resolved seed quietly queried the
       wrong GUID on the wrong site and reported whatever came back. That is how a preflight
       tells you the role catalogue is unreadable when the role catalogue is fine, or tells you
       it is fine when it was never read. Say so instead. */
    const list = SPEC.lists.find((l) => l.guid === seed.guid);
    if (!list) {
      record('BLOCKS PASTE', seed.title,
        `the seed names ${seed.guid}, which is not a list any package addresses`,
        'This preflight was built wrong — do not interpret the result. Re-run '
        + 'node scripts/build-internal-preflight.mjs and use the file it writes.');
      continue;
    }
    let items;
    try {
      const res = await send(`${list.siteUrl}/_api/web/lists(guid'${seed.guid}')/items?${seed.query}`);
      if (!res.ok) throw new Error(`${res.status}`);
      items = (await res.json()).d.results;
    } catch (err) {
      record('BLOCKS PASTE', seed.title, `could not be queried (${err.message})`, seed.because);
      continue;
    }
    if (!items.length) {
      record('BLOCKS PASTE', seed.title, `no row matching: ${seed.need}`, seed.because);
      continue;
    }
    if (seed.title === 'DGO_RoleCatalogue') {
      const perms = items.map((i) => String(i.PermissionsJson || '') + String(i.AllowedRoutesJson || '')).join(' ');
      const wanted = ['bulk:assign', 'user:view'];
      const absent = wanted.filter((p) => !perms.includes(p) && !perms.includes('"*"'));
      if (absent.length) {
        record('BLOCKS PASTE', seed.title,
          `${items.length} active role(s), but none carries ${absent.join(' or ')}`,
          'The gate tests for these exact strings; a known caller answers 403 without them.');
        continue;
      }
    }
    if (seed.title === 'Flow Configuration') {
      const withValue = items.map((i) => String(i.ConfigValue || '').trim()).filter(Boolean);
      if (!withValue.length) {
        record('BLOCKS PASTE', seed.title,
          `${items.length} ALLOWED_ORIGIN row(s), none with a ConfigValue`,
          'CORS fails closed — a browser refuses every response until one carries the portal origin.');
        continue;
      }
      /* A ROW IS NOT THE SAME AS A ROW THAT MEANS ANYTHING.
         This checked only that a ConfigValue was non-empty, and passed a run where the value was
         `*`. The resolver takes the caller's Origin when the list contains it and otherwise the
         FIRST listed value, so a list of ['*'] answers every caller with
         `Access-Control-Allow-Origin: *` — the wildcard posture this whole control exists to
         replace, reinstated by one row, with every check green. An allowed origin is an origin:
         a scheme and a host, optionally a port. Nothing else, and never a wildcard. */
      const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i;
      const wildcards = withValue.filter((v) => v === '*' || v.includes('*'));
      const malformed = withValue.filter((v) => !wildcards.includes(v) && !ORIGIN.test(v));
      if (wildcards.length) {
        record('BLOCKS PASTE', seed.title,
          `ConfigValue is ${wildcards.map((v) => JSON.stringify(v)).join(', ')} — a wildcard, not an origin`,
          'Every response would carry Access-Control-Allow-Origin: * to every caller, which is the '
          + 'posture this control was built to remove. Replace it with the portal\'s scheme and host, '
          + 'one origin per row (e.g. https://nitdanigeria.sharepoint.com).');
        continue;
      }
      if (malformed.length) {
        record('BLOCKS PASTE', seed.title,
          `ConfigValue is not an origin: ${malformed.map((v) => JSON.stringify(v)).join(', ')}`,
          'An origin is scheme://host with an optional port — no path, no trailing slash, no quotes. '
          + 'A browser compares it literally, so anything else never matches and every response is refused.');
        continue;
      }
      record('ok', seed.title, `origin(s): ${withValue.join(', ')}`, '');
      continue;
    }
    /* A count taken from a capped query is not a population. Say which it is. */
    const cap = Number((seed.query.match(/\$top=(\d+)/) || [])[1]) || 0;
    const atCap = cap && items.length >= cap;
    record('ok', seed.title,
      `${items.length}${atCap ? '+' : ''} row(s) — ${seed.need}`
      + (atCap ? ` (the query stops at ${cap}, so this is a floor, not a total)` : ''), '');
  }
  console.groupEnd();

  /* ---- verdict ----
     A RUN THAT MEASURED NOTHING HAS FOUND NOTHING.
     When every request fails at the network layer the report used to read "15 blocking issues —
     pasting now produces flows that fail on the first call", listing twelve unreadable lists and
     three unqueryable seeds. Every one of those statements is about the browser, not the tenant,
     and together they look exactly like a catastrophically broken estate. The count of requests
     that never left the page is known, so say that instead: the run is inconclusive, and the
     tenant is neither cleared nor accused. */
  const measuredSomething = rows.some((r) => r.severity === 'ok');
  const allNetwork = networkFailures > 0 && !measuredSomething;
  if (allNetwork) {
    rows.length = 0;
    blocking = 0; warnings = 0;
    record('BLOCKS PASTE', 'Nothing was measured',
      `all ${networkFailures} request(s) failed before reaching SharePoint`,
      'This says nothing about the tenant. The requests are same-origin and use the signed-in '
      + 'session of this page, so they fail this way when something between the page and the '
      + 'network refuses them: browser shields or an ad blocker (Brave Shields blocks these — '
      + 'try lowering shields for this site), a content-blocking extension, an offline or '
      + 'captive-portal connection, or a signed-out session. Fix that and run it again — a '
      + 'result you can act on has ticks in it.');
  }
  console.log('%c────────────────────────────────────────', 'color:#888');
  if (allNetwork) {
    console.log('%cINCONCLUSIVE — nothing was measured. See the panel.',
      'color:#dc322f;font-weight:bold;font-size:13px');
  } else if (blocking === 0) {
    console.log('%cREADY TO PASTE — every list, column, index and seed the seven flows need is in place.',
      'color:#859900;font-weight:bold;font-size:13px');
    console.log('Remaining, and not checkable from SharePoint: the two connection references must resolve in your Power Automate environment. Every action should arrive already bound on the first paste, with no connection picker shown.');
  } else {
    console.log(`%c${blocking} blocking issue(s) — pasting now produces flows that fail on the first call.`,
      'color:#dc322f;font-weight:bold;font-size:13px');
  }
  if (warnings) console.log(`${warnings} warning(s).`);

  console.table(rows.filter((r) => r.severity !== 'ok'));
  /* Kept on window so the run can be filed as evidence:
   *   copy(JSON.stringify(preflight, null, 2)) */
  window.preflight = { checkedUtc: new Date().toISOString(), blocking, warnings, rows };

  /* THE RESULT IS ALSO DRAWN ON THE PAGE.
     A console is a poor place to read a verdict from a phone: the panel is narrow, DevTools
     prints its own unrelated noise into the same stream (Autofill.enable failing with -32601 on
     a remote target, icon re-registration from the SharePoint page itself), and the operator has
     to scroll past all of it to find out whether they may paste. The same result is rendered as
     a panel over the page, which can be read and screenshotted directly. It only adds a div —
     refreshing the page removes it, and nothing about the tenant is touched. */
  function renderPanel() {
  try {
    document.getElementById('dgo-preflight-panel')?.remove();
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const bad = rows.filter((r) => r.severity !== 'ok');
    const verdict = (typeof allNetwork !== 'undefined' && allNetwork)
      ? ['INCONCLUSIVE — NOTHING WAS MEASURED', '#a4262c',
         'Every request failed before reaching SharePoint, so this run says nothing about the '
         + 'tenant either way. It is not a list of findings.']
      : blocking === 0
      ? ['READY TO PASTE', '#0b6b3a', 'Every list, column, index and seed the seven flows need is in place. '
         + 'Not checkable from SharePoint: the two connection references must resolve in your Power '
         + 'Automate environment — every action should arrive already bound on the first paste.']
      : [`${blocking} BLOCKING ISSUE${blocking > 1 ? 'S' : ''}`, '#a4262c',
         'Pasting now produces flows that fail on the first call.'];
    const el = document.createElement('div');
    el.id = 'dgo-preflight-panel';
    el.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;overflow:auto;'
      + 'background:#fff;color:#1b1b1b;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;'
      + '-webkit-text-size-adjust:100%;padding:16px 14px 48px');
    el.innerHTML = `
      <div style="max-width:760px;margin:0 auto">
        <button id="dgo-preflight-close" style="float:right;font:inherit;padding:6px 12px;
          border:1px solid #ccc;border-radius:6px;background:#f6f6f6;cursor:pointer">Close</button>
        <h2 style="margin:0 0 2px;font-size:17px">Pre-paste preflight</h2>
        <div style="color:#666;font-size:12px;margin-bottom:14px">
          seven internal endpoint flows · ${SPEC.lists.length} lists · ${SPEC.seeds.length} seed conditions
          · ${new Date().toISOString()}</div>
        <div style="background:${verdict[1]};color:#fff;padding:11px 13px;border-radius:8px;
          font-weight:700;font-size:15px">${verdict[0]}</div>
        <p style="color:#444;margin:9px 0 18px">${esc(verdict[2])}</p>
        ${warnings ? `<div style="color:#7a5200;margin:-8px 0 18px">${warnings} warning(s) — read them, they do not block.</div>` : ''}
        ${bad.length ? bad.map((r) => `
          <div style="border-left:4px solid ${r.severity === 'BLOCKS PASTE' ? '#a4262c' : '#b58900'};
            background:#fafafa;padding:10px 12px;margin:0 0 12px;border-radius:0 6px 6px 0">
            <div style="font-weight:700;color:${r.severity === 'BLOCKS PASTE' ? '#a4262c' : '#7a5200'};
              font-size:12px;letter-spacing:.04em">${esc(r.severity.toUpperCase())}</div>
            <div style="font-weight:600;margin:3px 0">${esc(r.area)}</div>
            <div style="margin-bottom:6px">${esc(r.detail)}</div>
            <div style="color:#555;font-size:13px">${esc(r.fix)}</div>
          </div>`).join('') : '<p style="color:#0b6b3a;font-weight:600">Nothing to report — every check passed.</p>'}
        <details style="margin-top:20px">
          <summary style="cursor:pointer;color:#444">Everything checked (${rows.length})</summary>
          <div style="font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:10px">
            ${rows.map((r) => `<div>${r.severity === 'ok' ? '✓' : '✗'} ${esc(r.area)} — ${esc(r.detail)}</div>`).join('')}
          </div>
        </details>
        <p style="color:#666;font-size:12px;margin-top:22px">
          Nothing was written. To file this run:
          <code>copy(JSON.stringify(window.preflight, null, 2))</code></p>
      </div>`;
    document.body.appendChild(el);
    const closeBtn = el.querySelector && el.querySelector('#dgo-preflight-close');
    if (closeBtn) closeBtn.onclick = () => el.remove();
  } catch (err) {
    console.log('The on-page panel could not be drawn (' + err.message + '). The console output above is complete.');
  }
  }
  renderPanel();
})();
