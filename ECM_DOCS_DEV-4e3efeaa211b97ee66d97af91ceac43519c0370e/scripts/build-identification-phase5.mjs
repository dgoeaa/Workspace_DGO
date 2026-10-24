#!/usr/bin/env node
/**
 * Identification Phase 5 (IDENTIFICATION_SYSTEM.md §12.3, §13): migration. First increment.
 *
 *   npm run idphase5
 *   npm run idphase5 -- --check
 *
 * P5-1  ID_Phase5_Survey   read-only. Measures every governed list the backfill touches, page by page over indexed ID
 *                          ranges: rows, rows without an Entity Key, rows per year of creation and, per year, rows
 *                          still without their reference; the legacy identifiers the later steps turn into aliases,
 *                          locators and structure (Reference_ID composites, RefIDD, ParentTask, ActivityTrackingID);
 *                          the small intake lists row by row (their reference shapes, for the B4 ticks-collision
 *                          count); and every counter row (§12.3 3: no year row may exist before migration claims).
 *                          It writes nothing and e-mails the result as JSON.
 * P5-2  ID_Phase5_Keys     §12.3 1, keys first. Every row without an Entity Key gets EntityKey = guid(), IdState
 *                          ACTIVE and, where the list has the column, Rev 1. Rows with a key are skipped, so a re-run
 *                          is safe and continues where a stopped run ended. DGO DIGITAL OPS (OPS_WORKING_REGISTER) is
 *                          left out: its rows are the working copies of intake records and take their register row's
 *                          key (§5 ID-01) in the register step (§12.3 2). DEV_OPS_Global_Tracking_Queue is a test list
 *                          (owner direction, 2026-10-05; spec 1.2.4) and is neither surveyed nor written.
 *
 * Writes are system updates (ValidateUpdateListItem, bNewDocumentUpdate true), sent 100 to a SharePoint $batch: no new
 * version, Modified and Editor unchanged, so no "item created or modified" flow fires on a list of 16,000 tasks.
 *
 * Both are new instant flows, so nothing here edits a tenant flow. They follow the generation kit's rules (B1): no
 * variable, no Until, no Filter array; lists are addressed through Flow Configuration (DATASET_<KEY>_*).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flowArtifactName } from './lib/flow-artifact-name.mjs';
import * as K from './lib/identification-kit.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const OUT = 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase5';
const CONFIG_SITE = 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING';
const PAGE = 5000;           // the list view threshold: one page of an indexed ID range is one query
const BATCH = 100;           // operations per SharePoint $batch
const YEARS = [2015, 12];    // range(2015, 12): 2015..2026
const CHECKED = JSON.parse(readFileSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/evidence/p1-1-list-check-2026-10-04-after-finish.json'), 'utf8')).lists;
const PROV = JSON.parse(readFileSync(join(ROOT, 'docs/reference/identification/provisioning/identity-provisioning.json'), 'utf8'));

/* What is measured on each list, and whether keys-first writes it. `pages` covers IDs up to pages × 5,000; the survey
   reports a list whose highest ID lies beyond that. `ref` is the reference column a row of that list should hold after
   §12.3 3, counted per year where it is still empty. */
const TARGETS = [
  { key: 'INTAKE_REGISTER', pages: 1, keys: true, raw: ['ReferenceId', 'LocalId', 'Channel', 'Status'] },
  { key: 'ATTACHMENTS', pages: 1, keys: true },
  { key: 'SCAN_LIBRARY', pages: 1, keys: true, raw: ['DocID'] },
  { key: 'STATUS_TIMELINE', pages: 1, keys: true },
  { key: 'SUPPORT_CASES', pages: 1, keys: true, raw: ['Title', 'CaseRef', 'AboutReference'] },
  { key: 'TASK_QUEUE', pages: 12, keys: true, ref: 'TaskRef', flags: 'task' },
  { key: 'OPS_WORKING_REGISTER', pages: 12, keys: false, ref: 'ReferenceId' },
  { key: 'MINUTES', pages: 1, keys: true },
  { key: 'AI_TEXT_LOG', pages: 2, keys: true },
  { key: 'AUDIT_LOG', pages: 1, keys: true },
  { key: 'ORG_DIRECTORY', pages: 1, keys: true },
  { key: 'IDENTITY_MAP', pages: 1, keys: false },
  { key: 'RECORD_LINKS', pages: 1, keys: false },
];
/* Which identity columns each list has, from the Phase 1 list check after P1-2 and the finish run: Rev is written only
   where the column exists, and a list without EntityKey cannot be a target. */
const byGuid = new Map(CHECKED.map((l) => [String(l.listGuid).toLowerCase(), l]));
for (const t of TARGETS) {
  const p = PROV.lists.find((l) => l.datasetKey === t.key);
  if (!p) throw new Error(`${t.key}: no list in identity-provisioning.json`);
  /* A list Phase 1 created has no GUID in the plan; the list check found it by title. */
  const c = p.listGuid ? byGuid.get(p.listGuid.toLowerCase()) : CHECKED.find((l) => l.list === p.title);
  if (!c) throw new Error(`${t.key}: the Phase 1 list check has no ${p.title}`);
  const present = String(c.identityColumnsPresent || '').split(',').map((x) => x.trim());
  if (!present.includes('EntityKey')) throw new Error(`${t.key}: ${p.title} has no EntityKey column`);
  t.title = p.title; t.rev = present.includes('Rev'); t.idState = present.includes('IdState'); t.items = c.itemCount;
  if (t.ref && !present.includes(t.ref)) throw new Error(`${t.key}: ${p.title} has no ${t.ref} column`);
  if (t.items > t.pages * PAGE) throw new Error(`${t.key}: ${t.items} items cannot fit ${t.pages} pages`);
}
const KEYED = TARGETS.filter((t) => t.keys);
const DATASETS = [...TARGETS.map((t) => t.key), 'SEQUENCE_COUNTERS'];

/* ---------------------------------------------------------------- building blocks */
const SP = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline';
const ok = (n) => ({ [n]: ['Succeeded'] });
const ALL = ['Succeeded', 'Failed', 'Skipped', 'TimedOut'];
const SITE = (key) => `outputs('Compose_Dataset_Bindings')?['DATASET_${key}_SITE_URL']`;
const LIST = (key) => `outputs('Compose_Dataset_Bindings')?['DATASET_${key}_LIST_ID']`;
const get = (key, query, runAfter) => ({ type: 'OpenApiConnection', runAfter, inputs: {
  host: { apiId: SP, connection: 'shared_sharepointonline', operationId: 'HttpRequest' },
  parameters: { dataset: `@${SITE(key)}`, 'parameters/method': 'GET',
    'parameters/uri': `_api/web/lists(guid'@{${LIST(key)}}')/items?${query}`,
    'parameters/headers': { Accept: 'application/json;odata=nometadata' } },
  retryPolicy: { type: 'exponential', count: 4, interval: 'PT10S' } } });
const rows = (a) => `coalesce(body('${a}')?['value'],json('[]'))`;
const count = (text, mark) => `sub(length(split(${text},${mark})),1)`;
const chain = (...blocks) => K.chain(...blocks);
const maxId = (a) => `int(coalesce(first(${rows(a)})?['ID'],0))`;
const mail = (to, subject, html, attachName, attach, runAfter) => ({ type: 'OpenApiConnection', runAfter, inputs: {
  host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'SendEmailV2' },
  parameters: { 'emailMessage/To': to, 'emailMessage/Subject': subject, 'emailMessage/Body': html,
    'emailMessage/Attachments': [{ Name: attachName, ContentBytes: `@base64(string(${attach}))` }], 'emailMessage/Importance': 'Normal' } } });
const context = (name) => ({ [name]: { type: 'Compose', runAfter: {}, inputs: {
  requestId: '@guid()', startedAtUtc: '@utcNow()', runName: "@workflow()?['run']?['name']",
  runBy: "@string(coalesce(triggerOutputs()?['headers']?['x-ms-user-email'],''))",
  pageSize: PAGE, batchSize: BATCH, crlf: "@decodeUriComponent('%0D%0A')" } } });
const bindings = () => K.readDatasetBindings({ keys: DATASETS, configSite: CONFIG_SITE });
/* The connections the Phase 1 instant flows were pasted with in this tenant (packages/identification-phase1): the
   designer maps each step to the flow's own connection of that connector. */
const CONNECTION = { shared_sharepointonline: '3f1943c5955a4cb8b301e8f22f2b590d', shared_office365: 'c0b9e7a5b0854c39a435fd8ce92f48ad' };
const connections = (pkg) => {
  const all = {};
  const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
    if (a.type === 'OpenApiConnection') {
      const api = a.inputs.host.apiId, key = a.inputs.host.connection;
      all[n] = { connectionReference: { api: { id: api }, connection: { id: `${api}/connections/${CONNECTION[key]}` }, connectionName: CONNECTION[key] }, referenceKey: key };
    }
    walk(a.actions); if (a.else) walk(a.else.actions);
  } };
  walk(pkg.serializedValue.actions);
  return all;
};
const node = (nodeId, actions) => {
  const pkg = { nodeId, serializedValue: { type: 'Scope', actions, runAfter: {} }, allConnectionData: {}, staticResults: {}, isScopeNode: true, mslaNode: true };
  pkg.allConnectionData = connections(pkg);
  return pkg;
};

/* ---------------------------------------------------------------- P5-1 survey */
/** One row as a short token: |<year of creation>[!] then markers. '!' straight after the year: the row still lacks its
 *  reference column. #nk: no Entity Key. Task rows: #rf Reference_ID composite, #rs/#rl RefIDD short (an item ID) or
 *  long (a Graph message ID), #pt ParentTask, #at ActivityTrackingID. */
function token(t) {
  const I = (c) => `item()?['${c}']`;
  const has = (c) => `not(empty(string(coalesce(${I(c)},''))))`;
  const parts = [
    `'|'`, `substring(concat(string(coalesce(${I('Created')},'')),'0000'),0,4)`,
    t.ref ? `if(${has(t.ref)},'','!')` : null,
    `if(${has('EntityKey')},'','#nk')`,
    ...(t.flags === 'task' ? [
      `if(${has('Reference_ID')},'#rf','')`,
      `if(${has('RefIDD')},if(less(length(string(${I('RefIDD')})),13),'#rs','#rl'),'')`,
      `if(greater(int(coalesce(${I('ParentTaskId')},0)),0),'#pt','')`,
      `if(${has('ActivityTrackingID')},'#at','')`,
    ] : []),
  ].filter(Boolean);
  return `@concat(${parts.join(',')})`;
}
function surveyTarget(t) {
  const cols = ['ID', 'Created', 'EntityKey', ...(t.ref ? [t.ref] : []), ...(t.flags === 'task' ? ['Reference_ID', 'RefIDD', 'ParentTaskId', 'ActivityTrackingID'] : []), ...(t.raw || [])];
  const uniq = [...new Set(cols)];
  const A = {};
  A[`Get_Max_${t.key}`] = get(t.key, '$select=ID&$orderby=ID%20desc&$top=1', {});
  let prev = `Get_Max_${t.key}`;
  for (let p = 0; p < t.pages; p++) {
    const g = `Get_${t.key}_${p + 1}`, s = `Select_${t.key}_${p + 1}`;
    A[g] = get(t.key, `$select=${uniq.join(',')}&$filter=ID%20gt%20${p * PAGE}%20and%20ID%20le%20${(p + 1) * PAGE}&$top=${PAGE}`, ok(prev));
    A[s] = { type: 'Select', runAfter: ok(g), inputs: { from: `@${rows(g)}`, select: token(t) } };
    prev = s;
  }
  const TOK = `outputs('Compose_${t.key}_Tokens')`;
  A[`Compose_${t.key}_Tokens`] = { type: 'Compose', runAfter: ok(prev),
    inputs: `@concat(''${Array.from({ length: t.pages }, (_, p) => `,join(body('Select_${t.key}_${p + 1}'),'')`).join('')})` };
  A[`Select_${t.key}_Years`] = { type: 'Select', runAfter: ok(`Compose_${t.key}_Tokens`), inputs: {
    from: `@range(${YEARS[0]},${YEARS[1]})`,
    select: { year: '@item()', rows: `@${count(TOK, "concat('|',string(item()))")}`, ...(t.ref ? { withoutReference: `@${count(TOK, "concat('|',string(item()),'!')")}` } : {}) } } };
  A[`Compose_${t.key}_Stats`] = { type: 'Compose', runAfter: ok(`Select_${t.key}_Years`), inputs: {
    dataset: t.key, list: t.title, maxId: `@${maxId(`Get_Max_${t.key}`)}`, coveredToId: t.pages * PAGE,
    covered: `@lessOrEquals(${maxId(`Get_Max_${t.key}`)},${t.pages * PAGE})`,
    rows: `@${count(TOK, "'|'")}`, withoutEntityKey: `@${count(TOK, "'#nk'")}`,
    ...(t.ref ? { referenceColumn: t.ref, withoutReference: `@${count(TOK, "'!'")}` } : {}),
    ...(t.flags === 'task' ? { legacy: { referenceIdComposite: `@${count(TOK, "'#rf'")}`, refIddItemId: `@${count(TOK, "'#rs'")}`, refIddMessageId: `@${count(TOK, "'#rl'")}`, parentTask: `@${count(TOK, "'#pt'")}`, activityTrackingId: `@${count(TOK, "'#at'")}` } } : {}),
    byYear: `@body('Select_${t.key}_Years')`,
    keysFirst: t.keys,
  } };
  if (t.raw) {
    A[`Select_${t.key}_Raw`] = { type: 'Select', runAfter: ok(`Compose_${t.key}_Stats`), inputs: {
      from: `@${rows(`Get_${t.key}_1`)}`,
      select: Object.fromEntries([['ID', "@item()?['ID']"], ['Created', "@item()?['Created']"], ['hasEntityKey', "@not(empty(string(coalesce(item()?['EntityKey'],''))))"], ...t.raw.map((c) => [c, `@item()?['${c}']`])]) } };
  }
  return { [`Scope_Survey_${t.key}`]: { type: 'Scope', runAfter: {}, actions: A } };
}
function survey() {
  const blocks = [context('Compose_Survey_Context'), bindings(), ...TARGETS.map(surveyTarget)];
  blocks.push({ Get_Counters: { ...get('SEQUENCE_COUNTERS', '$select=ID,Title,Prefix,Year,CurrentSequence,LastReferenceId,LastIssuedAt&$top=500', {}) } });
  const A = chain(...blocks);
  /* Every target's scope runs whatever the one before it did: a list that refuses access is reported, not fatal. */
  for (const t of TARGETS.slice(1)) A[`Scope_Survey_${t.key}`].runAfter = { [`Scope_Survey_${TARGETS[TARGETS.indexOf(t) - 1].key}`]: ALL };
  A.Get_Counters.runAfter = { [`Scope_Survey_${TARGETS[TARGETS.length - 1].key}`]: ALL };
  const stat = (t) => `coalesce(actions('Compose_${t.key}_Stats')?['outputs'],json('{"dataset":"${t.key}","error":"not read: see the run"}'))`;
  A.Compose_Survey_Report = { type: 'Compose', runAfter: { Get_Counters: ALL }, inputs: {
    check: 'P5-1 migration survey', spec: 'IDENTIFICATION_SYSTEM.md §12.3', context: "@outputs('Compose_Survey_Context')", completedAtUtc: '@utcNow()',
    environmentCode: "@outputs('Compose_Dataset_Bindings')?['ENVIRONMENT_CODE']",
    datasets: `@createArray(${TARGETS.map(stat).join(',')})`,
    intake: Object.fromEntries(TARGETS.filter((t) => t.raw).map((t) => [t.key, `@coalesce(actions('Select_${t.key}_Raw')?['outputs']?['body'],json('[]'))`])),
    counters: `@${rows('Get_Counters')}`,
  } };
  A.Select_Survey_Table = { type: 'Select', runAfter: ok('Compose_Survey_Report'), inputs: {
    from: "@outputs('Compose_Survey_Report')?['datasets']",
    select: { Dataset: "@item()?['dataset']", List: "@coalesce(item()?['list'],'')", Rows: "@coalesce(item()?['rows'],'')", 'Highest ID': "@coalesce(item()?['maxId'],'')",
      'All read': "@if(equals(item()?['covered'],false),'NO: highest ID beyond the pages read',if(equals(item()?['covered'],true),'yes',coalesce(item()?['error'],'')))",
      'Without Entity Key': "@coalesce(item()?['withoutEntityKey'],'')", 'Without reference': "@coalesce(item()?['withoutReference'],'')",
      'Keys first': "@if(equals(item()?['keysFirst'],true),'yes','no (working copy or new list)')" } } };
  A.Create_Survey_Table = { type: 'Table', runAfter: ok('Select_Survey_Table'), inputs: { from: "@body('Select_Survey_Table')", format: 'HTML' } };
  A.Compose_Survey_Html = { type: 'Compose', runAfter: ok('Create_Survey_Table'),
    inputs: "<p>P5-1 migration survey. Read only: nothing was written.</p>@{body('Create_Survey_Table')}<p>The full result, with rows per year, the legacy identifiers, the intake lists and the counter rows, is attached as p5-1-survey.json. Send it back to plan the next steps.</p>" };
  A.Send_Survey_Report = mail("@outputs('Compose_Survey_Context')?['runBy']", "@concat('P5-1 migration survey: ',string(length(outputs('Compose_Survey_Report')?['datasets'])),' lists')", "@outputs('Compose_Survey_Html')", 'p5-1-survey.json', "outputs('Compose_Survey_Report')", ok('Compose_Survey_Html'));
  return node('Scope_Phase5_Survey', A);
}

/* ---------------------------------------------------------------- P5-2 keys first */
function keysTarget(t) {
  const PL = `Apply_to_each_Keys_Page_${t.key}`, BL = `Apply_to_each_Keys_Batch_${t.key}`;
  const CTX = "outputs('Compose_Keys_Context')";
  const NL = `${CTX}?['crlf']`;
  const IDS = `outputs('Compose_Keys_Ids_${t.key}')`;
  const fields = [['EntityKey', '@{guid()}'], ...(t.idState ? [['IdState', 'ACTIVE']] : []), ...(t.rev ? [['Rev', '1']] : [])];
  const formValues = fields.map(([n, v]) => `{"FieldName":"${n}","FieldValue":"${v}"}`).join(',');
  /* One changeset per row: SharePoint runs a batch's changesets independently, so one refused row does not hold back
     the rest. The body is text; its only expression is the row's new key. */
  const part = `@concat('--batch_',${CTX}?['requestId'],${NL},'Content-Type: multipart/mixed; boundary=\"changeset_',string(item()),'\"',${NL},${NL},'--changeset_',string(item()),${NL},'Content-Type: application/http',${NL},'Content-Transfer-Encoding: binary',${NL},${NL},'POST ',${CTX}?['site_${t.key}'],'/_api/web/lists(guid''',${LIST(t.key)},''')/items(',string(item()),')/ValidateUpdateListItem HTTP/1.1',${NL},'Content-Type: application/json;odata=nometadata',${NL},'Accept: application/json;odata=nometadata',${NL},${NL},'{"formValues":[${formValues.replace('@{guid()}', "',guid(),'")}],"bNewDocumentUpdate":true}',${NL},${NL},'--changeset_',string(item()),'--',${NL})`;
  const A = {
    [`Get_Keys_Max_${t.key}`]: get(t.key, '$select=ID&$orderby=ID%20desc&$top=1', {}),
    [PL]: { type: 'Foreach', runAfter: ok(`Get_Keys_Max_${t.key}`), foreach: `@range(0,add(div(${maxId(`Get_Keys_Max_${t.key}`)},${PAGE}),1))`,
      runtimeConfiguration: { concurrency: { repetitions: 1 } },
      actions: {
        [`Get_Keys_Page_${t.key}`]: get(t.key, `$select=ID,EntityKey&$filter=ID%20gt%20@{mul(items('${PL}'),${PAGE})}%20and%20ID%20le%20@{mul(add(items('${PL}'),1),${PAGE})}&$top=${PAGE}`, {}),
        [`Select_Keys_Need_${t.key}`]: { type: 'Select', runAfter: ok(`Get_Keys_Page_${t.key}`), inputs: {
          from: `@${rows(`Get_Keys_Page_${t.key}`)}`, select: "@if(empty(string(coalesce(item()?['EntityKey'],''))),concat(',',string(item()?['ID'])),'')" } },
        [`Compose_Keys_Ids_${t.key}`]: { type: 'Compose', runAfter: ok(`Select_Keys_Need_${t.key}`),
          inputs: `@json(replace(concat('[',join(body('Select_Keys_Need_${t.key}'),''),']'),'[,','['))` },
        [BL]: { type: 'Foreach', runAfter: ok(`Compose_Keys_Ids_${t.key}`), foreach: `@range(0,div(add(length(${IDS}),${BATCH - 1}),${BATCH}))`,
          runtimeConfiguration: { concurrency: { repetitions: 1 } },
          actions: {
            [`Select_Keys_Parts_${t.key}`]: { type: 'Select', runAfter: {}, inputs: { from: `@take(skip(${IDS},mul(items('${BL}'),${BATCH})),${BATCH})`, select: part } },
            [`Post_Keys_Batch_${t.key}`]: { type: 'OpenApiConnection', runAfter: ok(`Select_Keys_Parts_${t.key}`), inputs: {
              host: { apiId: SP, connection: 'shared_sharepointonline', operationId: 'HttpRequest' },
              parameters: { dataset: `@${SITE(t.key)}`, 'parameters/method': 'POST', 'parameters/uri': '_api/$batch',
                'parameters/headers': { 'Content-Type': `multipart/mixed; boundary=batch_@{${CTX}?['requestId']}`, Accept: 'application/json;odata=nometadata' },
                'parameters/body': `@concat(join(body('Select_Keys_Parts_${t.key}'),''),'--batch_',${CTX}?['requestId'],'--',${NL})` },
              retryPolicy: { type: 'exponential', count: 4, interval: 'PT15S' } } },
            /* Every row answered 200 with no field refused, or the step fails and the run says so. */
            [`Compose_Keys_Check_${t.key}`]: { type: 'Compose', runAfter: ok(`Post_Keys_Batch_${t.key}`),
              inputs: `@int(if(and(equals(${count(`string(body('Post_Keys_Batch_${t.key}'))`, "'HTTP/1.1 200'")},length(body('Select_Keys_Parts_${t.key}'))),equals(${count(`string(body('Post_Keys_Batch_${t.key}'))`, `'"HasException":true'`)},0)),'0','KEY_BATCH_INCOMPLETE'))` },
          } },
      } },
    [`Compose_Keys_Result_${t.key}`]: { type: 'Compose', runAfter: { [PL]: ALL }, inputs: {
      dataset: t.key, list: t.title, maxId: `@${maxId(`Get_Keys_Max_${t.key}`)}`, pages: `@add(div(${maxId(`Get_Keys_Max_${t.key}`)},${PAGE}),1)`,
      writes: fields.map(([n]) => n).join(', '), outcome: `@coalesce(actions('${PL}')?['status'],'not run')` } },
  };
  return { [`Scope_Keys_${t.key}`]: { type: 'Scope', runAfter: {}, actions: A } };
}
function keys() {
  const ctx = context('Compose_Keys_Context');
  /* The site URL each batch line names, without a trailing slash. */
  for (const t of KEYED) ctx.Compose_Keys_Context.inputs[`site_${t.key}`] = `@{if(endsWith(string(${SITE(t.key)}),'/'),substring(string(${SITE(t.key)}),0,sub(length(string(${SITE(t.key)})),1)),string(${SITE(t.key)}))}`;
  const A = chain(bindings(), ctx, ...KEYED.map(keysTarget));
  for (const t of KEYED.slice(1)) A[`Scope_Keys_${t.key}`].runAfter = { [`Scope_Keys_${KEYED[KEYED.indexOf(t) - 1].key}`]: ALL };
  const res = (t) => `coalesce(actions('Compose_Keys_Result_${t.key}')?['outputs'],json('{"dataset":"${t.key}","outcome":"not run: see the run"}'))`;
  A.Compose_Keys_Report = { type: 'Compose', runAfter: { [`Scope_Keys_${KEYED[KEYED.length - 1].key}`]: ALL }, inputs: {
    run: 'P5-2 keys first', spec: 'IDENTIFICATION_SYSTEM.md §12.3 1', context: "@outputs('Compose_Keys_Context')", completedAtUtc: '@utcNow()',
    lists: `@createArray(${KEYED.map(res).join(',')})`,
    next: 'Run ID_Phase5_Survey again: every keys-first list should show 0 rows without an Entity Key. A list that does not, or an outcome Failed, is re-run; rows already keyed are skipped.' } };
  A.Select_Keys_Table = { type: 'Select', runAfter: ok('Compose_Keys_Report'), inputs: { from: "@outputs('Compose_Keys_Report')?['lists']",
    select: { Dataset: "@item()?['dataset']", List: "@coalesce(item()?['list'],'')", 'Highest ID': "@coalesce(item()?['maxId'],'')", Writes: "@coalesce(item()?['writes'],'')", Outcome: "@item()?['outcome']" } } };
  A.Create_Keys_Table = { type: 'Table', runAfter: ok('Select_Keys_Table'), inputs: { from: "@body('Select_Keys_Table')", format: 'HTML' } };
  A.Compose_Keys_Html = { type: 'Compose', runAfter: ok('Create_Keys_Table'),
    inputs: "<p>P5-2 keys first. Rows without an Entity Key were given one by system update (no new version; Modified unchanged).</p>@{body('Create_Keys_Table')}<p>Now run ID_Phase5_Survey and send back its p5-1-survey.json: it verifies every row was reached.</p>" };
  A.Send_Keys_Report = mail("@outputs('Compose_Keys_Context')?['runBy']", "P5-2 keys first: run report", "@outputs('Compose_Keys_Html')", 'p5-2-keys.json', "outputs('Compose_Keys_Report')", ok('Compose_Keys_Html'));
  return node('Scope_Phase5_Keys', A);
}

/* ---------------------------------------------------------------- files */
const FLOWS = [
  { name: 'ID_Phase5_Survey', pkg: survey() },
  { name: 'ID_Phase5_Keys', pkg: keys() },
];
const files = {};
for (const f of FLOWS) files[flowArtifactName({ flowName: f.name, kind: 'paste.json' })] = `${JSON.stringify(f.pkg, null, 2)}\n`;
const [SURVEY_FILE, KEYS_FILE] = Object.keys(files);
const steps = (pkg) => { let n = 0; const w = (o) => { for (const a of Object.values(o || {})) { n++; w(a.actions); } }; w(pkg.serializedValue.actions); return n; };

files['README.md'] = `# Identification Phase 5: migration

**Generated by \`npm run idphase5\` from \`scripts/build-identification-phase5.mjs\`. Do not edit by hand.**

Phase 5 of [IDENTIFICATION_SYSTEM.md](../../../reference/identification/IDENTIFICATION_SYSTEM.md) (§12.3, §13) gives
the records that existed before the identification system their keys, references, aliases, locators and structure.
This first increment measures the work and takes its first step:

| Step | Flow | Package | Writes |
|---|---|---|---|
| P5-1 survey | \`ID_Phase5_Survey\` | \`${SURVEY_FILE}\` (${steps(FLOWS[0].pkg)} steps) | nothing |
| P5-2 keys first (§12.3 1) | \`ID_Phase5_Keys\` | \`${KEYS_FILE}\` (${steps(FLOWS[1].pkg)} steps) | EntityKey, IdState, Rev on rows without a key |

The packages are named for flows that do not exist yet, so their flow id is \`NOT_CAPTURED\` (identifier catalogue
\`namingConventions.flowArtifactFile\`). Once each flow is created, send its id (the GUID in its address in Power
Automate) and the names take it.

The later steps, register rows for historic intake (§12.3 2), historic references (3), aliases and locators (4),
Folio's browser-held records (4a) and structure (5), are planned from the survey's result: how many rows each year
holds, how many legacy references collide (B4), and whether any counter row exists for an earlier year.

## The lists

Read from Flow Configuration (\`DATASET_<KEY>_SITE_URL\`, \`DATASET_<KEY>_LIST_ID\`); the columns are the ones the
Phase 1 list check found after P1-2 and the finish run.

| Dataset | List | Items at the Phase 1 check | Pages of ${PAGE.toLocaleString('en-GB')} IDs | Keys first | Rev written |
|---|---|---|---|---|---|
${TARGETS.map((t) => `| \`${t.key}\` | ${t.title} | ${t.items.toLocaleString('en-GB')} | ${t.pages} | ${t.keys ? 'yes' : t.key === 'OPS_WORKING_REGISTER' ? 'no: a working copy takes its register row\'s key (§12.3 2)' : 'no: new list, keyed at creation'} | ${t.keys && t.rev ? 'yes' : ''} |`).join('\n')}

## P5-1: survey (read only)

For each list it reads the highest ID, then pages of ${PAGE.toLocaleString('en-GB')} IDs (\`ID gt a and ID le b\`, an indexed
query under the list view threshold), and reports:

- **rows**, **rows without an Entity Key**, and **rows per year of creation** (2015–2026);
- for Global Tracking Queue and DGO DIGITAL OPS, **rows per year still without their reference**
  (TaskRef, ReferenceId): the numbers §12.3 3 claims, year by year;
- for the task lists, the **legacy identifiers** §12.3 4 and 5 turn into aliases, locators and structure:
  Reference_ID composites, RefIDD as an item ID or a Graph message ID, ParentTask, ActivityTrackingID;
- Portal Registry, NITDA_Central_Registry and Portal Support Cases **row by row** (ID, created, reference columns,
  whether keyed), from which the duplicate legacy references are counted before any alias is loaded (B4);
- every **counter row** (§12.3 3: migration claims no number while an earlier year's row is unaccounted for);
- **whether every row was read**: a list whose highest ID lies beyond the pages read says so.

It selects no personal field (no names, e-mail addresses or message text).

**Create and run.**
1. Power Automate → *Create* → **Instant cloud flow** named \`ID_Phase5_Survey\`, trigger **Manually trigger a flow**.
2. Add an empty **Send an HTTP request to SharePoint** step and an empty Office 365 Outlook **Send an email (V2)** step.
3. Click **+** under the trigger → **Paste an action** → paste \`${SURVEY_FILE}\`. Delete the two empty steps, **Save**.
4. Run it with an account that can read the four sites. Send back the attached \`p5-1-survey.json\`.

## P5-2: keys first (§12.3 1)

Every row without an Entity Key gets \`EntityKey\` = a new GUID, \`IdState\` ACTIVE and, on lists with the column,
\`Rev\` 1. Per list it pages the IDs as the survey does, keeps the rows whose EntityKey is empty, and sends them to
SharePoint ${BATCH} at a time in one \`$batch\`, each row its own change set calling \`ValidateUpdateListItem\` with
\`bNewDocumentUpdate\` true:

- **a system update**: no new version, and Modified and Modified By stay as they are, so the update does not start any
  "When an item is created or modified" flow (the notifier on Portal Registry, or any flow on Global Tracking Queue);
- **idempotent**: a row that has a key is never touched, so the flow can be re-run after a stop, throttling or a
  failed batch, and continues where it ended;
- **checked**: a batch in which any row did not answer 200, or SharePoint refused a field, fails its
  \`Compose_Keys_Check_<list>\` step, and the report shows that list's outcome as Failed.

It leaves out DGO DIGITAL OPS: its rows are the working copies of intake records, and a copy carries the key of its
register row (§5 ID-01, §7.1), which §12.3 2 gives it. Nothing else is written: no reference, alias, locator or
structure.

DEV_OPS_Global_Tracking_Queue is not in either flow: it is a test list (owner direction, 5 October 2026; spec 1.2.4).
Tasks live in Global Tracking Queue only.

**Create and run.**
1. Create an **Instant cloud flow** named \`ID_Phase5_Keys\` (trigger **Manually trigger a flow**), add the same two
   empty steps, paste \`${KEYS_FILE}\`, delete the empty steps and **Save**.
2. Run it with an account that can edit the lists (Global Tracking Queue: about ${Math.ceil((TARGETS.find((t) => t.key === 'TASK_QUEUE').items) / BATCH)} batches).
3. Run \`ID_Phase5_Survey\` again and send back both JSON files. The keys step is complete when every keys-first
   list shows 0 rows without an Entity Key (§12.3 6).
`;

let stale = 0;
if (!CHECK) mkdirSync(join(ROOT, OUT), { recursive: true });
for (const [f, body] of Object.entries(files)) {
  const p = join(ROOT, OUT, f);
  let cur = null; try { cur = readFileSync(p, 'utf8'); } catch { /* new */ }
  if (cur === body) continue;
  if (CHECK) { stale++; console.error(`stale: ${OUT}/${f}`); } else writeFileSync(p, body);
}
let present = []; try { present = readdirSync(join(ROOT, OUT)); } catch { /* none */ }
for (const f of present) if (!files[f]) { if (CHECK) { stale++; console.error(`stray: ${OUT}/${f}`); } else rmSync(join(ROOT, OUT, f)); }
if (CHECK && stale) { console.error('identification phase 5 is out of date — run: npm run idphase5'); process.exit(1); }
console.log(`identification phase 5: ${Object.keys(files).length} files ${CHECK ? 'up to date' : 'written'} (${FLOWS.length} flows)`);
