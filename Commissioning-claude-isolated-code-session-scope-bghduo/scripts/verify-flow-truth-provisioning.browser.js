/* GENERATED FILE — do not edit by hand.
 * Built by scripts/build-flow-truth-verifier.mjs from
 * docs/reference/out-of-band/NITDA_Flow_Truth_SharePoint_Provisioning_BROWSER_CONSOLE1.js.
 * Edit neither; re-run the generator.
 */
/*
 * READ-ONLY. Changes nothing. Establishes what GOV-11 actually put on the tenant.
 *
 * WHAT THIS ANSWERS
 *   Two browser scripts were reported executed on 2026-09-10, creating 3 resources and
 *   90 columns outside every specification this estate holds. Neither script pinned a site,
 *   neither recorded which site it used, and both called createfieldasxml with Options: 0 — without
 *   AddFieldInternalNameHint, so SharePoint was free to derive each internal name from the display
 *   name instead of taking the one the script asked for.
 *
 *   This script asks 2 sites, for each of the 3 resources, for each of its columns:
 *     · is it there at all
 *     · under the internal name the script asked for, or under one SharePoint derived
 *     · with how many auto-disambiguated siblings beside it (the re-run signature)
 *     · with Required and uniqueness in the state the scripts left them
 *
 *   It concludes nothing. Adopting these resources into the specification or retiring them in
 *   favour of the seven specified registry lists is an agency decision. Report what this prints.
 *
 * VERDICTS
 *   absent               the resource or column is not on this site
 *   asked-name           the column is there under the internal name the script asked for
 *   DERIVED NAME         the column is there under a DIFFERENT internal name — Options: 0 bit it
 *   DUPLICATED           more than one column answers to the same base name (a re-run happened)
 *   REQUIRED CLEARED     the script created it Required, and it is not Required now
 *
 * HOW TO RUN
 *   1. Sign in. Open any page on EITHER site — it asks about both regardless.
 *   2. F12 → Console. Paste. Nothing is written.
 */

const SITES = [
  {
    "url": "https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE",
    "role": "authoritative (GOV-01)"
  },
  {
    "url": "https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING",
    "role": "non-authoritative — GOV-09 producer site"
  }
];
const RESOURCES = [
  {
    "title": "NITDA Flow Truth Registry",
    "kind": "list",
    "template": 100,
    "uniqueKey": "RegistryKey",
    "fields": [
      {
        "askedFor": "RegistryKey",
        "displayName": "Registry Key",
        "type": "Text",
        "required": true
      },
      {
        "askedFor": "HistoryKey",
        "displayName": "History Key",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "EnvironmentId",
        "displayName": "Environment ID",
        "type": "Text",
        "required": true
      },
      {
        "askedFor": "EnvironmentName",
        "displayName": "Environment Name",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "FlowId",
        "displayName": "Flow ID",
        "type": "Text",
        "required": true
      },
      {
        "askedFor": "FlowName",
        "displayName": "Flow Name",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "FlowDisplayName",
        "displayName": "Flow Display Name",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "RunId",
        "displayName": "Run ID",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "CorrelationId",
        "displayName": "Correlation ID",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "LifecycleStatus",
        "displayName": "Lifecycle Status",
        "type": "Choice",
        "required": false
      },
      {
        "askedFor": "RunStatus",
        "displayName": "Run Status",
        "type": "Choice",
        "required": false
      },
      {
        "askedFor": "Criticality",
        "displayName": "Criticality",
        "type": "Choice",
        "required": false
      },
      {
        "askedFor": "DataClassification",
        "displayName": "Data Classification",
        "type": "Choice",
        "required": false
      },
      {
        "askedFor": "TechnicalOwner",
        "displayName": "Technical Owner",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "BusinessOwner",
        "displayName": "Business Owner",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "SupportContact",
        "displayName": "Support Contact",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "SystemName",
        "displayName": "System Name",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "BusinessProcess",
        "displayName": "Business Process",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "DefinitionVersion",
        "displayName": "Definition Version",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "SchemaVersion",
        "displayName": "Schema Version",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "CapturedUtc",
        "displayName": "Captured UTC",
        "type": "DateTime",
        "required": false
      },
      {
        "askedFor": "CompletedUtc",
        "displayName": "Completed UTC",
        "type": "DateTime",
        "required": false
      },
      {
        "askedFor": "PersistedUtc",
        "displayName": "Persisted UTC",
        "type": "DateTime",
        "required": false
      },
      {
        "askedFor": "DurationMilliseconds",
        "displayName": "Duration Milliseconds",
        "type": "Number",
        "required": false
      },
      {
        "askedFor": "RequiresOwnerReview",
        "displayName": "Requires Owner Review",
        "type": "Boolean",
        "required": false
      },
      {
        "askedFor": "ContainsSensitiveData",
        "displayName": "Contains Sensitive Technical Data",
        "type": "Boolean",
        "required": false
      },
      {
        "askedFor": "CredentialsExcluded",
        "displayName": "Credentials Excluded",
        "type": "Boolean",
        "required": false
      },
      {
        "askedFor": "IntegrityVerified",
        "displayName": "Integrity Verified",
        "type": "Boolean",
        "required": false
      },
      {
        "askedFor": "ContentSha256",
        "displayName": "Content SHA-256",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "ContentSizeBytes",
        "displayName": "Content Size Bytes",
        "type": "Number",
        "required": false
      },
      {
        "askedFor": "CurrentArtefactUrl",
        "displayName": "Current Artefact URL",
        "type": "URL",
        "required": false
      },
      {
        "askedFor": "HistoryArtefactUrl",
        "displayName": "History Artefact URL",
        "type": "URL",
        "required": false
      },
      {
        "askedFor": "HtmlReportUrl",
        "displayName": "HTML Report URL",
        "type": "URL",
        "required": false
      },
      {
        "askedFor": "IntegrityManifestUrl",
        "displayName": "Integrity Manifest URL",
        "type": "URL",
        "required": false
      },
      {
        "askedFor": "ComplianceIssuesJson",
        "displayName": "Compliance Issues JSON",
        "type": "Note",
        "required": false
      },
      {
        "askedFor": "PersistenceReceiptJson",
        "displayName": "Persistence Receipt JSON",
        "type": "Note",
        "required": false
      },
      {
        "askedFor": "LastErrorJson",
        "displayName": "Last Error JSON",
        "type": "Note",
        "required": false
      }
    ]
  },
  {
    "title": "NITDA Flow Truth History",
    "kind": "list",
    "template": 100,
    "uniqueKey": "HistoryKey",
    "fields": [
      {
        "askedFor": "RegistryKey",
        "displayName": "Registry Key",
        "type": "Text",
        "required": true
      },
      {
        "askedFor": "HistoryKey",
        "displayName": "History Key",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "EnvironmentId",
        "displayName": "Environment ID",
        "type": "Text",
        "required": true
      },
      {
        "askedFor": "EnvironmentName",
        "displayName": "Environment Name",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "FlowId",
        "displayName": "Flow ID",
        "type": "Text",
        "required": true
      },
      {
        "askedFor": "FlowName",
        "displayName": "Flow Name",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "FlowDisplayName",
        "displayName": "Flow Display Name",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "RunId",
        "displayName": "Run ID",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "CorrelationId",
        "displayName": "Correlation ID",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "LifecycleStatus",
        "displayName": "Lifecycle Status",
        "type": "Choice",
        "required": false
      },
      {
        "askedFor": "RunStatus",
        "displayName": "Run Status",
        "type": "Choice",
        "required": false
      },
      {
        "askedFor": "Criticality",
        "displayName": "Criticality",
        "type": "Choice",
        "required": false
      },
      {
        "askedFor": "DataClassification",
        "displayName": "Data Classification",
        "type": "Choice",
        "required": false
      },
      {
        "askedFor": "TechnicalOwner",
        "displayName": "Technical Owner",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "BusinessOwner",
        "displayName": "Business Owner",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "SupportContact",
        "displayName": "Support Contact",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "SystemName",
        "displayName": "System Name",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "BusinessProcess",
        "displayName": "Business Process",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "DefinitionVersion",
        "displayName": "Definition Version",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "SchemaVersion",
        "displayName": "Schema Version",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "CapturedUtc",
        "displayName": "Captured UTC",
        "type": "DateTime",
        "required": false
      },
      {
        "askedFor": "CompletedUtc",
        "displayName": "Completed UTC",
        "type": "DateTime",
        "required": false
      },
      {
        "askedFor": "PersistedUtc",
        "displayName": "Persisted UTC",
        "type": "DateTime",
        "required": false
      },
      {
        "askedFor": "DurationMilliseconds",
        "displayName": "Duration Milliseconds",
        "type": "Number",
        "required": false
      },
      {
        "askedFor": "RequiresOwnerReview",
        "displayName": "Requires Owner Review",
        "type": "Boolean",
        "required": false
      },
      {
        "askedFor": "ContainsSensitiveData",
        "displayName": "Contains Sensitive Technical Data",
        "type": "Boolean",
        "required": false
      },
      {
        "askedFor": "CredentialsExcluded",
        "displayName": "Credentials Excluded",
        "type": "Boolean",
        "required": false
      },
      {
        "askedFor": "IntegrityVerified",
        "displayName": "Integrity Verified",
        "type": "Boolean",
        "required": false
      },
      {
        "askedFor": "ContentSha256",
        "displayName": "Content SHA-256",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "ContentSizeBytes",
        "displayName": "Content Size Bytes",
        "type": "Number",
        "required": false
      },
      {
        "askedFor": "CurrentArtefactUrl",
        "displayName": "Current Artefact URL",
        "type": "URL",
        "required": false
      },
      {
        "askedFor": "HistoryArtefactUrl",
        "displayName": "History Artefact URL",
        "type": "URL",
        "required": false
      },
      {
        "askedFor": "HtmlReportUrl",
        "displayName": "HTML Report URL",
        "type": "URL",
        "required": false
      },
      {
        "askedFor": "IntegrityManifestUrl",
        "displayName": "Integrity Manifest URL",
        "type": "URL",
        "required": false
      },
      {
        "askedFor": "ComplianceIssuesJson",
        "displayName": "Compliance Issues JSON",
        "type": "Note",
        "required": false
      },
      {
        "askedFor": "PersistenceReceiptJson",
        "displayName": "Persistence Receipt JSON",
        "type": "Note",
        "required": false
      },
      {
        "askedFor": "LastErrorJson",
        "displayName": "Last Error JSON",
        "type": "Note",
        "required": false
      }
    ]
  },
  {
    "title": "NITDA Flow Truth Artefacts",
    "kind": "library",
    "template": 101,
    "uniqueKey": null,
    "fields": [
      {
        "askedFor": "RegistryKey",
        "displayName": "Registry Key",
        "type": "Text",
        "required": true
      },
      {
        "askedFor": "HistoryKey",
        "displayName": "History Key",
        "type": "Text",
        "required": true
      },
      {
        "askedFor": "EnvironmentId",
        "displayName": "Environment ID",
        "type": "Text",
        "required": true
      },
      {
        "askedFor": "FlowId",
        "displayName": "Flow ID",
        "type": "Text",
        "required": true
      },
      {
        "askedFor": "RunId",
        "displayName": "Run ID",
        "type": "Text",
        "required": true
      },
      {
        "askedFor": "CorrelationId",
        "displayName": "Correlation ID",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "ArtefactType",
        "displayName": "Artefact Type",
        "type": "Choice",
        "required": false
      },
      {
        "askedFor": "ContentType",
        "displayName": "Content Type",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "SchemaVersion",
        "displayName": "Schema Version",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "ContentSha256",
        "displayName": "Content SHA-256",
        "type": "Text",
        "required": false
      },
      {
        "askedFor": "ContentSizeBytes",
        "displayName": "Content Size Bytes",
        "type": "Number",
        "required": false
      },
      {
        "askedFor": "CapturedUtc",
        "displayName": "Captured UTC",
        "type": "DateTime",
        "required": false
      },
      {
        "askedFor": "PersistedUtc",
        "displayName": "Persisted UTC",
        "type": "DateTime",
        "required": false
      },
      {
        "askedFor": "IntegrityVerified",
        "displayName": "Integrity Verified",
        "type": "Boolean",
        "required": false
      },
      {
        "askedFor": "DataClassification",
        "displayName": "Data Classification",
        "type": "Choice",
        "required": false
      },
      {
        "askedFor": "RetentionClass",
        "displayName": "Retention Class",
        "type": "Text",
        "required": false
      }
    ]
  }
];
const REQUIRED_BY_SCRIPT = [
  "NITDA Flow Truth Registry::RegistryKey",
  "NITDA Flow Truth Registry::EnvironmentId",
  "NITDA Flow Truth Registry::FlowId",
  "NITDA Flow Truth History::RegistryKey",
  "NITDA Flow Truth History::EnvironmentId",
  "NITDA Flow Truth History::FlowId",
  "NITDA Flow Truth Artefacts::RegistryKey",
  "NITDA Flow Truth Artefacts::HistoryKey",
  "NITDA Flow Truth Artefacts::EnvironmentId",
  "NITDA Flow Truth Artefacts::FlowId",
  "NITDA Flow Truth Artefacts::RunId"
];

(async () => {
  const NOMETA = 'application/json;odata=nometadata';
  const required = new Set(REQUIRED_BY_SCRIPT);

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

  const isCustom = (f) => f && f.FromBaseType !== true && f.CanBeDeleted !== false;

  /* SharePoint encodes characters it cannot use in an internal name as _xHHHH_. A display name of
     'Registry Key' derives to 'Registry_x0020_Key'. Matching on the decoded form rather than on a
     guessed encoding means an unexpected encoding still resolves. */
  const decode = (n) => String(n || '').replace(/_x([0-9a-fA-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

  const ledger = [];
  let asked = 0, derived = 0, duplicated = 0, cleared = 0, absentCols = 0, foundResources = 0, absentResources = 0;

  console.log('%cGOV-11 — what the out-of-band flow-truth provisioning actually created',
    'font-weight:bold;font-size:13px');

  for (const site of SITES) {
    console.log(`%c${site.url}  —  ${site.role}`, 'color:#888');

    for (const r of RESOURCES) {
      let meta = null;
      try {
        const res = await send(
          `${site.url}/_api/web/lists/getbytitle('${r.title.replace(/'/g, "''")}')?$select=Id,Title,BaseTemplate,ItemCount,Created`);
        if (res.ok) meta = await res.json();
        else if (res.status !== 404) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        ledger.push({ site: site.url, resource: r.title, column: '(whole resource)', verdict: 'UNREADABLE', detail: err.message });
        continue;
      }

      if (!meta) {
        absentResources++;
        ledger.push({ site: site.url, resource: r.title, column: '(whole resource)', verdict: 'absent', detail: 'not on this site' });
        continue;
      }

      foundResources++;
      ledger.push({
        site: site.url, resource: r.title, column: '(whole resource)', verdict: 'PRESENT',
        detail: `guid ${meta.Id} · template ${meta.BaseTemplate} (expected ${r.template}) · ${meta.ItemCount} item(s) · created ${meta.Created}`,
      });

      let live;
      try {
        const res = await send(
          `${site.url}/_api/web/lists(guid'${meta.Id}')/fields?$select=InternalName,Title,Required,Indexed,EnforceUniqueValues,FromBaseType,CanBeDeleted&$top=500`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        live = ((await res.json()).value || []).filter(isCustom);
      } catch (err) {
        ledger.push({ site: site.url, resource: r.title, column: '(fields)', verdict: 'UNREADABLE', detail: err.message });
        continue;
      }

      const byInternal = new Map(live.map((f) => [f.InternalName, f]));

      for (const f of r.fields) {
        /* Anything that could plausibly be this column: the exact name the script asked for, the
           name SharePoint would derive from the display name, and any digit-suffixed sibling of
           either — which is what a second run leaves behind. */
        const base = new RegExp(`^${f.askedFor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d*$`);
        const candidates = live.filter(
          (x) => base.test(x.InternalName) || decode(x.InternalName) === f.displayName || x.Title === f.displayName,
        );

        if (!candidates.length) {
          absentCols++;
          ledger.push({
            site: site.url, resource: r.title, column: f.askedFor, verdict: 'absent',
            detail: `no column under that name and none titled '${f.displayName}'`,
          });
          continue;
        }

        const exact = byInternal.get(f.askedFor);
        if (candidates.length > 1) {
          duplicated++;
          ledger.push({
            site: site.url, resource: r.title, column: f.askedFor, verdict: 'DUPLICATED',
            detail: `${candidates.length} columns answer to it: ${candidates.map((c) => c.InternalName).join(', ')} — the script was run more than once and SharePoint disambiguated`,
          });
        } else if (exact) {
          asked++;
          ledger.push({
            site: site.url, resource: r.title, column: f.askedFor, verdict: 'asked-name',
            detail: `Required=${exact.Required} · Indexed=${exact.Indexed} · Unique=${exact.EnforceUniqueValues}`,
          });
        } else {
          derived++;
          ledger.push({
            site: site.url, resource: r.title, column: f.askedFor, verdict: 'DERIVED NAME',
            detail: `present as '${candidates[0].InternalName}' — Options: 0 omitted AddFieldInternalNameHint, so every flow addressing '${f.askedFor}' will not find it`,
          });
        }

        /* The Required claim, checked against whichever column actually answers. RESUME_FIX sent
           Required: false on every field it indexed without uniqueness. */
        const live1 = exact || candidates[0];
        if (required.has(`${r.title}::${f.askedFor}`) && live1 && live1.Required !== true) {
          cleared++;
          ledger.push({
            site: site.url, resource: r.title, column: f.askedFor, verdict: 'REQUIRED CLEARED',
            detail: "created Required=TRUE; RESUME_FIX's index() sends Required: false on every non-unique field",
          });
        }
      }

      if (r.uniqueKey) {
        const k = byInternal.get(r.uniqueKey);
        if (k && k.EnforceUniqueValues !== true) {
          ledger.push({
            site: site.url, resource: r.title, column: r.uniqueKey, verdict: 'UNIQUENESS NOT ENFORCED',
            detail: 'the scripts enforce uniqueness on this column; nothing stops a duplicate key without it',
          });
        }
      }
    }
  }

  console.table(ledger);
  console.log(
    `%c${foundResources} resource(s) present · ${absentResources} absent · ${asked} column(s) under the asked name · ${derived} under a DERIVED name · ${duplicated} DUPLICATED · ${cleared} REQUIRED CLEARED · ${absentCols} absent`,
    (derived || duplicated || cleared) ? 'color:#b00;font-weight:bold' : 'color:#080;font-weight:bold',
  );

  if (!foundResources) {
    console.log('%cNothing was found on either site. The out-of-band provisioning did not reach this tenant, or reached a site not listed above.',
      'color:#080;font-weight:bold');
  } else {
    console.log('%cReport this output under GOV-11. Do NOT re-run either provisioning script — a re-run is the duplication case, not a repair.',
      'color:#b00;font-weight:bold');
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
      script: "verify-flow-truth-provisioning.browser.js",
      mode: 'read-only',
      site: SITES.map((s) => s.url).join(" + "),
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
