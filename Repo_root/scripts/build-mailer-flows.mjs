#!/usr/bin/env node
// Build the DGO Correspondence Mailer's Power Automate flows.
//
//   node scripts/build-mailer-flows.mjs           write mailer/flows/ from this file
//   node scripts/build-mailer-flows.mjs --check   exit 1 if what is committed differs
//
// WHAT IT WRITES
//
// The mailer (mailer/index.html) has no server of its own. Everything it does beyond the
// browser is one of seven Power Automate flows, and every one of them is started by an HTTP
// request trigger — no schedule, no mailbox trigger, no SharePoint trigger, no child flow:
//
//   DGO_MAIL_SEND        send one personalised message, with attachments, and log it
//   DGO_MAIL_LOG         read the send log back
//   DGO_MAIL_DIRECTORY   the shared addressee directory (list / upsert / delete)
//   DGO_MAIL_TEMPLATES   the shared letter templates (list / upsert / delete)
//   DGO_MAIL_PROVISION   create the SharePoint lists and library the others use, idempotently
//   DGO_MAIL_AUTH        operator sign-in with a mailed code, and operator management
//   DGO_MAIL_DATA        mailings, Activity reports and attached files, shared across devices
//
// For each flow this writes two artefacts under mailer/flows/:
//
//   definitions/<FLOW>.definition.json   the workflow definition, readable and diffable
//   packages/<FLOW>.zip                  an "Import package (legacy)" archive — the thing you
//                                        import in make.powerautomate.com
//
// Both are generated from the declarations below and nowhere else, and --check holds the
// committed copies to them byte for byte. Edit this file, not the output.
//
// THE CONTRACT EVERY FLOW KEEPS
//
// Request   { operation, requestId, validationOnly, operatorKey, operator, payload }
// Response  { success, validationOnly, endpoint: { key }, requestId, data, error }
//
// Two operations are common to all seven and need no operator key, because neither writes
// anything: `healthCheck` (docs/folio-Master-Flows-and-Endpoints/reference/HEALTH_CONTRACT.md — requires validationOnly:true and
// names the key the flow itself serves) and the `_platform.operation = verify` identity
// handshake. Every other operation is refused unless the caller presents the operator key
// configured inside the flow, and a flow whose key is still the placeholder refuses everything
// — it fails closed, so an import that nobody finished configuring cannot be used as a relay.
//
// validationOnly:true on a writing operation runs every check and then stops before the first
// write. The mailer uses it as a server-side preflight before a batch.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildZip } from './lib/zip-writer.mjs';
import { flowPackageEntries } from './mailer-package/flow-package.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'mailer', 'flows');
const CHECK = process.argv.includes('--check');

/* ------------------------------------------------------------------ *
 * Tenant-level settings. The same values appear in each flow's
 * Compose_Config action, which is the one place to change them after
 * import.
 * ------------------------------------------------------------------ */

export const MAILER = Object.freeze({
  contractVersion: 'dgo-mail/2.0',
  /* The one origin whose pages may read the flows' answers: the platform's host, where the
     mailer is published under /mailer/. A browser on any other origin gets no readable response.
     "*" opens it to every origin — only for local testing. */
  allowedOrigin: 'https://folio-platform.page.gd',
  /* Operators sign in with a code mailed to them (DGO_MAIL_AUTH). */
  codeMinutes: 10,
  maxCodeAttempts: 5,
  /* At most this many codes are mailed to one operator address per window; further requests get
     the same answer and nothing is created or mailed. */
  codesPerWindow: 5,
  codeWindowMinutes: 10,
  sessionHours: 12,
  environment: 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1',
  siteUrl: 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING',
  /* The ADMIN key, held only inside the flows. Automatic setup uses it to provision and to
     add the first operator; browsers never hold it — operators sign in with a mailed code.
     A key that starts with "__" is a placeholder, and a flow holding one refuses every
     writing operation. */
  operatorKeyPlaceholder: '__SET_OPERATOR_KEY_AFTER_IMPORT__',
  lists: Object.freeze({
    log: 'DGOMailLog', directory: 'DGOMailDirectory', templates: 'DGOMailTemplates',
    operators: 'DGOMailOperators', sessions: 'DGOMailSessions', campaigns: 'DGOMailCampaigns', reports: 'DGOMailReports',
    files: 'DGOMailFiles',
  }),
  /* Recipients must sit under one of these registrable suffixes (the last two labels of
     the domain) or be named exactly in allowedDomains. Every address in the mailing guide
     is .gov.ng or .edu.ng. This is what stops the send flow being an open relay. */
  allowedSuffixes: Object.freeze(['gov.ng', 'edu.ng']),
  allowedDomains: Object.freeze([]),
  maxRecipients: 10,
  /* Base64 characters across all attachments of ONE message. 30 MB of base64 is ~22 MB of
     files, under Exchange Online's 25 MB practical ceiling for connector-sent mail. */
  maxAttachmentChars: 30_000_000,
  /* A log row still "Sending" younger than this is a send in progress; a second request for the
     same message is refused (409 IN_PROGRESS) instead of sending it again. */
  inProgressMinutes: 15,
});

/* ------------------------------------------------------------------ *
 * SharePoint list schema — what DGO_MAIL_PROVISION creates.
 * Title carries the natural key in every list.
 * ------------------------------------------------------------------ */

const text = (name) => ({ name, xml: `<Field Type="Text" Name="${name}" StaticName="${name}" DisplayName="${name}" MaxLength="255" />` });
const note = (name) => ({ name, xml: `<Field Type="Note" Name="${name}" StaticName="${name}" DisplayName="${name}" NumLines="6" RichText="FALSE" UnlimitedLengthInDocumentLibrary="TRUE" />` });
const num = (name) => ({ name, xml: `<Field Type="Number" Name="${name}" StaticName="${name}" DisplayName="${name}" Decimals="0" />` });
const when = (name) => ({ name, xml: `<Field Type="DateTime" Name="${name}" StaticName="${name}" DisplayName="${name}" Format="DateTime" />` });
const bool = (name) => ({ name, xml: `<Field Type="Boolean" Name="${name}" StaticName="${name}" DisplayName="${name}"><Default>1</Default></Field>` });
/* Indexed, so equality filters keep working past SharePoint's 5,000-item view threshold. */
const indexed = (name) => ({ name, xml: `<Field Type="Text" Name="${name}" StaticName="${name}" DisplayName="${name}" MaxLength="255" Indexed="TRUE" />` });

export const LIST_SCHEMA = Object.freeze([
  {
    title: MAILER.lists.log,
    description: 'DGO Correspondence Mailer - one row per message. Title is the messageId. Private to the flow owner.',
    private: true,
    fields: [
      text('CampaignId'), text('RecipientKey'), text('Institution'), text('Addressee'),
      note('ToAddresses'), note('CcAddresses'), note('BccAddresses'), text('Subject'), text('Reference'),
      note('AttachmentNames'), num('AttachmentCount'), text('Status'), note('ErrorMessage'),
      text('OperatorEmail'), text('OperatorName'), when('SentAt'), text('RequestId'), text('FlowRunId'),
    ],
  },
  {
    title: MAILER.lists.directory,
    description: 'DGO Correspondence Mailer - addressee directory. Title is the institution key.',
    fields: [
      text('Institution'), text('Addressee'), text('Email'), note('CcEmails'), text('Website'),
      text('Verification'), text('Salutation'), text('Category'), bool('Active'), note('Notes'), num('SortOrder'),
    ],
  },
  {
    title: MAILER.lists.templates,
    description: 'DGO Correspondence Mailer - letter templates. Title is the template key. Private to the flow owner.',
    private: true,
    fields: [
      text('TemplateName'), text('Subject'), note('BodyHtml'), note('Description'), text('UpdatedBy'),
    ],
  },
  {
    title: MAILER.lists.operators,
    description: 'DGO Correspondence Mailer - who may sign in. Title is the operator\'s email address, lower case. Role: operator or admin. Private to the flow owner.',
    private: true,
    fields: [text('DisplayName'), bool('Active'), text('Role')],
  },
  {
    title: MAILER.lists.sessions,
    description: 'DGO Correspondence Mailer - sign-in codes and sessions. Private to the flow owner. Title is the challenge id.',
    private: true,
    fields: [
      indexed('Email'), text('DisplayName'), text('Code'), when('CodeExpiresAt'), num('Attempts'),
      indexed('Token'), when('TokenExpiresAt'), indexed('Status'),
    ],
  },
  {
    title: MAILER.lists.campaigns,
    description: 'DGO Correspondence Mailer - every mailing and its per-recipient results, shared across devices. Title is the mailing id. Private to the flow owner.',
    private: true,
    fields: [text('CampaignName'), text('Status'), note('Data'), text('UpdatedByEmail')],
  },
  {
    title: MAILER.lists.reports,
    description: 'DGO Correspondence Mailer - the report of every operation (the Activity page), shared across devices. Title is the report id.',
    fields: [text('Kind'), text('ReportTitle'), text('Status'), note('Data'), text('OperatorEmail')],
  },
  {
    title: MAILER.lists.files,
    description: 'DGO Correspondence Mailer - attached letters and enclosures, shared across devices. File name: <id>__<original name>.',
    template: 101,
    fields: [],
  },
]);

/* ------------------------------------------------------------------ *
 * Expression helpers
 * ------------------------------------------------------------------ */

const CFG = (k) => `outputs('Compose_Config')?['${k}']`;

/* The sign-in code e-mail is ML-Sign-In-Code of the e-mail template package (register row TR-071): its complete
   document as one string, each token an interpolated @{expression}. One concat() over the whole document would be one
   expression past the service's 8192-character limit; here each expression is a token's own. */
const SIGN_IN_CODE_HTML = 'docs/folio-Master-Flows-and-Endpoints/email-templates/01-Templates/email/ML-Sign-In-Code.html';
function templateExpression(rel, values) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8').trim();
  /* A literal @ is itself except before {, where it would open an expression. */
  const literal = (t) => t.replace(/@\{/g, "@{'@'}{");
  let out = '';
  let last = 0;
  for (const m of html.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    if (!(m[1] in values)) throw new Error(`${rel}: no expression for {{${m[1]}}}`);
    out += `${literal(html.slice(last, m.index))}@{${values[m[1]]}}`;
    last = m.index + m[0].length;
  }
  return out + literal(html.slice(last));
}
const REQ = (k) => `outputs('Compose_Request')?['${k}']`;
/** Who is calling, as established by the flow (session or admin key) — never as the client says. */
const CALLER = (k) => `outputs('Compose_Caller')?['${k}']`;
const P = (...ks) => `triggerBody()?['payload']${ks.map((k) => `?['${k}']`).join('')}`;
/** An OData string literal body: single quotes doubled. */
const odata = (expr) => `replace(string(${expr}), '''', '''''')`;
/** Truncate to a SharePoint single-line text column. */
const cap255 = (expr) => `substring(string(${expr}), 0, min(length(string(${expr})), 255))`;
const listItems = (listKey) => `concat('_api/web/lists/GetByTitle(''', ${CFG(listKey)}, ''')/items')`;

const SP_API = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline';
const O365_API = '/providers/Microsoft.PowerApps/apis/shared_office365';
const AUTH = "@parameters('$authentication')";
const NOMETA = 'application/json;odata=nometadata';
const VERBOSE = 'application/json;odata=verbose';

/* Only the configured origin may read an answer (Compose_Config allowedOrigin). */
const CORS = Object.freeze({
  'Access-Control-Allow-Origin': `@${CFG('allowedOrigin')}`,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
  'Content-Type': 'application/json',
});

const after = (...names) => Object.fromEntries(names.map((n) => [n, ['Succeeded']]));
const afterAny = (name, ...states) => ({ [name]: states });

const compose = (inputs, runAfter = {}) => ({ type: 'Compose', inputs, runAfter });

/** One SharePoint REST call through the connector's "Send an HTTP request". */
function spHttp({ method, uri, body, headers = {}, runAfter = {}, verbose = false }) {
  const type = verbose ? VERBOSE : NOMETA;
  const parameters = {
    dataset: `@${CFG('siteUrl')}`,
    'parameters/method': method,
    'parameters/uri': uri,
    'parameters/headers': { Accept: type, 'Content-Type': type, ...headers },
  };
  if (body !== undefined) parameters['parameters/body'] = body;
  return {
    type: 'OpenApiConnection',
    inputs: {
      host: { apiId: SP_API, connectionName: 'shared_sharepointonline', operationId: 'HttpRequest' },
      parameters,
      authentication: AUTH,
    },
    runAfter,
  };
}

/** The standard envelope. `data` and `error` are objects whose string values may be expressions. */
function envelope({ success, validationOnly = false, data = null, error = null }) {
  return {
    success,
    validationOnly,
    endpoint: { key: `@${CFG('endpointKey')}` },
    requestId: `@${REQ('requestId')}`,
    runId: "@workflow()?['run']?['name']",
    data,
    error,
  };
}

const response = (statusCode, body, runAfter = {}) => ({
  type: 'Response',
  kind: 'Http',
  inputs: { statusCode, headers: { ...CORS }, body },
  runAfter,
});

const terminate = (runAfter) => ({ type: 'Terminate', inputs: { runStatus: 'Succeeded' }, runAfter });

/** Condition whose TRUE branch answers and ends the run; the FALSE branch is empty, so the
 *  next action (runAfter this condition) is the continuation.
 *
 *  Its two inner actions are named after the condition by uniqueNames() below: Logic Apps
 *  requires every action name to be unique across the WHOLE definition, not just within its
 *  branch, so a fixed "Respond" in each guard would fail at import. */
const GUARD = Symbol('guard');
function guard(expression, status, body, runAfter) {
  return {
    [GUARD]: true,
    type: 'If',
    expression: { and: [{ equals: [`@${expression}`, true] }] },
    actions: {
      Respond: response(status, body),
      Stop: terminate(after('Respond')),
    },
    else: { actions: {} },
    runAfter,
  };
}

/** Give each guard's inner actions names derived from the guard's own. */
function uniqueNames(actions) {
  for (const [name, a] of Object.entries(actions || {})) {
    if (a[GUARD]) {
      const respond = `${name}_Respond`;
      a.actions = { [respond]: a.actions.Respond, [`${name}_Stop`]: { ...a.actions.Stop, runAfter: after(respond) } };
      delete a[GUARD];
    }
    uniqueNames(a.actions);
    uniqueNames(a.else?.actions);
    for (const c of Object.values(a.cases || {})) uniqueNames(c.actions);
    uniqueNames(a.default?.actions);
  }
  return actions;
}

const err = (code, message, details = null) => ({ code, message, details });

/* ------------------------------------------------------------------ *
 * The skeleton every flow shares
 * ------------------------------------------------------------------ */

/* The lists each flow's healthCheck looks for: its own, plus the two every signed-in call reads. */
const HEALTH_LISTS = Object.freeze({
  MAIL_SEND: ['logList'],
  MAIL_LOG: ['logList'],
  MAIL_DIRECTORY: ['directoryList'],
  MAIL_TEMPLATES: ['templatesList'],
  MAIL_PROVISION: ['logList', 'directoryList', 'templatesList'],
  MAIL_AUTH: [],
  MAIL_DATA: ['campaignsList', 'reportsList', 'filesLibrary'],
});

function skeleton({ key, identity, description, extraConfig = {}, cases, preActions = {}, openOps = [], triggerRuntime = null }) {
  const config = {
    endpointKey: key,
    flowIdentity: identity,
    contractVersion: MAILER.contractVersion,
    environment: MAILER.environment,
    siteUrl: MAILER.siteUrl,
    allowedOrigin: MAILER.allowedOrigin,
    operatorKey: MAILER.operatorKeyPlaceholder,
    logList: MAILER.lists.log,
    directoryList: MAILER.lists.directory,
    templatesList: MAILER.lists.templates,
    operatorsList: MAILER.lists.operators,
    sessionsList: MAILER.lists.sessions,
    ...extraConfig,
  };

  const keyConfigured = `and(not(startsWith(string(${CFG('operatorKey')}), '__')), greaterOrEquals(length(string(${CFG('operatorKey')})), 16))`;
  const open = `contains(createArray(${['verify', 'healthcheck', ...openOps].map((o) => `'${o}'`).join(', ')}), ${REQ('operation')})`;

  let last = 'Compose_Request';
  const actions = {
    Compose_Config: compose(config),
    Compose_Request: compose({
      operation: "@toLower(string(coalesce(triggerBody()?['_platform']?['operation'], triggerBody()?['operation'], '')))",
      requestId: "@string(coalesce(triggerBody()?['requestId'], triggerBody()?['_platform']?['correlationId'], guid()))",
      validationOnly: "@equals(triggerBody()?['validationOnly'], true)",
      operatorEmail: "@string(coalesce(triggerBody()?['operator']?['email'], ''))",
      operatorName: "@string(coalesce(triggerBody()?['operator']?['name'], ''))",
      keyConfigured: `@${keyConfigured}`,
      sessionToken: "@trim(string(coalesce(triggerBody()?['sessionToken'], '')))",
      /* The admin key: automatic setup's credential. Browsers never hold it. */
      isAdmin: `@and(${keyConfigured}, equals(string(coalesce(triggerBody()?['operatorKey'], '')), string(${CFG('operatorKey')})))`,
    }, after('Compose_Config')),
  };
  for (const [name, a] of Object.entries(preActions)) {
    actions[name] = { ...a, runAfter: after(last) };
    last = name;
  }

  /* The caller's session and operator rows are carried in variables, never read from the
     look-ups themselves: for open operations and admin-key calls the look-ups are skipped,
     and a skipped action must not be an input to anything that runs on every call. */
  actions.Initialize_varCallerSessions = { type: 'InitializeVariable', inputs: { variables: [{ name: 'varCallerSessions', type: 'array', value: [] }] }, runAfter: after(last) };
  actions.Initialize_varCallerOperators = { type: 'InitializeVariable', inputs: { variables: [{ name: 'varCallerOperators', type: 'array', value: [] }] }, runAfter: after('Initialize_varCallerSessions') };
  actions.Condition_Refuse_Unconfigured = guard(
    `and(not(${open}), not(${REQ('keyConfigured')}))`,
    503,
    envelope({ success: false, error: err('NOT_CONFIGURED', 'This flow has not been configured: set operatorKey in Compose_Config (16+ characters, not starting with "__").') }),
    after('Initialize_varCallerOperators'),
  );
  /* Sign-in: a session token issued by DGO_MAIL_AUTH, still active and unexpired, whose
     operator is still on DGOMailOperators and Active. Looked up on every call, so signing out,
     expiry and switching an operator off all take effect at once. */
  const sessionRows = "variables('varCallerSessions')";
  const operatorRows = "variables('varCallerOperators')";
  const session = `first(${sessionRows})`;
  const operator = `first(${operatorRows})`;
  actions.Condition_Check_Session = {
    type: 'If',
    expression: { and: [
      { equals: [`@${open}`, false] },
      { equals: [`@${REQ('isAdmin')}`, false] },
      { equals: [`@empty(${REQ('sessionToken')})`, false] },
    ] },
    actions: {
      /* Looked up by Title only: an active session's Title is its token (set at sign-in).
         SharePoint refused a filter on the custom Status column on the tenant ("Value does not
         fall within the expected range"), so status and expiry are checked here instead. */
      SP_Find_Session: spHttp({
        method: 'GET',
        uri: `@concat(${listItems('sessionsList')}, '?$top=1&$filter=', encodeUriComponent(concat('Title eq ''', ${odata(REQ('sessionToken'))}, '''')))`,
      }),
      Filter_Active_Session: {
        type: 'Query',
        inputs: {
          from: "@coalesce(body('SP_Find_Session')?['value'], createArray())",
          where: "@and(equals(string(item()?['Status']), 'Active'), equals(string(item()?['Token']), string(outputs('Compose_Request')?['sessionToken'])), greater(ticks(string(coalesce(item()?['TokenExpiresAt'], '1900-01-01T00:00:00Z'))), ticks(utcNow())))",
        },
        runAfter: after('SP_Find_Session'),
      },
      Set_varCallerSessions: {
        type: 'SetVariable',
        inputs: { name: 'varCallerSessions', value: "@body('Filter_Active_Session')" },
        runAfter: after('Filter_Active_Session'),
      },
      SP_Find_Caller_Operator: spHttp({
        method: 'GET',
        uri: `@concat(${listItems('operatorsList')}, '?$select=Title,DisplayName,Role&$top=1&$filter=', encodeUriComponent(concat('Title eq ''', ${odata(`toLower(string(coalesce(${session}?['Email'], '-')))`)}, ''' and Active eq 1')))`,
        runAfter: after('Set_varCallerSessions'),
      }),
      Set_varCallerOperators: {
        type: 'SetVariable',
        inputs: { name: 'varCallerOperators', value: "@coalesce(body('SP_Find_Caller_Operator')?['value'], createArray())" },
        runAfter: after('SP_Find_Caller_Operator'),
      },
    },
    else: { actions: {} },
    runAfter: after('Condition_Refuse_Unconfigured'),
  };
  const signedIn = `and(greater(length(${sessionRows}), 0), greater(length(${operatorRows}), 0))`;
  actions.Compose_Caller = compose({
    authenticated: `@or(${REQ('isAdmin')}, ${signedIn})`,
    via: `@if(${REQ('isAdmin')}, 'admin-key', if(${signedIn}, 'session', 'none'))`,
    email: `@if(${REQ('isAdmin')}, ${REQ('operatorEmail')}, toLower(string(coalesce(${session}?['Email'], ''))))`,
    name: `@if(${REQ('isAdmin')}, ${REQ('operatorName')}, string(coalesce(${operator}?['DisplayName'], ${session}?['DisplayName'], '')))`,
    role: `@if(${REQ('isAdmin')}, 'admin', if(${signedIn}, toLower(string(coalesce(${operator}?['Role'], 'operator'))), ''))`,
    sessionId: `@${session}?['Id']`,
    expiresAt: `@${session}?['TokenExpiresAt']`,
    /* The sign-in look-up itself failed (SharePoint throttled or unreachable): the session may
       well be valid, so the caller is told to try again (503), not to sign in again (401). */
    lookupFailed: "@contains(createArray('Failed', 'TimedOut'), string(actions('Condition_Check_Session')?['status']))",
  }, afterAny('Condition_Check_Session', 'Succeeded', 'Failed', 'TimedOut'));
  actions.Condition_Refuse_Unauthorised = guard(
    `and(not(${open}), not(${CALLER('authenticated')}))`,
    `@if(${CALLER('lookupFailed')}, 503, 401)`,
    envelope({ success: false, error: err(
      `@if(${CALLER('lookupFailed')}, 'SIGN_IN_CHECK_FAILED', 'SIGN_IN_REQUIRED')`,
      `@if(${CALLER('lookupFailed')}, 'The sign-in could not be checked just now (SharePoint did not answer). Nothing was done; try again in a moment.', 'Sign in first: the session is missing, has expired, was signed out, or its operator is no longer active.')`,
    ) }),
    after('Compose_Caller'),
  );

  const healthLists = [...(HEALTH_LISTS[key] || []), 'operatorsList', 'sessionsList'];
  const allCases = {
    Verify: {
      case: 'verify',
      actions: {
        Respond_Verify: response(200, {
          verified: true,
          flowIdentity: `@${CFG('flowIdentity')}`,
          environment: `@${CFG('environment')}`,
          contractVersion: `@${CFG('contractVersion')}`,
          correlationId: "@triggerBody()?['_platform']?['correlationId']",
          endpoint: { key: `@${CFG('endpointKey')}` },
        }),
      },
    },
    HealthCheck: {
      case: 'healthcheck',
      actions: {
        Condition_Health_Requires_ValidationOnly: guard(
          `not(${REQ('validationOnly')})`,
          400,
          envelope({ success: false, error: err('VALIDATION_ONLY_REQUIRED', 'healthCheck must be called with validationOnly:true.') }),
        ),
        SP_Health_Probe: spHttp({
          method: 'GET',
          uri: `@concat('_api/web/lists?$select=Title&$filter=', encodeUriComponent(concat(${healthLists.map((k) => `'Title eq ''', ${CFG(k)}, ''''`).join(", ' or ', ")})))`,
          runAfter: after('Condition_Health_Requires_ValidationOnly'),
        }),
        Respond_Health: response(200, envelope({
          success: true,
          validationOnly: true,
          data: {
            flowIdentity: `@${CFG('flowIdentity')}`,
            contractVersion: `@${CFG('contractVersion')}`,
            operatorKeyConfigured: `@${REQ('keyConfigured')}`,
            sharePointReachable: "@equals(actions('SP_Health_Probe')?['status'], 'Succeeded')",
            listsFound: "@coalesce(body('SP_Health_Probe')?['value'], createArray())",
            listsExpected: `@createArray(${healthLists.map((k) => CFG(k)).join(', ')})`,
            ...(key === 'MAIL_SEND' ? { sharedMailbox: `@${CFG('sharedMailbox')}`, allowedSuffixes: `@${CFG('allowedSuffixes')}` } : {}),
          },
        }), afterAny('SP_Health_Probe', 'Succeeded', 'Failed', 'TimedOut')),
      },
    },
    ...cases,
  };

  actions.Scope_Try = {
    type: 'Scope',
    runAfter: after('Condition_Refuse_Unauthorised'),
    actions: {
      Switch_Operation: {
        type: 'Switch',
        expression: `@${REQ('operation')}`,
        cases: allCases,
        default: {
          actions: {
            Respond_Unknown_Operation: response(400, envelope({
              success: false,
              error: err('UNKNOWN_OPERATION', `@concat('Unsupported operation ''', ${REQ('operation')}, '''. Supported: ', '${Object.values(allCases).map((c) => c.case).join(', ')}')`),
            })),
          },
        },
      },
    },
  };
  actions.Respond_Unhandled_Failure = response(500, envelope({
    success: false,
    error: err('FLOW_FAILED', "@concat('The flow failed before it could answer. Run id: ', workflow()?['run']?['name'])",
      "@string(result('Scope_Try'))"),
  }), afterAny('Scope_Try', 'Failed', 'TimedOut'));

  return {
    $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
    contentVersion: '1.0.0.0',
    description,
    parameters: {
      $authentication: { defaultValue: {}, type: 'SecureObject' },
      $connections: { defaultValue: {}, type: 'Object' },
    },
    triggers: {
      manual: {
        type: 'Request',
        kind: 'Http',
        ...(triggerRuntime ? { runtimeConfiguration: triggerRuntime } : {}),
        inputs: {
          triggerAuthenticationType: 'All',
          method: 'POST',
          schema: {
            type: 'object',
            properties: {
              operation: { type: 'string' },
              requestId: { type: 'string' },
              validationOnly: { type: 'boolean' },
              operatorKey: { type: 'string' },
              sessionToken: { type: 'string' },
              operator: { type: 'object', properties: { email: { type: 'string' }, name: { type: 'string' } } },
              payload: { type: 'object' },
              _platform: { type: 'object', properties: { operation: { type: 'string' }, correlationId: { type: 'string' } } },
            },
          },
        },
      },
    },
    actions: uniqueNames(actions),
    outputs: {},
  };
}

/* ------------------------------------------------------------------ *
 * DGO_MAIL_SEND
 * ------------------------------------------------------------------ */

function sendFlow() {
  const TO = `coalesce(${P('to')}, createArray())`;
  const CC = `coalesce(${P('cc')}, createArray())`;
  const BCC = `coalesce(${P('bcc')}, createArray())`;
  const ATT = `coalesce(${P('attachments')}, createArray())`;
  const MSG = (k) => `outputs('Compose_Message')?['${k}']`;

  const domainOf = "toLower(last(split(trim(string(item())), '@')))";
  const allowed = `or(contains(${CFG('allowedDomains')}, ${domainOf}), contains(${CFG('allowedSuffixes')}, join(skip(split(${domainOf}, '.'), max(0, sub(length(split(${domainOf}, '.')), 2))), '.')))`;
  const wellFormed = "and(equals(length(split(trim(string(item())), '@')), 2), greater(length(split(last(split(trim(string(item())), '@')), '.')), 1), not(contains(trim(string(item())), ' ')))";

  const errorCode = `if(empty(${MSG('to')}), 'NO_RECIPIENT', ` +
    `if(greater(length(${MSG('recipients')}), ${CFG('maxRecipients')}), 'TOO_MANY_RECIPIENTS', ` +
    `if(greater(length(body('Filter_Disallowed_Recipients')), 0), 'RECIPIENT_NOT_ALLOWED', ` +
    `if(empty(${MSG('subject')}), 'NO_SUBJECT', ` +
    `if(empty(${MSG('htmlBody')}), 'NO_BODY', ` +
    `if(greater(length(body('Filter_Malformed_Attachments')), 0), 'ATTACHMENT_MALFORMED', ` +
    `if(greater(length(string(${ATT})), ${CFG('maxAttachmentChars')}), 'ATTACHMENTS_TOO_LARGE', '')))))))`;

  const sendParams = (mailbox) => ({
    ...(mailbox ? { 'emailMessage/MailboxAddress': `@${CFG('sharedMailbox')}` } : {}),
    'emailMessage/To': `@join(${MSG('to')}, ';')`,
    'emailMessage/Subject': `@${MSG('subject')}`,
    'emailMessage/Body': `@concat(${MSG('htmlBody')}, string(${CFG('footerHtml')}))`,
    'emailMessage/Cc': `@join(${MSG('cc')}, ';')`,
    'emailMessage/Bcc': `@join(${MSG('bcc')}, ';')`,
    'emailMessage/Attachments': "@body('Select_Attachments')",
    'emailMessage/Importance': `@${MSG('importance')}`,
  });

  const sendAction = (mailbox) => ({
    type: 'OpenApiConnection',
    inputs: {
      host: { apiId: O365_API, connectionName: 'shared_office365', operationId: mailbox ? 'SharedMailboxSendEmailV2' : 'SendEmailV2' },
      parameters: sendParams(mailbox),
      authentication: AUTH,
    },
    runAfter: {},
  });

  const logItemUri = `@concat(${listItems('logList')}, '(', string(body('SP_Create_Log')?['Id']), ')')`;
  const mergeHeaders = { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' };

  /* Scope_Send ran (it is what failed), so its result is always readable. The two send steps
     inside it are not: one of them is always skipped, and reading a skipped step's output stops
     the run without an answer. The mail connector's own reason is in the run history. */
  const sendError = "coalesce(first(result('Scope_Send'))?['error']?['message'], 'The mail connector did not accept the message.')";

  const send = {
    case: 'send',
    actions: {
      Compose_Message: compose({
        messageId: `@trim(string(coalesce(${P('messageId')}, guid())))`,
        campaignId: `@string(coalesce(${P('campaignId')}, ''))`,
        recipientKey: `@string(coalesce(${P('recipientKey')}, ''))`,
        institution: `@string(coalesce(${P('institution')}, ''))`,
        addressee: `@string(coalesce(${P('addressee')}, ''))`,
        reference: `@string(coalesce(${P('reference')}, ''))`,
        to: `@${TO}`,
        cc: `@${CC}`,
        bcc: `@${BCC}`,
        recipients: `@union(${TO}, ${CC}, ${BCC})`,
        subject: `@trim(string(coalesce(${P('subject')}, '')))`,
        htmlBody: `@string(coalesce(${P('htmlBody')}, ''))`,
        importance: `@if(contains(createArray('Low', 'Normal', 'High'), string(${P('importance')})), string(${P('importance')}), 'Normal')`,
        attachmentCount: `@length(${ATT})`,
      }),
      Filter_Disallowed_Recipients: {
        type: 'Query',
        inputs: { from: `@${MSG('recipients')}`, where: `@not(and(${wellFormed}, ${allowed}))` },
        runAfter: after('Compose_Message'),
      },
      Filter_Malformed_Attachments: {
        type: 'Query',
        inputs: { from: `@${ATT}`, where: "@or(empty(string(coalesce(item()?['name'], ''))), empty(string(coalesce(item()?['contentBase64'], ''))))" },
        runAfter: after('Filter_Disallowed_Recipients'),
      },
      Compose_Error_Code: compose(`@${errorCode}`, after('Filter_Malformed_Attachments')),
      Condition_Refuse_Invalid: guard(
        "not(empty(outputs('Compose_Error_Code')))",
        "@if(equals(outputs('Compose_Error_Code'), 'ATTACHMENTS_TOO_LARGE'), 413, 400)",
        envelope({
          success: false,
          error: err("@outputs('Compose_Error_Code')", "@concat('The message was refused: ', outputs('Compose_Error_Code'))", {
            disallowedRecipients: "@body('Filter_Disallowed_Recipients')",
            allowedSuffixes: `@${CFG('allowedSuffixes')}`,
            maxRecipients: `@${CFG('maxRecipients')}`,
            maxAttachmentChars: `@${CFG('maxAttachmentChars')}`,
          }),
        }),
        after('Compose_Error_Code'),
      ),
      Condition_Stop_If_ValidationOnly: guard(
        REQ('validationOnly'),
        200,
        envelope({
          success: true,
          validationOnly: true,
          data: { messageId: `@${MSG('messageId')}`, wouldSendTo: `@${MSG('recipients')}`, attachmentCount: `@${MSG('attachmentCount')}` },
        }),
        after('Condition_Refuse_Invalid'),
      ),
      /* Every row for this messageId that is Sent, or still Sending. */
      SP_Find_Sent: spHttp({
        method: 'GET',
        uri: `@concat(${listItems('logList')}, '?$top=20&$orderby=Id%20desc&$filter=', encodeUriComponent(concat('Title eq ''', ${odata(MSG('messageId'))}, '''')))`,
        runAfter: after('Condition_Stop_If_ValidationOnly'),
      }),
      Filter_Already_Sent: {
        type: 'Query',
        inputs: { from: "@coalesce(body('SP_Find_Sent')?['value'], createArray())", where: "@equals(item()?['Status'], 'Sent')" },
        runAfter: after('SP_Find_Sent'),
      },
      Condition_Already_Sent: guard(
        "greater(length(body('Filter_Already_Sent')), 0)",
        200,
        envelope({
          success: true,
          data: {
            messageId: `@${MSG('messageId')}`,
            status: 'Sent',
            duplicate: true,
            sentAt: "@first(body('Filter_Already_Sent'))?['SentAt']",
            logItemId: "@first(body('Filter_Already_Sent'))?['Id']",
          },
        }),
        after('Filter_Already_Sent'),
      ),
      /* A row still Sending means another run for this message has started and not finished:
         a client that timed out and asked again. Sending again would deliver the letter twice,
         so it is refused until that run has answered or the row is older than inProgressMinutes. */
      Filter_In_Progress: {
        type: 'Query',
        inputs: {
          from: "@coalesce(body('SP_Find_Sent')?['value'], createArray())",
          where: `@and(equals(item()?['Status'], 'Sending'), greater(ticks(string(item()?['Created'])), ticks(addMinutes(utcNow(), mul(-1, int(${CFG('inProgressMinutes')}))))))`,
        },
        runAfter: after('Condition_Already_Sent'),
      },
      Condition_In_Progress: guard(
        "greater(length(body('Filter_In_Progress')), 0)",
        409,
        envelope({
          success: false,
          data: { messageId: `@${MSG('messageId')}`, status: 'Sending', logItemId: "@first(body('Filter_In_Progress'))?['Id']" },
          error: err('IN_PROGRESS', 'This message is already being sent by another request. Nothing was sent again; read the log for its outcome.'),
        }),
        after('Filter_In_Progress'),
      ),
      Select_Attachment_Names: {
        type: 'Select',
        inputs: { from: `@${ATT}`, select: "@string(item()?['name'])" },
        runAfter: after('Condition_In_Progress'),
      },
      Compose_Log_Item: compose({
        Title: `@${cap255(MSG('messageId'))}`,
        CampaignId: `@${cap255(MSG('campaignId'))}`,
        RecipientKey: `@${cap255(MSG('recipientKey'))}`,
        Institution: `@${cap255(MSG('institution'))}`,
        Addressee: `@${cap255(MSG('addressee'))}`,
        ToAddresses: `@join(${MSG('to')}, '; ')`,
        CcAddresses: `@join(${MSG('cc')}, '; ')`,
        BccAddresses: `@join(${MSG('bcc')}, '; ')`,
        Subject: `@${cap255(MSG('subject'))}`,
        Reference: `@${cap255(MSG('reference'))}`,
        AttachmentNames: "@join(body('Select_Attachment_Names'), '; ')",
        AttachmentCount: `@${MSG('attachmentCount')}`,
        Status: 'Sending',
        OperatorEmail: `@${cap255(CALLER('email'))}`,
        OperatorName: `@${cap255(CALLER('name'))}`,
        RequestId: `@${cap255(REQ('requestId'))}`,
        FlowRunId: "@workflow()?['run']?['name']",
      }, after('Select_Attachment_Names')),
      SP_Create_Log: spHttp({
        method: 'POST',
        uri: `@${listItems('logList')}`,
        body: "@string(outputs('Compose_Log_Item'))",
        runAfter: after('Compose_Log_Item'),
      }),
      /* The check above is a read, and the row is written after it: two runs for one message
         that arrive together could both pass it. So, once this run's row exists, the message's
         rows are read again in the order they were written. Only the run whose row is the first
         live claim (Sent, or Sending within inProgressMinutes) sends; any other marks its own
         row Duplicate and answers 409 IN_PROGRESS without touching the mailbox. */
      SP_Recheck_Claims: spHttp({
        method: 'GET',
        uri: `@concat(${listItems('logList')}, '?$top=20&$orderby=Id%20asc&$filter=', encodeUriComponent(concat('Title eq ''', ${odata(MSG('messageId'))}, '''')))`,
        runAfter: after('SP_Create_Log'),
      }),
      Filter_Live_Claims: {
        type: 'Query',
        inputs: {
          from: "@coalesce(body('SP_Recheck_Claims')?['value'], createArray())",
          where: `@or(equals(item()?['Id'], body('SP_Create_Log')?['Id']), equals(item()?['Status'], 'Sent'), and(equals(item()?['Status'], 'Sending'), greater(ticks(string(item()?['Created'])), ticks(addMinutes(utcNow(), mul(-1, int(${CFG('inProgressMinutes')})))))))`,
        },
        runAfter: after('SP_Recheck_Claims'),
      },
      Condition_Lost_Claim: {
        type: 'If',
        expression: { and: [{ equals: ["@equals(first(body('Filter_Live_Claims'))?['Id'], body('SP_Create_Log')?['Id'])", false] }] },
        actions: {
          Compose_Duplicate_Item: compose({ Status: 'Duplicate', ErrorMessage: 'Another request for this message was already sending it; this one sent nothing.' }),
          SP_Mark_Duplicate: spHttp({ method: 'POST', uri: logItemUri, headers: mergeHeaders, body: "@string(outputs('Compose_Duplicate_Item'))", runAfter: after('Compose_Duplicate_Item') }),
          Respond_Lost_Claim: response(409, envelope({
            success: false,
            data: { messageId: `@${MSG('messageId')}`, status: 'Sending', logItemId: "@first(body('Filter_Live_Claims'))?['Id']" },
            error: err('IN_PROGRESS', 'This message is already being sent by another request. Nothing was sent again; read the log for its outcome.'),
          }), after('SP_Mark_Duplicate')),
          Stop_Lost_Claim: terminate(after('Respond_Lost_Claim')),
        },
        else: { actions: {} },
        runAfter: after('Filter_Live_Claims'),
      },
      Select_Attachments: {
        type: 'Select',
        inputs: { from: `@${ATT}`, select: { Name: "@string(item()?['name'])", ContentBytes: "@item()?['contentBase64']" } },
        runAfter: after('Condition_Lost_Claim'),
      },
      Scope_Send: {
        type: 'Scope',
        runAfter: after('Select_Attachments'),
        actions: {
          Condition_Shared_Mailbox: {
            type: 'If',
            expression: { and: [{ equals: [`@empty(string(${CFG('sharedMailbox')}))`, false] }] },
            actions: { Send_From_Shared_Mailbox: sendAction(true) },
            else: { actions: { Send_As_Connection: sendAction(false) } },
            runAfter: {},
          },
        },
      },
      Compose_Sent_At: compose('@utcNow()', after('Scope_Send')),
      Compose_Sent_Item: compose({ Status: 'Sent', SentAt: "@outputs('Compose_Sent_At')" }, after('Compose_Sent_At')),
      SP_Mark_Sent: spHttp({
        method: 'POST',
        uri: logItemUri,
        headers: mergeHeaders,
        body: "@string(outputs('Compose_Sent_Item'))",
        runAfter: after('Compose_Sent_Item'),
      }),
      Respond_Sent: response(200, envelope({
        success: true,
        data: {
          messageId: `@${MSG('messageId')}`,
          status: 'Sent',
          duplicate: false,
          sentAt: "@outputs('Compose_Sent_At')",
          logItemId: "@body('SP_Create_Log')?['Id']",
          logUpdated: "@equals(actions('SP_Mark_Sent')?['status'], 'Succeeded')",
          to: `@${MSG('to')}`,
          attachmentCount: `@${MSG('attachmentCount')}`,
          sentFrom: `@if(empty(string(${CFG('sharedMailbox')})), 'connection-owner', ${CFG('sharedMailbox')})`,
        },
      }), afterAny('SP_Mark_Sent', 'Succeeded', 'Failed', 'TimedOut')),
      Compose_Send_Error: compose(`@${sendError}`, afterAny('Scope_Send', 'Failed', 'TimedOut')),
      Compose_Failed_Item: compose({
        Status: 'Failed',
        ErrorMessage: "@string(outputs('Compose_Send_Error'))",
      }, after('Compose_Send_Error')),
      SP_Mark_Failed: spHttp({
        method: 'POST',
        uri: logItemUri,
        headers: mergeHeaders,
        body: "@string(outputs('Compose_Failed_Item'))",
        runAfter: after('Compose_Failed_Item'),
      }),
      Respond_Send_Failed: response(502, envelope({
        success: false,
        data: { messageId: `@${MSG('messageId')}`, status: 'Failed', logItemId: "@body('SP_Create_Log')?['Id']" },
        error: err('SEND_FAILED', "@string(outputs('Compose_Send_Error'))"),
      }), afterAny('SP_Mark_Failed', 'Succeeded', 'Failed', 'TimedOut')),
    },
  };

  return skeleton({
    key: 'MAIL_SEND',
    identity: 'DGO_MAIL_SEND',
    description: 'DGO Correspondence Mailer: send one personalised message with attachments; refuses recipients outside the allowlist; idempotent on messageId; logs to DGOMailLog.',
    extraConfig: {
      /* Empty: mail goes out as the account that owns the Office 365 connection. Set to a
         shared mailbox address (e.g. the DGO office mailbox) that the connection's account
         holds Send As rights on, and every message is sent from it instead. */
      sharedMailbox: '',
      footerHtml: '',
      allowedSuffixes: [...MAILER.allowedSuffixes],
      allowedDomains: [...MAILER.allowedDomains],
      maxRecipients: MAILER.maxRecipients,
      maxAttachmentChars: MAILER.maxAttachmentChars,
      inProgressMinutes: MAILER.inProgressMinutes,
    },
    /* No trigger concurrency limit: Power Automate refuses to save a flow that limits trigger
       concurrency and answers with a Response action (InvalidConcurrencyConfiguration, seen on
       the tenant). Duplicate sends are stopped by the in-progress log row instead. */
    cases: { Send: send },
  });
}

/* ------------------------------------------------------------------ *
 * DGO_MAIL_LOG
 * ------------------------------------------------------------------ */

function logFlow() {
  const row = {
    messageId: "@item()?['Title']",
    campaignId: "@item()?['CampaignId']",
    recipientKey: "@item()?['RecipientKey']",
    institution: "@item()?['Institution']",
    addressee: "@item()?['Addressee']",
    to: "@item()?['ToAddresses']",
    cc: "@item()?['CcAddresses']",
    subject: "@item()?['Subject']",
    reference: "@item()?['Reference']",
    attachmentNames: "@item()?['AttachmentNames']",
    attachmentCount: "@item()?['AttachmentCount']",
    status: "@item()?['Status']",
    error: "@item()?['ErrorMessage']",
    operatorEmail: "@item()?['OperatorEmail']",
    operatorName: "@item()?['OperatorName']",
    sentAt: "@item()?['SentAt']",
    created: "@item()?['Created']",
    logItemId: "@item()?['Id']",
    flowRunId: "@item()?['FlowRunId']",
  };

  return skeleton({
    key: 'MAIL_LOG',
    identity: 'DGO_MAIL_LOG',
    description: 'DGO Correspondence Mailer: read the send log (DGOMailLog). Read-only.',
    cases: {
      List: {
        case: 'list',
        actions: {
          /* "since" is a date, never text pasted into the filter: it is re-formatted, and a value
             that is not a date stops here with 400 instead of reaching SharePoint. */
          Compose_Since: compose(`@formatDateTime(if(empty(string(coalesce(${P('since')}, ''))), '1900-01-01T00:00:00Z', string(${P('since')})), 'yyyy-MM-ddTHH:mm:ssZ')`),
          Condition_Since_Invalid: guard('equals(1, 1)', 400, envelope({ success: false, error: err('BAD_SINCE', 'payload.since must be a date and time, e.g. 2026-09-01T00:00:00Z.') }), afterAny('Compose_Since', 'Failed')),
          /* SharePoint is asked only for the newest rows (by Id, which is always indexed); the
             campaign, status, recipient and date filters are applied here. A filter on custom
             columns was refused by SharePoint on the tenant. */
          SP_Get_Log: spHttp({
            method: 'GET',
            uri: `@concat(${listItems('logList')}, '?$orderby=Id%20desc&$top=5000')`,
            runAfter: after('Compose_Since'),
          }),
          Filter_Log: {
            type: 'Query',
            inputs: {
              from: "@coalesce(body('SP_Get_Log')?['value'], createArray())",
              where: `@and(or(empty(string(coalesce(${P('campaignId')}, ''))), equals(string(item()?['CampaignId']), string(${P('campaignId')}))), or(empty(string(coalesce(${P('status')}, ''))), equals(string(item()?['Status']), string(${P('status')}))), or(empty(string(coalesce(${P('recipientKey')}, ''))), equals(string(item()?['RecipientKey']), string(${P('recipientKey')}))), greaterOrEquals(ticks(string(item()?['Created'])), ticks(outputs('Compose_Since'))))`,
            },
            runAfter: after('SP_Get_Log'),
          },
          Compose_Top: compose(`@min(1000, max(1, int(coalesce(${P('top')}, 200))))`, after('Filter_Log')),
          Select_Rows: { type: 'Select', inputs: { from: "@take(body('Filter_Log'), outputs('Compose_Top'))", select: row }, runAfter: after('Compose_Top') },
          Respond_List: response(200, envelope({ success: true, data: { items: "@body('Select_Rows')", count: "@length(body('Select_Rows'))" } }), after('Select_Rows')),
        },
      },
      Get: {
        case: 'get',
        actions: {
          SP_Get_Message: spHttp({
            method: 'GET',
            uri: `@concat(${listItems('logList')}, '?$top=5&$orderby=Id%20desc&$filter=', encodeUriComponent(concat('Title eq ''', ${odata(P('messageId'))}, '''')))`,
          }),
          Select_Message_Rows: { type: 'Select', inputs: { from: "@coalesce(body('SP_Get_Message')?['value'], createArray())", select: row }, runAfter: after('SP_Get_Message') },
          Condition_Not_Found: guard(
            "empty(body('Select_Message_Rows'))",
            404,
            envelope({ success: false, error: err('NOT_FOUND', 'No log entry carries that messageId.') }),
            after('Select_Message_Rows'),
          ),
          Respond_Get: response(200, envelope({ success: true, data: { item: "@first(body('Select_Message_Rows'))", history: "@body('Select_Message_Rows')" } }), after('Condition_Not_Found')),
        },
      },
    },
  });
}

/* ------------------------------------------------------------------ *
 * DGO_MAIL_DIRECTORY and DGO_MAIL_TEMPLATES — one shape, two lists
 * ------------------------------------------------------------------ */

function recordsFlow({ key, identity, listKey, description, recordName, fields }) {
  // fields: [ [payloadKey, Column, kind] ]  kind: 'text' | 'note' | 'bool' | 'num'
  const R = (k) => P(recordName, k);
  const select = ['Id', 'Title', 'Modified', 'Editor/Title', ...fields.map(([, c]) => c)].join(',');
  const row = { key: "@item()?['Title']", id: "@item()?['Id']", modified: "@item()?['Modified']", modifiedBy: "@item()?['Editor']?['Title']" };
  for (const [k, c] of fields) row[k] = `@item()?['${c}']`;

  const itemBody = { Title: `@${cap255(`trim(string(${R('key')}))`)}` };
  for (const [k, c, kind] of fields) {
    if (kind === 'bool') itemBody[c] = `@if(equals(${R(k)}, false), false, true)`;
    else if (kind === 'num') itemBody[c] = `@int(coalesce(${R(k)}, 0))`;
    else if (kind === 'note') itemBody[c] = `@string(coalesce(${R(k)}, ''))`;
    /* A list column arrives as an array of strings (the mailer always sends one) and is
       stored semicolon-separated, the form Outlook itself accepts. */
    else if (kind === 'list') itemBody[c] = `@join(coalesce(${R(k)}, createArray()), '; ')`;
    else if (kind === 'caller') itemBody[c] = `@${cap255(CALLER('email'))}`;
    else itemBody[c] = `@${cap255(`coalesce(${R(k)}, '')`)}`;
  }

  const findUri = `@concat(${listItems(listKey)}, '?$select=Id,Title&$top=1&$filter=', encodeUriComponent(concat('Title eq ''', ${odata(`trim(string(${R('key')}))`)}, '''')))`;
  const itemUriFor = (find) => `@concat(${listItems(listKey)}, '(', string(first(body('${find}')?['value'])?['Id']), ')')`;
  const existsFor = (find) => `greater(length(coalesce(body('${find}')?['value'], createArray())), 0)`;
  const itemUri = itemUriFor('SP_Find_Record');
  const exists = existsFor('SP_Find_Record');
  const keyMissing = `empty(trim(string(coalesce(${R('key')}, ''))))`;

  return skeleton({
    key,
    identity,
    description,
    cases: {
      List: {
        case: 'list',
        actions: {
          SP_List_Records: spHttp({
            method: 'GET',
            uri: `@concat(${listItems(listKey)}, '?$select=${select}&$expand=Editor&$top=2000&$orderby=Title')`,
          }),
          Select_Records: { type: 'Select', inputs: { from: "@coalesce(body('SP_List_Records')?['value'], createArray())", select: row }, runAfter: after('SP_List_Records') },
          Respond_List: response(200, envelope({ success: true, data: { items: "@body('Select_Records')", count: "@length(body('Select_Records'))" } }), after('Select_Records')),
        },
      },
      Upsert: {
        case: 'upsert',
        actions: {
          Condition_Key_Required: guard(keyMissing, 400, envelope({ success: false, error: err('KEY_REQUIRED', `payload.${recordName}.key is required.`) })),
          SP_Find_Record: spHttp({ method: 'GET', uri: findUri, runAfter: after('Condition_Key_Required') }),
          Compose_Item: compose(itemBody, after('SP_Find_Record')),
          Condition_Stop_If_ValidationOnly: guard(REQ('validationOnly'), 200, envelope({
            success: true, validationOnly: true, data: { key: `@trim(string(${R('key')}))`, wouldCreate: `@not(${exists})`, item: "@outputs('Compose_Item')" },
          }), after('Compose_Item')),
          /* Each branch answers for itself, reading only the step that ran in it: reading the
             output of the skipped branch's step stops the run without an answer. */
          Condition_Exists: {
            type: 'If',
            expression: { and: [{ equals: [`@${exists}`, true] }] },
            actions: {
              SP_Update_Record: spHttp({ method: 'POST', uri: itemUri, headers: { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }, body: "@string(outputs('Compose_Item'))" }),
              Respond_Upsert_Updated: response(200, envelope({
                success: true,
                data: { key: `@trim(string(${R('key')}))`, created: false, id: "@first(body('SP_Find_Record')?['value'])?['Id']" },
              }), after('SP_Update_Record')),
            },
            else: {
              actions: {
                SP_Create_Record: spHttp({ method: 'POST', uri: `@${listItems(listKey)}`, body: "@string(outputs('Compose_Item'))" }),
                Respond_Upsert_Created: response(200, envelope({
                  success: true,
                  data: { key: `@trim(string(${R('key')}))`, created: true, id: "@body('SP_Create_Record')?['Id']" },
                }), after('SP_Create_Record')),
              },
            },
            runAfter: after('Condition_Stop_If_ValidationOnly'),
          },
        },
      },
      Delete: {
        case: 'delete',
        actions: {
          Condition_Delete_Key_Required: guard(keyMissing, 400, envelope({ success: false, error: err('KEY_REQUIRED', `payload.${recordName}.key is required.`) })),
          SP_Find_Record_To_Delete: spHttp({ method: 'GET', uri: findUri, runAfter: after('Condition_Delete_Key_Required') }),
          Condition_Delete_Not_Found: guard(`not(${existsFor('SP_Find_Record_To_Delete')})`, 404, envelope({ success: false, error: err('NOT_FOUND', 'No record carries that key.') }), after('SP_Find_Record_To_Delete')),
          Condition_Delete_ValidationOnly: guard(REQ('validationOnly'), 200, envelope({ success: true, validationOnly: true, data: { key: `@trim(string(${R('key')}))`, wouldDelete: true } }), after('Condition_Delete_Not_Found')),
          SP_Delete_Record: spHttp({ method: 'POST', uri: itemUriFor('SP_Find_Record_To_Delete'), headers: { 'IF-MATCH': '*', 'X-HTTP-Method': 'DELETE' }, runAfter: after('Condition_Delete_ValidationOnly') }),
          Respond_Delete: response(200, envelope({ success: true, data: { key: `@trim(string(${R('key')}))`, deleted: true } }), after('SP_Delete_Record')),
        },
      },
    },
  });
}

const directoryFlow = () => recordsFlow({
  key: 'MAIL_DIRECTORY',
  identity: 'DGO_MAIL_DIRECTORY',
  listKey: 'directoryList',
  recordName: 'record',
  description: 'DGO Correspondence Mailer: the shared addressee directory (DGOMailDirectory) - list, upsert, delete.',
  fields: [
    ['institution', 'Institution', 'text'], ['addressee', 'Addressee', 'text'], ['email', 'Email', 'text'],
    ['cc', 'CcEmails', 'list'], ['website', 'Website', 'text'], ['verification', 'Verification', 'text'],
    ['salutation', 'Salutation', 'text'], ['category', 'Category', 'text'], ['active', 'Active', 'bool'],
    ['notes', 'Notes', 'note'], ['sortOrder', 'SortOrder', 'num'],
  ],
});

const templatesFlow = () => recordsFlow({
  key: 'MAIL_TEMPLATES',
  identity: 'DGO_MAIL_TEMPLATES',
  listKey: 'templatesList',
  recordName: 'template',
  description: 'DGO Correspondence Mailer: the shared letter templates (DGOMailTemplates) - list, upsert, delete.',
  fields: [
    ['name', 'TemplateName', 'text'], ['subject', 'Subject', 'text'], ['bodyHtml', 'BodyHtml', 'note'],
    ['description', 'Description', 'note'], ['updatedBy', 'UpdatedBy', 'caller'],
  ],
});

/* ------------------------------------------------------------------ *
 * DGO_MAIL_PROVISION
 * ------------------------------------------------------------------ */

function provisionFlow() {
  const L = (k) => `items('Apply_to_each_List')?['${k}']`;
  const listTitleFilter = `encodeUriComponent(concat('Title eq ''', ${L('title')}, ''''))`;
  const created = "equals(actions('SP_Create_List')?['status'], 'Succeeded')";

  const provision = {
    case: 'provision',
    actions: {
      Apply_to_each_List: {
        type: 'Foreach',
        foreach: `@${CFG('lists')}`,
        runtimeConfiguration: { concurrency: { repetitions: 1 } },
        actions: {
          SP_Find_List: spHttp({ method: 'GET', uri: `@concat('_api/web/lists?$select=Title,Id&$filter=', ${listTitleFilter})` }),
          Compose_List_Body: compose({
            __metadata: { type: 'SP.List' },
            AllowContentTypes: true,
            BaseTemplate: `@coalesce(${L('template')}, 100)`,
            ContentTypesEnabled: false,
            Title: `@${L('title')}`,
            Description: `@${L('description')}`,
          }, after('SP_Find_List')),
          Condition_Create_List: {
            type: 'If',
            expression: { and: [
              { equals: ["@empty(coalesce(body('SP_Find_List')?['value'], createArray()))", true] },
              { equals: [`@${REQ('validationOnly')}`, false] },
            ] },
            actions: {
              SP_Create_List: spHttp({
                method: 'POST',
                uri: '_api/web/lists',
                verbose: true,
                body: "@string(outputs('Compose_List_Body'))",
              }),
            },
            else: { actions: {} },
            runAfter: after('Compose_List_Body'),
          },
          /* Columns and permissions are read only from a list that exists (or was just created):
             in a plan run a new list does not exist yet, and a failed read inside this loop would
             fail the whole loop even though the next step carries on, so the plan would never be
             answered. Both are carried out of the branch in variables. */
          Set_varExistingFields_Empty: {
            type: 'SetVariable',
            inputs: { name: 'varExistingFields', value: [] },
            runAfter: after('Condition_Create_List'),
          },
          Set_varListPrivate_False: {
            type: 'SetVariable',
            inputs: { name: 'varListPrivate', value: false },
            runAfter: after('Set_varExistingFields_Empty'),
          },
          Set_varListIndexed_False: {
            type: 'SetVariable',
            inputs: { name: 'varListIndexed', value: false },
            runAfter: after('Set_varListPrivate_False'),
          },
          Condition_List_Present: {
            type: 'If',
            expression: { or: [
              { equals: ["@empty(coalesce(body('SP_Find_List')?['value'], createArray()))", false] },
              { equals: [`@${created}`, true] },
            ] },
            actions: {
              SP_Get_Fields: spHttp({
                method: 'GET',
                uri: `@concat('_api/web/lists/GetByTitle(''', ${L('title')}, ''')/fields?$select=InternalName&$filter=Hidden eq false')`,
              }),
              Select_Existing_Fields: {
                type: 'Select',
                inputs: { from: "@coalesce(body('SP_Get_Fields')?['value'], createArray())", select: "@item()?['InternalName']" },
                runAfter: after('SP_Get_Fields'),
              },
              Set_varExistingFields: {
                type: 'SetVariable',
                inputs: { name: 'varExistingFields', value: "@body('Select_Existing_Fields')" },
                runAfter: after('Select_Existing_Fields'),
              },
              /* A private list (sign-in sessions, operators, the send log, mailings, templates)
                 stops inheriting the site's permissions, keeping only the flow owner (the account
                 that breaks inheritance keeps Full Control). Checked on EVERY run, not only when
                 the list is created, so a list created earlier, or by a run that failed half-way,
                 is still made private; a list that cannot be made private fails the provisioning. */
              SP_Get_List_Permissions: spHttp({
                method: 'GET',
                uri: `@concat('_api/web/lists/GetByTitle(''', ${L('title')}, ''')?$select=HasUniqueRoleAssignments')`,
                runAfter: after('Set_varExistingFields'),
              }),
              Condition_Make_Private: {
                type: 'If',
                expression: { and: [
                  { equals: [`@equals(${L('private')}, true)`, true] },
                  { equals: [`@${REQ('validationOnly')}`, false] },
                  { equals: ["@equals(body('SP_Get_List_Permissions')?['HasUniqueRoleAssignments'], true)", false] },
                ] },
                actions: {
                  SP_Make_List_Private: spHttp({
                    method: 'POST',
                    uri: `@concat('_api/web/lists/GetByTitle(''', ${L('title')}, ''')/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)')`,
                    verbose: true,
                  }),
                },
                else: { actions: {} },
                runAfter: after('SP_Get_List_Permissions'),
              },
              Set_varListPrivate: {
                type: 'SetVariable',
                inputs: { name: 'varListPrivate', value: "@or(equals(body('SP_Get_List_Permissions')?['HasUniqueRoleAssignments'], true), equals(actions('SP_Make_List_Private')?['status'], 'Succeeded'))" },
                runAfter: after('Condition_Make_Private'),
              },
              /* Every look-up is by Title, and reports are listed by Created. Past 5,000 rows
                 SharePoint refuses a filter or sort on a column that is not indexed, so both are
                 indexed on every list (sign-in, sending and the log would otherwise stop). */
              SP_Get_Index_Fields: spHttp({
                method: 'GET',
                uri: `@concat('_api/web/lists/GetByTitle(''', ${L('title')}, ''')/fields?$select=InternalName,Indexed&$filter=', encodeUriComponent('InternalName eq ''Title'' or InternalName eq ''Created'''))`,
                runAfter: after('Set_varListPrivate'),
              }),
              Filter_Unindexed_Fields: {
                type: 'Query',
                inputs: { from: "@coalesce(body('SP_Get_Index_Fields')?['value'], createArray())", where: "@not(equals(item()?['Indexed'], true))" },
                runAfter: after('SP_Get_Index_Fields'),
              },
              Condition_Index_Fields: {
                type: 'If',
                expression: { and: [{ equals: [`@${REQ('validationOnly')}`, false] }] },
                actions: {
                  Apply_to_each_Index_Field: {
                    type: 'Foreach',
                    foreach: "@body('Filter_Unindexed_Fields')",
                    runtimeConfiguration: { concurrency: { repetitions: 1 } },
                    actions: {
                      SP_Index_Field: spHttp({
                        method: 'POST',
                        uri: `@concat('_api/web/lists/GetByTitle(''', ${L('title')}, ''')/fields/getbyinternalnameortitle(''', items('Apply_to_each_Index_Field')?['InternalName'], ''')')`,
                        headers: { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' },
                        verbose: true,
                        body: '{"__metadata":{"type":"SP.Field"},"Indexed":true}',
                      }),
                    },
                  },
                },
                else: { actions: {} },
                runAfter: after('Filter_Unindexed_Fields'),
              },
              Set_varListIndexed: {
                type: 'SetVariable',
                inputs: { name: 'varListIndexed', value: `@or(empty(body('Filter_Unindexed_Fields')), not(${REQ('validationOnly')}))` },
                runAfter: after('Condition_Index_Fields'),
              },
            },
            else: { actions: {} },
            runAfter: after('Set_varListIndexed_False'),
          },
          Filter_Missing_Fields: {
            type: 'Query',
            inputs: { from: `@${L('fields')}`, where: "@not(contains(variables('varExistingFields'), item()?['name']))" },
            runAfter: after('Condition_List_Present'),
          },
          Condition_Create_Fields: {
            type: 'If',
            expression: { and: [{ equals: [`@${REQ('validationOnly')}`, false] }] },
            actions: {
              Apply_to_each_Field: {
                type: 'Foreach',
                foreach: "@body('Filter_Missing_Fields')",
                runtimeConfiguration: { concurrency: { repetitions: 1 } },
                actions: {
                  Compose_Field_Body: compose({
                    parameters: {
                      __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' },
                      SchemaXml: "@items('Apply_to_each_Field')?['xml']",
                      /* 8 = use the Name as the internal name; 16 = add to the default view. */
                      Options: 24,
                    },
                  }),
                  SP_Create_Field: spHttp({
                    method: 'POST',
                    uri: `@concat('_api/web/lists/GetByTitle(''', ${L('title')}, ''')/fields/CreateFieldAsXml')`,
                    verbose: true,
                    body: "@string(outputs('Compose_Field_Body'))",
                    runAfter: after('Compose_Field_Body'),
                  }),
                },
              },
            },
            else: { actions: {} },
            runAfter: after('Filter_Missing_Fields'),
          },
          Append_Report: {
            type: 'AppendToArrayVariable',
            inputs: {
              name: 'varReport',
              value: {
                list: `@${L('title')}`,
                existed: "@not(empty(coalesce(body('SP_Find_List')?['value'], createArray())))",
                created: `@${created}`,
                missingFields: "@body('Filter_Missing_Fields')",
                private: `@equals(${L('private')}, true)`,
                isPrivate: "@variables('varListPrivate')",
                indexed: "@variables('varListIndexed')",
                fieldsCreated: `@if(${REQ('validationOnly')}, 0, length(body('Filter_Missing_Fields')))`,
              },
            },
            runAfter: after('Condition_Create_Fields'),
          },
        },
      },
      Respond_Provision: response(200, envelope({
        success: true,
        validationOnly: `@${REQ('validationOnly')}`,
        data: { mode: `@if(${REQ('validationOnly')}, 'plan', 'provision')`, siteUrl: `@${CFG('siteUrl')}`, lists: "@variables('varReport')" },
      }), after('Apply_to_each_List')),
    },
  };

  return skeleton({
    key: 'MAIL_PROVISION',
    identity: 'DGO_MAIL_PROVISION',
    description: `DGO Correspondence Mailer: create the ${LIST_SCHEMA.map((l) => l.title).join(', ')} lists and library and their columns. Idempotent; validationOnly:true reports the plan and writes nothing.`,
    extraConfig: {
      lists: LIST_SCHEMA.map((l) => ({ title: l.title, description: l.description, template: l.template || 100, private: l.private === true, fields: l.fields.map((f) => ({ name: f.name, xml: f.xml })) })),
    },
    preActions: {
      Initialize_varReport: { type: 'InitializeVariable', inputs: { variables: [{ name: 'varReport', type: 'array', value: [] }] } },
      Initialize_varExistingFields: { type: 'InitializeVariable', inputs: { variables: [{ name: 'varExistingFields', type: 'array', value: [] }] } },
      Initialize_varListPrivate: { type: 'InitializeVariable', inputs: { variables: [{ name: 'varListPrivate', type: 'boolean', value: false }] } },
      Initialize_varListIndexed: { type: 'InitializeVariable', inputs: { variables: [{ name: 'varListIndexed', type: 'boolean', value: false }] } },
    },
    cases: { Provision: provision },
  });
}

/* ------------------------------------------------------------------ *
 * DGO_MAIL_AUTH — sign in with a code mailed to the operator
 * ------------------------------------------------------------------ */

/* Power Automate has no hash or HMAC function, so a proof cannot be signed and checked
   statelessly. Codes and session tokens are random values kept in DGOMailSessions — a list
   that provisioning makes private to the flow owner — and every flow looks the token up on
   every call. That is also what makes sign-out, expiry and switching an operator off
   immediate. */
function authFlow() {
  const EMAIL = `toLower(trim(string(coalesce(${P('email')}, ''))))`;
  const randomId = "concat(replace(guid(), '-', ''), replace(guid(), '-', ''))";
  const itemUri = (listKey, idExpr) => `@concat(${listItems(listKey)}, '(', string(${idExpr}), ')')`;
  const merge = { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' };
  const CH = (k) => `outputs('Compose_Challenge')?['${k}']`;
  const ROW = (k) => `outputs('Compose_Challenge_Row')?['${k}']`;
  const RATE = (k) => `outputs('Compose_Rate_Row')?['${k}']`;
  const TOK = (k) => `outputs('Compose_Token')?['${k}']`;
  /** This try's number: the stored count, read fresh with the row's ETag, plus one. */
  const ATTEMPT = "add(int(coalesce(body('SP_Read_Challenge_Version')?['d']?['Attempts'], 0)), 1)";
  const requireAdmin = (name, runAfter) => ({
    [name]: guard(`not(equals(${CALLER('role')}, 'admin'))`, 403, envelope({ success: false, error: err('FORBIDDEN', 'Only a mailer admin can manage operators.') }), runAfter),
  });

  const codeEmail = {
    type: 'OpenApiConnection',
    inputs: {
      host: { apiId: O365_API, connectionName: 'shared_office365', operationId: 'SendEmailV2' },
      parameters: {
        'emailMessage/To': `@${CH('email')}`,
        /* The code is in the body only: a subject line shows on a locked screen and in every inbox list. */
        'emailMessage/Subject': 'Your DGO Correspondence Mailer sign-in code',
        'emailMessage/Body': templateExpression(SIGN_IN_CODE_HTML, {
          code: CH('code'), codeMinutes: `string(${CFG('codeMinutes')})`, email: CH('email'), year: "formatDateTime(utcNow(), 'yyyy')",
        }),
        'emailMessage/Importance': 'High',
      },
      authentication: AUTH,
    },
    runAfter: after('SP_Create_Challenge'),
  };

  const requestCode = {
    case: 'requestcode',
    actions: {
      Compose_Challenge: compose({
        email: `@${EMAIL}`,
        challengeId: `@${randomId}`,
        code: '@string(rand(10000000, 100000000))',
        expiresAt: `@addMinutes(utcNow(), int(${CFG('codeMinutes')}))`,
      }),
      SP_Find_Requesting_Operator: spHttp({
        method: 'GET',
        uri: `@concat(${listItems('operatorsList')}, '?$select=Title,DisplayName&$top=1&$filter=', encodeUriComponent(concat('Title eq ''', ${odata(CH('email'))}, ''' and Active eq 1')))`,
        runAfter: after('Compose_Challenge'),
      }),
      /* Unknown addresses get the same answer as known ones, so the list of operators cannot be
         discovered by guessing; only a real operator receives a code. */
      Condition_Known_Operator: {
        type: 'If',
        expression: { and: [
          { equals: ["@greater(length(coalesce(body('SP_Find_Requesting_Operator')?['value'], createArray())), 0)", true] },
          { equals: [`@${REQ('validationOnly')}`, false] },
        ] },
        actions: {
          /* One counter row per operator address (Title "rate:<address>", a Title look-up): how
             many codes were mailed in the current window, and when the window ends. */
          SP_Find_Rate: spHttp({
            method: 'GET',
            uri: `@concat(${listItems('sessionsList')}, '?$top=1&$filter=', encodeUriComponent(concat('Title eq ''', ${odata(`concat('rate:', ${CH('email')})`)}, '''')))`,
          }),
          Compose_Rate_Row: compose("@coalesce(first(coalesce(body('SP_Find_Rate')?['value'], createArray())), json('{}'))", after('SP_Find_Rate')),
          Compose_Rate: compose({
            open: `@less(ticks(utcNow()), ticks(string(coalesce(${RATE('CodeExpiresAt')}, '1900-01-01T00:00:00Z'))))`,
            count: `@if(less(ticks(utcNow()), ticks(string(coalesce(${RATE('CodeExpiresAt')}, '1900-01-01T00:00:00Z')))), int(coalesce(${RATE('Attempts')}, 0)), 0)`,
          }, after('Compose_Rate_Row')),
          Condition_Rate_Allows: {
            type: 'If',
            expression: { and: [{ equals: [`@less(outputs('Compose_Rate')?['count'], int(${CFG('codesPerWindow')}))`, true] }] },
            actions: {
              Compose_Challenge_Item: compose({
                Title: `@${CH('challengeId')}`,
                Email: `@${CH('email')}`,
                DisplayName: `@${cap255("coalesce(first(body('SP_Find_Requesting_Operator')?['value'])?['DisplayName'], '')")}`,
                Code: `@${CH('code')}`,
                CodeExpiresAt: `@${CH('expiresAt')}`,
                Attempts: 0,
                Status: 'Pending',
              }),
              SP_Create_Challenge: spHttp({ method: 'POST', uri: `@${listItems('sessionsList')}`, body: "@string(outputs('Compose_Challenge_Item'))", runAfter: after('Compose_Challenge_Item') }),
              Send_Code: codeEmail,
              Condition_Rate_Row_Exists: {
                type: 'If',
                expression: { and: [{ equals: [`@empty(string(coalesce(${RATE('Id')}, '')))`, false] }] },
                actions: {
                  Compose_Rate_Update: compose({
                    Attempts: "@add(outputs('Compose_Rate')?['count'], 1)",
                    CodeExpiresAt: `@if(outputs('Compose_Rate')?['open'], ${RATE('CodeExpiresAt')}, addMinutes(utcNow(), int(${CFG('codeWindowMinutes')})))`,
                  }),
                  SP_Update_Rate: spHttp({ method: 'POST', uri: itemUri('sessionsList', RATE('Id')), headers: merge, body: "@string(outputs('Compose_Rate_Update'))", runAfter: after('Compose_Rate_Update') }),
                },
                else: {
                  actions: {
                    Compose_Rate_Item: compose({
                      Title: `@${cap255(`concat('rate:', ${CH('email')})`)}`,
                      Email: `@${CH('email')}`,
                      Attempts: 1,
                      CodeExpiresAt: `@addMinutes(utcNow(), int(${CFG('codeWindowMinutes')}))`,
                      Status: 'RateLimit',
                    }),
                    SP_Create_Rate: spHttp({ method: 'POST', uri: `@${listItems('sessionsList')}`, body: "@string(outputs('Compose_Rate_Item'))", runAfter: after('Compose_Rate_Item') }),
                  },
                },
                runAfter: after('Send_Code'),
              },
            },
            else: { actions: {} },
            runAfter: after('Compose_Rate'),
          },
        },
        else: { actions: {} },
        runAfter: after('SP_Find_Requesting_Operator'),
      },
      Respond_Code_Requested: response(200, envelope({
        success: true,
        validationOnly: `@${REQ('validationOnly')}`,
        data: {
          challengeId: `@${CH('challengeId')}`,
          expiresAt: `@${CH('expiresAt')}`,
          message: 'If this address belongs to a mailer operator, a sign-in code has been mailed to it.',
        },
      }), after('Condition_Known_Operator')),
      /* After answering: the 50 oldest sign-in rows are read and those no longer usable (an
         expired or locked code, a signed-out or expired session) are deleted, so the list does not
         grow with every code ever requested. */
      Condition_Cleanup_Sessions: {
        type: 'If',
        expression: { and: [{ equals: [`@${REQ('validationOnly')}`, false] }] },
        actions: {
          SP_Read_Oldest_Sessions: spHttp({ method: 'GET', uri: `@concat(${listItems('sessionsList')}, '?$orderby=Id%20asc&$top=50')` }),
          Filter_Expired_Sessions: {
            type: 'Query',
            inputs: {
              from: "@coalesce(body('SP_Read_Oldest_Sessions')?['value'], createArray())",
              where: "@or(equals(item()?['Status'], 'Revoked'), and(equals(item()?['Status'], 'RateLimit'), less(ticks(string(coalesce(item()?['CodeExpiresAt'], '1900-01-01T00:00:00Z'))), ticks(utcNow()))), and(contains(createArray('Pending', 'Locked'), string(item()?['Status'])), less(ticks(string(coalesce(item()?['CodeExpiresAt'], '1900-01-01T00:00:00Z'))), ticks(utcNow()))), and(equals(item()?['Status'], 'Active'), less(ticks(string(coalesce(item()?['TokenExpiresAt'], '1900-01-01T00:00:00Z'))), ticks(utcNow()))))",
            },
            runAfter: after('SP_Read_Oldest_Sessions'),
          },
          Apply_to_each_Expired_Session: {
            type: 'Foreach',
            foreach: "@body('Filter_Expired_Sessions')",
            runtimeConfiguration: { concurrency: { repetitions: 1 } },
            actions: {
              SP_Delete_Expired_Session: spHttp({ method: 'POST', uri: `@concat(${listItems('sessionsList')}, '(', string(items('Apply_to_each_Expired_Session')?['Id']), ')')`, headers: { 'IF-MATCH': '*', 'X-HTTP-Method': 'DELETE' } }),
            },
            runAfter: after('Filter_Expired_Sessions'),
          },
        },
        else: { actions: {} },
        runAfter: after('Respond_Code_Requested'),
      },
    },
  };

  const verifyCode = {
    case: 'verifycode',
    actions: {
      SP_Find_Challenge: spHttp({
        method: 'GET',
        uri: `@concat(${listItems('sessionsList')}, '?$top=1&$filter=', encodeUriComponent(concat('Title eq ''', ${odata(`trim(string(coalesce(${P('challengeId')}, '')))`)}, '''')))`,
      }),
      Compose_Challenge_Row: compose("@coalesce(first(coalesce(body('SP_Find_Challenge')?['value'], createArray())), json('{}'))", after('SP_Find_Challenge')),
      Condition_Challenge_Unusable: guard(
        `or(empty(string(coalesce(${ROW('Id')}, ''))), not(equals(string(${ROW('Status')}), 'Pending')), less(ticks(string(coalesce(${ROW('CodeExpiresAt')}, '1900-01-01T00:00:00Z'))), ticks(utcNow())), greaterOrEquals(int(coalesce(${ROW('Attempts')}, 0)), int(${CFG('maxCodeAttempts')})))`,
        401,
        envelope({ success: false, error: err('CODE_EXPIRED', 'This code has expired, was already used, or had too many wrong tries. Ask for a new code.') }),
        after('Compose_Challenge_Row'),
      ),
      /* Every try is counted BEFORE the code is compared, and the count is written with the
         row's own ETag. Of many tries sent at once only one can write each count; the rest are
         refused unchecked (TRY_AGAIN), so no more than maxCodeAttempts codes are ever compared. */
      SP_Read_Challenge_Version: spHttp({
        method: 'GET',
        uri: `@concat(${listItems('sessionsList')}, '(', string(${ROW('Id')}), ')')`,
        verbose: true,
        runAfter: after('Condition_Challenge_Unusable'),
      }),
      Compose_Attempt_Item: compose({
        Attempts: `@${ATTEMPT}`,
        Status: `@if(greaterOrEquals(${ATTEMPT}, int(${CFG('maxCodeAttempts')})), 'Locked', 'Pending')`,
      }, after('SP_Read_Challenge_Version')),
      SP_Count_Attempt: spHttp({
        method: 'POST',
        uri: itemUri('sessionsList', ROW('Id')),
        headers: { 'IF-MATCH': "@string(body('SP_Read_Challenge_Version')?['d']?['__metadata']?['etag'])", 'X-HTTP-Method': 'MERGE' },
        body: "@string(outputs('Compose_Attempt_Item'))",
        runAfter: after('Compose_Attempt_Item'),
      }),
      Condition_Attempt_Not_Counted: guard(
        "not(equals(actions('SP_Count_Attempt')?['status'], 'Succeeded'))",
        429,
        envelope({ success: false, error: err('TRY_AGAIN', 'Another try with this code is being checked. Wait a moment, then enter the code again.') }),
        afterAny('SP_Count_Attempt', 'Succeeded', 'Failed', 'TimedOut'),
      ),
      Condition_Too_Many_Attempts: guard(
        `greater(${ATTEMPT}, int(${CFG('maxCodeAttempts')}))`,
        401,
        envelope({ success: false, error: err('CODE_EXPIRED', 'This code has expired, was already used, or had too many wrong tries. Ask for a new code.') }),
        after('Condition_Attempt_Not_Counted'),
      ),
      Condition_Code_Wrong: {
        type: 'If',
        expression: { and: [{ equals: [`@equals(trim(string(coalesce(${P('code')}, ''))), string(${ROW('Code')}))`, false] }] },
        actions: {
          Respond_Code_Wrong: response(401, envelope({
            success: false,
            error: err('CODE_INVALID', `@concat('That code is not right. ', string(max(0, sub(int(${CFG('maxCodeAttempts')}), ${ATTEMPT}))), ' try(s) left for this code.')`),
          })),
          Stop_Code_Wrong: terminate(after('Respond_Code_Wrong')),
        },
        else: { actions: {} },
        runAfter: after('Condition_Too_Many_Attempts'),
      },
      Compose_Token: compose({ token: `@${randomId}`, expiresAt: `@addHours(utcNow(), int(${CFG('sessionHours')}))` }, after('Condition_Code_Wrong')),
      Compose_Active_Item: compose({ Title: `@${TOK('token')}`, Status: 'Active', Token: `@${TOK('token')}`, TokenExpiresAt: `@${TOK('expiresAt')}`, Code: '' }, after('Compose_Token')),
      SP_Activate_Session: spHttp({ method: 'POST', uri: itemUri('sessionsList', ROW('Id')), headers: merge, body: "@string(outputs('Compose_Active_Item'))", runAfter: after('Compose_Active_Item') }),
      Respond_Signed_In: response(200, envelope({
        success: true,
        data: { token: `@${TOK('token')}`, expiresAt: `@${TOK('expiresAt')}`, email: `@toLower(string(${ROW('Email')}))`, name: `@string(coalesce(${ROW('DisplayName')}, ''))` },
      }), after('SP_Activate_Session')),
    },
  };

  const signOut = {
    case: 'signout',
    actions: {
      Condition_Has_Session: {
        type: 'If',
        expression: { and: [{ equals: [`@empty(string(coalesce(${CALLER('sessionId')}, '')))`, false] }] },
        actions: {
          Compose_Revoked_Item: compose({ Status: 'Revoked' }),
          SP_Revoke_Session: spHttp({ method: 'POST', uri: itemUri('sessionsList', CALLER('sessionId')), headers: merge, body: "@string(outputs('Compose_Revoked_Item'))", runAfter: after('Compose_Revoked_Item') }),
        },
        else: { actions: {} },
      },
      Respond_Signed_Out: response(200, envelope({ success: true, data: { signedOut: true } }), after('Condition_Has_Session')),
    },
  };

  const whoAmI = {
    case: 'whoami',
    actions: {
      Respond_Who: response(200, envelope({
        success: true,
        data: { email: `@${CALLER('email')}`, name: `@${CALLER('name')}`, role: `@${CALLER('role')}`, via: `@${CALLER('via')}`, expiresAt: `@${CALLER('expiresAt')}` },
      })),
    },
  };

  const OP = (k) => P('operator', k);
  const opEmail = `toLower(trim(string(coalesce(${OP('email')}, ''))))`;
  const listOperators = {
    case: 'listoperators',
    actions: {
      ...requireAdmin('Condition_List_Operators_Admin_Only', {}),
      SP_List_Operators: spHttp({ method: 'GET', uri: `@concat(${listItems('operatorsList')}, '?$select=Title,DisplayName,Active,Role,Modified&$top=500&$orderby=Title')`, runAfter: after('Condition_List_Operators_Admin_Only') }),
      Select_Operators: {
        type: 'Select',
        inputs: { from: "@coalesce(body('SP_List_Operators')?['value'], createArray())", select: { email: "@item()?['Title']", name: "@item()?['DisplayName']", active: "@item()?['Active']", role: "@item()?['Role']", modified: "@item()?['Modified']" } },
        runAfter: after('SP_List_Operators'),
      },
      Respond_Operators: response(200, envelope({ success: true, data: { items: "@body('Select_Operators')", count: "@length(body('Select_Operators'))" } }), after('Select_Operators')),
    },
  };
  const upsertOperator = {
    case: 'upsertoperator',
    actions: {
      ...requireAdmin('Condition_Upsert_Operator_Admin_Only', {}),
      Condition_Operator_Email_Required: guard(`not(contains(${opEmail}, '@'))`, 400, envelope({ success: false, error: err('EMAIL_REQUIRED', 'payload.operator.email must be an email address.') }), after('Condition_Upsert_Operator_Admin_Only')),
      SP_Find_Operator_Record: spHttp({
        method: 'GET',
        uri: `@concat(${listItems('operatorsList')}, '?$select=Id,Title&$top=1&$filter=', encodeUriComponent(concat('Title eq ''', ${odata(opEmail)}, '''')))`,
        runAfter: after('Condition_Operator_Email_Required'),
      }),
      Compose_Operator_Item: compose({
        Title: `@${cap255(opEmail)}`,
        DisplayName: `@${cap255(`coalesce(${OP('name')}, '')`)}`,
        Active: `@if(equals(${OP('active')}, false), false, true)`,
        Role: `@if(equals(toLower(string(coalesce(${OP('role')}, ''))), 'admin'), 'admin', 'operator')`,
      }, after('SP_Find_Operator_Record')),
      Condition_Operator_ValidationOnly: guard(REQ('validationOnly'), 200, envelope({ success: true, validationOnly: true, data: { item: "@outputs('Compose_Operator_Item')" } }), after('Compose_Operator_Item')),
      Condition_Operator_Exists: {
        type: 'If',
        expression: { and: [{ equals: ["@greater(length(coalesce(body('SP_Find_Operator_Record')?['value'], createArray())), 0)", true] }] },
        actions: {
          SP_Update_Operator: spHttp({ method: 'POST', uri: itemUri('operatorsList', "first(body('SP_Find_Operator_Record')?['value'])?['Id']"), headers: merge, body: "@string(outputs('Compose_Operator_Item'))" }),
        },
        else: { actions: { SP_Create_Operator: spHttp({ method: 'POST', uri: `@${listItems('operatorsList')}`, body: "@string(outputs('Compose_Operator_Item'))" }) } },
        runAfter: after('Condition_Operator_ValidationOnly'),
      },
      Respond_Operator_Saved: response(200, envelope({ success: true, data: { operator: "@outputs('Compose_Operator_Item')" } }), after('Condition_Operator_Exists')),
    },
  };

  return skeleton({
    key: 'MAIL_AUTH',
    identity: 'DGO_MAIL_AUTH',
    description: 'DGO Correspondence Mailer: operator sign-in. requestCode mails a one-time code to an active operator; verifyCode exchanges it for a session token; signOut ends it; admins manage DGOMailOperators.',
    extraConfig: { codeMinutes: MAILER.codeMinutes, maxCodeAttempts: MAILER.maxCodeAttempts, sessionHours: MAILER.sessionHours, codesPerWindow: MAILER.codesPerWindow, codeWindowMinutes: MAILER.codeWindowMinutes },
    openOps: ['requestcode', 'verifycode'],
    cases: { RequestCode: requestCode, VerifyCode: verifyCode, SignOut: signOut, WhoAmI: whoAmI, ListOperators: listOperators, UpsertOperator: upsertOperator },
  });
}

/* ------------------------------------------------------------------ *
 * DGO_MAIL_DATA — mailings, reports and attachments, shared across devices
 * ------------------------------------------------------------------ */

/* The mailer's working data lives in SharePoint, not in one browser: every device an operator
   signs in on sees the same mailings with their per-recipient results, the same Activity
   reports, and the same attached files. The browser keeps a copy only as a cache. */
function dataFlow() {
  const merge = { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' };

  /** list / save / delete for a list whose rows carry one JSON document in Data. */
  function jsonRecords({ tag, listKey, recordName, columns, orderBy, defaultTop }) {
    const R = (k) => P(recordName, k);
    const idExpr = `trim(string(coalesce(${R('id')}, '')))`;
    const row = { id: "@item()?['Title']", data: "@item()?['Data']", created: "@item()?['Created']", modified: "@item()?['Modified']" };
    for (const [k, c] of columns) row[k] = `@item()?['${c}']`;
    const item = { Title: `@${cap255(idExpr)}`, Data: `@string(coalesce(${R('data')}, ''))` };
    for (const [k, c, kind] of columns) item[c] = kind === 'caller' ? `@${cap255(CALLER('email'))}` : `@${cap255(`coalesce(${R(k)}, '')`)}`;
    /* Every row carrying the id (at most 20), oldest first: two saves that overlapped can have
       created two rows, and a delete that removed only one would let the record come back. */
    const find = (name, runAfter) => spHttp({
      method: 'GET',
      uri: `@concat(${listItems(listKey)}, '?$select=Id,Title&$top=20&$orderby=Id%20asc&$filter=', encodeUriComponent(concat('Title eq ''', ${odata(idExpr)}, '''')))`,
      runAfter,
    });
    const deleteEach = (loop, from) => ({
      type: 'Foreach',
      foreach: from,
      runtimeConfiguration: { concurrency: { repetitions: 1 } },
      actions: {
        [`SP_Delete_${loop}`]: spHttp({ method: 'POST', uri: `@concat(${listItems(listKey)}, '(', string(items('Apply_to_each_${loop}')?['Id']), ')')`, headers: { 'IF-MATCH': '*', 'X-HTTP-Method': 'DELETE' } }),
      },
    });
    const exists = (name) => `greater(length(coalesce(body('${name}')?['value'], createArray())), 0)`;
    const itemUri = (name) => `@concat(${listItems(listKey)}, '(', string(first(body('${name}')?['value'])?['Id']), ')')`;
    return {
      [`List${tag}`]: {
        case: `list${tag.toLowerCase()}`,
        actions: {
          [`Compose_${tag}_Top`]: compose(`@min(1000, max(1, int(coalesce(${P('top')}, ${defaultTop}))))`),
          [`SP_List_${tag}`]: spHttp({
            method: 'GET',
            uri: `@concat(${listItems(listKey)}, '?$orderby=${orderBy}%20desc&$top=', string(outputs('Compose_${tag}_Top')))`,
            runAfter: after(`Compose_${tag}_Top`),
          }),
          [`Select_${tag}`]: { type: 'Select', inputs: { from: `@coalesce(body('SP_List_${tag}')?['value'], createArray())`, select: row }, runAfter: after(`SP_List_${tag}`) },
          [`Respond_List_${tag}`]: response(200, envelope({ success: true, data: { items: `@body('Select_${tag}')`, count: `@length(body('Select_${tag}'))` } }), after(`Select_${tag}`)),
        },
      },
      [`Save${tag}`]: {
        case: `save${recordName}`,
        actions: {
          [`Condition_${tag}_Id_Required`]: guard(`empty(${idExpr})`, 400, envelope({ success: false, error: err('ID_REQUIRED', `payload.${recordName}.id is required.`) })),
          [`SP_Find_${tag}`]: find(`SP_Find_${tag}`, after(`Condition_${tag}_Id_Required`)),
          [`Compose_${tag}_Item`]: compose(item, after(`SP_Find_${tag}`)),
          [`Condition_${tag}_ValidationOnly`]: guard(REQ('validationOnly'), 200, envelope({ success: true, validationOnly: true, data: { id: `@${idExpr}`, wouldCreate: `@not(${exists(`SP_Find_${tag}`)})` } }), after(`Compose_${tag}_Item`)),
          [`Condition_${tag}_Exists`]: {
            type: 'If',
            expression: { and: [{ equals: [`@${exists(`SP_Find_${tag}`)}`, true] }] },
            actions: {
              [`SP_Update_${tag}`]: spHttp({ method: 'POST', uri: itemUri(`SP_Find_${tag}`), headers: merge, body: `@string(outputs('Compose_${tag}_Item'))` }),
              [`Apply_to_each_${tag}_Extra`]: { ...deleteEach(`${tag}_Extra`, `@skip(coalesce(body('SP_Find_${tag}')?['value'], createArray()), 1)`), runAfter: after(`SP_Update_${tag}`) },
            },
            else: { actions: { [`SP_Create_${tag}`]: spHttp({ method: 'POST', uri: `@${listItems(listKey)}`, body: `@string(outputs('Compose_${tag}_Item'))` }) } },
            runAfter: after(`Condition_${tag}_ValidationOnly`),
          },
          [`Respond_Save_${tag}`]: response(200, envelope({ success: true, data: { id: `@${idExpr}`, created: `@not(${exists(`SP_Find_${tag}`)})`, savedBy: `@${CALLER('email')}` } }), after(`Condition_${tag}_Exists`)),
        },
      },
      [`Delete${tag}`]: {
        case: `delete${recordName}`,
        actions: {
          [`SP_Find_${tag}_To_Delete`]: find(`SP_Find_${tag}_To_Delete`, {}),
          [`Condition_${tag}_Delete`]: {
            type: 'If',
            expression: { and: [{ equals: [`@${exists(`SP_Find_${tag}_To_Delete`)}`, true] }, { equals: [`@${REQ('validationOnly')}`, false] }] },
            actions: { [`Apply_to_each_${tag}_Row`]: deleteEach(`${tag}_Row`, `@coalesce(body('SP_Find_${tag}_To_Delete')?['value'], createArray())`) },
            else: { actions: {} },
            runAfter: after(`SP_Find_${tag}_To_Delete`),
          },
          [`Respond_Delete_${tag}`]: response(200, envelope({ success: true, validationOnly: `@${REQ('validationOnly')}`, data: { id: `@${idExpr}`, deleted: `@and(${exists(`SP_Find_${tag}_To_Delete`)}, not(${REQ('validationOnly')}))` } }), after(`Condition_${tag}_Delete`)),
        },
      },
    };
  }

  const mailings = jsonRecords({
    tag: 'Mailings', listKey: 'campaignsList', recordName: 'mailing', orderBy: 'Modified', defaultTop: 500,
    columns: [['name', 'CampaignName'], ['status', 'Status'], ['updatedBy', 'UpdatedByEmail', 'caller']],
  });
  const reports = jsonRecords({
    tag: 'Reports', listKey: 'reportsList', recordName: 'report', orderBy: 'Created', defaultTop: 200,
    columns: [['kind', 'Kind'], ['title', 'ReportTitle'], ['status', 'Status'], ['operator', 'OperatorEmail', 'caller']],
  });

  /* Files: <id>__<name> in the DGOMailFiles library. The client makes the name safe. */
  const F = (k) => P('file', k);
  const fileName = `concat(trim(string(coalesce(${F('id')}, ''))), '__', trim(string(coalesce(${F('name')}, ''))))`;
  const storedName = `trim(string(coalesce(${F('storedName')}, ${fileName})))`;
  const libraryPath = `concat(uriPath(${CFG('siteUrl')}), '/', ${CFG('filesLibrary')})`;
  /** A name that is empty, or has a "/" or "\\" (so it could name a path outside the library), is refused. */
  const unsafeName = (expr) => `or(empty(${expr}), contains(${expr}, '/'), contains(${expr}, '\\'))`;
  const badName = envelope({ success: false, error: err('BAD_FILE_NAME', 'A shared file name must be a plain file name, without "/" or "\\".') });
  const files = {
    UploadFile: {
      case: 'uploadfile',
      actions: {
        Condition_File_Fields_Required: guard(
          `or(empty(trim(string(coalesce(${F('id')}, '')))), empty(trim(string(coalesce(${F('name')}, '')))), empty(string(coalesce(${F('contentBase64')}, ''))))`,
          400, envelope({ success: false, error: err('FILE_REQUIRED', 'payload.file needs id, name and contentBase64.') }),
        ),
        Condition_Upload_Name_Unsafe: guard(unsafeName(fileName), 400, badName, after('Condition_File_Fields_Required')),
        Condition_Upload_ValidationOnly: guard(REQ('validationOnly'), 200, envelope({ success: true, validationOnly: true, data: { storedName: `@${fileName}` } }), after('Condition_Upload_Name_Unsafe')),
        SP_Create_File: {
          type: 'OpenApiConnection',
          inputs: {
            host: { apiId: SP_API, connectionName: 'shared_sharepointonline', operationId: 'CreateFile' },
            parameters: {
              dataset: `@${CFG('siteUrl')}`,
              folderPath: `@concat('/', ${CFG('filesLibrary')})`,
              name: `@${fileName}`,
              body: `@base64ToBinary(string(${F('contentBase64')}))`,
            },
            authentication: AUTH,
          },
          runAfter: after('Condition_Upload_ValidationOnly'),
        },
        Respond_Uploaded: response(200, envelope({ success: true, data: { id: `@${F('id')}`, storedName: `@${fileName}`, uploadedBy: `@${CALLER('email')}` } }), after('SP_Create_File')),
      },
    },
    DownloadFile: {
      case: 'downloadfile',
      actions: {
        Condition_Download_Name_Unsafe: guard(unsafeName(storedName), 400, badName),
        SP_Get_File_Content: {
          type: 'OpenApiConnection',
          inputs: {
            host: { apiId: SP_API, connectionName: 'shared_sharepointonline', operationId: 'GetFileContentByPath' },
            parameters: { dataset: `@${CFG('siteUrl')}`, path: `@concat('/', ${CFG('filesLibrary')}, '/', ${storedName})`, inferContentType: false },
            authentication: AUTH,
          },
          runAfter: after('Condition_Download_Name_Unsafe'),
        },
        Respond_File: response(200, envelope({
          success: true,
          data: { storedName: `@${storedName}`, contentBase64: "@coalesce(body('SP_Get_File_Content')?['$content'], base64(body('SP_Get_File_Content')))" },
        }), after('SP_Get_File_Content')),
        Respond_File_Missing: response(404, envelope({ success: false, error: err('NOT_FOUND', `@concat('No shared file ', ${storedName}, '.')`) }), afterAny('SP_Get_File_Content', 'Failed')),
      },
    },
    ListFiles: {
      case: 'listfiles',
      actions: {
        SP_List_Files: spHttp({ method: 'GET', uri: `@concat('_api/web/GetFolderByServerRelativeUrl(''', ${odata(libraryPath)}, ''')/Files?$select=Name,Length,TimeCreated&$top=5000')` }),
        Select_Files: {
          type: 'Select',
          inputs: {
            from: "@coalesce(body('SP_List_Files')?['value'], createArray())",
            select: { storedName: "@item()?['Name']", id: "@first(split(item()?['Name'], '__'))", size: "@int(coalesce(item()?['Length'], 0))", created: "@item()?['TimeCreated']" },
          },
          runAfter: after('SP_List_Files'),
        },
        Respond_Files: response(200, envelope({ success: true, data: { items: "@body('Select_Files')", count: "@length(body('Select_Files'))" } }), after('Select_Files')),
      },
    },
    DeleteFile: {
      case: 'deletefile',
      actions: {
        Condition_Delete_Name_Unsafe: guard(unsafeName(storedName), 400, badName),
        Condition_Delete_File_ValidationOnly: guard(REQ('validationOnly'), 200, envelope({ success: true, validationOnly: true, data: { storedName: `@${storedName}` } }), after('Condition_Delete_Name_Unsafe')),
        SP_Delete_File: spHttp({
          method: 'POST',
          uri: `@concat('_api/web/GetFileByServerRelativeUrl(''', ${odata(`concat(${libraryPath}, '/', ${storedName})`)}, ''')')`,
          headers: { 'IF-MATCH': '*', 'X-HTTP-Method': 'DELETE' },
          runAfter: after('Condition_Delete_File_ValidationOnly'),
        }),
        Respond_File_Deleted: response(200, envelope({ success: true, data: { storedName: `@${storedName}`, deleted: "@equals(actions('SP_Delete_File')?['status'], 'Succeeded')" } }), afterAny('SP_Delete_File', 'Succeeded', 'Failed')),
      },
    },
  };

  return skeleton({
    key: 'MAIL_DATA',
    identity: 'DGO_MAIL_DATA',
    description: 'DGO Correspondence Mailer: the shared working data - mailings with their results (DGOMailCampaigns), Activity reports (DGOMailReports) and attached files (DGOMailFiles).',
    extraConfig: { campaignsList: MAILER.lists.campaigns, reportsList: MAILER.lists.reports, filesLibrary: MAILER.lists.files },
    cases: { ...mailings, ...reports, ...files },
  });
}

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

export const FLOWS = Object.freeze([
  { name: 'DGO_MAIL_SEND', key: 'MAIL_SEND', build: sendFlow, apis: ['sharepointonline', 'office365'],
    operations: ['send', 'healthCheck', 'verify'] },
  { name: 'DGO_MAIL_LOG', key: 'MAIL_LOG', build: logFlow, apis: ['sharepointonline'],
    operations: ['list', 'get', 'healthCheck', 'verify'] },
  { name: 'DGO_MAIL_DIRECTORY', key: 'MAIL_DIRECTORY', build: directoryFlow, apis: ['sharepointonline'],
    operations: ['list', 'upsert', 'delete', 'healthCheck', 'verify'] },
  { name: 'DGO_MAIL_TEMPLATES', key: 'MAIL_TEMPLATES', build: templatesFlow, apis: ['sharepointonline'],
    operations: ['list', 'upsert', 'delete', 'healthCheck', 'verify'] },
  { name: 'DGO_MAIL_PROVISION', key: 'MAIL_PROVISION', build: provisionFlow, apis: ['sharepointonline'],
    operations: ['provision', 'healthCheck', 'verify'] },
  { name: 'DGO_MAIL_AUTH', key: 'MAIL_AUTH', build: authFlow, apis: ['sharepointonline', 'office365'],
    operations: ['requestCode', 'verifyCode', 'signOut', 'whoAmI', 'listOperators', 'upsertOperator', 'healthCheck', 'verify'] },
  { name: 'DGO_MAIL_DATA', key: 'MAIL_DATA', build: dataFlow, apis: ['sharepointonline'],
    operations: ['listMailings', 'saveMailing', 'deleteMailing', 'listReports', 'saveReport', 'deleteReport', 'uploadFile', 'downloadFile', 'listFiles', 'deleteFile', 'healthCheck', 'verify'] },
]);

const API_META = {
  sharepointonline: { display: 'SharePoint', id: SP_API },
  office365: { display: 'Office 365 Outlook', id: O365_API },
};

/** A stable GUID from a label, so every build names every resource identically. */
function guidFrom(label) {
  const h = crypto.createHash('sha1').update(`dgo-mailer:${label}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function packageFor(flow, definition) {
  const connectionReferences = {};
  for (const api of flow.apis) {
    connectionReferences[`shared_${api}`] = {
      connectionName: `shared-${api}-${guidFrom(`${flow.name}:${api}:connection-name`)}`,
      source: 'Embedded',
      id: API_META[api].id,
      tier: 'NotSpecified',
      apiName: api,
      isProcessSimpleApiReferenceConversionAlreadyDone: false,
    };
  }
  return buildZip(flowPackageEntries({
    name: flow.name,
    description: definition.description,
    definition,
    connectionReferences,
    guid: guidFrom,
    createdTime: '2026-09-25T00:00:00.0000000Z',
    creator: 'DGO Correspondence Mailer build (scripts/build-mailer-flows.mjs)',
  }));
}

/** Every file this generator owns, as { relative path: Buffer }. */
export function buildAll() {
  const files = {};
  const catalogue = {
    generatedBy: 'scripts/build-mailer-flows.mjs',
    contractVersion: MAILER.contractVersion,
    siteUrl: MAILER.siteUrl,
    lists: LIST_SCHEMA.map((l) => ({ title: l.title, fields: l.fields.map((f) => f.name) })),
    flows: [],
  };
  for (const flow of FLOWS) {
    const definition = flow.build();
    files[`definitions/${flow.name}.definition.json`] = Buffer.from(JSON.stringify(definition, null, 2) + '\n');
    files[`packages/${flow.name}.zip`] = packageFor(flow, definition);
    catalogue.flows.push({
      name: flow.name,
      endpointKey: flow.key,
      trigger: 'HTTP request (POST), triggerAuthenticationType: All',
      connectors: flow.apis.map((a) => API_META[a].display),
      operations: flow.operations,
      definition: `definitions/${flow.name}.definition.json`,
      package: `packages/${flow.name}.zip`,
    });
  }
  files['flows.catalogue.json'] = Buffer.from(JSON.stringify(catalogue, null, 2) + '\n');
  return files;
}

function main() {
  const files = buildAll();
  const drift = [];
  for (const [rel, buf] of Object.entries(files)) {
    const abs = path.join(OUT, rel);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
    if (current && current.equals(buf)) continue;
    if (CHECK) { drift.push(rel); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buf);
    console.log(`  wrote mailer/flows/${rel}`);
  }
  if (CHECK) {
    if (drift.length) {
      console.log(`  ❌ mailer/flows is stale — run: npm run mailer:flows\n     ${drift.join('\n     ')}`);
      process.exit(1);
    }
    console.log(`  ✅ mailer/flows matches its generator (${Object.keys(files).length} files)`);
  } else {
    console.log(`  mailer/flows: ${Object.keys(files).length} files current`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
