#!/usr/bin/env node
/**
 * DGO_USERDIRECTORY_SYNC — the corrected Scope_Global for the Microsoft 365 -> DGO_UserDirectory
 * synchronization flow, emitted as a Power Automate designer clipboard package.
 *
 *   node scripts/build-userdirectory-sync.mjs           # write the package
 *   node scripts/build-userdirectory-sync.mjs --check   # fail if the committed package is stale
 *
 * WHAT IT REPLACES AND WHY
 *
 * The submitted Scope_Global v4.0.1 could not sync:
 *   - its four decision conditions were placeholders (`equals("","")`), so every user took the
 *     update path and every new user failed on a null item id;
 *   - it matched on UserId only, while modules/user-admin.js enrols people with a random UUID —
 *     so every app-enrolled user was duplicated as a viewer and then DISABLED as "absent";
 *   - it wrote choice values the lists do not carry (`verification-required`, `Information`,
 *     `Warning`, `Error`);
 *   - its source-completeness guard used Terminate, which skipped the failure report.
 *
 * DESIGN
 *
 * One settings Compose, one sync scope, one report scope, one final outcome gate.
 *
 *   Sync      Read both sides in parallel -> refuse an empty or capped read -> keep eligible
 *             accounts (has an id and a mailbox address, not an external guest) -> normalise ->
 *             pre-screen by fingerprint so unchanged users cost no actions -> for each remaining
 *             user decide create / update / conflict / protected / ignore by UserId first and
 *             Email second (adopting app-enrolled rows) -> write, fail-soft per user ->
 *             reconcile absent rows set-based, behind a mass-disable limit.
 *   Report    Runs after the sync whatever its outcome. Reads the directory back, derives every
 *             number, and delivers one audit row, an interactive HTML report and a JSON run
 *             record (both attached to the audit row and to the email), and one styled email.
 *   Gate      The run is marked Failed if either scope did not succeed.
 *
 * The sync never overwrites Role, Persona, AccessScope or PilotCohort, and only changes Status
 * where Microsoft 365 decides it: an account disabled there is disabled here, and a row the sync
 * itself disabled is re-activated when the account comes back. A status set by an administrator
 * is kept.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { OrganizationalUnits } from '../config/organizational-units.config.js';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = 'docs/folio-Master-Flows-and-Endpoints/surfaces/governance/DGO_USERDIRECTORY_SYNC.Scope_Global.designer-paste.json';

/* ───────────────────────────── tenant constants ───────────────────────────── */

const SITE = 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE';
const USERDIR = '3d591f5b-3f2f-409c-983a-a77b5c174834';
const AUDIT = 'be0c7af1-b21d-4efe-8c30-53fc55598d95';
const COHORTS = 'ecc4ac65-1804-4f67-ad3e-eacb1a3a4dc2'; // DGO_PilotCohorts, adopted copy on DGO_ECM_GOVERNANCE
const ENV_FALLBACK = 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const PACKAGE_VERSION = '5.2.0';

/* The connections the submitted scope was bound to. They name environment resources, not secrets. */
const CONNECTIONS = {
  shared_office365users: '6903e7ce64d24b49a773f0de53dcfc52',
  shared_sharepointonline: '3f1943c5955a4cb8b301e8f22f2b590d',
  shared_office365: 'c0b9e7a5b0854c39a435fd8ce92f48ad',
  shared_flowmanagement: 'shared-flowmanagemen-6a2f7a95-3886-4631-b8ca-bd6b5e9bf5c2',
};

/* Top-level variables the scope reads and writes. They are declared by the flow's
   Initialize variable actions above the scope, never inside it. */
export const VARIABLES = {
  RunId: 'String', RequestId: 'String', StartedAt: 'String',
  CreatedCount: 'Integer', UpdatedCount: 'Integer', DisabledCount: 'Integer', SkippedCount: 'Integer',
  Errors: 'Array',
  DecisionLog: 'Array',
};

/* ───────────────────────────── expression helpers ───────────────────────────── */

const S = (k) => `outputs('Compose_Settings')?['${k}']`;
const M = (k) => `outputs('Compose_Metrics')?['${k}']`;
const O = (k) => `outputs('Compose_Outcome')?['${k}']`;
const L = (k) => `outputs('Compose_Links')?['${k}']`;
const F = (k) => `outputs('Compose_Flow_Facts')?['${k}']`;
const U = (k) => `items('Apply_to_each_M365_user')?['${k}']`;
const ROW = (k) => `outputs('Compose_Existing_Row')?['${k}']`;
const C = (k) => `items('Apply_to_each_disable_candidate')?['${k}']`;
const arr = (e) => `coalesce(${e},json('[]'))`;
const txt = (e) => `string(coalesce(${e},''))`;
const low = (e) => `toLower(trim(string(coalesce(${e},''))))`;
const esc = (e) => `replace(replace(replace(string(coalesce(${e},'')),'&','&amp;'),'<','&lt;'),'>','&gt;')`;
const num = (e) => `formatNumber(coalesce(${e},0),'N0','en-US')`;
const wat = (e) => `convertFromUtc(${e},'W. Central Africa Standard Time','dd MMM yyyy, HH:mm')`;
const x = (e) => `@{${e}}`;
/* A timestamp that is always valid, so a function applied to it cannot fault on an empty value. */
const ts = (e) => `if(empty(${txt(e)}),'2000-01-01T00:00:00Z',${txt(e)})`;
const EXISTING = arr(`body('Get_existing_UserDirectory_items')?['value']`);
const M365 = arr(`body('Search_for_users_V2')?['value']`);
const AFTER = arr(`body('Get_UserDirectory_After_Sync')?['value']`);
const STARTED = S('StartedAtUtc');

/* ───────────────────────────── action builders ───────────────────────────── */

const after = (...deps) => Object.fromEntries(deps.map((d) => (Array.isArray(d) ? [d[0], d[1]] : [d, ['Succeeded']])));
const ANY = ['Succeeded', 'Failed', 'TimedOut', 'Skipped'];
const compose = (inputs, runAfter = {}) => ({ type: 'Compose', inputs, runAfter });
const query = (from, where, runAfter = {}) => ({ type: 'Query', inputs: { from, where }, runAfter });
const select = (from, sel, runAfter = {}) => ({ type: 'Select', inputs: { from, select: sel }, runAfter });
const increment = (name, runAfter = {}) => ({ type: 'IncrementVariable', inputs: { name, value: 1 }, runAfter });
const appendError = (stage, userId, email, detail, runAfter = {}) => ({
  type: 'AppendToArrayVariable',
  inputs: { name: 'Errors', value: { stage, userId, email, detail, at: '@{utcNow()}' } },
  runAfter,
});
const sp = (operationId, parameters, runAfter = {}, extra = {}) => ({
  type: 'OpenApiConnection',
  inputs: {
    parameters,
    host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId },
  },
  runAfter,
  ...extra,
});
const paginate = (n) => ({ runtimeConfiguration: { paginationPolicy: { minimumItemCount: n } } });
const sequential = { runtimeConfiguration: { concurrency: { repetitions: 1 } } };

/* ═════════════════════════ 0. directorate vocabulary ═════════════════════════

   Records are scoped by the approved unit keys (config/organizational-units.config.js), so a
   user's Directorate must BE one of those keys for them to see their unit's records. Microsoft
   365 holds free text. This map resolves it, case-insensitively and with '&' read as 'and', from:
     1. each approved unit's key and title;
     2. the dsuKey corrections the agency adopted (docs/reference/approved/dsu-key-corrections.csv);
     3. the aliases in docs/reference/directorate-aliases.csv whose Status is 'confirmed'.
   Anything else is 'Unassigned', and the report lists it. */
const norm = (v) => String(v).trim().toLowerCase().replaceAll('&', 'and');
const WDL_NORM = (e) => `replace(toLower(trim(string(coalesce(${e},'')))),'&','and')`;
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [h, ...rs] = rows.filter((r) => r.length > 1);
  return rs.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
const UNIT_KEYS = OrganizationalUnits.map((u) => u.key);
export const DIRECTORATE_MAP = (() => {
  const map = {};
  const put = (from, key, source) => {
    if (!UNIT_KEYS.includes(key)) throw new Error(`${source}: '${from}' maps to '${key}', which is not an approved unit key`);
    if (map[norm(from)] && map[norm(from)] !== key) throw new Error(`${source}: '${from}' maps to both ${map[norm(from)]} and ${key}`);
    map[norm(from)] = key;
  };
  for (const u of OrganizationalUnits) { put(u.key, u.key, 'organizational-units'); put(u.title, u.key, 'organizational-units'); }
  for (const c of parseCsv(readFileSync(join(ROOT, 'docs/reference/approved/dsu-key-corrections.csv'), 'utf8'))) if (c.Kind === 'dsuKey') put(c.From, c.To, 'dsu-key-corrections');
  for (const a of parseCsv(readFileSync(join(ROOT, 'docs/reference/directorate-aliases.csv'), 'utf8'))) if (a.Status === 'confirmed') put(a.Microsoft365Name, a.UnitKey, 'directorate-aliases');
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
})();

/* ═════════════════════════════ 1. settings ═════════════════════════════ */

/* 5000 is the most the service accepts. The write of 2026-09-27 was refused: "The value specified
   for property 'minimumItemsCount' exceeds the maximum allowed. Actual: '10000'. Maximum: '5000'"
   (InvalidPaginationPolicy, on Search_for_users_V2; the service names only the first action it
   rejects, so the two GetItems get the same ceiling). A directory that reaches a cap is not
   truncated silently: Condition_Source_Complete stops the run with nothing written. */
const M365_CAP = 5000;    // must equal Search_for_users_V2 paginationPolicy.minimumItemCount
const LIST_CAP = 5000;    // must equal the two GetItems paginationPolicy.minimumItemCount

const settings = compose({
  PackageVersion: PACKAGE_VERSION,
  SiteUrl: SITE,
  UserDirectoryListId: USERDIR,
  UserDirectoryListUrl: `${SITE}/Lists/DGO_UserDirectory/AllItems.aspx`,
  AuditListId: AUDIT,
  AuditListUrl: `${SITE}/Lists/DGO_AuditLog/AllItems.aspx`,
  SyncActor: 'DGO_UserDirectory_M365_Sync',
  NotifyTo: 'dgsregistry@nitda.gov.ng',
  TelemetryTo: 'dgsregistry@nitda.gov.ng',
  NewUserStatus: 'active',
  NewUserRole: 'viewer',
  NewUserPersona: 'general',
  NewUserCohort: 'directory-sync',
  IncludeGuests: true,
  M365PageCap: M365_CAP,
  ListPageCap: LIST_CAP,
  MaxDisablePerRun: 25,
  MaxDisablePercent: 5,
  EmailRowLimit: 25,
  EnvironmentName: x(`coalesce(workflow()?['tags']?['environmentName'],'${ENV_FALLBACK}')`),
  FlowName: x(`workflow()?['name']`),
  FlowDisplayName: x(`coalesce(workflow()?['tags']?['flowDisplayName'],'DGO User Directory Microsoft 365 Synchronization')`),
  RunName: x(`workflow()?['run']?['name']`),
  RunId: x(`if(empty(${txt(`variables('RunId')`)}),workflow()?['run']?['name'],variables('RunId'))`),
  RequestId: x(`if(empty(${txt(`variables('RequestId')`)}),workflow()?['run']?['name'],variables('RequestId'))`),
  StartedAtUtc: x(`if(empty(${txt(`variables('StartedAt')`)}),utcNow(),variables('StartedAt'))`),
  RunUrl: `https://make.powerautomate.com/environments/${x(`coalesce(workflow()?['tags']?['environmentName'],'${ENV_FALLBACK}')`)}/flows/${x(`workflow()?['name']`)}/runs/${x(`workflow()?['run']?['name']`)}`,
  FlowUrl: `https://make.powerautomate.com/environments/${x(`coalesce(workflow()?['tags']?['environmentName'],'${ENV_FALLBACK}')`)}/flows/${x(`workflow()?['name']`)}/details`,
});

/* ═════════════════════════════ 2. synchronization ═════════════════════════════ */

const search = {
  type: 'OpenApiConnection',
  inputs: {
    parameters: { top: 1000, isSearchTermRequired: false, searchTerm: '' },
    host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365users', connection: 'shared_office365users', operationId: 'SearchUserV2' },
  },
  runAfter: {},
  ...paginate(M365_CAP),
};

const getExisting = sp('GetItems', { dataset: SITE, table: USERDIR, $top: 5000 }, {}, paginate(LIST_CAP));

const sourceCheck = {
  type: 'If',
  expression: {
    and: [
      { greater: [`@length(${M365})`, 0] },
      { less: [`@length(${M365})`, `@${S('M365PageCap')}`] },
      { less: [`@length(${EXISTING})`, `@${S('ListPageCap')}`] },
    ],
  },
  actions: {},
  else: {
    actions: {
      Append_Source_Error: appendError('Source validation', '', '',
        x(`concat('The directory read was empty or reached a safety cap, so nothing was written. Microsoft 365 accounts read: ', string(length(${M365})), ' (cap ', string(${S('M365PageCap')}), '). UserDirectory rows read: ', string(length(${EXISTING})), ' (cap ', string(${S('ListPageCap')}), ').')`)),
      /* Deliberate, named stop. A Terminate here would end the run before the report scope. */
      Stop_Incomplete_Source: compose(`@int(concat('IncompleteDirectoryExtraction-', ${S('RunId')}))`, after('Append_Source_Error')),
    },
  },
  runAfter: after('Search_for_users_V2', 'Get_existing_UserDirectory_items'),
};

const eligible = query(`@${M365}`,
  `@and(not(empty(trim(string(coalesce(item()?['Id'],''))))),contains(if(empty(trim(string(coalesce(item()?['Mail'],'')))),string(coalesce(item()?['UserPrincipalName'],'')),string(coalesce(item()?['Mail'],''))),'@'),or(not(contains(toLower(string(coalesce(item()?['UserPrincipalName'],''))),'#ext#')),and(equals(${S('IncludeGuests')},true),contains(string(coalesce(item()?['Mail'],'')),'@'))))`,
  after('Condition_Source_Complete'));

const firstNonEmpty = (...fields) => {
  // trim(coalesce(a)) if non-empty, else the next one; the last is returned as-is.
  const [head, ...rest] = fields;
  const h = `trim(string(coalesce(item()?['${head}'],'')))`;
  return rest.length ? `if(empty(${h}),${firstNonEmpty(...rest)},${h})` : h;
};

const normalized = select(`@body('Filter_Eligible_M365_Users')`, {
  UserId: x(low(`item()?['Id']`)),
  Email: x(`toLower(${firstNonEmpty('Mail', 'UserPrincipalName')})`),
  FullName: x(`take(${firstNonEmpty('DisplayName', 'UserPrincipalName', 'Mail')},255)`),
  Directorate: x(`coalesce(outputs('Compose_Directorate_Map')?[${WDL_NORM(`item()?['Department']`)}],outputs('Compose_Directorate_Map')?[${WDL_NORM(`item()?['CompanyName']`)}],'Unassigned')`),
  Department: x(`take(trim(string(coalesce(item()?['Department'],''))),255)`),
  JobTitle: x(`take(trim(string(coalesce(item()?['JobTitle'],''))),255)`),
  Phone: x(`take(if(empty(trim(string(coalesce(item()?['MobilePhone'],'')))),trim(string(coalesce(first(${arr(`item()?['BusinessPhones']`)}),''))),trim(string(coalesce(item()?['MobilePhone'],'')))),255)`),
  AccountStatus: x(`if(equals(item()?['AccountEnabled'],true),'active',if(equals(item()?['AccountEnabled'],false),'disabled',''))`),
}, after('Filter_Eligible_M365_Users', 'Compose_Directorate_Map'));

/* The fingerprint is the same string on both sides when a row already holds exactly what the sync
   would write — so those users never enter the loop. Status contributes only enabled/disabled:
   an administrator's staged/active choice is not something the sync changes. */
const fingerprinted = select(`@body('Select_Normalized_Users')`,
  `@addProperty(item(),'Fingerprint',concat(item()?['UserId'],'|',item()?['Email'],'|',item()?['FullName'],'|',item()?['FullName'],'|',item()?['Directorate'],'|',item()?['Department'],'|',item()?['JobTitle'],'|',item()?['Phone'],'|',if(equals(item()?['AccountStatus'],'disabled'),'disabled','enabled')))`,
  after('Select_Normalized_Users'));

const existingFingerprints = select(`@${EXISTING}`,
  `@concat(${txt(`item()?['UserId']`)},'|',${txt(`item()?['Email']`)},'|',${txt(`item()?['Title']`)},'|',${txt(`item()?['FullName']`)},'|',${txt(`item()?['Directorate']`)},'|',${txt(`item()?['Department']`)},'|',${txt(`item()?['JobTitle']`)},'|',${txt(`item()?['Phone']`)},'|',if(equals(${low(`item()?['Status']?['Value']`)},'disabled'),'disabled','enabled'))`,
  after('Condition_Source_Complete'));

const existingIds = select(`@${EXISTING}`, `@${low(`item()?['UserId']`)}`, after('Condition_Source_Complete'));
const existingEmails = select(`@${EXISTING}`, `@${low(`item()?['Email']`)}`, after('Condition_Source_Complete'));
const m365Ids = select(`@${M365}`, `@${low(`item()?['Id']`)}`, after('Condition_Source_Complete'));
const m365Mails = select(`@${M365}`, `@${low(`item()?['Mail']`)}`, after('Condition_Source_Complete'));
const m365Upns = select(`@${M365}`, `@${low(`item()?['UserPrincipalName']`)}`, after('Condition_Source_Complete'));
/* The accounts the directory is made of this run. A row whose id and email are both outside this set
   is reconciled: absent from Microsoft 365, or present but excluded (a guest while IncludeGuests is
   off, or an account with no mailbox address). */
const eligibleIds = select(`@body('Select_Normalized_Users')`, `@item()?['UserId']`, after('Select_Normalized_Users'));
const eligibleEmails = select(`@body('Select_Normalized_Users')`, `@item()?['Email']`, after('Select_Normalized_Users'));

/* DUPLICATE EMAILS. The platform signs a person in with the FIRST row holding their email
   (core/current-user.js), so a second row for the same email is either ignored or silently wins.
   Every row whose email occurs more than once is listed and raised as a data-quality issue; the
   sync never deletes or merges rows itself — which row is the person is an administrator's call. */
const EMAILS_JOINED = `concat('|',join(body('Select_Existing_Emails'),'||'),'|')`;
const duplicateRows = query(`@${EXISTING}`,
  `@and(not(empty(${low(`item()?['Email']`)})),not(equals(indexOf(${EMAILS_JOINED},concat('|',${low(`item()?['Email']`)},'|')),lastIndexOf(${EMAILS_JOINED},concat('|',${low(`item()?['Email']`)},'|')))))`,
  after('Select_Existing_Emails'));
const duplicateEmails = select(`@body('Filter_Duplicate_Email_Rows')`, `@${low(`item()?['Email']`)}`, after('Filter_Duplicate_Email_Rows'));
const duplicateGate = {
  type: 'If',
  expression: { and: [{ greater: [`@length(body('Filter_Duplicate_Email_Rows'))`, 0] }] },
  actions: {
    Append_Duplicate_Warning: appendError('Data quality', '', '',
      x(`concat(string(length(body('Filter_Duplicate_Email_Rows'))), ' UserDirectory rows share an email with another row: ', join(union(body('Select_Duplicate_Emails'),body('Select_Duplicate_Emails')),', '), '. The platform signs a person in with the first row holding their email, so keep one row per person. The rows are listed under Duplicate rows.')`)),
  },
  else: { actions: {} },
  runAfter: after('Select_Duplicate_Emails'),
};

const m365Emails = compose(`@union(body('Select_M365_Mails'),body('Select_M365_Upns'))`, after('Select_M365_Mails', 'Select_M365_Upns'));

const toProcess = query(`@body('Select_Normalized_Fingerprinted')`,
  `@not(contains(body('Select_Existing_Fingerprints'),item()?['Fingerprint']))`,
  after('Select_Normalized_Fingerprinted', 'Select_Existing_Fingerprints'));

/* ── per-user loop ── */

const BY_ID = `body('Filter_existing_by_UserId')`;
const BY_EMAIL = `body('Filter_existing_by_Email')`;
const EX_STATUS = low(ROW(`Status`) + `?['Value']`);
const EX_REASON = txt(ROW('DisabledReason'));

const decision = compose(
  `@if(or(greater(length(${BY_ID}),1),and(equals(length(${BY_ID}),0),greater(length(${BY_EMAIL}),1))),'conflict',`
  + `if(and(equals(length(${BY_ID}),0),equals(length(${BY_EMAIL}),0)),if(equals(${U('AccountStatus')},'disabled'),'ignore','create'),`
  + `if(equals(${low(ROW('PilotCohort'))},'bootstrap'),'protected',`
  + `if(and(equals(length(${BY_ID}),0),contains(body('Select_M365_Ids'),${low(ROW('UserId'))})),'conflict','update'))))`,
  after('Compose_Existing_Row'));

const statusToWrite = compose(
  `@if(equals(${U('AccountStatus')},'disabled'),'disabled',`
  + `if(and(equals(${EX_STATUS},'disabled'),equals(${U('AccountStatus')},'active'),or(startsWith(${EX_REASON},'Microsoft 365 account disabled'),startsWith(${EX_REASON},'User absent'),startsWith(${EX_REASON},'Excluded from the directory'))),'active',`
  + `if(contains(createArray('staged','active','disabled','unregistered'),${EX_STATUS}),${EX_STATUS},if(equals(${U('AccountStatus')},'active'),'active','staged'))))`);

const DESIRED_REASON = `if(equals(outputs('Compose_Status_To_Write'),'disabled'),if(and(equals(${EX_STATUS},'disabled'),not(empty(${EX_REASON}))),${EX_REASON},'Microsoft 365 account disabled'),if(equals(${EX_STATUS},'disabled'),'',${EX_REASON}))`;

/* BLANK NEVER ERASES. Most NITDA accounts carry no Department, job title or phone in Microsoft 365;
   an administrator may have entered them here. Where Microsoft 365 has a value it wins; where it is
   blank — or the directorate is only the 'Unassigned' fallback — the value already on the row is
   kept. (Clearing a value in Microsoft 365 therefore does not clear it here.) */
const KEEP = (k) => `if(empty(${U(k)}),${txt(ROW(k))},${U(k)})`;
const KEEP_DIRECTORATE = `if(and(equals(${U('Directorate')},'Unassigned'),contains(outputs('Compose_Unit_Keys'),trim(${txt(ROW('Directorate'))}))),trim(${txt(ROW('Directorate'))}),${U('Directorate')})`;

const changeCheck = compose({
  current: {
    Title: x(txt(ROW('Title'))), UserId: x(txt(ROW('UserId'))), Email: x(txt(ROW('Email'))),
    FullName: x(txt(ROW('FullName'))), Directorate: x(txt(ROW('Directorate'))), Department: x(txt(ROW('Department'))),
    JobTitle: x(txt(ROW('JobTitle'))), Phone: x(txt(ROW('Phone'))), Status: x(txt(ROW('Status') + `?['Value']`)),
    DisabledReason: x(EX_REASON),
  },
  desired: {
    Title: x(U('FullName')), UserId: x(U('UserId')), Email: x(U('Email')),
    FullName: x(U('FullName')), Directorate: x(KEEP_DIRECTORATE), Department: x(KEEP('Department')),
    JobTitle: x(KEEP('JobTitle')), Phone: x(KEEP('Phone')), Status: x(`outputs('Compose_Status_To_Write')`),
    DisabledReason: x(DESIRED_REASON),
  },
}, after('Compose_Status_To_Write'));

const D = (k) => `outputs('Compose_Change_Check')?['desired']?['${k}']`;

const updateItem = sp('PatchItem', {
  dataset: SITE, table: USERDIR,
  id: `@${ROW('ID')}`,
  'item/Title': `@${D('Title')}`,
  'item/UserId': `@${D('UserId')}`,
  'item/FullName': `@${D('FullName')}`,
  'item/Email': `@${D('Email')}`,
  'item/Directorate': `@${D('Directorate')}`,
  'item/Department': `@${D('Department')}`,
  'item/JobTitle': `@${D('JobTitle')}`,
  'item/Phone': `@${D('Phone')}`,
  'item/Role/Value': `@coalesce(${ROW('Role')}?['Value'],${S('NewUserRole')})`,
  'item/Persona/Value': `@coalesce(${ROW('Persona')}?['Value'],${S('NewUserPersona')})`,
  'item/Status/Value': `@${D('Status')}`,
  'item/DisabledReason': `@${D('DisabledReason')}`,
  'item/UpdatedAt': '@utcNow()',
  'item/UpdatedBy': `@${S('SyncActor')}`,
});

const createItem = sp('PostItem', {
  dataset: SITE, table: USERDIR,
  'item/Title': `@${U('FullName')}`,
  'item/UserId': `@${U('UserId')}`,
  'item/FullName': `@${U('FullName')}`,
  'item/Email': `@${U('Email')}`,
  'item/Directorate': `@${U('Directorate')}`,
  'item/Department': `@${U('Department')}`,
  'item/JobTitle': `@${U('JobTitle')}`,
  'item/Phone': `@${U('Phone')}`,
  'item/Role/Value': `@${S('NewUserRole')}`,
  'item/Persona/Value': `@${S('NewUserPersona')}`,
  'item/Status/Value': `@if(equals(${U('AccountStatus')},'active'),${S('NewUserStatus')},'staged')`,
  'item/AccessScope': '[]',
  'item/PilotCohort': `@${S('NewUserCohort')}`,
  'item/CreatedAt': '@utcNow()',
  'item/CreatedBy': `@${S('SyncActor')}`,
  'item/UpdatedAt': '@utcNow()',
  'item/UpdatedBy': `@${S('SyncActor')}`,
  'item/DisabledReason': '',
});

/* THE DECISION LOG. Every user the loop reviews, and every row reconciliation disables, appends
   one entry to the DecisionLog array variable: what was decided, why, how the row was matched, and
   — for an update — each field that changed, old value and new. The report's "Changes" and
   "Users reviewed" tables are built from it. */
const MATCHED = `if(equals(length(${BY_ID}),1),'UserId',if(and(equals(length(${BY_ID}),0),equals(length(${BY_EMAIL}),1)),'Email',if(and(equals(length(${BY_ID}),0),equals(length(${BY_EMAIL}),0)),'None','Ambiguous')))`;
const logEntry = (fields, runAfter = {}) => ({
  type: 'AppendToArrayVariable',
  inputs: {
    name: 'DecisionLog',
    value: {
      decision: fields.decision,
      reason: fields.reason,
      matchedBy: fields.matchedBy ?? x(MATCHED),
      userId: fields.userId ?? x(U('UserId')),
      email: fields.email ?? x(U('Email')),
      name: fields.name ?? x(U('FullName')),
      directorate: fields.directorate ?? x(U('Directorate')),
      status: fields.status ?? '',
      itemId: fields.itemId ?? x(txt(ROW('ID'))),
      summary: fields.summary ?? '',
      changes: fields.changes ?? [],
      at: '@{utcNow()}',
    },
  },
  runAfter,
});
const wrote = (action) => `equals(actions('${action}')?['status'],'Succeeded')`;
const rejected = (action) => `concat('SharePoint rejected the write: ', take(string(coalesce(body('${action}'),'No response body')),400))`;
const CONFLICT_MSG = `concat('Not written: the match is ambiguous. Rows with this UserId: ', string(length(${BY_ID})), '. Rows with this email: ', string(length(${BY_EMAIL})), '. UserId on the email match: ', ${txt(`first(${BY_EMAIL})?['UserId']`)}, '. Remove the duplicate rows in DGO_UserDirectory.')`;
const NEW_STATUS = `if(equals(${U('AccountStatus')},'active'),${S('NewUserStatus')},'staged')`;
const FIELDS = `createArray('FullName','Email','UserId','Title','Directorate','Department','JobTitle','Phone','Status','DisabledReason')`;

/* Each write ends in ONE chain — write -> count (on success) -> record the error (when the count
   was skipped, i.e. the write failed) -> log the outcome. The log entry is the chain's only
   terminal action, so a rejected row is recorded and the loop carries on instead of the whole
   scope failing. */
const perUser = {
  type: 'Foreach',
  foreach: `@body('Filter_Users_To_Process')`,
  actions: {
    Filter_existing_by_UserId: query(`@${EXISTING}`, `@equals(${low(`item()?['UserId']`)},${U('UserId')})`),
    Filter_existing_by_Email: query(`@${EXISTING}`, `@equals(${low(`item()?['Email']`)},${U('Email')})`),
    Compose_Existing_Row: compose(
      `@if(equals(length(${BY_ID}),1),first(${BY_ID}),if(and(equals(length(${BY_ID}),0),equals(length(${BY_EMAIL}),1)),first(${BY_EMAIL}),null))`,
      after('Filter_existing_by_UserId', 'Filter_existing_by_Email')),
    Compose_Decision: decision,
    Switch_Decision: {
      type: 'Switch',
      expression: `@outputs('Compose_Decision')`,
      cases: {
        Case_Create: {
          case: 'create',
          actions: {
            Create_UserDirectory_item: createItem,
            Increment_CreatedCount: increment('CreatedCount', after('Create_UserDirectory_item')),
            Append_Create_Error: appendError('Create', x(U('UserId')), x(U('Email')),
              x(`concat('SharePoint rejected the new row. ', take(string(coalesce(body('Create_UserDirectory_item'),'No response body')),600))`),
              after(['Increment_CreatedCount', ['Skipped']])),
            Log_Create_Result: logEntry({
              decision: x(`if(${wrote('Create_UserDirectory_item')},'Created','Failed')`),
              reason: x(`if(${wrote('Create_UserDirectory_item')},if(equals(${U('AccountStatus')},'active'),'New Microsoft 365 account','New account; Microsoft 365 did not report its state, so it starts staged'),${rejected('Create_UserDirectory_item')})`),
              status: x(NEW_STATUS),
              itemId: x(txt(`body('Create_UserDirectory_item')?['ID']`)),
              summary: x(`concat('New row: ', ${U('Directorate')}, if(empty(${U('JobTitle')}),'',concat(', ', ${U('JobTitle')})), ', status ', ${NEW_STATUS}, ', role ', ${S('NewUserRole')})`),
            }, after(['Append_Create_Error', ['Succeeded', 'Skipped']])),
          },
        },
        Case_Update: {
          case: 'update',
          actions: {
            Compose_Status_To_Write: statusToWrite,
            Compose_Change_Check: changeCheck,
            Select_Field_Diff: select(`@${FIELDS}`, {
              field: '@item()',
              from: `@${txt(`outputs('Compose_Change_Check')?['current']?[item()]`)}`,
              to: `@${txt(`outputs('Compose_Change_Check')?['desired']?[item()]`)}`,
            }, after('Compose_Change_Check')),
            Filter_Changed_Fields: query(`@body('Select_Field_Diff')`, `@not(equals(item()?['from'],item()?['to']))`, after('Select_Field_Diff')),
            Select_Change_Lines: select(`@body('Filter_Changed_Fields')`,
              `@concat(item()?['field'],': ',if(empty(item()?['from']),'(empty)',item()?['from']),' → ',if(empty(item()?['to']),'(empty)',item()?['to']))`,
              after('Filter_Changed_Fields')),
            Condition_User_Changed: {
              type: 'If',
              expression: { and: [{ greater: [`@length(body('Filter_Changed_Fields'))`, 0] }] },
              actions: {
                Update_UserDirectory_item: updateItem,
                Increment_UpdatedCount: increment('UpdatedCount', after('Update_UserDirectory_item')),
                Append_Update_Error: appendError('Update', x(U('UserId')), x(U('Email')),
                  x(`concat('SharePoint rejected the update of item ', ${txt(ROW('ID'))}, '. ', take(string(coalesce(body('Update_UserDirectory_item'),'No response body')),600))`),
                  after(['Increment_UpdatedCount', ['Skipped']])),
                Log_Update_Result: logEntry({
                  decision: x(`if(${wrote('Update_UserDirectory_item')},'Updated','Failed')`),
                  reason: x(`if(${wrote('Update_UserDirectory_item')},if(equals(length(${BY_ID}),0),'Adopted the app-enrolled row by email and wrote the Microsoft 365 id to it','Microsoft 365 attributes changed'),${rejected('Update_UserDirectory_item')})`),
                  status: x(D('Status')),
                  summary: x(`join(body('Select_Change_Lines'),' | ')`),
                  changes: `@body('Filter_Changed_Fields')`,
                }, after(['Append_Update_Error', ['Succeeded', 'Skipped']])),
              },
              else: {
                actions: {
                  Increment_Skipped_Unchanged: increment('SkippedCount'),
                  Log_Unchanged: logEntry({
                    decision: 'Unchanged',
                    reason: x(`if(and(equals(${EX_STATUS},'disabled'),equals(${U('AccountStatus')},'active')),'Disabled by an administrator; the sync keeps that status','Reviewed; nothing to change')`),
                    status: x(EX_STATUS),
                  }, after('Increment_Skipped_Unchanged')),
                },
              },
              runAfter: after('Select_Change_Lines'),
            },
          },
        },
        Case_Conflict: {
          case: 'conflict',
          actions: {
            Append_Conflict_Error: appendError('Matching', x(U('UserId')), x(U('Email')), x(CONFLICT_MSG)),
            Increment_Skipped_Conflict: increment('SkippedCount', after('Append_Conflict_Error')),
            Log_Conflict: logEntry({ decision: 'Conflict', reason: x(CONFLICT_MSG), itemId: '' }, after('Increment_Skipped_Conflict')),
          },
        },
      },
      default: {
        actions: {
          Increment_Skipped_Other: increment('SkippedCount'),
          Log_Other: logEntry({
            decision: x(`if(equals(outputs('Compose_Decision'),'protected'),'Protected','Ignored')`),
            reason: x(`if(equals(outputs('Compose_Decision'),'protected'),'Bootstrap row; the sync never changes it','Disabled in Microsoft 365 and not in UserDirectory; no row created')`),
            status: x(EX_STATUS),
          }, after('Increment_Skipped_Other')),
        },
      },
      runAfter: after('Compose_Decision'),
    },
  },
  runAfter: after('Filter_Users_To_Process', 'Select_M365_Ids', 'Compose_Unit_Keys'),
  ...sequential,
};

/* ── reconciliation: rows absent from the complete Microsoft 365 read ── */

const candidates = query(`@${EXISTING}`,
  `@and(not(empty(trim(string(coalesce(item()?['UserId'],''))))),not(equals(${low(`item()?['PilotCohort']`)},'bootstrap')),not(equals(${low(`item()?['Status']?['Value']`)},'disabled')),not(contains(body('Select_Eligible_Ids'),${low(`item()?['UserId']`)})),not(contains(body('Select_Eligible_Emails'),${low(`item()?['Email']`)})))`,
  after('Apply_to_each_M365_user', 'Compose_M365_Emails', 'Select_Eligible_Ids', 'Select_Eligible_Emails'));

/* Present in Microsoft 365 but outside the directory, or not there at all — the reason says which. */
const IN_M365 = `or(contains(body('Select_M365_Ids'),${low(C('UserId'))}),contains(outputs('Compose_M365_Emails'),${low(C('Email'))}))`;

const disableLimit = compose(`@max(${S('MaxDisablePerRun')},div(mul(length(${EXISTING}),${S('MaxDisablePercent')}),100))`, after('Filter_Disable_Candidates'));

const disableItem = sp('PatchItem', {
  dataset: SITE, table: USERDIR,
  id: `@${C('ID')}`,
  'item/Title': `@coalesce(${C('Title')},${C('FullName')},${C('Email')},'Unknown user')`,
  'item/UserId': `@${C('UserId')}`,
  'item/FullName': `@coalesce(${C('FullName')},${C('Email')},'Unknown user')`,
  'item/Email': `@${C('Email')}`,
  'item/Directorate': `@coalesce(${C('Directorate')},'Unassigned')`,
  'item/Role/Value': `@coalesce(${C('Role')}?['Value'],${S('NewUserRole')})`,
  'item/Persona/Value': `@coalesce(${C('Persona')}?['Value'],${S('NewUserPersona')})`,
  'item/Status/Value': 'disabled',
  'item/DisabledReason': `@if(${IN_M365},concat('Excluded from the directory on ', formatDateTime(utcNow(),'yyyy-MM-dd'), ': the Microsoft 365 account is an external guest (IncludeGuests is off) or has no mailbox address (run ', ${S('RunId')}, ').'),concat('User absent from the complete Microsoft 365 directory read on ', formatDateTime(utcNow(),'yyyy-MM-dd'), ' (run ', ${S('RunId')}, ').'))`,
  'item/UpdatedAt': '@utcNow()',
  'item/UpdatedBy': `@${S('SyncActor')}`,
});

const disableGate = {
  type: 'If',
  expression: { and: [{ lessOrEquals: [`@length(body('Filter_Disable_Candidates'))`, `@outputs('Compose_Disable_Limit')`] }] },
  actions: {
    Apply_to_each_disable_candidate: {
      type: 'Foreach',
      foreach: `@body('Filter_Disable_Candidates')`,
      actions: {
        Disable_missing_UserDirectory_item: disableItem,
        Increment_DisabledCount: increment('DisabledCount', after('Disable_missing_UserDirectory_item')),
        Append_Disable_Error: appendError('Reconciliation', x(txt(C('UserId'))), x(txt(C('Email'))),
          x(`concat('SharePoint rejected disabling item ', ${txt(C('ID'))}, '. ', take(string(coalesce(body('Disable_missing_UserDirectory_item'),'No response body')),600))`),
          after(['Increment_DisabledCount', ['Skipped']])),
        Log_Disable_Result: logEntry({
          decision: x(`if(${wrote('Disable_missing_UserDirectory_item')},'Disabled','Failed')`),
          reason: x(`if(${wrote('Disable_missing_UserDirectory_item')},if(${IN_M365},'In Microsoft 365 but outside the directory: an external guest while IncludeGuests is off, or no mailbox address','Absent from the complete Microsoft 365 read, by id and by email'),${rejected('Disable_missing_UserDirectory_item')})`),
          matchedBy: x(`if(${IN_M365},'Excluded','Absent')`),
          userId: x(txt(C('UserId'))), email: x(txt(C('Email'))), name: x(txt(C('FullName'))), directorate: x(txt(C('Directorate'))),
          status: 'disabled',
          itemId: x(txt(C('ID'))),
          summary: x(`concat('Status: ', ${low(C('Status') + "?['Value']")}, ' → disabled')`),
          changes: [{ field: 'Status', from: x(low(C('Status') + "?['Value']")), to: 'disabled' }],
        }, after(['Append_Disable_Error', ['Succeeded', 'Skipped']])),
      },
      runAfter: {},
      ...sequential,
    },
  },
  else: {
    actions: {
      Append_Disable_Withheld_Error: appendError('Reconciliation', '', '',
        x(`concat(string(length(body('Filter_Disable_Candidates'))), ' directory rows are absent from Microsoft 365, above the safety limit of ', string(outputs('Compose_Disable_Limit')), '. None were disabled. Review them in the report; if the absences are genuine, raise MaxDisablePerRun for one run.')`)),
    },
  },
  runAfter: after('Compose_Disable_Limit'),
};

/* THE COHORT IS CATALOGUED. Rows the sync creates carry PilotCohort = NewUserCohort, and every
   cohort value belongs in DGO_PilotCohorts (as COHORT-1 does). The sync registers its own the
   first time it is missing. Fail-soft: a refusal is recorded as an issue, never blocks the sync. */
const cohortGate = {
  type: 'If',
  expression: { and: [{ equals: [`@length(${arr(`body('Get_Directory_Cohort')?['value']`)})`, 0] }] },
  actions: {
    Create_Directory_Cohort: sp('PostItem', {
      dataset: SITE, table: COHORTS,
      'item/Title': 'Microsoft 365 directory sync',
      'item/CohortId': `@${S('NewUserCohort')}`,
      'item/CohortName': 'Microsoft 365 directory sync',
      'item/Status/Value': 'active',
      'item/StartDate': '@utcNow()',
      'item/OwnerEmail': `@${S('NotifyTo')}`,
      'item/Notes': 'Registered by the DGO User Directory synchronization for the rows it creates from Microsoft 365.',
    }),
    Append_Cohort_Error: appendError('Cohort', '', '',
      x(`concat('DGO_PilotCohorts did not accept the cohort ', ${S('NewUserCohort')}, '. ', take(string(coalesce(body('Create_Directory_Cohort'),'No response body')),400))`),
      after(['Create_Directory_Cohort', ['Failed', 'TimedOut']])),
  },
  else: { actions: {} },
  runAfter: after('Get_Directory_Cohort'),
};

const syncScope = {
  type: 'Scope',
  actions: {
    Search_for_users_V2: search,
    Get_existing_UserDirectory_items: getExisting,
    Condition_Source_Complete: sourceCheck,
    Filter_Eligible_M365_Users: eligible,
    Get_Directory_Cohort: sp('GetItems', { dataset: SITE, table: COHORTS, $filter: `@concat('CohortId eq ''',replace(${S('NewUserCohort')},'''',''''''),'''')`, $top: 1 }, after('Condition_Source_Complete')),
    Condition_Cohort_Registered: cohortGate,
    Compose_Directorate_Map: compose(DIRECTORATE_MAP, after('Condition_Source_Complete')),
    Compose_Unit_Keys: compose(UNIT_KEYS, after('Condition_Source_Complete')),
    Select_Normalized_Users: normalized,
    Filter_Unmapped_Departments: query(`@body('Select_Normalized_Users')`, `@and(equals(item()?['Directorate'],'Unassigned'),not(empty(item()?['Department'])))`, after('Select_Normalized_Users')),
    Select_Unmapped_Department_Names: select(`@body('Filter_Unmapped_Departments')`, `@item()?['Department']`, after('Filter_Unmapped_Departments')),
    Select_Normalized_Fingerprinted: fingerprinted,
    Select_Existing_Fingerprints: existingFingerprints,
    Select_Existing_UserIds: existingIds,
    Select_Existing_Emails: existingEmails,
    Select_M365_Ids: m365Ids,
    Select_M365_Mails: m365Mails,
    Select_M365_Upns: m365Upns,
    Compose_M365_Emails: m365Emails,
    Select_Eligible_Ids: eligibleIds,
    Select_Eligible_Emails: eligibleEmails,
    Filter_Duplicate_Email_Rows: duplicateRows,
    Select_Duplicate_Emails: duplicateEmails,
    Condition_Duplicates_Found: duplicateGate,
    Filter_Users_To_Process: toProcess,
    Apply_to_each_M365_user: perUser,
    Filter_Disable_Candidates: candidates,
    Compose_Disable_Limit: disableLimit,
    Condition_Disable_Within_Limit: disableGate,
  },
  runAfter: after('Compose_Settings'),
};

/* ═════════════════════════════ 3. report and notify ═════════════════════════════ */

const SYNC_STATUS = `actions('Scope_UserDirectory_Synchronization')?['status']`;

const outcomeKey = compose(`@if(equals(${SYNC_STATUS},'Succeeded'),if(greater(length(variables('Errors')),0),'warning','success'),'failed')`);
const pick = (a, b, c) => `@if(equals(outputs('Compose_Outcome_Key'),'success'),'${a}',if(equals(outputs('Compose_Outcome_Key'),'warning'),'${b}','${c}'))`;
const outcome = compose({
  key: `@outputs('Compose_Outcome_Key')`,
  label: pick('Succeeded', 'Completed with warnings', 'Failed'),
  tag: pick('SUCCEEDED', 'WARNING', 'FAILED'),
  accent: pick('#107c10', '#8a5a00', '#c50f1f'),
  tint: pick('#dff6dd', '#fff4ce', '#fde7e9'),
  icon: pick('&#10004;', '&#9888;', '&#10006;'),
  severity: pick('info', 'warning', 'error'),
  importance: pick('Normal', 'High', 'High'),
  auditEvent: pick('audit:user-directory-synced', 'audit:user-directory-synced-with-warnings', 'audit:user-directory-sync-failed'),
  headline: pick(
    'UserDirectory matches Microsoft 365.',
    'The sync finished, but some items need your attention.',
    'The sync stopped before it finished. Steps after the failure did not run.'),
  syncStatus: `@${SYNC_STATUS}`,
}, after('Compose_Outcome_Key'));

const getFlow = {
  type: 'OpenApiConnection',
  inputs: {
    parameters: { environmentName: `@${S('EnvironmentName')}`, flowName: `@${S('FlowName')}` },
    host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_flowmanagement', connection: 'shared_flowmanagement', operationId: 'GetFlow' },
  },
  runAfter: {},
};

const FP = (k) => `body('Get_Flow_Definition')?['properties']?['${k}']`;
const flowFacts = compose({
  lookupStatus: `@actions('Get_Flow_Definition')?['status']`,
  displayName: `@coalesce(${FP('displayName')},${S('FlowDisplayName')})`,
  state: `@coalesce(${FP('state')},'Unknown')`,
  createdTime: `@coalesce(${FP('createdTime')},'')`,
  lastModifiedTime: `@coalesce(${FP('lastModifiedTime')},'')`,
  triggers: `@coalesce(${FP('definitionSummary')}?['triggers'],json('[]'))`,
  actionCount: `@length(coalesce(${FP('definitionSummary')}?['actions'],json('[]')))`,
  definition: `@coalesce(${FP('definition')},json('{}'))`,
  connectionReferences: `@coalesce(${FP('connectionReferences')},json('{}'))`,
  triggerName: `@coalesce(trigger()?['name'],'')`,
  triggerStartTime: `@coalesce(trigger()?['startTime'],'')`,
  triggerScheduledTime: `@coalesce(trigger()?['scheduledTime'],'')`,
}, after(['Get_Flow_Definition', ANY]));

const getAfter = sp('GetItems', { dataset: SITE, table: USERDIR, $top: 5000 }, {}, paginate(LIST_CAP));

const statusFilter = (v) => query(`@${AFTER}`, `@equals(${low(`item()?['Status']?['Value']`)},'${v}')`, after(['Get_UserDirectory_After_Sync', ANY]));

/* Changes and reviews come from the DecisionLog the sync wrote, not from reading rows back: the log
   knows what each row was before, which the list no longer does. */
const changeLog = query(`@variables('DecisionLog')`, `@contains(createArray('Created','Updated','Disabled'),item()?['decision'])`);

/* ── shared HTML fragments (inline styles: they must survive Outlook) ── */

const FONT = "font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;";
const TH = 'padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#605e5c;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #edebe9;background:#faf9f8;';
const TD = 'padding:10px 12px;font-size:13px;color:#323130;border-bottom:1px solid #edebe9;vertical-align:top;overflow-wrap:break-word;';
const badge = (colorExpr, bgExpr, textExpr) =>
  `concat('<span style="display:inline-block;white-space:nowrap;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;line-height:18px;color:',${colorExpr},';background:',${bgExpr},';">',${textExpr},'</span>')`;
const changeColor = (e, a, b, c) => `if(equals(${e},'Created'),'${a}',if(equals(${e},'Disabled'),'${c}','${b}'))`;
const statusColor = (e, active, staged, disabled, other) => `if(equals(${e},'active'),'${active}',if(equals(${e},'staged'),'${staged}',if(equals(${e},'disabled'),'${disabled}','${other}')))`;

const decisionColor = (e, fg) => fg
  ? `if(equals(${e},'Created'),'#0e700e',if(or(equals(${e},'Disabled'),equals(${e},'Failed')),'#a4262c',if(equals(${e},'Updated'),'#0f548c',if(equals(${e},'Conflict'),'#8a5a00',if(equals(${e},'Protected'),'#5c2e91','#605e5c')))))`
  : `if(equals(${e},'Created'),'#dff6dd',if(or(equals(${e},'Disabled'),equals(${e},'Failed')),'#fde7e9',if(equals(${e},'Updated'),'#deecf9',if(equals(${e},'Conflict'),'#fff4ce',if(equals(${e},'Protected'),'#efe6f9','#f3f2f1')))))`;
const PERSON = `'<td style="${TD}"><strong>',${esc(`item()?['name']`)},'</strong><br><span style="color:#605e5c;font-size:12px;">',${esc(`item()?['email']`)},'</span></td>'`;
const DECISION_BADGE = `'<td style="${TD}">',${badge(decisionColor(`item()?['decision']`, true), decisionColor(`item()?['decision']`, false), `item()?['decision']`)},'</td>'`;

const changeRowsHtml = select(`@body('Filter_Change_Log')`,
  `@concat('<tr data-type="',item()?['decision'],'">',${DECISION_BADGE},${PERSON},`
  + `'<td style="${TD}">',replace(${esc(`item()?['summary']`)},' | ','<br>'),'</td>',`
  + `'<td class="hide-sm" style="${TD}">',${badge(statusColor(`item()?['status']`, '#0e700e', '#0f548c', '#a4262c', '#605e5c'), statusColor(`item()?['status']`, '#dff6dd', '#deecf9', '#fde7e9', '#f3f2f1'), `if(empty(item()?['status']),'unset',item()?['status'])`)},'</td></tr>')`,
  after('Filter_Change_Log'));

const duplicateRowsHtml = select(`@${arr(`body('Filter_Duplicate_Email_Rows')`)}`,
  `@concat('<tr>',`
  + `'<td style="${TD}"><strong>',${esc(low(`item()?['Email']`))},'</strong></td>',`
  + `'<td style="${TD}">Item&nbsp;',${txt(`item()?['ID']`)},'<br><span style="color:#605e5c;font-size:12px;">',${esc(`item()?['FullName']`)},'</span></td>',`
  + `'<td class="hide-sm" style="${TD}font-size:12px;word-break:break-all;">',${esc(`item()?['UserId']`)},'</td>',`
  + `'<td style="${TD}">',${esc(`item()?['Role']?['Value']`)},' / ',${esc(`item()?['Persona']?['Value']`)},'</td>',`
  + `'<td style="${TD}">',${badge(statusColor(low(`item()?['Status']?['Value']`), '#0e700e', '#0f548c', '#a4262c', '#605e5c'), statusColor(low(`item()?['Status']?['Value']`), '#dff6dd', '#deecf9', '#fde7e9', '#f3f2f1'), low(`item()?['Status']?['Value']`))},'</td>',`
  + `'<td class="hide-sm" style="${TD}font-size:12px;word-break:break-all;">',if(empty(${txt(`item()?['PilotCohort']`)}),'&mdash;',${esc(`item()?['PilotCohort']`)}),'<br>',if(empty(${txt(`item()?['CreatedBy']`)}),'created by hand',${esc(`item()?['CreatedBy']`)}),'</td></tr>')`);

const decisionRowsHtml = select(`@variables('DecisionLog')`,
  `@concat('<tr data-type="',item()?['decision'],'">',${DECISION_BADGE},${PERSON},`
  + `'<td class="hide-sm" style="${TD}white-space:nowrap;">',${esc(`item()?['matchedBy']`)},'</td>',`
  + `'<td style="${TD}">',${esc(`item()?['reason']`)},'</td></tr>')`);

const errorRowsHtml = select(`@variables('Errors')`,
  `@concat('<tr>',`
  + `'<td style="${TD}white-space:nowrap;"><strong>',${esc(`item()?['stage']`)},'</strong></td>',`
  + `'<td style="${TD}">',if(empty(${txt(`item()?['email']`)}),'&mdash;',${esc(`item()?['email']`)}),if(empty(${txt(`item()?['userId']`)}),'',concat('<br><span style="color:#605e5c;font-size:11px;">',${esc(`item()?['userId']`)},'</span>')),'</td>',`
  + `'<td style="${TD}word-break:break-word;">',${esc(`item()?['detail']`)},'</td>',`
  + `'<td class="hide-sm" style="${TD}white-space:nowrap;color:#605e5c;">',${esc(`item()?['at']`)},'</td></tr>')`);

const absentRecords = select(`@${arr(`body('Filter_Disable_Candidates')`)}`, {
  ItemId: x(txt(`item()?['ID']`)),
  UserId: x(txt(`item()?['UserId']`)),
  FullName: x(txt(`item()?['FullName']`)),
  Email: x(txt(`item()?['Email']`)),
  Directorate: x(txt(`item()?['Directorate']`)),
  StatusBefore: x(low(`item()?['Status']?['Value']`)),
  PilotCohort: x(txt(`item()?['PilotCohort']`)),
});

const absentRowsHtml = select(`@body('Select_Absent_Records')`,
  `@concat('<tr>',`
  + `'<td style="${TD}"><strong>',${esc(`item()?['FullName']`)},'</strong><br><span style="color:#605e5c;font-size:12px;">',${esc(`item()?['Email']`)},'</span></td>',`
  + `'<td class="hide-sm" style="${TD}">',${esc(`item()?['Directorate']`)},'</td>',`
  + `'<td class="hide-sm" style="${TD}">',${esc(`item()?['StatusBefore']`)},'</td>',`
  + `'<td style="${TD}">',if(${M('disableWithheld')},${badge(`'#8a5a00'`, `'#fff4ce'`, `'Withheld'`)},${badge(`'#a4262c'`, `'#fde7e9'`, `'Disabled'`)}),'</td></tr>')`,
  after('Select_Absent_Records', 'Compose_Metrics'));

const stepRecords = select(`@result('Scope_UserDirectory_Synchronization')`, {
  name: x(txt(`item()?['name']`)),
  status: x(txt(`item()?['status']`)),
  code: x(`coalesce(item()?['code'],item()?['error']?['code'],'')`),
  message: x(`coalesce(item()?['error']?['message'],'')`),
  startTime: x(`coalesce(item()?['startTime'],${STARTED})`),
  endTime: x(`coalesce(item()?['endTime'],item()?['startTime'],${STARTED})`),
});

const failedSteps = query(`@body('Select_Step_Records')`, `@contains(createArray('Failed','TimedOut','Cancelled'),item()?['status'])`, after('Select_Step_Records'));
const failedStepLines = select(`@body('Filter_Failed_Steps')`,
  `@concat('<li style="margin:0 0 6px 0;"><strong>',replace(${esc(`item()?['name']`)},'_',' '),'</strong>',if(empty(item()?['message']),'',concat(' &mdash; ',${esc(`item()?['message']`)})),'</li>')`,
  after('Filter_Failed_Steps'));

const SECS = `div(sub(ticks(item()?['endTime']),ticks(item()?['startTime'])),10000000)`;
const stepRowsHtml = select(`@body('Select_Step_Records')`,
  `@concat('<tr>',`
  + `'<td style="${TD}">',replace(${esc(`item()?['name']`)},'_',' '),'</td>',`
  + `'<td style="${TD}">',${badge(`if(equals(item()?['status'],'Succeeded'),'#0e700e',if(equals(item()?['status'],'Skipped'),'#605e5c','#a4262c'))`, `if(equals(item()?['status'],'Succeeded'),'#dff6dd',if(equals(item()?['status'],'Skipped'),'#f3f2f1','#fde7e9'))`, `item()?['status']`)},'</td>',`
  + `'<td class="hide-sm" style="${TD}white-space:nowrap;">',formatDateTime(item()?['startTime'],'HH:mm:ss'),'</td>',`
  + `'<td style="${TD}white-space:nowrap;text-align:right;">',string(${SECS}),' s</td>',`
  + `'<td class="hide-sm" style="${TD}word-break:break-word;color:#605e5c;">',if(empty(item()?['message']),'&mdash;',${esc(`item()?['message']`)}),'</td></tr>')`,
  after('Select_Step_Records'));

const EL = `length(${arr(`body('Filter_Eligible_M365_Users')`)})`;
const metrics = compose({
  m365Total: `@length(${M365})`,
  m365Eligible: `@${EL}`,
  m365Excluded: `@sub(length(${M365}),${EL})`,
  screened: `@length(${arr(`body('Filter_Users_To_Process')`)})`,
  unchanged: `@sub(${EL},length(${arr(`body('Filter_Users_To_Process')`)}))`,
  existingBefore: `@length(${EXISTING})`,
  created: `@variables('CreatedCount')`,
  updated: `@variables('UpdatedCount')`,
  disabled: `@variables('DisabledCount')`,
  skipped: `@variables('SkippedCount')`,
  errors: `@length(variables('Errors'))`,
  absent: `@length(${arr(`body('Filter_Disable_Candidates')`)})`,
  disableLimit: `@coalesce(outputs('Compose_Disable_Limit'),0)`,
  disableWithheld: `@greater(length(${arr(`body('Filter_Disable_Candidates')`)}),coalesce(outputs('Compose_Disable_Limit'),0))`,
  duplicateUserIdRows: `@sub(length(${arr(`body('Select_Existing_UserIds')`)}),length(union(${arr(`body('Select_Existing_UserIds')`)},${arr(`body('Select_Existing_UserIds')`)})))`,
  duplicateEmailRows: `@sub(length(${arr(`body('Select_Existing_Emails')`)}),length(union(${arr(`body('Select_Existing_Emails')`)},${arr(`body('Select_Existing_Emails')`)})))`,
  directoryReadOk: `@equals(actions('Get_UserDirectory_After_Sync')?['status'],'Succeeded')`,
  directoryTotal: `@length(${AFTER})`,
  directoryActive: `@length(${arr(`body('Filter_Status_Active')`)})`,
  directoryStaged: `@length(${arr(`body('Filter_Status_Staged')`)})`,
  directoryDisabled: `@length(${arr(`body('Filter_Status_Disabled')`)})`,
  directoryOther: `@sub(length(${AFTER}),add(add(length(${arr(`body('Filter_Status_Active')`)}),length(${arr(`body('Filter_Status_Staged')`)})),length(${arr(`body('Filter_Status_Disabled')`)})))`,
  touched: `@length(${arr(`body('Filter_Change_Log')`)})`,
  reviewed: `@length(variables('DecisionLog'))`,
  duplicateRows: `@length(${arr(`body('Filter_Duplicate_Email_Rows')`)})`,
  cohortRegistered: `@equals(actions('Create_Directory_Cohort')?['status'],'Succeeded')`,
  unmappedAccounts: `@length(${arr(`body('Filter_Unmapped_Departments')`)})`,
  unmappedDepartments: `@union(${arr(`body('Select_Unmapped_Department_Names')`)},${arr(`body('Select_Unmapped_Department_Names')`)})`,
  failedSteps: `@length(${arr(`body('Filter_Failed_Steps')`)})`,
  durationSeconds: `@div(sub(ticks(utcNow()),ticks(${STARTED})),10000000)`,
  completedAtUtc: '@{utcNow()}',
}, after('Compose_Outcome', 'Filter_Change_Log', 'Filter_Status_Active', 'Filter_Status_Staged', 'Filter_Status_Disabled', 'Filter_Failed_Steps'));

const bar = (label, valueKey, scaleKey, color) => ({ label, value: `@${M(valueKey)}`, scale: `@${M(scaleKey)}`, color });
const chartData = compose([
  bar('Created', 'created', 'm365Total', '#107c10'),
  bar('Updated', 'updated', 'm365Total', '#0f6cbd'),
  bar('Already up to date', 'unchanged', 'm365Total', '#8a8886'),
  bar('Skipped in run', 'skipped', 'm365Total', '#c19c00'),
  bar('Excluded (guest or no mailbox)', 'm365Excluded', 'm365Total', '#8764b8'),
  bar('Active', 'directoryActive', 'directoryTotal', '#107c10'),
  bar('Staged', 'directoryStaged', 'directoryTotal', '#0f6cbd'),
  bar('Disabled', 'directoryDisabled', 'directoryTotal', '#c50f1f'),
  bar('Other or unset', 'directoryOther', 'directoryTotal', '#8a8886'),
], after('Compose_Metrics'));

const PCT = `div(mul(item()?['value'],100),max(1,item()?['scale']))`;
const chartBars = select(`@outputs('Compose_Chart_Data')`,
  `@concat('<tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#323130;white-space:nowrap;">',item()?['label'],'</td>',`
  + `'<td style="padding:6px 0;width:100%;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#edebe9;border-radius:4px;"><tr>',`
  + `if(greater(item()?['value'],0),concat('<td width="',string(max(1,${PCT})),'%" style="background:',item()?['color'],';height:12px;line-height:12px;font-size:0;border-radius:4px;">&nbsp;</td>'),''),`
  + `'<td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr></table></td>',`
  + `'<td style="padding:6px 0 6px 12px;font-size:13px;font-weight:600;color:#201f1e;text-align:right;white-space:nowrap;">',${num(`item()?['value']`)},' <span style="color:#605e5c;font-weight:400;">',string(${PCT}),'%</span></td></tr>')`,
  after('Compose_Chart_Data'));

const narrative = compose(
  x(`concat('Read ', ${num(M('m365Total'))}, ' Microsoft 365 accounts and ', ${num(M('existingBefore'))}, ' UserDirectory rows. ',`
  + ` ${num(M('m365Eligible'))}, ' accounts were eligible and ', ${num(M('unchanged'))}, ' of them were already up to date. ',`
  + ` 'This run created ', ${num(M('created'))}, ', updated ', ${num(M('updated'))}, ' and disabled ', ${num(M('disabled'))}, ' row(s)',`
  + ` if(greater(${M('skipped')},0), concat(', and left ', ${num(M('skipped'))}, ' unchanged after review'), ''), '. ',`
  + ` if(greater(${M('errors')},0), concat(${num(M('errors'))}, ' item(s) need attention; they are listed below. '), 'No issues were recorded. '),`
  + ` if(${M('disableWithheld')}, concat('Disabling was withheld: ', ${num(M('absent'))}, ' rows are absent from Microsoft 365, above the limit of ', ${num(M('disableLimit'))}, '. '), ''),`
  + ` if(greater(${M('failedSteps')},0), concat(${num(M('failedSteps'))}, ' step(s) failed. '), ''))`),
  after('Compose_Metrics'));

const telemetry = compose({
  capture_metadata: { telemetry_kind: 'flow_run_record', capture_version: PACKAGE_VERSION, captured_at_utc: '@{utcNow()}' },
  flow: {
    name: `@${S('FlowName')}`,
    display_name: `@${F('displayName')}`,
    environment: `@${S('EnvironmentName')}`,
    state: `@${F('state')}`,
    created_time: `@${F('createdTime')}`,
    last_modified_time: `@${F('lastModifiedTime')}`,
    flow_url: `@${S('FlowUrl')}`,
    lookup_status: `@${F('lookupStatus')}`,
    triggers: `@${F('triggers')}`,
    definition: `@${F('definition')}`,
    connection_references: `@${F('connectionReferences')}`,
  },
  run: {
    run_id: `@${S('RunName')}`,
    logical_run_id: `@${S('RunId')}`,
    request_id: `@${S('RequestId')}`,
    run_url: `@${S('RunUrl')}`,
    trigger_name: `@${F('triggerName')}`,
    trigger_start_time: `@${F('triggerStartTime')}`,
    trigger_scheduled_time: `@${F('triggerScheduledTime')}`,
    started_at_utc: `@${STARTED}`,
    completed_at_utc: `@${M('completedAtUtc')}`,
    duration_seconds: `@${M('durationSeconds')}`,
    outcome: `@${O('label')}`,
    sync_scope_status: `@${O('syncStatus')}`,
    summary: `@outputs('Compose_Narrative')`,
  },
  inputs: {
    settings: `@outputs('Compose_Settings')`,
    sources: {
      microsoft_365: { connector: 'Office 365 Users', operation: 'SearchUserV2', page_size: 1000, safety_cap: `@${S('M365PageCap')}`, accounts_read: `@${M('m365Total')}` },
      user_directory: { site: SITE, list_id: USERDIR, safety_cap: `@${S('ListPageCap')}`, rows_read: `@${M('existingBefore')}` },
    },
  },
  outputs: {
    metrics: `@outputs('Compose_Metrics')`,
    changes: `@body('Filter_Change_Log')`,
    decisions: `@variables('DecisionLog')`,
    absent_accounts: `@body('Select_Absent_Records')`,
    errors: `@variables('Errors')`,
  },
  steps: `@body('Select_Step_Records')`,
}, after('Compose_Narrative', 'Compose_Flow_Facts', 'Select_Absent_Records'));

const auditMeta = compose({
  outcome: `@${O('label')}`,
  runUrl: `@${S('RunUrl')}`,
  summary: `@outputs('Compose_Narrative')`,
  metrics: `@outputs('Compose_Metrics')`,
  errors: `@take(variables('Errors'),20)`,
}, after('Compose_Sync_Report_Data'));

const audit = sp('PostItem', {
  dataset: SITE, table: AUDIT,
  /* The branch's audit convention (auditRow() in scripts/build-internal-designer-paste.mjs and the
     DGO_AuditLog seed row): AuditId <module>:<event>:<requestId>; Event audit:<kebab-case>;
     lower-case, hyphenated module, action and entity type; a system actor recorded as
     systemAdmin / admin. */
  'item/Title': `@concat('User directory sync: ', ${O('label')}, ' (', ${S('RunId')}, ')')`,
  'item/AuditId': `@concat('user-directory:', last(split(${O('auditEvent')},':')), ':', ${S('RequestId')})`,
  'item/RequestId': `@${S('RequestId')}`,
  'item/Event': `@${O('auditEvent')}`,
  'item/Module': 'user-directory',
  'item/Action': 'full-reconciliation',
  'item/ActorEmail': `@${S('SyncActor')}`,
  'item/ActorRole': 'systemAdmin',
  'item/ActorPersona': 'admin',
  'item/EntityType': 'user-directory',
  'item/EntityId': USERDIR,
  'item/Ref': `@take(${S('RunUrl')},255)`,
  'item/Severity/Value': `@${O('severity')}`,
  'item/CreatedAt': '@utcNow()',
  'item/MetaJson': `@{string(outputs('Compose_Audit_Meta'))}`,
}, after('Compose_Audit_Meta'));

const links = compose({
  run: `@${S('RunUrl')}`,
  flow: `@${S('FlowUrl')}`,
  list: `@${S('UserDirectoryListUrl')}`,
  auditList: `@${S('AuditListUrl')}`,
  auditItem: `@coalesce(body('Create_Governance_Audit')?['{Link}'],${S('AuditListUrl')})`,
  auditItemId: `@${txt(`body('Create_Governance_Audit')?['ID']`)}`,
  auditCreated: `@equals(actions('Create_Governance_Audit')?['status'],'Succeeded')`,
  reportFile: `@concat('UserDirectorySync_', ${S('RunId')}, '_', ${O('key')}, '_report.html')`,
  telemetryFile: `@concat('UserDirectorySync_', ${S('RunId')}, '_', ${O('key')}, '_sync-data.json')`,
}, after(['Create_Governance_Audit', ANY]));

/* ── the two documents ── */

const kv = (label, valueExpr) =>
  `<tr><td style="padding:8px 12px 8px 0;font-size:13px;color:#605e5c;white-space:nowrap;vertical-align:top;border-bottom:1px solid #f3f2f1;">${label}</td><td style="padding:8px 0;font-size:13px;color:#201f1e;word-break:break-word;border-bottom:1px solid #f3f2f1;">${x(valueExpr)}</td></tr>`;
const button = (href, label, primary) => primary
  ? `<a class="btn" href="${x(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 18px;border-radius:6px;background:${x(O('accent'))};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">${label}</a>`
  : `<a class="btn" href="${x(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 17px;border-radius:6px;border:1px solid #8a8886;background:#ffffff;color:#201f1e;font-size:14px;font-weight:600;text-decoration:none;">${label}</a>`;
const kpi = (label, valueExpr, color) =>
  `<td class="kpi" width="25%" style="padding:6px;"><div style="border:1px solid #edebe9;border-radius:8px;padding:14px 12px;text-align:center;background:#ffffff;"><div style="font-size:28px;line-height:32px;font-weight:700;color:${color};">${x(num(valueExpr))}</div><div style="margin-top:4px;font-size:12px;color:#605e5c;text-transform:uppercase;letter-spacing:.05em;">${label}</div></div></td>`;
const h2 = (id, text) => `<h2 id="${id}" style="margin:28px 0 10px 0;font-size:16px;line-height:22px;font-weight:600;color:#201f1e;">${text}</h2>`;
const tableOpen = (id, heads) =>
  `<table${id ? ` id="${id}"` : ''} width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #edebe9;border-radius:6px;"><thead><tr>${heads.map(([h, cls, sort]) => `<th${cls ? ` class="${cls}"` : ''}${sort ? ' data-sort="1" tabindex="0"' : ''} style="${TH}">${h}</th>`).join('')}</tr></thead><tbody>`;
const tableClose = '</tbody></table>';

const CHANGE_HEADS = [['Change', '', 1], ['Person', '', 1], ['What changed (old → new)', '', 0], ['Status now', 'hide-sm', 1]];
const DUP_HEADS = [['Email', '', 1], ['Row', '', 1], ['UserId', 'hide-sm', 1], ['Role / persona', '', 1], ['Status', '', 1], ['Cohort / created by', 'hide-sm', 0]];
const DECISION_HEADS = [['Decision', '', 1], ['Person', '', 1], ['Matched by', 'hide-sm', 1], ['Reason', '', 0]];
const ERROR_HEADS = [['Stage', '', 1], ['User', '', 1], ['Detail', '', 0], ['When (UTC)', 'hide-sm', 1]];
const ABSENT_HEADS = [['Person', '', 1], ['Directorate', 'hide-sm', 1], ['Status before', 'hide-sm', 1], ['Action', '', 1]];
const STEP_HEADS = [['Step', '', 1], ['Status', '', 1], ['Started', 'hide-sm', 1], ['Duration', '', 1], ['Message', 'hide-sm', 0]];

const bars = (from, count) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${x(`join(${from === 'first' ? 'take' : 'skip'}(coalesce(body('Select_Chart_Bars_Html'),json('[]')),${count}),'')`)}</table>`;
const failureBox = x(`if(greater(${M('failedSteps')},0),concat('<div style="margin:16px 0 0 0;padding:14px 16px;border-left:4px solid #c50f1f;background:#fde7e9;border-radius:4px;font-size:13px;color:#201f1e;"><strong>Failed steps</strong><ul style="margin:8px 0 0 18px;padding:0;">',join(coalesce(body('Select_Failed_Step_Lines'),json('[]')),''),'</ul></div>'),'')`);
const withheldBox = x(`if(${M('disableWithheld')},concat('<div style="margin:0 0 12px 0;padding:12px 16px;border-left:4px solid #8a5a00;background:#fff4ce;border-radius:4px;font-size:13px;color:#201f1e;"><strong>Disabling was withheld.</strong> ',${num(M('absent'))},' rows are absent from Microsoft 365, above the safety limit of ',${num(M('disableLimit'))},'. Nothing was disabled. Check these accounts before raising MaxDisablePerRun for one run.</div>'),'')`);
const DUP_NOTE = '<p style="margin:0 0 10px 0;font-size:13px;color:#201f1e;">The platform signs a person in with the <strong>first</strong> row that holds their email, so every other row for that email is ignored, or wins by accident. Keep one row per person: usually the one an administrator enrolled (it carries the role), with the Microsoft 365 id written into its UserId. Delete the others, and the next run adopts and re-activates the kept row.</p>';
const q = (html) => `'${html.replace(/'/g, "''")}'`;
const dataQualityBox = x(`if(equals(${M('duplicateRows')},0),'',concat(${q(h2('duplicates', 'Duplicate rows'))},${q(DUP_NOTE)},${q(tableOpen('t-dups', DUP_HEADS))},join(coalesce(body('Select_Duplicate_Rows_Html'),json('[]')),''),${q(tableClose)}))`) + x(`if(equals(${M('unmappedAccounts')},0),'',concat(${q(h2('unmapped', 'Departments with no unit key'))},'<p style="margin:0 0 10px 0;font-size:13px;color:#201f1e;">',${num(M('unmappedAccounts'))},' Microsoft 365 accounts carry a department that matches no approved unit key, so their Directorate is kept (if it is already a unit key) or set to Unassigned, and they see only what their role allows across units. Add the name to docs/reference/directorate-aliases.csv with its unit key, or set the Directorate on the row.</p><p style="margin:0;font-size:12px;color:#605e5c;word-break:break-word;">',${esc(`join(${M('unmappedDepartments')},' · ')`)},'</p>'))`);
const dirUnavailable = x(`if(${M('directoryReadOk')},'','<p style="margin:0 0 8px 0;font-size:13px;color:#a4262c;">UserDirectory could not be read back after the run, so the status figures below are empty.</p>')`);

const runDetailsRows = [
  kv('Flow', F('displayName')),
  kv('Flow state', F('state')),
  kv('Environment', S('EnvironmentName')),
  kv('Power Automate run', S('RunName')),
  kv('Logical run ID', S('RunId')),
  kv('Request ID', S('RequestId')),
  kv('Trigger', `if(empty(${F('triggerName')}),'Not reported',${F('triggerName')})`),
  kv('Started', `concat(${wat(STARTED)},' WAT')`),
  kv('Completed', `concat(${wat(M('completedAtUtc'))},' WAT')`),
  kv('Duration', `concat(string(div(${M('durationSeconds')},60)),' min ',string(mod(${M('durationSeconds')},60)),' s')`),
  kv('Sync scope', O('syncStatus')),
  kv('Audit record', `if(${L('auditCreated')},concat('DGO_AuditLog item ',${L('auditItemId')}),'Not created')`),
  kv('Package', `concat('Scope_Global ',${S('PackageVersion')})`),
].join('');

const HEADER = (tagline) => `
<tr><td style="height:6px;line-height:6px;font-size:0;background:${x(O('accent'))};">&nbsp;</td></tr>
<tr><td class="px" style="padding:28px 32px 8px 32px;">
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#605e5c;font-weight:600;">DGO &middot; ECM Governance &middot; ${tagline}</div>
<h1 style="margin:8px 0 12px 0;font-size:24px;line-height:30px;font-weight:700;color:#201f1e;">User Directory synchronization</h1>
<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${x(O('tint'))};color:${x(O('accent'))};font-size:13px;font-weight:700;">${x(O('icon'))}&nbsp; ${x(O('label'))}</span>
<span style="display:inline-block;margin-left:8px;font-size:13px;color:#605e5c;">Run ${x(esc(S('RunId')))} &middot; ${x(`concat(${wat(STARTED)},' WAT')`)}</span>
<p style="margin:16px 0 0 0;font-size:15px;line-height:22px;color:#201f1e;font-weight:600;">${x(O('headline'))}</p>
<p style="margin:6px 0 0 0;font-size:14px;line-height:21px;color:#323130;">${x(esc(`outputs('Compose_Narrative')`))}</p>
${failureBox}
</td></tr>
<tr><td class="px" style="padding:16px 32px 0 32px;">
${button(S('RunUrl'), 'View run in Power Automate', true)}${button(S('UserDirectoryListUrl'), 'Open UserDirectory', false)}${button(L('auditItem'), 'Open audit record', false)}
</td></tr>
<tr><td class="px" style="padding:12px 26px 0 26px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${kpi('Created', M('created'), '#107c10')}${kpi('Updated', M('updated'), '#0f6cbd')}${kpi('Disabled', M('disabled'), '#c50f1f')}${kpi('Issues', M('errors'), `${x(`if(greater(${M('errors')},0),'#8a5a00','#605e5c')`)}`)}
</tr></table>
<p style="margin:10px 6px 0 6px;font-size:12px;color:#605e5c;">Microsoft 365 accounts ${x(num(M('m365Total')))} &middot; eligible ${x(num(M('m365Eligible')))} &middot; already up to date ${x(num(M('unchanged')))} &middot; UserDirectory rows now ${x(num(M('directoryTotal')))}</p>
</td></tr>`;

const EMAIL_STYLE = `body{margin:0;padding:0;background:#f3f2f1;-webkit-text-size-adjust:100%;}a{color:#0f6cbd;}table{border-collapse:collapse;}
@media only screen and (max-width:640px){.container{width:100% !important;}.px{padding-left:16px !important;padding-right:16px !important;}.kpi{display:inline-block !important;width:50% !important;box-sizing:border-box;}.hide-sm{display:none !important;}.btn{display:block !important;text-align:center !important;margin:0 0 8px 0 !important;}.outer{padding:0 !important;}td{overflow-wrap:anywhere !important;}.container{border-radius:0 !important;border-left:0 !important;border-right:0 !important;}}`;

const emailHtml = compose(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>User Directory synchronization ${x(O('label'))}</title><style>${EMAIL_STYLE}</style></head>
<body style="margin:0;padding:0;background:#f3f2f1;${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${x(O('label'))}: ${x(num(M('created')))} created, ${x(num(M('updated')))} updated, ${x(num(M('disabled')))} disabled, ${x(num(M('errors')))} issue(s).</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f2f1;"><tr><td class="outer" align="center" style="padding:24px 12px;">
<table role="presentation" class="container" width="680" cellpadding="0" cellspacing="0" border="0" style="width:680px;max-width:680px;background:#ffffff;border:1px solid #e1dfdd;border-radius:8px;${FONT}">
${HEADER('Run report')}
<tr><td class="px" style="padding:0 32px 8px 32px;">
${h2('m365', 'Microsoft 365 accounts this run')}${bars('first', 5)}
${h2('status', 'UserDirectory status after the run')}${dirUnavailable}${bars('rest', 5)}
${h2('changes', `Changes this run (${x(num(M('touched')))})`)}
${x(`if(equals(${M('touched')},0),'<p style="margin:0;font-size:13px;color:#605e5c;">No rows were written in this run.</p>',concat('${tableOpen('', CHANGE_HEADS).replace(/'/g, "''")}',join(take(coalesce(body('Select_Change_Rows_Html'),json('[]')),${S('EmailRowLimit')}),''),'${tableClose}',if(greater(${M('touched')},${S('EmailRowLimit')}),concat('<p style="margin:8px 0 0 0;font-size:12px;color:#605e5c;">Showing ',string(${S('EmailRowLimit')}),' of ',${num(M('touched'))},'. The attached report lists every change.</p>'),'')))`)}
${h2('reviewed', `Users reviewed (${x(num(M('reviewed')))})`)}
<p style="margin:0 0 10px 0;font-size:12px;color:#605e5c;">Every account the sync looked at individually, with its decision and the reason. ${x(num(M('unchanged')))} further accounts already matched and were not reviewed individually.</p>
${x(`if(equals(${M('reviewed')},0),'<p style="margin:0;font-size:13px;color:#605e5c;">No account needed individual review.</p>',concat('${tableOpen('', DECISION_HEADS).replace(/'/g, "''")}',join(take(coalesce(body('Select_Decision_Rows_Html'),json('[]')),${S('EmailRowLimit')}),''),'${tableClose}',if(greater(${M('reviewed')},${S('EmailRowLimit')}),concat('<p style="margin:8px 0 0 0;font-size:12px;color:#605e5c;">Showing ',string(${S('EmailRowLimit')}),' of ',${num(M('reviewed'))},'. The attached report lists every decision.</p>'),'')))`)}
${h2('attention', 'Needs attention')}
${withheldBox}
${x(`if(equals(${M('errors')},0),'<p style="margin:0;font-size:13px;color:#0e700e;">&#10004; No issues were recorded.</p>',concat('${tableOpen('', ERROR_HEADS).replace(/'/g, "''")}',join(take(coalesce(body('Select_Error_Rows_Html'),json('[]')),${S('EmailRowLimit')}),''),'${tableClose}',if(greater(${M('errors')},${S('EmailRowLimit')}),concat('<p style="margin:8px 0 0 0;font-size:12px;color:#605e5c;">Showing ',string(${S('EmailRowLimit')}),' of ',${num(M('errors'))},'. The attached report lists every issue.</p>'),'')))`)}
${dataQualityBox}
${x(`if(equals(${M('absent')},0),'',concat('${h2('absent', 'Absent from Microsoft 365').replace(/'/g, "''")}','${tableOpen('', ABSENT_HEADS).replace(/'/g, "''")}',join(take(coalesce(body('Select_Absent_Rows_Html'),json('[]')),${S('EmailRowLimit')}),''),'${tableClose}'))`)}
${h2('details', 'Run details')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${runDetailsRows}</table>
</td></tr>
<tr><td class="px" style="padding:20px 32px 28px 32px;border-top:1px solid #edebe9;background:#faf9f8;border-radius:0 0 8px 8px;">
<p style="margin:0 0 6px 0;font-size:12px;color:#323130;word-break:break-word;overflow-wrap:anywhere;"><strong>Attached:</strong> ${x(L('reportFile'))} (interactive report, open in a browser) and ${x(L('telemetryFile'))} (the sync data as JSON). Both are also on the audit record. The standard flow run record goes separately to the telemetry sink.</p>
<p style="margin:0;font-size:12px;color:#605e5c;">Sent automatically by ${x(esc(F('displayName')))}. Replies to this message are not monitored.</p>
</td></tr>
</table></td></tr></table></body></html>`, after('Compose_Report_Html'));

/* The interactive report: same content, every row, plus inputs, flow facts and raw data. */
const REPORT_CSS = `
:root{--bg:#f3f2f1;--card:#ffffff;--ink:#201f1e;--ink2:#323130;--muted:#605e5c;--line:#edebe9;--brand:#0f6cbd;}
*{box-sizing:border-box;}html{scroll-behavior:smooth;}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;}
.skip{position:absolute;left:-999px;top:0;background:var(--ink);color:#fff;padding:8px 12px;z-index:10;}.skip:focus{left:8px;}
nav{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);backdrop-filter:saturate(1.2) blur(6px);}
nav .in{max-width:1100px;margin:0 auto;padding:8px 16px;display:flex;gap:4px;overflow-x:auto;white-space:nowrap;}
nav a{display:inline-block;padding:6px 10px;border-radius:6px;color:var(--ink2);text-decoration:none;font-size:13px;font-weight:600;}
nav a:hover,nav a:focus{background:var(--bg);color:var(--brand);outline:none;}
main{max-width:1100px;margin:0 auto;padding:16px;}
.card{background:var(--card);border:1px solid #e1dfdd;border-radius:10px;margin:0 0 16px 0;overflow:hidden;}
.card>.body{padding:20px 24px;}
.card h2{margin:0 0 12px 0;font-size:18px;}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;}
.tile{border:1px solid var(--line);border-radius:8px;padding:14px;text-align:center;}
.tile b{display:block;font-size:28px;line-height:32px;}
.tile span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;}
.two{display:grid;grid-template-columns:1fr 1fr;gap:24px;}
.tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px 0;}
.tools input{flex:1 1 220px;min-width:0;padding:8px 12px;border:1px solid #8a8886;border-radius:6px;font:inherit;}
.tools button,.act{padding:7px 12px;border:1px solid #8a8886;border-radius:999px;background:#fff;color:var(--ink2);font:inherit;font-size:13px;cursor:pointer;}
.tools button[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:#fff;}
.count{font-size:12px;color:var(--muted);}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
th[data-sort]{cursor:pointer;user-select:none;}th[data-sort]:after{content:" \\2195";color:#a19f9d;font-size:11px;}
th[aria-sort="ascending"]:after{content:" \\2191";color:var(--ink);}th[aria-sort="descending"]:after{content:" \\2193";color:var(--ink);}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0;}dt{color:var(--muted);}dd{margin:0;word-break:break-word;}
details{border:1px solid var(--line);border-radius:8px;margin:0 0 8px 0;}summary{cursor:pointer;padding:10px 14px;font-weight:600;}
details pre{margin:0;padding:12px 14px;max-height:420px;overflow:auto;background:#faf9f8;border-top:1px solid var(--line);font:12px/1.45 Consolas,'Courier New',monospace;white-space:pre-wrap;word-break:break-word;}
.act{margin:0 14px 10px 14px;}
footer{max-width:1100px;margin:0 auto;padding:8px 16px 32px 16px;color:var(--muted);font-size:12px;}
@media (max-width:760px){td{overflow-wrap:anywhere !important;}.two{grid-template-columns:1fr;}.hide-sm{display:none !important;}.card>.body{padding:16px;}.btn{display:block !important;text-align:center;}}
@media print{nav,.tools,.act,.skip{display:none !important;}body{background:#fff;}.card{break-inside:avoid;border-color:#c8c6c4;}details{border:0;}details pre{max-height:none;}}
`;

const REPORT_JS = `
(function(){
  function rows(t){return Array.prototype.slice.call(t.tBodies[0].rows);}
  function apply(t){
    var q=(document.querySelector('input[data-for="'+t.id+'"]')||{value:''}).value.toLowerCase();
    var chip=t.getAttribute('data-chip')||'';var n=0;
    rows(t).forEach(function(r){var ok=(!chip||r.getAttribute('data-type')===chip)&&r.textContent.toLowerCase().indexOf(q)>-1;r.hidden=!ok;if(ok)n++;});
    var c=document.querySelector('[data-count="'+t.id+'"]');if(c)c.textContent=n+' of '+rows(t).length+' shown';
  }
  document.querySelectorAll('table[id]').forEach(function(t){if(t.tBodies.length)apply(t);});
  document.querySelectorAll('input[data-for]').forEach(function(i){i.addEventListener('input',function(){apply(document.getElementById(i.getAttribute('data-for')));});});
  document.querySelectorAll('button[data-chip]').forEach(function(b){b.addEventListener('click',function(){
    var t=document.getElementById(b.getAttribute('data-for'));t.setAttribute('data-chip',b.getAttribute('data-chip'));
    document.querySelectorAll('button[data-for="'+t.id+'"]').forEach(function(o){o.setAttribute('aria-pressed',o===b?'true':'false');});apply(t);});});
  document.querySelectorAll('th[data-sort]').forEach(function(th){
    function go(){var t=th.closest('table');var i=Array.prototype.indexOf.call(th.parentNode.children,th);
      var dir=th.getAttribute('aria-sort')==='ascending'?'descending':'ascending';
      th.parentNode.querySelectorAll('th').forEach(function(o){o.removeAttribute('aria-sort');});th.setAttribute('aria-sort',dir);
      var rs=rows(t).sort(function(a,b){var x=a.cells[i].textContent.trim(),y=b.cells[i].textContent.trim();
        var nx=parseFloat(x),ny=parseFloat(y);var r=(!isNaN(nx)&&!isNaN(ny))?nx-ny:(x<y?-1:x>y?1:0);return dir==='ascending'?r:-r;});
      rs.forEach(function(r){t.tBodies[0].appendChild(r);});}
    th.addEventListener('click',go);th.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});
  document.querySelectorAll('button[data-copy]').forEach(function(b){b.addEventListener('click',function(){
    var el=document.getElementById(b.getAttribute('data-copy'));var done=function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy';},1500);};
    if(navigator.clipboard){navigator.clipboard.writeText(el.textContent).then(done);}else{var r=document.createRange();r.selectNodeContents(el);var s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('copy');done();}});});
  var p=document.getElementById('print');if(p)p.addEventListener('click',function(){window.print();});
})();
`;

const toolbar = (id, placeholder, chips) =>
  `<div class="tools"><input type="search" data-for="${id}" placeholder="${placeholder}" aria-label="${placeholder}">${chips ? chips.map((c, i) => `<button type="button" data-for="${id}" data-chip="${c === 'All' ? '' : c}" aria-pressed="${i === 0}">${c}</button>`).join('') : ''}<span class="count" data-count="${id}"></span></div>`;
const rawBlock = (id, title, expr) =>
  `<details><summary>${title}</summary><button type="button" class="act" data-copy="${id}">Copy</button><pre id="${id}">${x(esc(`string(${expr})`))}</pre></details>`;
const card = (id, title, body) => `<section class="card" id="${id}" aria-labelledby="${id}-h"><div class="body"><h2 id="${id}-h">${title}</h2>${body}</div></section>`;
const tile = (label, valueExpr, color) => `<div class="tile"><b style="color:${color};">${x(num(valueExpr))}</b><span>${label}</span></div>`;

const reportHtml = compose(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>User Directory sync ${x(O('label'))} &middot; ${x(esc(S('RunId')))}</title><style>${REPORT_CSS}</style></head>
<body>
<a class="skip" href="#overview">Skip to report</a>
<nav aria-label="Report sections"><div class="in">
<a href="#overview">Overview</a><a href="#charts">Charts</a><a href="#changes">Changes</a><a href="#reviewed">Users reviewed</a><a href="#attention">Needs attention</a><a href="#absent">Absent</a><a href="#steps">Steps</a><a href="#inputs">Inputs</a><a href="#deliverables">Deliverables</a><a href="#flow">Flow</a><a href="#raw">Raw data</a>
</div></nav>
<main>
<section class="card" id="overview" aria-label="Overview"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${HEADER('Full run report')}
<tr><td class="px" style="padding:12px 32px 24px 32px;"><button type="button" id="print" class="act" style="margin:0;">Print or save as PDF</button></td></tr>
</table></section>
${card('charts', 'Charts', `<div class="two"><div><h3 style="margin:0 0 8px 0;font-size:14px;">Microsoft 365 accounts this run</h3>${bars('first', 5)}</div><div><h3 style="margin:0 0 8px 0;font-size:14px;">UserDirectory status after the run</h3>${dirUnavailable}${bars('rest', 5)}</div></div>
<div class="grid" style="margin-top:16px;">${tile('Accounts read', M('m365Total'), '#201f1e')}${tile('Eligible', M('m365Eligible'), '#201f1e')}${tile('Excluded', M('m365Excluded'), '#8764b8')}${tile('Rows before', M('existingBefore'), '#201f1e')}${tile('Rows now', M('directoryTotal'), '#201f1e')}${tile('Absent', M('absent'), '#8a5a00')}</div>`)}
${card('changes', `Changes this run (${x(num(M('touched')))})`, `<div${x(`if(equals(${M('touched')},0),' hidden','')`)}>${toolbar('t-changes', 'Filter changes by name, email, directorate…', ['All', 'Created', 'Updated', 'Disabled'])}<div class="scroll">${tableOpen('t-changes', CHANGE_HEADS)}${x(`join(coalesce(body('Select_Change_Rows_Html'),json('[]')),'')`)}${tableClose}</div></div>${x(`if(equals(${M('touched')},0),'<p class="count">No rows were written in this run.</p>','')`)}`)}
${card('reviewed', `Users reviewed (${x(num(M('reviewed')))})`, `<p style="margin:0 0 12px 0;color:#605e5c;">Every account the sync reviewed individually, and every row reconciliation acted on. ${x(num(M('unchanged')))} further accounts already matched UserDirectory exactly and were not reviewed individually.</p><div${x(`if(equals(${M('reviewed')},0),' hidden','')`)}>${toolbar('t-reviewed', 'Filter by name, email or reason…', ['All', 'Created', 'Updated', 'Disabled', 'Unchanged', 'Protected', 'Ignored', 'Conflict', 'Failed'])}<div class="scroll">${tableOpen('t-reviewed', DECISION_HEADS)}${x(`join(coalesce(body('Select_Decision_Rows_Html'),json('[]')),'')`)}${tableClose}</div></div>${x(`if(equals(${M('reviewed')},0),'<p class="count">No account needed individual review.</p>','')`)}`)}
${card('attention', `Needs attention (${x(num(M('errors')))})`, `${withheldBox}<div${x(`if(equals(${M('errors')},0),' hidden','')`)}>${toolbar('t-errors', 'Filter issues…')}<div class="scroll">${tableOpen('t-errors', ERROR_HEADS)}${x(`join(coalesce(body('Select_Error_Rows_Html'),json('[]')),'')`)}${tableClose}</div></div>${x(`if(equals(${M('errors')},0),'<p class="count">&#10004; No issues were recorded.</p>','')`)}${dataQualityBox}`)}
${card('absent', `Absent from Microsoft 365 (${x(num(M('absent')))})`, `<p style="margin:0 0 12px 0;color:#605e5c;">Rows with a UserId that is not in the complete Microsoft 365 read, by id or email. Bootstrap and already-disabled rows are never included. Limit this run: ${x(num(M('disableLimit')))}.</p><div${x(`if(equals(${M('absent')},0),' hidden','')`)}>${toolbar('t-absent', 'Filter absent accounts…')}<div class="scroll">${tableOpen('t-absent', ABSENT_HEADS)}${x(`join(coalesce(body('Select_Absent_Rows_Html'),json('[]')),'')`)}${tableClose}</div></div>${x(`if(equals(${M('absent')},0),'<p class="count">Every UserDirectory row with a UserId is present in Microsoft 365.</p>','')`)}`)}
${card('steps', 'Steps', `<p style="margin:0 0 12px 0;color:#605e5c;">Every top-level step of the synchronization scope, in the order the runtime reports them.</p><div class="scroll">${tableOpen('t-steps', STEP_HEADS)}${x(`join(coalesce(body('Select_Step_Rows_Html'),json('[]')),'')`)}${tableClose}</div>`)}
${card('inputs', 'Inputs', `<dl>
<dt>Microsoft 365 source</dt><dd>Office 365 Users &middot; Search for users (V2), 1,000 per page, safety cap ${x(num(S('M365PageCap')))} &middot; ${x(num(M('m365Total')))} accounts read, ${x(num(M('m365Eligible')))} eligible, ${x(num(M('m365Excluded')))} excluded (external guests, or no id or mailbox address)</dd>
<dt>UserDirectory</dt><dd><a href="${x(S('UserDirectoryListUrl'))}">DGO_UserDirectory</a> (${USERDIR}) on ${SITE} &middot; ${x(num(M('existingBefore')))} rows read, safety cap ${x(num(S('ListPageCap')))}</dd>
<dt>Matching</dt><dd>By Microsoft 365 object id, then by email. An email match adopts the row and writes the object id to it. Bootstrap rows are never changed.</dd>
<dt>Fields written</dt><dd>Title, UserId, FullName, Email, Directorate, Department, JobTitle, Phone, Status (only as Microsoft 365 decides), DisabledReason, UpdatedAt, UpdatedBy. Role, Persona, AccessScope and PilotCohort are kept.</dd>
<dt>New rows</dt><dd>Role ${x(S('NewUserRole'))}, persona ${x(S('NewUserPersona'))}, status ${x(S('NewUserStatus'))} (staged when Microsoft 365 does not report the account state), cohort ${x(S('NewUserCohort'))}</dd>
<dt>Disable limit</dt><dd>The larger of ${x(num(S('MaxDisablePerRun')))} rows or ${x(num(S('MaxDisablePercent')))}% of UserDirectory &middot; this run: ${x(num(M('disableLimit')))}</dd>
<dt>Written as</dt><dd>${x(S('SyncActor'))}</dd>
<dt>Recipients</dt><dd>${x(esc(S('NotifyTo')))}</dd>
</dl>`)}
${card('deliverables', 'Deliverables', `<dl>
<dt>UserDirectory rows</dt><dd>${x(num(M('created')))} created, ${x(num(M('updated')))} updated, ${x(num(M('disabled')))} disabled &middot; <a href="${x(S('UserDirectoryListUrl'))}">open list</a></dd>
<dt>Audit record</dt><dd>${x(`if(${L('auditCreated')},concat('<a href="',${L('auditItem')},'">DGO_AuditLog item ',${L('auditItemId')},'</a> &middot; severity ',${O('severity')}),'Not created. See the Steps section and the run history.')`)}</dd>
<dt>Attachments</dt><dd>${x(L('reportFile'))} (this report) and ${x(L('telemetryFile'))} (the sync data: metrics, decisions, changes, issues), on the audit record and on the email</dd>
<dt>Pilot cohort</dt><dd>${x(`if(${M('cohortRegistered')},concat(${S('NewUserCohort')},' registered in DGO_PilotCohorts by this run'),concat(${S('NewUserCohort')},' (already in DGO_PilotCohorts, or not needed)'))`)}</dd>
<dt>Email</dt><dd>Run report to ${x(esc(S('NotifyTo')))}, importance ${x(O('importance'))}</dd>
<dt>Flow telemetry</dt><dd>After this report: the standard flow run record (capture v2.0.0) with its schema, trigger schema, full definition and varResponse, as a Portal Flow Telemetry row and an email to ${x(esc(S('TelemetryTo')))}</dd>
</dl>`)}
${card('flow', 'Flow', `<dl>
<dt>Name</dt><dd>${x(esc(F('displayName')))}</dd>
<dt>Flow ID</dt><dd>${x(S('FlowName'))}</dd>
<dt>Environment</dt><dd>${x(S('EnvironmentName'))}</dd>
<dt>State</dt><dd>${x(F('state'))}</dd>
<dt>Created</dt><dd>${x(`if(empty(${F('createdTime')}),'Not reported',concat(${wat(ts(F('createdTime')))},' WAT'))`)}</dd>
<dt>Last modified</dt><dd>${x(`if(empty(${F('lastModifiedTime')}),'Not reported',concat(${wat(ts(F('lastModifiedTime')))},' WAT'))`)}</dd>
<dt>Trigger</dt><dd>${x(`if(empty(${F('triggerName')}),'Not reported',${F('triggerName')})`)}${x(`if(empty(${F('triggerScheduledTime')}),'',concat(' &middot; scheduled ',${F('triggerScheduledTime')}))`)}</dd>
<dt>Actions in definition</dt><dd>${x(`if(equals(${F('actionCount')},0),'Not reported',string(${F('actionCount')}))`)}</dd>
<dt>Connectors</dt><dd>Office 365 Users, SharePoint, Office 365 Outlook, Power Automate Management</dd>
<dt>Definition lookup</dt><dd>${x(F('lookupStatus'))}</dd>
<dt>Links</dt><dd><a href="${x(S('RunUrl'))}">This run</a> &middot; <a href="${x(S('FlowUrl'))}">Flow details</a> &middot; <a href="${x(S('AuditListUrl'))}">DGO_AuditLog</a></dd>
</dl>
<h3 style="margin:20px 0 8px 0;font-size:14px;">Run details</h3><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${runDetailsRows}</table>`)}
${card('raw', 'Raw data', `<p style="margin:0 0 12px 0;color:#605e5c;">Everything above, as data. The attached run record holds all of it in one JSON document.</p>
${rawBlock('raw-metrics', 'Metrics', `outputs('Compose_Metrics')`)}
${rawBlock('raw-settings', 'Settings (inputs)', `outputs('Compose_Settings')`)}
${rawBlock('raw-changes', 'Changes (old → new)', `body('Filter_Change_Log')`)}
${rawBlock('raw-decisions', 'Decision log', `variables('DecisionLog')`)}
${rawBlock('raw-errors', 'Issues', `variables('Errors')`)}
${rawBlock('raw-absent', 'Absent accounts', `body('Select_Absent_Records')`)}
${rawBlock('raw-steps', 'Step results', `body('Select_Step_Records')`)}
${rawBlock('raw-definition', 'Flow definition', F('definition'))}
${rawBlock('raw-connections', 'Connection references', F('connectionReferences'))}`)}
</main>
<footer>Generated ${x(`concat(${wat('utcNow()')},' WAT')`)} by ${x(esc(F('displayName')))} &middot; Scope_Global ${x(S('PackageVersion'))}</footer>
<script>${REPORT_JS}</script>
</body></html>`, after('Compose_Links', 'Select_Chart_Bars_Html', 'Select_Change_Rows_Html', 'Select_Decision_Rows_Html', 'Select_Duplicate_Rows_Html', 'Select_Error_Rows_Html', 'Select_Absent_Rows_Html', 'Select_Step_Rows_Html', 'Select_Failed_Step_Lines'));

const attach = (displayName, contentExpr, runAfter) => sp('CreateAttachment', {
  dataset: SITE, table: AUDIT,
  itemId: `@${L('auditItemId')}`,
  displayName,
  body: `@{${contentExpr}}`,
}, runAfter);

const sendEmail = {
  type: 'OpenApiConnection',
  inputs: {
    parameters: {
      'emailMessage/To': `@${S('NotifyTo')}`,
      'emailMessage/Subject': `@concat('[DGO][', ${O('tag')}, '] User Directory sync: ', ${num(M('created'))}, ' created, ', ${num(M('updated'))}, ' updated, ', ${num(M('disabled'))}, ' disabled', if(greater(${M('errors')},0), concat(', ', ${num(M('errors'))}, ' issue(s)'), ''), ' | ', ${S('RunId')})`,
      'emailMessage/Body': `@outputs('Compose_Email_Html')`,
      'emailMessage/Attachments': [
        { Name: `@${L('reportFile')}`, ContentBytes: `@{outputs('Compose_Report_Html')}` },
        { Name: `@${L('telemetryFile')}`, ContentBytes: `@{string(outputs('Compose_Sync_Report_Data'))}` },
      ],
      'emailMessage/Importance': `@${O('importance')}`,
    },
    host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'SendEmailV2' },
  },
  runAfter: after('Compose_Email_Html', ['Attach_Sync_Data_Json', ANY]),
};

const reportScope = {
  type: 'Scope',
  actions: {
    Compose_Outcome_Key: outcomeKey,
    Compose_Outcome: outcome,
    Get_Flow_Definition: getFlow,
    Compose_Flow_Facts: flowFacts,
    Get_UserDirectory_After_Sync: getAfter,
    Filter_Change_Log: changeLog,
    Filter_Status_Active: statusFilter('active'),
    Filter_Status_Staged: statusFilter('staged'),
    Filter_Status_Disabled: statusFilter('disabled'),
    Select_Step_Records: stepRecords,
    Filter_Failed_Steps: failedSteps,
    Select_Failed_Step_Lines: failedStepLines,
    Select_Step_Rows_Html: stepRowsHtml,
    Select_Change_Rows_Html: changeRowsHtml,
    Select_Decision_Rows_Html: decisionRowsHtml,
    Select_Duplicate_Rows_Html: duplicateRowsHtml,
    Select_Error_Rows_Html: errorRowsHtml,
    Select_Absent_Records: absentRecords,
    Compose_Metrics: metrics,
    Select_Absent_Rows_Html: absentRowsHtml,
    Compose_Chart_Data: chartData,
    Select_Chart_Bars_Html: chartBars,
    Compose_Narrative: narrative,
    Compose_Sync_Report_Data: telemetry,
    Compose_Audit_Meta: auditMeta,
    Create_Governance_Audit: audit,
    Compose_Links: links,
    Compose_Report_Html: reportHtml,
    Compose_Email_Html: emailHtml,
    Attach_Report_Html: attach(`@${L('reportFile')}`, `outputs('Compose_Report_Html')`, after('Compose_Email_Html')),
    Attach_Sync_Data_Json: attach(`@${L('telemetryFile')}`, `string(outputs('Compose_Sync_Report_Data'))`, after(['Attach_Report_Html', ANY])),
    Send_Run_Report: sendEmail,
  },
  runAfter: after(['Scope_UserDirectory_Synchronization', ANY]),
};

/* ═════════════════════════════ 4. flow data capture (estate standard) ═════════════════════════════

   The observability harness every platform flow carries: Scope_Flow_Data_Capture composes the
   versioned flow_run_record (capture_version 2.0.0 — capture_metadata, workflow_identity,
   run_identity, trigger_record, request, design_definition, response_record, outcome, timing) with
   its JSON Schema, writes a row to Portal Flow Telemetry, and mails the five standard
   <Flow>__<RunId>__*.json attachments.

   Adapted for a scheduled flow, and nothing else changed:
     request          a Recurrence trigger carries no headers, query or body — nothing to redact
     response_record  the flow answers nobody; its "response" is the run report email, so the
                      record describes Send_Run_Report, and varResponse.json is Compose_Run_Response
     outcome          all_scope_action_results lists every step of both scopes WITHOUT outputs —
                      the Microsoft 365 read is the whole staff directory and does not belong in
                      telemetry. */

const RUN_RECORD_SCHEMA = JSON.parse(readFileSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/contracts/flow-run-record-schema.json'), 'utf8')).recordSchema;

const REPORT_STATUS = `actions('Scope_Report_And_Notify')?['status']`;
const FLOW_OUTCOME = `if(and(equals(${SYNC_STATUS},'Succeeded'),equals(${REPORT_STATUS},'Succeeded')),'Succeeded','Failed')`;
const GF = (k) => `outputs('Get_Flow_Definition')?['body']?['properties']?['${k}']`;
const TRIGGER_START = `coalesce(trigger()?['startTime'],${STARTED})`;
const PREFIX = `@{coalesce(workflow()?['tags']?['flowDisplayName'], workflow()?['name'], 'Flow')}__@{workflow()?['run']?['name']}__`;

const reportStepRecords = select(`@result('Scope_Report_And_Notify')`, stepRecords.inputs.select);
const allSteps = compose(`@union(${arr(`body('Select_Step_Records')`)},${arr(`body('Select_Report_Step_Records')`)})`, after('Select_Report_Step_Records'));
const allFailed = query(`@outputs('Compose_All_Step_Results')`, `@contains(createArray('Failed','TimedOut','Cancelled'),item()?['status'])`, after('Compose_All_Step_Results'));

const runResponse = compose({
  ok: `@equals(${FLOW_OUTCOME},'Succeeded')`,
  status: { outcome: `@coalesce(${O('label')},'Failed')`, synchronization: `@${SYNC_STATUS}`, reporting: `@${REPORT_STATUS}` },
  request: { runId: `@${S('RunId')}`, requestId: `@${S('RequestId')}`, run: `@${S('RunName')}` },
  timing: { startedAtUtc: `@${STARTED}`, completedAtUtc: '@{utcNow()}', durationSeconds: `@div(sub(ticks(utcNow()),ticks(${STARTED})),10000000)` },
  data: `@coalesce(outputs('Compose_Metrics'),json('{}'))`,
  errors: `@variables('Errors')`,
  meta: { package: `@concat('Scope_Global ',${S('PackageVersion')})`, runUrl: `@${S('RunUrl')}`, auditItem: `@coalesce(${L('auditItem')},'')` },
});

const runRecord = compose({
  capture_metadata: { telemetry_kind: 'flow_run_record', capture_version: '2.0.0', captured_at_utc: '@{utcNow()}', capture_scope: 'Scope_Flow_Data_Capture' },
  workflow_identity: {
    internal_name: "@{workflow()?['name']}",
    full_resource_id: "@{workflow()?['id']}",
    type: "@{workflow()?['type']}",
    location: "@{workflow()?['location']}",
    tags: "@coalesce(workflow()?['tags'], json('{}'))",
    run: "@coalesce(workflow()?['run'], json('{}'))",
  },
  run_identity: {
    run_name: "@{workflow()?['run']?['name']}",
    run_resource_id: "@{workflow()?['run']?['id']}",
    run_type: "@{workflow()?['run']?['type']}",
    environment_id: `@{${S('EnvironmentName')}}`,
    run_url: `@{${S('RunUrl')}}`,
  },
  trigger_record: {
    name: "@{trigger()?['name']}",
    start_time: "@{trigger()?['startTime']}",
    end_time: "@{trigger()?['endTime']}",
    scheduled_time: "@{trigger()?['scheduledTime']}",
    status: "@{trigger()?['status']}",
    code: "@{trigger()?['code']}",
    tracking_id: "@{trigger()?['trackingId']}",
    client_tracking_id: "@{trigger()?['clientTrackingId']}",
    origin_history_name: "@{trigger()?['originHistoryName']}",
    correlation: "@coalesce(trigger()?['correlation'], json('{}'))",
  },
  request: {
    method: "@{coalesce(triggerOutputs()?['method'],'')}",
    relative_path_parameters: "@coalesce(triggerOutputs()?['relativePathParameters'], json('{}'))",
    headers_redacted: "@json('{}')",
    queries_redacted: "@json('{}')",
    body: "@coalesce(triggerBody(), json('{}'))",
  },
  design_definition: {
    get_flow_body: "@coalesce(outputs('Get_Flow_Definition')?['body'], json('{}'))",
    display_name: `@{${GF('displayName')}}`,
    state: `@{${GF('state')}}`,
    provisioning_method: `@{${GF('provisioningMethod')}}`,
    created_time: `@{${GF('createdTime')}}`,
    last_modified_time: `@{${GF('lastModifiedTime')}}`,
    creator: `@coalesce(${GF('creator')}, json('{}'))`,
    definition: `@coalesce(${GF('definition')}, json('{}'))`,
    trigger_definition: `@coalesce(${GF('definition')}?['triggers'], json('{}'))`,
    trigger_input_schema: `@coalesce(${GF('definition')}?['triggers']?['manual']?['inputs']?['schema'], json('{}'))`,
    action_definitions: `@coalesce(${GF('definition')}?['actions'], json('{}'))`,
    connection_references: `@coalesce(${GF('connectionReferences')}, json('{}'))`,
  },
  response_record: {
    action_status: "@{actions('Send_Run_Report')?['status']}",
    action_code: "@{actions('Send_Run_Report')?['code']}",
    action_start_time: "@{actions('Send_Run_Report')?['startTime']}",
    action_end_time: "@{actions('Send_Run_Report')?['endTime']}",
    tracking_id: "@{actions('Send_Run_Report')?['trackingId']}",
    client_tracking_id: "@{actions('Send_Run_Report')?['clientTrackingId']}",
    correlation: "@coalesce(actions('Send_Run_Report')?['correlation'], json('{}'))",
    status_code_sent: "@coalesce(outputs('Send_Run_Report')?['statusCode'], 0)",
    headers_sent: "@json('{}')",
    body_sent: "@outputs('Compose_Run_Response')",
    raw_action_record: "@coalesce(actions('Send_Run_Report'), json('{}'))",
  },
  outcome: {
    flow_outcome: `@${FLOW_OUTCOME}`,
    failed_action_count: "@length(body('Filter_All_Failed_Steps'))",
    first_failed_action: "@coalesce(first(body('Filter_All_Failed_Steps')), json('{}'))",
    all_scope_action_results: "@outputs('Compose_All_Step_Results')",
  },
  timing: {
    trigger_start_time: `@{${TRIGGER_START}}`,
    captured_at_utc: '@{utcNow()}',
    total_elapsed_seconds: `@div(sub(ticks(utcNow()), ticks(${TRIGGER_START})), 10000000)`,
    total_elapsed_ms: `@div(sub(ticks(utcNow()), ticks(${TRIGGER_START})), 10000)`,
    response_action_duration_ms: `@if(empty(${txt(`actions('Send_Run_Report')?['endTime']`)}), 0, div(sub(ticks(${ts(`actions('Send_Run_Report')?['endTime']`)}), ticks(${ts(`actions('Send_Run_Report')?['startTime']`)})), 10000))`,
  },
}, after('Filter_All_Failed_Steps', 'Compose_Run_Response'));

const TELEMETRY_SITE = 'https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre';
const TELEMETRY_LIST = '726c210d-09d5-45d9-952d-7a506b644b13';

const captureScope = {
  type: 'Scope',
  actions: {
    Select_Report_Step_Records: reportStepRecords,
    Compose_All_Step_Results: allSteps,
    Filter_All_Failed_Steps: allFailed,
    Compose_Run_Response: runResponse,
    Compose_Flow_Run_Record: runRecord,
    Compose_Flow_Run_Record_Schema: compose(RUN_RECORD_SCHEMA, after('Compose_Flow_Run_Record')),
    Compose_Telemetry_Attachments: compose([
      { Name: `${PREFIX}flow_run_record.json`, ContentBytes: "@{string(outputs('Compose_Flow_Run_Record'))}" },
      { Name: `${PREFIX}flow_run_record_schema.json`, ContentBytes: "@{string(outputs('Compose_Flow_Run_Record_Schema'))}" },
      { Name: `${PREFIX}trigger_input_schema.json`, ContentBytes: `@{string(coalesce(${GF('definition')}?['triggers']?['manual']?['inputs']?['schema'], json('{}')))}` },
      { Name: `${PREFIX}full_definition.json`, ContentBytes: `@{string(coalesce(${GF('definition')}, json('{}')))}` },
      { Name: `${PREFIX}varResponse.json`, ContentBytes: "@{string(outputs('Compose_Run_Response'))}" },
    ], after('Compose_Flow_Run_Record_Schema')),
    Create_Flow_Telemetry: sp('PostItem', {
      dataset: TELEMETRY_SITE, table: TELEMETRY_LIST,
      'item/Title': `@${S('FlowDisplayName')}`,
      'item/Flow': `@${S('FlowDisplayName')}`,
      'item/RunId': `@${S('RunName')}`,
      'item/StartedAtUtc': `@${STARTED}`,
      'item/CompletedAtUtc': '@utcNow()',
      'item/Outcome': `@${FLOW_OUTCOME}`,
      'item/DurationMs': `@div(sub(ticks(utcNow()),ticks(${STARTED})),10000)`,
      'item/ErrorMessage': `@take(concat('{"errors":',string(variables('Errors')),',"failedSteps":',string(body('Filter_All_Failed_Steps')),'}'),60000)`,
      'item/RunRecordJson': `@take(string(removeProperty(outputs('Compose_Flow_Run_Record'),'design_definition')),60000)`,
    }, after('Compose_Telemetry_Attachments')),
    Send_Telemetry_Email: {
      type: 'OpenApiConnection',
      inputs: {
        parameters: {
          'emailMessage/To': `@${S('TelemetryTo')}`,
          'emailMessage/Subject': "@{coalesce(workflow()?['tags']?['flowDisplayName'], workflow()?['name'])} — Flow Run Record — @{workflow()?['run']?['name']}",
          'emailMessage/Body': `<p class="editor-paragraph">Automated flow run record capture.<br>Flow: @{coalesce(workflow()?['tags']?['flowDisplayName'], workflow()?['name'])}<br>Run: @{workflow()?['run']?['name']}<br>Outcome: @{${FLOW_OUTCOME}} (synchronization @{${SYNC_STATUS}}, report @{${REPORT_STATUS}})<br>Telemetry row: @{if(equals(actions('Create_Flow_Telemetry')?['status'],'Succeeded'),'written to Portal Flow Telemetry','NOT written')}<br><a href="@{${S('RunUrl')}}">Open the run</a></p>`,
          'emailMessage/Attachments': "@outputs('Compose_Telemetry_Attachments')",
          'emailMessage/Importance': `@if(equals(${FLOW_OUTCOME},'Succeeded'),'Normal','High')`,
        },
        host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'SendEmailV2' },
      },
      runAfter: after(['Create_Flow_Telemetry', ANY]),
    },
  },
  runAfter: after(['Scope_Report_And_Notify', ANY]),
};

/* ═════════════════════════════ 5. outcome gate ═════════════════════════════ */

const gate = {
  type: 'If',
  expression: {
    and: [
      { equals: [`@${SYNC_STATUS}`, 'Succeeded'] },
      { equals: [`@actions('Scope_Report_And_Notify')?['status']`, 'Succeeded'] },
      { equals: [`@actions('Scope_Flow_Data_Capture')?['status']`, 'Succeeded'] },
    ],
  },
  actions: {},
  else: {
    actions: {
      Terminate_Run_Failed: {
        type: 'Terminate',
        inputs: {
          runStatus: 'Failed',
          runError: {
            code: 'UserDirectorySyncFailed',
            message: `@concat('Synchronization: ', ${SYNC_STATUS}, '. Report and notification: ', actions('Scope_Report_And_Notify')?['status'], '. Flow data capture: ', actions('Scope_Flow_Data_Capture')?['status'], '. RunId=', ${S('RunId')}, '; RequestId=', ${S('RequestId')}, '. Open the run report email or the DGO_AuditLog record for details.')`,
          },
        },
        runAfter: {},
      },
    },
  },
  runAfter: after(['Scope_Flow_Data_Capture', ANY]),
};

/* ═════════════════════════════ package ═════════════════════════════ */

const scope = {
  type: 'Scope',
  actions: {
    Compose_Settings: settings,
    Scope_UserDirectory_Synchronization: syncScope,
    Scope_Report_And_Notify: reportScope,
    Scope_Flow_Data_Capture: captureScope,
    Condition_Run_Outcome: gate,
  },
  runAfter: {},
};

function connectorActions(node, out = []) {
  const visit = (actions) => {
    for (const [name, act] of Object.entries(actions || {})) {
      if (act.type === 'OpenApiConnection') out.push([name, act.inputs.host.connection]);
      visit(act.actions);
      if (act.else) visit(act.else.actions);
      if (act.cases) for (const c of Object.values(act.cases)) visit(c.actions);
      if (act.default) visit(act.default.actions);
    }
  };
  visit(node.actions);
  return out;
}

const allConnectionData = Object.fromEntries(connectorActions(scope).map(([name, api]) => [name, {
  connectionReference: {
    api: { id: `/providers/Microsoft.PowerApps/apis/${api}` },
    connection: { id: `/providers/Microsoft.PowerApps/apis/${api}/connections/${CONNECTIONS[api]}` },
    connectionName: CONNECTIONS[api],
  },
  referenceKey: api,
}]));

export const pkg = {
  nodeId: 'Scope_Global',
  serializedValue: scope,
  allConnectionData,
  staticResults: {},
  isScopeNode: true,
  mslaNode: true,
};

const text = JSON.stringify(pkg, null, 2) + '\n';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = join(ROOT, OUT);
  if (process.argv.includes('--check')) {
    let current = '';
    try { current = readFileSync(target, 'utf8'); } catch { /* missing */ }
    if (current !== text) { console.error(`✗ ${OUT} is stale — run node scripts/build-userdirectory-sync.mjs`); process.exit(1); }
    console.log(`✓ ${OUT} is current`);
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    console.log(`wrote ${OUT} (${(text.length / 1024).toFixed(0)} KB)`);
  }
}
