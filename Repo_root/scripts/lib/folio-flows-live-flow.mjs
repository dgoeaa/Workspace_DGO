// "Folio Flow Estate — Live Report": the flow that reads the tenant every time it runs.
// Two designer pastes, built by scripts/build-folio-flows.mjs:
//   1-variables  the Initialize variable actions (move them to the top level after pasting)
//   2-body       everything else, in one scope
//
// What it does on each run:
//   1. For every flow in the 2026-09-26 baseline (the 46 the usage analysis marks used), reads the
//      flow live from the tenant with Power Automate Management GetFlow and ListFlowOwners, the same
//      operations and field paths DGO_ENDPOINT_INVENTORY uses. From the live definition it derives
//      state, trigger, method, action count, connectors, SharePoint sites and lists, owners and
//      failure alerts, and compares each with the baseline (state changed, modified since).
//      A flow it cannot read is recorded as not retrieved, with the connector's own error.
//   2. Reads the folio's governance lists on DGO_ECM_GOVERNANCE (DGO_HTTPFlowRegistry,
//      DGO_HTTPFlowExecutionLedger, DGO_HTTPFlowRegistryExceptions) through the SharePoint REST
//      API, as the GOV flows do. No column is assumed: rows are carried whole into the JSON, and a
//      flow counts as registered / ledgered / excepted when its flow ID appears in that list's rows.
//   3. Produces: a branded HTML report, a PDF of it, a complete JSON, and three CSVs (flows, lists
//      touched, changes since baseline); files all of them in DGO_ECM_GOVERNANCE/Shared Documents/
//      Folio Flow Estate Reports/<run>; and emails the report with every file attached.
// The PDF is made by OneDrive for Business (Create file, then Convert file). If that step fails,
// the run still files and sends everything else, and the report says the PDF was not produced.

const ok = (a) => ({ [a]: ['Succeeded'] });
const always = (a) => ({ [a]: ['Succeeded', 'Failed', 'Skipped', 'TimedOut'] });
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const esc = (e) => `replace(replace(replace(string(coalesce(${e},'')),'&','&amp;'),'<','&lt;'),'>','&gt;')`;
const cat = (parts) => `@concat(${parts.map(([k, v]) => (k === 'lit' ? lit(v) : v)).join(',')})`;
const MAX_EXPRESSION = 8192;
/* Every workflow action type. ActionCount counts these "type" values in the live definition: equal to
   a full walk for 84 of the 87 held exports; the other 3 carry action definitions as data in their
   inputs and read high (checked by scripts/build-folio-flows.mjs, which fails if more appear). */
export const ACTION_TYPES = ['OpenApiConnection', 'OpenApiConnectionWebhook', 'ApiConnection', 'ApiConnectionWebhook', 'Http', 'HttpWebhook', 'Response', 'Compose', 'ParseJson', 'Query', 'Select', 'Table', 'Join',
  'InitializeVariable', 'SetVariable', 'AppendToArrayVariable', 'AppendToStringVariable', 'IncrementVariable', 'DecrementVariable',
  'Scope', 'If', 'Switch', 'Foreach', 'Until', 'Terminate', 'Wait', 'Workflow', 'Expression', 'JavaScriptCode', 'Function'];
const REGISTRY_MAILBOX = 'dgsRegistry@nitda.gov.ng'; // the To of the folio's run-record emails
const GOV_SITE = 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE';
const REPORT_FOLDER = '/Shared Documents/Folio Flow Estate Reports';
const GOV_LISTS = [['Registry', 'DGO_HTTPFlowRegistry'], ['Ledger', 'DGO_HTTPFlowExecutionLedger'], ['Exceptions', 'DGO_HTTPFlowRegistryExceptions']];

const literal = (v) => (typeof v === 'string' ? v.replace(/^@/, '@@').replace(/@\{/g, '@@{')
  : Array.isArray(v) ? v.map(literal) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, literal(x)])) : v);

/* The tenant's connections, so every connector action arrives already connected. Office 365 Outlook,
   SharePoint and OneDrive for Business are the ones the designer bound on this flow (nodeConnectionData
   of Send_an_email_Folio_Flow_Estate, Create_Record_HTML and Create_HTML_in_OneDrive, pasted
   2026-10-01); Power Automate Management is the one DGO_ENDPOINT_INVENTORY.designer-paste.json uses. */
export const CONNECTIONS = {
  shared_office365: 'c0b9e7a5b0854c39a435fd8ce92f48ad',
  shared_sharepointonline: '3f1943c5955a4cb8b301e8f22f2b590d',
  shared_onedriveforbusiness: 'shared-onedriveforbu-63773f75-c217-43f5-9677-30aec0d49fa0',
  shared_flowmanagement: 'shared-flowmanagemen-6a2f7a95-3886-4631-b8ca-bd6b5e9bf5c2',
};

/** allConnectionData for a pasted scope: one entry per connector action, at any depth. */
export function connectionData(actions) {
  const out = {};
  const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
    const api = a.inputs?.host?.connectionName || a.inputs?.host?.connection;
    if (api) {
      if (!CONNECTIONS[api]) throw new Error(`${n}: no connection for ${api}`);
      out[n] = { connectionReference: { api: { id: `/providers/Microsoft.PowerApps/apis/${api}` }, connection: { id: `/providers/Microsoft.PowerApps/apis/${api}/connections/${CONNECTIONS[api]}` }, connectionName: CONNECTIONS[api] }, referenceKey: api };
    }
    walk(a.actions); walk(a.else?.actions);
  } };
  walk(actions);
  return out;
}

const conn = (name, operationId, parameters) => ({
  type: 'OpenApiConnection',
  inputs: { host: { apiId: `/providers/Microsoft.PowerApps/apis/${name}`, connectionName: name, operationId }, parameters, authentication: "@parameters('$authentication')" },
});

export function buildLiveFlow({ rows, brand, environment, sources, template }) {
  const B = brand;
  const th = `style="text-align:left;background:${B.deepGreen};color:#fff;padding:8px 10px;font-size:12px"`;
  const td = `style="padding:7px 10px;border-bottom:1px solid ${B.line};font-size:12px;vertical-align:top"`;
  const tdk = `style="padding:6px 10px;border-bottom:1px solid ${B.line};font-size:12px;color:${B.muted};width:200px;vertical-align:top"`;
  const table = `style="width:100%;border-collapse:collapse;margin:8px 0 18px"`;
  const h2 = `style="color:${B.deepGreen};font-size:17px;margin:26px 0 6px;border-bottom:2px solid ${B.smartGreen};padding-bottom:4px"`;
  const note = `style="font-size:12px;color:${B.muted};margin:4px 0 8px"`;
  const roles = [...new Set(rows.map((r) => r.PrimaryRole))];

  const v = (name, type, value) => ({ name, type, value });
  const varList = [
    v('varInUse', 'array', literal(rows)),
    v('varSources', 'object', literal(sources)),
    v('varEnvironment', 'string', environment),
    v('varLiveFlows', 'array', []),
    v('varNotRetrieved', 'array', []),
    v('varListsTouched', 'array', []),
    v('varChanges', 'array', []),
    v('varResolvedFlow', 'string', "@string('')"),
    v('varCallbackUrls', 'array', []),
    v('varReportTemplate', 'string', literal(template)),
  ];
  const vars = {};
  let pv = null;
  for (const x of varList) {
    const n = `Initialize_variable_${x.name}`;
    vars[n] = { type: 'InitializeVariable', inputs: { variables: [x] }, runAfter: pv ? ok(pv) : {} };
    pv = n;
  }

  const body = {};
  let prev = null;
  const add = (name, action, after) => { body[name] = { ...action, runAfter: after ?? (prev ? ok(prev) : {}) }; prev = name; };

  /* ── 1 · the folio's governance lists, read whole ── */
  for (const [key, title] of GOV_LISTS) {
    add(`Get_Governance_${key}`, conn('shared_sharepointonline', 'HttpRequest', {
      dataset: GOV_SITE,
      'parameters/method': 'GET',
      'parameters/uri': `_api/web/lists/getbytitle('${title}')/items?$top=5000`,
      'parameters/headers': { Accept: 'application/json;odata=nometadata' },
    }), prev ? always(prev) : {});
  }
  add('Compose_Governance', { type: 'Compose', inputs: Object.fromEntries(GOV_LISTS.map(([key, title]) => [key, {
    list: title,
    read: `@equals(actions('Get_Governance_${key}')?['status'], 'Succeeded')`,
    error: `@if(equals(actions('Get_Governance_${key}')?['status'], 'Succeeded'), '', string(coalesce(outputs('Get_Governance_${key}')?['body']?['error']?['message'], outputs('Get_Governance_${key}')?['body']?['odata.error']?['message']?['value'], actions('Get_Governance_${key}')?['status'])))`,
    rows: `@if(equals(actions('Get_Governance_${key}')?['status'], 'Succeeded'), coalesce(outputs('Get_Governance_${key}')?['body']?['value'], json('[]')), json('[]'))`,
  }])) }, always(prev));
  add('Compose_Governance_Text', { type: 'Compose', inputs: Object.fromEntries(GOV_LISTS.map(([key]) => [key, `@toLower(string(outputs('Compose_Governance')?['${key}']?['rows']))`])) });

  /* ── 2 · every flow the platforms call, resolved and read live ── */
  const F = "items('Apply_to_each_In_Use_Flow')";
  const G = "outputs('Get_Live_Flow')?['body']";
  const P = `${G}?['properties']`;
  const D = `${P}?['definition']`;
  const L = "items('Apply_to_each_Live_List')";
  const R = "variables('varResolvedFlow')";
  const CB = "string(coalesce(outputs('List_Live_Callback')?['body']?['response']?['value'], outputs('List_Live_Callback')?['body']?['value'], ''))";
  const govCount = (key) => `if(empty(${R}), 0, sub(length(split(outputs('Compose_Governance_Text')?['${key}'], toLower(${R}))), 1))`;
  const designer = `concat('https://make.powerautomate.com/environments/', variables('varEnvironment'), '/flows/', ${R}, '/details')`;
  const C = "items('Apply_to_each_Candidate')";
  add('Apply_to_each_In_Use_Flow', {
    type: 'Foreach', foreach: "@variables('varInUse')", runtimeConfiguration: { concurrency: { repetitions: 1 } },
    actions: {
      Set_varResolvedFlow_Empty: { type: 'SetVariable', inputs: { name: 'varResolvedFlow', value: "@string('')" }, runAfter: {} },
      /* The tenant flow behind the endpoint: the candidate whose live callback URL carries the configured
         workflow ID. With no configured workflow (Mailer, GOV, background), the one candidate. */
      Apply_to_each_Candidate: {
        type: 'Foreach', foreach: `@${F}?['Candidates']`, runtimeConfiguration: { concurrency: { repetitions: 1 } }, runAfter: ok('Set_varResolvedFlow_Empty'),
        actions: {
          List_Candidate_Callback: { ...conn('shared_flowmanagement', 'ListCallbackUrl', { environmentName: "@variables('varEnvironment')", flowName: `@${C}` }), runAfter: {} },
          Condition_Candidate_Is_Live: {
            type: 'If', runAfter: { List_Candidate_Callback: ['Succeeded', 'Failed', 'TimedOut'] },
            expression: { and: [
              { equals: [`@empty(${R})`, true] },
              { or: [{ equals: [`@empty(${F}?['WorkflowId'])`, true] }, { equals: [`@contains(toLower(string(outputs('List_Candidate_Callback')?['body'])), toLower(${F}?['WorkflowId']))`, true] }] },
            ] },
            actions: { Set_varResolvedFlow_Candidate: { type: 'SetVariable', inputs: { name: 'varResolvedFlow', value: `@${C}` }, runAfter: {} } },
            else: { actions: {} },
          },
        },
      },
      Scope_Read_Live_Flow: {
        type: 'Scope', runAfter: always('Apply_to_each_Candidate'),
        actions: {
          Get_Live_Flow: { ...conn('shared_flowmanagement', 'GetFlow', { environmentName: "@variables('varEnvironment')", flowName: `@${R}` }), runAfter: {} },
          List_Live_Flow_Owners: { ...conn('shared_flowmanagement', 'ListFlowOwners', { environmentName: "@variables('varEnvironment')", flowName: `@${R}` }), runAfter: ok('Get_Live_Flow') },
          List_Live_Callback: { ...conn('shared_flowmanagement', 'ListCallbackUrl', { environmentName: "@variables('varEnvironment')", flowName: `@${R}` }), runAfter: { List_Live_Flow_Owners: ['Succeeded', 'Failed', 'TimedOut'] } },
          Select_Live_Owner_Roles: { type: 'Select', inputs: { from: "@coalesce(outputs('List_Live_Flow_Owners')?['body']?['value'], json('[]'))", select: "@string(coalesce(item()?['properties']?['roleName'], ''))" }, runAfter: { List_Live_Callback: ['Succeeded', 'Failed', 'TimedOut'] } },
          Select_Live_Connectors: { type: 'Select', inputs: { from: `@skip(split(string(${P}?['connectionReferences']), '/providers/Microsoft.PowerApps/apis/'), 1)`, select: "@first(split(item(), '\"'))" }, runAfter: ok('Select_Live_Owner_Roles') },
          Select_Live_Sites: { type: 'Select', inputs: { from: `@skip(split(string(${D}), '"dataset":"'), 1)`, select: "@first(split(item(), '\"'))" }, runAfter: ok('Select_Live_Connectors') },
          Select_Live_Lists: { type: 'Select', inputs: { from: `@skip(split(string(${D}), '"table":"'), 1)`, select: "@first(split(item(), '\"'))" }, runAfter: ok('Select_Live_Sites') },
          Compose_Live_Record: { type: 'Compose', runAfter: ok('Select_Live_Lists'), inputs: {
            Name: `@coalesce(${P}?['displayName'], ${F}?['Name'])`,
            FlowGuid: `@${R}`,
            Retrieved: true,
            PrimaryRole: `@${F}?['PrimaryRole']`,
            Platform: `@${F}?['Platform']`,
            ContractKeys: `@${F}?['ContractKeys']`,
            WorkflowId: `@${F}?['WorkflowId']`,
            CandidateFlows: `@join(${F}?['Candidates'], '; ')`,
            ConfiguredUrl: `@${F}?['ConfiguredUrl']`,
            CallbackUrlRedacted: `@if(contains(${CB}, 'sig='), concat(first(split(${CB}, 'sig=')), 'sig=<redacted>'), ${CB})`,
            CallbackSignatureLength: `@if(contains(${CB}, 'sig='), length(first(split(last(split(${CB}, 'sig=')), '&'))), 0)`,
            // Compared on the workflow id in the path: the query string differs in encoding (%2F against /) and a
            // Tenant-authenticated trigger's callback carries no sp/sv/sig at all, so a prefix match reports false mismatches.
            CallbackMatchesConfiguration: `@if(or(empty(${CB}), empty(${F}?['ConfiguredUrl'])), 'n/a', if(equals(toLower(first(split(last(split(${CB}, '/workflows/')), '/'))), toLower(first(split(last(split(${F}?['ConfiguredUrl'], '/workflows/')), '/')))), 'Yes', 'No'))`,
            State: `@string(coalesce(${P}?['state'], ''))`,
            BaselineState: `@${F}?['State']`,
            StateChanged: `@not(equals(toLower(string(coalesce(${P}?['state'], ''))), toLower(${F}?['State'])))`,
            Created: `@string(coalesce(${P}?['createdTime'], ''))`,
            Modified: `@string(coalesce(${P}?['lastModifiedTime'], ''))`,
            BaselineModified: `@${F}?['Modified']`,
            ModifiedSinceBaseline: `@if(or(empty(string(coalesce(${P}?['lastModifiedTime'], ''))), empty(${F}?['Modified'])), false, greater(ticks(coalesce(${P}?['lastModifiedTime'], '1900-01-01T00:00:00Z')), ticks(concat(replace(coalesce(${F}?['Modified'], ''), ' ', 'T'), if(empty(${F}?['Modified']), '1900-01-01T00:00:00Z', 'Z')))))`,
            TriggerType: `@if(contains(string(${D}?['triggers']), '"type":"Request"'), 'HTTP request', if(contains(string(${D}?['triggers']), '"type":"Recurrence"'), 'Recurrence', if(contains(string(${D}?['triggers']), 'OpenApiConnection'), 'Connector event', if(empty(string(coalesce(${D}?['triggers'], ''))), '', 'Other'))))`,
            Method: `@if(contains(string(${D}?['triggers']), '"method":"'), first(split(substring(concat(string(${D}?['triggers']), '          '), add(max(indexOf(string(${D}?['triggers']), '"method":"'), 0), 10)), '"')), '')`,
            ActionCount: `@${ACTION_TYPES.map((t) => `sub(length(split(string(coalesce(${D}?['actions'], '')), '"type":"${t}"')), 1)`).reduce((a, b) => `add(${a}, ${b})`)}`,
            Connectors: "@join(union(body('Select_Live_Connectors'), body('Select_Live_Connectors')), '; ')",
            Sites: "@join(union(body('Select_Live_Sites'), body('Select_Live_Sites')), '; ')",
            ListCount: "@length(union(body('Select_Live_Lists'), body('Select_Live_Lists')))",
            Owners: "@length(coalesce(outputs('List_Live_Flow_Owners')?['body']?['value'], json('[]')))",
            OwnerRoles: "@join(union(body('Select_Live_Owner_Roles'), body('Select_Live_Owner_Roles')), '; ')",
            FailureAlerts: `@if(equals(${P}?['flowFailureAlertSubscribed'], true), true, false)`,
            InRegistry: `@greater(${govCount('Registry')}, 0)`,
            LedgerMentions: `@${govCount('Ledger')}`,
            ExceptionMentions: `@${govCount('Exceptions')}`,
            OpenInDesigner: `@${designer}`,
            Creator: `@string(coalesce(${P}?['creator']?['objectId'], ''))`,
            Triggers: `@${D}?['triggers']`,
            ConnectionReferences: `@${P}?['connectionReferences']`,
            Definition: `@${D}`,
          } },
          Append_to_varCallbackUrls: { type: 'AppendToArrayVariable', runAfter: ok('Compose_Live_Record'), inputs: { name: 'varCallbackUrls', value: { Flow: "@outputs('Compose_Live_Record')?['Name']", FlowGuid: `@${R}`, Platform: `@${F}?['Platform']`, ContractKeys: `@${F}?['ContractKeys']`, WorkflowId: `@${F}?['WorkflowId']`, CallbackUrl: `@${CB}` } } },
          Append_to_varLiveFlows: { type: 'AppendToArrayVariable', inputs: { name: 'varLiveFlows', value: "@outputs('Compose_Live_Record')" }, runAfter: ok('Append_to_varCallbackUrls') },
          Apply_to_each_Live_List: {
            type: 'Foreach', foreach: "@union(body('Select_Live_Lists'), body('Select_Live_Lists'))", runAfter: ok('Append_to_varLiveFlows'),
            actions: { Append_to_varListsTouched: { type: 'AppendToArrayVariable', runAfter: {}, inputs: { name: 'varListsTouched', value: { Flow: `@outputs('Compose_Live_Record')?['Name']`, FlowGuid: `@${R}`, List: `@${L}`, Sites: `@outputs('Compose_Live_Record')?['Sites']` } } } },
          },
          Condition_Changed_Since_Baseline: {
            type: 'If', runAfter: ok('Apply_to_each_Live_List'),
            expression: { or: [{ equals: ["@outputs('Compose_Live_Record')?['StateChanged']", true] }, { equals: ["@outputs('Compose_Live_Record')?['ModifiedSinceBaseline']", true] }] },
            actions: { Append_to_varChanges: { type: 'AppendToArrayVariable', runAfter: {}, inputs: { name: 'varChanges', value: { Flow: `@outputs('Compose_Live_Record')?['Name']`, FlowGuid: `@${R}`, Change: "@concat(if(outputs('Compose_Live_Record')?['StateChanged'], concat('State ', outputs('Compose_Live_Record')?['BaselineState'], ' → ', outputs('Compose_Live_Record')?['State'], '. '), ''), if(outputs('Compose_Live_Record')?['ModifiedSinceBaseline'], concat('Modified ', outputs('Compose_Live_Record')?['Modified'], ' (baseline ', outputs('Compose_Live_Record')?['BaselineModified'], ').'), ''))", OpenInDesigner: `@${designer}` } } } },
            else: { actions: {} },
          },
        },
      },
      Condition_Not_Readable: {
        type: 'If', runAfter: always('Scope_Read_Live_Flow'),
        expression: { and: [{ not: { equals: ["@actions('Get_Live_Flow')?['status']", 'Succeeded'] } }] },
        actions: { Append_to_varNotRetrieved: {
          type: 'AppendToArrayVariable', runAfter: {},
          inputs: { name: 'varNotRetrieved', value: { Name: `@${F}?['Name']`, FlowGuid: `@${R}`, PrimaryRole: `@${F}?['PrimaryRole']`, Platform: `@${F}?['Platform']`, ContractKeys: `@${F}?['ContractKeys']`, WorkflowId: `@${F}?['WorkflowId']`, CandidateFlows: `@join(${F}?['Candidates'], '; ')`,
            Reason: `@if(empty(${R}), concat('None of the candidate tenant flows (', join(${F}?['Candidates'], ', '), ') has a live callback URL carrying the configured workflow ', ${F}?['WorkflowId'], '.'), string(coalesce(outputs('Get_Live_Flow')?['body']?['error']?['message'], outputs('Get_Live_Flow')?['body']?['message'], actions('Get_Live_Flow')?['status'])))`,
            OpenInDesigner: `@if(empty(${R}), '', ${designer})` } },
        } },
        else: { actions: {} },
      },
    },
  });

  /* ── 3 · totals ── */
  /* Counts without Filter array (the designer rejects Query here): per flag, a Select of each flow's
     value joined as |a||b|, then an exact-match count of |value|. */
  const flags = [['State', "toLower(string(coalesce(item()?['State'], '')))"], ['Modified', "toLower(string(item()?['ModifiedSinceBaseline']))"], ['StateChanged', "toLower(string(item()?['StateChanged']))"], ['InRegistry', "toLower(string(item()?['InRegistry']))"], ['Callback', "toLower(string(item()?['CallbackMatchesConfiguration']))"]];
  flags.forEach(([k, e], i) => add(`Select_Live_${k}`, { type: 'Select', inputs: { from: "@variables('varLiveFlows')", select: `@${e}` } }, i ? undefined : always(prev)));
  add('Compose_Live_Flags', { type: 'Compose', inputs: Object.fromEntries(flags.map(([k]) => [k, `@concat('|', join(body('Select_Live_${k}'), '||'), '|')`])) });
  add('Select_Primary_Roles', { type: 'Select', inputs: { from: "@variables('varInUse')", select: "@item()?['PrimaryRole']" } });
  add('Compose_Roles_Joined', { type: 'Compose', inputs: "@concat('|', join(body('Select_Primary_Roles'), '||'), '|')" });
  add('Compose_By_Role', { type: 'Compose', inputs: roles.map((role) => ({ PrimaryRole: role, Flows: `@sub(length(split(outputs('Compose_Roles_Joined'), ${lit(`|${role}|`)})), 1)` })) });
  add('Compose_Distinct_Lists', { type: 'Compose', inputs: "@union(variables('varListsTouched'), json('[]'))" });
  add('Compose_Generated_At', { type: 'Compose', inputs: '@utcNow()' });
  add('Compose_Totals', { type: 'Compose', inputs: {
    inUse: "@length(variables('varInUse'))",
    retrievedLive: "@length(variables('varLiveFlows'))",
    notRetrieved: "@length(variables('varNotRetrieved'))",
    on: "@sub(length(split(outputs('Compose_Live_Flags')?['State'], '|started|')), 1)",
    notOn: "@sub(length(variables('varLiveFlows')), sub(length(split(outputs('Compose_Live_Flags')?['State'], '|started|')), 1))",
    modifiedSinceBaseline: "@sub(length(split(outputs('Compose_Live_Flags')?['Modified'], '|true|')), 1)",
    stateChanged: "@sub(length(split(outputs('Compose_Live_Flags')?['StateChanged'], '|true|')), 1)",
    inRegistry: "@sub(length(split(outputs('Compose_Live_Flags')?['InRegistry'], '|true|')), 1)",
    listTouches: "@length(variables('varListsTouched'))",
    callbackMatches: "@sub(length(split(outputs('Compose_Live_Flags')?['Callback'], '|yes|')), 1)",
    callbackMismatches: "@sub(length(split(outputs('Compose_Live_Flags')?['Callback'], '|no|')), 1)",
    registryRows: "@length(outputs('Compose_Governance')?['Registry']?['rows'])",
    ledgerRows: "@length(outputs('Compose_Governance')?['Ledger']?['rows'])",
    exceptionRows: "@length(outputs('Compose_Governance')?['Exceptions']?['rows'])",
  } });
  add('Compose_Run_Stamp', { type: 'Compose', inputs: "@formatDateTime(outputs('Compose_Generated_At'), 'yyyy-MM-dd_HHmm')" });

  /* ── 4 · the report ── */
  const T = (k) => `string(outputs('Compose_Totals')?['${k}'])`;
  const tile = (label, k) => [['lit', `<td style="padding:5px"><div style="background:${B.paper};border:1px solid ${B.line};border-top:4px solid ${B.smartGreen};border-radius:12px;padding:10px 12px"><div style="font-size:24px;font-weight:bold;color:${B.deepGreen}">`], ['x', T(k)], ['lit', `</div><div style="font-size:10px;color:${B.muted};text-transform:uppercase;letter-spacing:.06em">${label}</div></div></td>`]];
  add('Compose_Report_Head', { type: 'Compose', inputs: cat([
    ['lit', `<!doctype html><html><head><meta charset="utf-8"><title>Folio Flow Estate — Live Report</title><style>td.k{padding:6px 10px;border-bottom:1px solid ${B.line};font-size:12px;color:${B.muted};width:200px;vertical-align:top}td.v{padding:6px 10px;border-bottom:1px solid ${B.line};font-size:12px;vertical-align:top;word-break:break-all}</style></head><body style="margin:0;background:${B.paper};font-family:Arial,Segoe UI,sans-serif;color:${B.ink}"><div style="max-width:1100px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid ${B.line};border-radius:18px;overflow:hidden">`],
    ['lit', `<div style="background:${B.deepGreen};color:#fff;padding:18px 22px"><div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase">${B.ministry.replace(/&/g, '&amp;')}</div><h1 style="margin:6px 0 0;font-size:22px">${B.agency}</h1><div>${B.office}</div></div>`],
    ['lit', `<div style="padding:22px"><div style="display:inline-block;background:${B.smartGreen};color:${B.onAccent};border-radius:999px;padding:5px 10px;font-size:12px">Official · Internal · Live read</div><h2 style="margin:14px 0 4px;color:${B.deepGreen};font-size:22px">Folio Flow Estate — Live Report</h2><p style="color:${B.muted};margin:0">Read live from the tenant `],
    ['x', "formatDateTime(outputs('Compose_Generated_At'),'dd MMMM yyyy HH:mm')"], ['lit', ' UTC · Run '], ['x', "workflow()?['run']?['name']"], ['lit', ' · Environment '], ['x', esc("variables('varEnvironment')")],
    ['lit', `</p><table style="width:100%;border-collapse:separate;margin:14px 0"><tr>`],
    ...tile('In use by the platforms', 'inUse'), ...tile('Read live', 'retrievedLive'), ...tile('Not readable', 'notRetrieved'), ...tile('On', 'on'), ...tile('Not on', 'notOn'),
    ['lit', '</tr><tr>'],
    ...tile('Modified since 2026-09-26', 'modifiedSinceBaseline'), ...tile('State changed', 'stateChanged'), ...tile('In flow registry', 'inRegistry'), ...tile('Callback = configured', 'callbackMatches'), ...tile('Callback ≠ configured', 'callbackMismatches'),
    ['lit', '</tr></table>'],
  ]) });
  const head = (cols) => `<table ${table}><tr>${cols.map((c) => `<th ${th}>${c}</th>`).join('')}</tr>`;
  const row = (cells) => cat(cells.flatMap((c, i) => [['lit', `${i ? '</td>' : '<tr>'}<td ${td}>`], ['x', c]]).concat([['lit', '</td></tr>']]));
  const I = (k) => esc(`item()?['${k}']`);
  const yn = (k, y = 'Yes', n = 'No') => `if(equals(item()?['${k}'], true), '${y}', '${n}')`;
  const link = `concat('<a style="color:${B.deepGreen}" href="', item()?['OpenInDesigner'], '">Open</a>')`;
  add('Select_Role_Rows', { type: 'Select', inputs: { from: "@outputs('Compose_By_Role')", select: row([I('PrimaryRole'), "string(item()?['Flows'])"]) } });
  add('Select_Index_Rows', { type: 'Select', inputs: { from: "@variables('varLiveFlows')", select: row([
    `concat('<a style="color:${B.deepGreen}" href="#f-', item()?['FlowGuid'], '"><b>', ${I('Name')}, '</b></a>')`, I('Platform'), I('ContractKeys'), I('State'), I('TriggerType'),
    "string(item()?['ActionCount'])", I('CallbackMatchesConfiguration'), yn('InRegistry'),
  ]) } });
  /* Card cells use the classes in the report head's <style>, to keep the card expression under 8,192 characters. */
  const field = (label, e) => [['lit', `<tr><td class="k">${label}</td><td class="v">`], ['x', e], ['lit', '</td></tr>']];
  add('Select_Flow_Cards', { type: 'Select', inputs: { from: "@variables('varLiveFlows')", select: cat([
    ['lit', '<div id="f-'], ['x', "item()?['FlowGuid']"], ['lit', `" style="border:1px solid ${B.line};border-left:5px solid ${B.deepGreen};border-radius:12px;padding:10px 14px;margin:12px 0"><h3 style="margin:0 0 4px;color:${B.deepGreen};font-size:15px">`],
    ['x', I('Name')], ['lit', ` <span style="background:${B.smartGreen};color:${B.onAccent};border-radius:999px;padding:2px 8px;font-size:11px;font-weight:normal">`], ['x', I('PrimaryRole')], ['lit', `</span></h3><table ${table}>`],
    ...field('Platform', I('Platform')), ...field('Contract keys', I('ContractKeys')), ...field('Configured workflow ID', I('WorkflowId')),
    ...field('Configured endpoint (register)', I('ConfiguredUrl')), ...field('Live callback URL', I('CallbackUrlRedacted')),
    ...field('Callback signature', "concat(string(item()?['CallbackSignatureLength']), ' characters (full URL in the restricted callback file)')"), ...field('Callback = configured', I('CallbackMatchesConfiguration')),
    ...field('Tenant flow ID (live)', I('FlowGuid')), ...field('Candidates checked', I('CandidateFlows')), ...field('Creator', I('Creator')), ...field('State (live / baseline)', `concat(${I('State')}, ' / ', ${I('BaselineState')})`),
    ...field('Modified (live / baseline)', `concat(${I('Modified')}, ' / ', ${I('BaselineModified')})`), ...field('Created', I('Created')),
    ...field('Trigger', `concat(${I('TriggerType')}, if(empty(item()?['Method']), '', concat(' · ', ${I('Method')})))`), ...field('Actions', "concat(string(item()?['ActionCount']), ' (action definitions in the live definition, including any carried as data)')"),
    ...field('Connectors', I('Connectors')), ...field('SharePoint sites', I('Sites')), ...field('SharePoint lists', "string(item()?['ListCount'])"),
    ...field('Owners', `concat(string(item()?['Owners']), if(empty(item()?['OwnerRoles']), '', concat(' (', ${I('OwnerRoles')}, ')')))`), ...field('Failure alerts', yn('FailureAlerts', 'On', 'Off')),
    ...field('Full definition', "concat('In flows/<name>__', item()?['FlowGuid'], '.json and the complete JSON')"),
    ...field('In DGO_HTTPFlowRegistry', yn('InRegistry')), ...field('Execution ledger mentions', "string(item()?['LedgerMentions'])"), ...field('Registry exception mentions', "string(item()?['ExceptionMentions'])"),
    ['lit', '<tr><td class="k">Open in designer</td><td class="v">'], ['x', link], ['lit', '</td></tr></table></div>'],
  ]) } });
  add('Select_List_Rows', { type: 'Select', inputs: { from: "@variables('varListsTouched')", select: row([I('Flow'), I('List'), I('Sites')]) } });
  add('Select_Change_Rows', { type: 'Select', inputs: { from: "@variables('varChanges')", select: row([I('Flow'), I('Change'), link]) } });
  add('Select_Not_Retrieved_Rows', { type: 'Select', inputs: { from: "@variables('varNotRetrieved')", select: row([I('Name'), I('Platform'), I('ContractKeys'), I('Reason'), link]) } });
  const govRow = (key, title) => [['lit', `<tr><td ${td}>${title}</td><td ${td}>`], ['x', `if(outputs('Compose_Governance')?['${key}']?['read'], 'Read', concat('Not read: ', ${esc(`outputs('Compose_Governance')?['${key}']?['error']`)}))`], ['lit', `</td><td ${td}>`], ['x', `string(length(outputs('Compose_Governance')?['${key}']?['rows']))`], ['lit', '</td></tr>']];
  add('Compose_Report_HTML', { type: 'Compose', inputs: cat([
    ['x', "outputs('Compose_Report_Head')"],
    ['lit', `<h2 ${h2}>1. Changes since the 2026-09-26 export</h2>${head(['Flow', 'Change', 'Designer'])}`], ['x', "join(body('Select_Change_Rows'),'')"], ['lit', '</table>'],
    ['lit', `<h2 ${h2}>2. Endpoints and flows that could not be read</h2><p ${note}>No candidate tenant flow carries the configured workflow ID, or the flow is deleted, or not visible to the connection that ran this report.</p>${head(['Flow', 'Platform', 'Contract keys', 'Reason', 'Designer'])}`], ['x', "join(body('Select_Not_Retrieved_Rows'),'')"], ['lit', '</table>'],
    ['lit', `<h2 ${h2}>3. In use, by platform</h2>${head(['Platform', 'Flows'])}`], ['x', "join(body('Select_Role_Rows'),'')"], ['lit', '</table>'],
    ['lit', `<h2 ${h2}>4. Endpoints and flows in use, live</h2>${head(['Flow', 'Platform', 'Contract keys', 'State', 'Trigger', 'Actions', 'Callback = configured', 'Registered'])}`], ['x', "join(body('Select_Index_Rows'),'')"], ['lit', '</table>'],
    ['lit', `<h2 ${h2}>5. Flow details, live</h2>`], ['x', "join(body('Select_Flow_Cards'),'')"],
    ['lit', `<h2 ${h2}>6. SharePoint lists the flows touch, from their live definitions</h2>${head(['Flow', 'List', 'Sites in that flow'])}`], ['x', "join(body('Select_List_Rows'),'')"], ['lit', '</table>'],
    ['lit', `<h2 ${h2}>7. Governance lists</h2>${head(['List', 'Read', 'Rows'])}`], ...govRow('Registry', 'DGO_HTTPFlowRegistry'), ...govRow('Ledger', 'DGO_HTTPFlowExecutionLedger'), ...govRow('Exceptions', 'DGO_HTTPFlowRegistryExceptions'), ['lit', '</table>'],
    ['lit', `<h2 ${h2}>8. Sources</h2><p ${note}>Which flows: the endpoint register's current configuration (Workspace, Document Portal), the Mailer's settings, the GOV registry flows and the background carriers. Live: Power Automate Management (GetFlow, ListFlowOwners, ListCallbackUrl) and SharePoint on DGO_ECM_GOVERNANCE, read at the time above. Earlier state compared against: `], ['x', esc("variables('varSources')?['usageAnalysis']")], ['lit', ' ('], ['x', esc("variables('varSources')?['tenantExport']")], ['lit', ').</p></div>'],
    ['lit', `<div style="border-top:1px solid ${B.line};padding:14px 22px;color:${B.muted};font-size:12px">Confidentiality Notice: This report is for internal use within the Agency. If received in error, please notify the sender and delete it.<br>${B.agency} · ${B.office}</div></div></div></body></html>`],
  ]) });

  /* ── 5 · the complete JSON and the CSVs ── */
  add('Compose_Full_JSON', { type: 'Compose', inputs: {
    report: { title: 'Folio Flow Estate — Live Report', generatedUtc: "@outputs('Compose_Generated_At')", runId: "@workflow()?['run']?['name']", reportFlow: "@workflow()?['tags']?['flowDisplayName']", environment: "@variables('varEnvironment')", issuer: { agency: B.agency, office: B.office, ministry: B.ministry }, baselineSources: "@variables('varSources')" },
    totals: "@outputs('Compose_Totals')",
    byRole: "@outputs('Compose_By_Role')",
    flowsLive: "@variables('varLiveFlows')",
    changesSinceBaseline: "@variables('varChanges')",
    notRetrieved: "@variables('varNotRetrieved')",
    listsTouched: "@variables('varListsTouched')",
    governance: "@outputs('Compose_Governance')",
    inUseConfiguration: "@variables('varInUse')",
    callbackUrls: 'Full signed callback URLs are filed separately in the restricted callback file, not in this JSON.',
  } });
  add('Compose_Report_Data', { type: 'Compose', inputs: {
    report: "@outputs('Compose_Full_JSON')?['report']", totals: "@outputs('Compose_Totals')", flowsLive: "@variables('varLiveFlows')", notRetrieved: "@variables('varNotRetrieved')",
    changesSinceBaseline: "@variables('varChanges')", listsTouched: "@variables('varListsTouched')",
    governance: Object.fromEntries(GOV_LISTS.map(([key]) => [key, { list: `@outputs('Compose_Governance')?['${key}']?['list']`, read: `@outputs('Compose_Governance')?['${key}']?['read']`, error: `@outputs('Compose_Governance')?['${key}']?['error']`, rowCount: `@length(outputs('Compose_Governance')?['${key}']?['rows'])` }])),
  } });
  /* The interactive report: the template with this run's data in place of "__REPORT_DATA__". "</" is
     written "<\/" so no value can close the report's <script>. */
  add('Compose_Interactive_HTML', { type: 'Compose', inputs: "@replace(variables('varReportTemplate'), '\"__REPORT_DATA__\"', replace(string(outputs('Compose_Report_Data')), '</', '<\\/'))" });
  add('Select_CSV_Flows', { type: 'Select', inputs: { from: "@variables('varLiveFlows')", select: Object.fromEntries(['Name', 'Platform', 'ContractKeys', 'WorkflowId', 'FlowGuid', 'State', 'Created', 'Modified', 'TriggerType', 'Method', 'ActionCount', 'Connectors', 'Sites', 'ListCount', 'Owners', 'OwnerRoles', 'FailureAlerts', 'ConfiguredUrl', 'CallbackUrlRedacted', 'CallbackSignatureLength', 'CallbackMatchesConfiguration', 'InRegistry', 'LedgerMentions', 'ExceptionMentions', 'CandidateFlows', 'OpenInDesigner'].map((k) => [k, `@item()?['${k}']`])) } });
  add('Create_CSV_Flows', { type: 'Table', inputs: { from: "@body('Select_CSV_Flows')", format: 'CSV' } });
  add('Create_CSV_Lists_Touched', { type: 'Table', inputs: { from: "@variables('varListsTouched')", format: 'CSV' } });
  add('Create_CSV_Changes', { type: 'Table', inputs: { from: "@union(variables('varChanges'), variables('varNotRetrieved'))", format: 'CSV' } });
  const fname = (ext, part = '') => `@concat('Folio-Flow-Estate${part}_', outputs('Compose_Run_Stamp'), '.${ext}')`;
  add('Compose_File_Names', { type: 'Compose', inputs: { html: fname('html'), pdf: fname('pdf'), json: fname('json'), csvFlows: fname('csv', '-Flows'), csvLists: fname('csv', '-Lists'), csvChanges: fname('csv', '-Changes'), callbacks: fname('json', '-CONFIDENTIAL-Callback-URLs'), interactive: fname('html', '-Interactive'), printable: fname('html', '-Printable'), folder: `@concat('${REPORT_FOLDER}/', outputs('Compose_Run_Stamp'))` } });

  /* ── 6 · PDF (OneDrive for Business); the run carries on without it ── */
  add('Create_HTML_in_OneDrive', conn('shared_onedriveforbusiness', 'CreateFile', { folderPath: '/Folio Flow Estate Reports', name: "@outputs('Compose_File_Names')?['html']", body: "@outputs('Compose_Report_HTML')" }));
  add('Convert_Report_to_PDF', conn('shared_onedriveforbusiness', 'ConvertFile', { id: "@outputs('Create_HTML_in_OneDrive')?['body']?['Id']", type: 'PDF' }));
  add('Compose_PDF_Made', { type: 'Compose', inputs: "@equals(actions('Convert_Report_to_PDF')?['status'], 'Succeeded')" }, always('Convert_Report_to_PDF'));

  /* ── 7 · file the record set on DGO_ECM_GOVERNANCE ── */
  const files = [['Interactive', 'interactive', "@outputs('Compose_Interactive_HTML')"], ['HTML', 'printable', "@outputs('Compose_Report_HTML')"], ['JSON', 'json', "@string(outputs('Compose_Full_JSON'))"], ['CSV_Flows', 'csvFlows', "@body('Create_CSV_Flows')"], ['CSV_Lists', 'csvLists', "@body('Create_CSV_Lists_Touched')"], ['CSV_Changes', 'csvChanges', "@body('Create_CSV_Changes')"]];
  for (const [n, k, content] of files) add(`Create_Record_${n}`, conn('shared_sharepointonline', 'CreateFile', { dataset: GOV_SITE, folderPath: "@outputs('Compose_File_Names')?['folder']", name: `@outputs('Compose_File_Names')?['${k}']`, body: content }), always(prev));
  add('Create_Record_Callback_URLs', conn('shared_sharepointonline', 'CreateFile', { dataset: GOV_SITE, folderPath: "@outputs('Compose_File_Names')?['folder']", name: "@outputs('Compose_File_Names')?['callbacks']", body: "@string(variables('varCallbackUrls'))" }), always(prev));
  /* One file per flow or endpoint, with its complete record: configuration, live properties, redacted
     callback URL, triggers, connection references and the full definition (unreadable ones: their
     configuration and the reason). */
  add('Apply_to_each_Flow_File', {
    type: 'Foreach', foreach: "@union(variables('varLiveFlows'), variables('varNotRetrieved'))", runtimeConfiguration: { concurrency: { repetitions: 5 } },
    actions: { Create_Record_Flow_File: { ...conn('shared_sharepointonline', 'CreateFile', { dataset: GOV_SITE, folderPath: "@concat(outputs('Compose_File_Names')?['folder'], '/flows')",
      name: "@concat(replace(replace(string(items('Apply_to_each_Flow_File')?['Name']), ' ', '_'), '/', '_'), '__', if(empty(items('Apply_to_each_Flow_File')?['FlowGuid']), concat('unread_', items('Apply_to_each_Flow_File')?['WorkflowId']), items('Apply_to_each_Flow_File')?['FlowGuid']), '.json')",
      body: "@string(items('Apply_to_each_Flow_File'))" }), runAfter: {} } },
  }, always(prev));
  add('Condition_File_PDF', { type: 'If', expression: { and: [{ equals: ["@outputs('Compose_PDF_Made')", true] }] },
    actions: { Create_Record_PDF: { ...conn('shared_sharepointonline', 'CreateFile', { dataset: GOV_SITE, folderPath: "@outputs('Compose_File_Names')?['folder']", name: "@outputs('Compose_File_Names')?['pdf']", body: "@body('Convert_Report_to_PDF')" }), runAfter: {} } },
    else: { actions: {} } }, always(prev));
  add('Compose_Filed', { type: 'Compose', inputs: {
    folder: `@concat('${GOV_SITE}', outputs('Compose_File_Names')?['folder'])`,
    filed: `@concat(${[...files.map(([n]) => n), 'PDF'].map((n) => `if(equals(actions('${n === 'PDF' ? 'Create_Record_PDF' : `Create_Record_${n}`}')?['status'], 'Succeeded'), '${n.replace('_', ' ')} ', '')`).join(', ')}, if(equals(actions('Create_Record_Callback_URLs')?['status'], 'Succeeded'), 'Callback-URLs (restricted) ', ''), if(equals(actions('Apply_to_each_Flow_File')?['status'], 'Succeeded'), concat(string(add(length(variables('varLiveFlows')), length(variables('varNotRetrieved')))), ' per-flow files '), ''))`,
  } }, always(prev));

  /* ── 8 · send ── */
  const att = (k, content) => ({ Name: `@outputs('Compose_File_Names')?['${k}']`, ContentBytes: content });
  add('Compose_Base_Attachments', { type: 'Compose', inputs: [
    att('interactive', "@base64(outputs('Compose_Interactive_HTML'))"), att('printable', "@base64(outputs('Compose_Report_HTML'))"), att('json', "@base64(string(outputs('Compose_Full_JSON')))"),
    att('csvFlows', "@base64(body('Create_CSV_Flows'))"), att('csvLists', "@base64(body('Create_CSV_Lists_Touched'))"), att('csvChanges', "@base64(body('Create_CSV_Changes'))"),
  ] }, always(prev));
  add('Compose_Attachments', { type: 'Compose', inputs: "@union(outputs('Compose_Base_Attachments'), if(outputs('Compose_PDF_Made'), createArray(json(concat('{\"Name\":\"', outputs('Compose_File_Names')?['pdf'], '\",\"ContentBytes\":\"', string(body('Convert_Report_to_PDF')?['$content']), '\"}'))), json('[]')))" });
  /* The email body is a summary that reads well in Outlook: the headline figures, what changed and what
     could not be read. Everything else is in the attached interactive report. */
  add('Compose_Email_HTML', { type: 'Compose', inputs: cat([
    ['x', "outputs('Compose_Report_Head')"],
    ['lit', `<p style="font-size:13px;margin:6px 0 14px">Open the attached <b>Interactive report</b> for navigation, search, filters, the dashboard and each flow's full definition. The <b>Printable</b> report and PDF carry the same content for print.</p>`],
    ['lit', `<h2 ${h2}>Changes since the 2026-09-26 export</h2><table ${table}><tr><th ${th}>Flow</th><th ${th}>Change</th><th ${th}>Designer</th></tr>`], ['x', "join(body('Select_Change_Rows'),'')"], ['lit', '</table>'],
    ['lit', `<h2 ${h2}>Not readable</h2><table ${table}><tr><th ${th}>Flow</th><th ${th}>Platform</th><th ${th}>Contract keys</th><th ${th}>Reason</th><th ${th}>Designer</th></tr>`], ['x', "join(body('Select_Not_Retrieved_Rows'),'')"], ['lit', '</table>'],
    ['lit', `</div><div style="border-top:1px solid ${B.line};padding:14px 22px;color:${B.muted};font-size:12px">Confidentiality Notice: This report is for internal use within the Agency. If received in error, please notify the sender and delete it.<br>${B.agency} · ${B.office}</div></div></div></body></html>`],
  ]) });
  add('Send_an_email_Folio_Flow_Estate', conn('shared_office365', 'SendEmailV2', {
    'emailMessage/To': `@coalesce(triggerOutputs()?['headers']?['x-ms-user-email'], ${lit(REGISTRY_MAILBOX)})`,
    'emailMessage/Subject': "@concat('Folio Flow Estate — Live Report — ', formatDateTime(outputs('Compose_Generated_At'),'dd MMMM yyyy HH:mm'), ' UTC — ', string(outputs('Compose_Totals')?['retrievedLive']), ' read, ', string(outputs('Compose_Totals')?['notRetrieved']), ' not readable, ', string(length(variables('varChanges'))), ' changed')",
    'emailMessage/Body': `@concat('<p style="font-family:Arial;font-size:12px;color:${B.muted}">Filed: ', outputs('Compose_Filed')?['filed'], '· <a href="', outputs('Compose_Filed')?['folder'], '">record folder</a>', if(outputs('Compose_PDF_Made'), '', ' · PDF not produced this run'), '</p>', outputs('Compose_Email_HTML'))`,
    'emailMessage/Attachments': "@outputs('Compose_Attachments')",
    'emailMessage/Importance': 'Normal',
  }));

  const walk = (x, where) => {
    if (typeof x === 'string' && x.startsWith('@') && x.length > MAX_EXPRESSION) throw new Error(`${where}: expression is ${x.length} characters, over ${MAX_EXPRESSION}`);
    if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) walk(y, `${where}.${k}`);
  };
  walk(body, 'body');
  return { vars, body };
}
