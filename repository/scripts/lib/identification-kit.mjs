/**
 * The identification system's generation kit: the one source of every block a flow uses to mint,
 * claim, update or resolve an identifier (IDENTIFICATION_SYSTEM.md §8, decisions B1, B3, B8, B9, B10).
 *
 *   npm run idkit            writes docs/folio-Master-Flows-and-Endpoints/packages/identification-kit/
 *   npm run idkit -- --check
 *
 * WHY THE BLOCKS LOOK THE WAY THEY DO (B1)
 *
 * Every block is pasted into an existing flow as a scope. A pasted scope cannot declare variables:
 * Logic Apps accepts InitializeVariable only at a workflow's top level
 * (docs/folio-Master-Flows-and-Endpoints/surfaces/governance/DGO_FLOW_TRUTH_PERSISTENCE.variables.md). So nothing here uses a
 * variable, an Until loop or a Filter array. Values are Compose actions, which are evaluated once
 * per run and so are stable for the run. Retries are unrolled into flat attempts. Attempt k runs
 * only if attempt k-1 failed, and a final Compose collects whichever attempt succeeded through
 * `actions(...)?['outputs']`, which is null for a skipped action instead of an error.
 *
 * SharePoint writes that must not lose a concurrent change use "Send an HTTP request to SharePoint"
 * with IF-MATCH (B9). The standard Update item action cannot send IF-MATCH.
 *
 * Lists are never addressed by title or a hard-coded GUID. Each block takes a Dataset Key, and the
 * flow reads the binding from Flow Configuration (DATASET_<KEY>_SITE_URL, DATASET_<KEY>_LIST_ID)
 * with the readDatasetBindings block.
 */

const SP = 'shared_sharepointonline';
const WAT = 'W. Central Africa Standard Time';

/* A request body is never sent as an object literal. Run 08584106116380843146636461148CU01 (3 October 2026)
 * proved that "Send an HTTP request to SharePoint" answers 400 "Not well formatted JSON stream" to an object
 * whose values hold expressions, while the deployed '01 - GOV - Provision HTTP Flow Registry', which built
 * DGO_HTTPFlowRegistry in this tenant, sends every body as setProperty(json('{}'), …). So an object body is
 * turned into that expression here, once, for every block. */
const splitInterp = (str) => {               // "@{a}lit@{b}" → [['e','a'],['t','lit'],['e','b']]
  const parts = []; let i = 0;
  while (i < str.length) {
    const j = str.indexOf('@{', i);
    if (j < 0) { parts.push(['t', str.slice(i)]); break; }
    if (j > i) parts.push(['t', str.slice(i, j)]);
    let k = j + 2, depth = 1, inq = false;
    for (; k < str.length; k++) {
      const ch = str[k];
      if (inq) { if (ch === "'") { if (str[k + 1] === "'") k++; else inq = false; } continue; }
      if (ch === "'") inq = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) break;
    }
    parts.push(['e', str.slice(j + 2, k)]); i = k + 1;
  }
  return parts;
};
const lit = (t) => `'${t.replace(/'/g, "''")}'`;
const valueExpr = (v) => {
  if (v === null) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') return objectExpr(v);
  if (v.startsWith('@') && !v.startsWith('@{')) return v.slice(1);
  if (!v.includes('@{')) return lit(v);
  const parts = splitInterp(v).filter(([, x]) => x !== '');
  return parts.length === 1 && parts[0][0] === 'e' ? `string(${parts[0][1]})`
    : `concat(${parts.map(([k, x]) => (k === 'e' ? `string(${x})` : lit(x))).join(', ')})`;
};
const objectExpr = (o) => Object.entries(o).reduce((acc, [k, v]) => `setProperty(${acc}, ${lit(k)}, ${valueExpr(v)})`, "json('{}')");
export const bodyExpr = (body) => (body && typeof body === 'object' ? `@${objectExpr(body)}` : body);

const http = (site, method, uri, { headers = {}, body } = {}) => ({
  type: 'OpenApiConnection',
  inputs: {
    /* Designer-paste form, as every paste that has run in the tenant carries it: host.connection, and no
       authentication (that pair belongs to a full flow definition, not to the clipboard). */
    host: { apiId: `/providers/Microsoft.PowerApps/apis/${SP}`, connection: SP, operationId: 'HttpRequest' },
    parameters: {
      dataset: site,
      'parameters/method': method,
      'parameters/uri': q(uri),
      'parameters/headers': { Accept: 'application/json;odata=minimalmetadata', ...headers },
      ...(body === undefined ? {} : { 'parameters/body': bodyExpr(body) }),
    },
  },
});
const compose = (inputs, runAfter = {}) => ({ type: 'Compose', inputs, runAfter });
const after = (name, ...states) => ({ [name]: states.length ? states : ['Succeeded'] });
const ALWAYS = ['Succeeded', 'Failed', 'Skipped', 'TimedOut'];

/** The site and list of a dataset, as read by readDatasetBindings. */
export const listRaw = (key) => `outputs('Compose_Dataset_Bindings')?['DATASET_${key}_LIST_ID']`;
export const site = (key) => `@outputs('Compose_Dataset_Bindings')?['DATASET_${key}_SITE_URL']`;
export const list = (key) => `@{${listRaw(key)}}`;
/* Spaces in a REST query are encoded, except inside @{...} expressions, which the engine evaluates
   before the request is sent. */
const q = (uri) => uri.split(/(@\{[^}]*\})/).map((p) => (p.startsWith('@{') ? p : p.replace(/ /g, '%20'))).join('');
const items = (key) => `_api/web/lists(guid'${list(key)}')/items`;

/* ── 0. Dataset bindings ─────────────────────────────────────────────────────────────── */

/** Reads DATASET_<KEY>_SITE_URL, DATASET_<KEY>_LIST_ID and ENVIRONMENT_CODE from Flow
 *  Configuration into one map, Compose_Dataset_Bindings. Flow Configuration itself is addressed by
 *  its configured site, because it is where every other binding lives. */
export function readDatasetBindings({ keys, configSite }) {
  const titles = ['ENVIRONMENT_CODE', ...keys.flatMap((k) => [`DATASET_${k}_SITE_URL`, `DATASET_${k}_LIST_ID`])];
  const filter = titles.map((t) => `Title eq '${t}'`).join(' or ');
  return {
    Get_Dataset_Bindings: { ...http(configSite, 'GET', `_api/web/lists/getbytitle('Flow Configuration')/items?$select=Title,ConfigValue&$top=500&$filter=${filter}`), runAfter: {} },
    Select_Dataset_Bindings: {
      type: 'Select',
      inputs: {
        from: "@coalesce(body('Get_Dataset_Bindings')?['value'], json('[]'))",
        select: "@concat('\"', trim(string(item()?['Title'])), '\":\"', replace(trim(string(coalesce(item()?['ConfigValue'], ''))), '\"', ''), '\"')",
      },
      runAfter: after('Get_Dataset_Bindings'),
    },
    Compose_Dataset_Bindings: compose("@json(concat('{', join(body('Select_Dataset_Bindings'), ','), '}'))", after('Select_Dataset_Bindings')),
  };
}

/* ── 1. Request context (S8, ID-19) ──────────────────────────────────────────────────── */

/** RequestId is always minted here. Anything the client sent is kept only as clientCorrelationId,
 *  sanitised and cut to 64 characters. */
export function requestContext() {
  return {
    Compose_Request_Context: compose({
      requestId: '@guid()',
      clientCorrelationId: "@substring(concat(replace(replace(trim(string(coalesce(triggerOutputs()?['headers']?['X-Correlation-ID'], triggerBody()?['requestId'], ''))), '<', ''), '>', ''), '                                                                '), 0, 64)",
      runName: "@workflow()?['run']?['name']",
      receivedAtUtc: '@utcNow()',
    }),
  };
}

/* ── 2. Entity Key (ID-01) ───────────────────────────────────────────────────────────── */

export function entityKey(tag) {
  return { [`Compose_EntityKey_${tag}`]: compose('@guid()') };
}

/* ── 3. Claim Reference (ID-04, ID-05, ID-26) ────────────────────────────────────────── */

/**
 * Claims Count numbers from the SEQUENCE_COUNTERS row (Prefix, Year) in up to `attempts` flat
 * attempts. Output Compose_Claim_<tag>: { ok, prefix, year, first, last, references[] }.
 * A year with no row: attempt 1 creates it already holding the claimed numbers. Its Title
 * '<Prefix>-<Year>' is enforce-unique, so a concurrent create fails and the next attempt reads the
 * winner's row.
 */
/* lean: the same claim in fewer actions, for a flow near Power Automate's limit of 500 (DYNAMIC_ACTIONS, ITEM-79: release 1
   made it 551 and the service refused it). Each attempt keeps its scope, delay, counter read, claim and create, and drops
   Compose_Next/Claimed/Created: the claim computes the next number inline, and the summary reads the number from which
   step succeeded. Same attempts, same delays, same result. */
export function claimReference({ tag, prefix, count = '@int(1)', envPrefix = "@{outputs('Compose_Environment_Prefix')}", attempts = 10, dataset = 'SEQUENCE_COUNTERS', floor, lean = false }) {
  const Y = `Compose_Claim_${tag}_Year`;
  const out = { [Y]: compose(`@formatDateTime(convertFromUtc(utcNow(), '${WAT}'), 'yyyy')`) };
  /* Floor: the highest number of this prefix and year already written to the record list. A claim never issues at or
     below it, so a counter row that is missing, reset or behind the register cannot reissue a reference already in use
     (CG_Submission_Endpoint, 5 October 2026: the claim created a new counter at 1 and issued NITDA-2026-00001, which
     Portal Registry already held; the record write was refused as a duplicate Reference ID). References are padded to
     five digits, so the text order of the column is the number order. A failed read counts as 0: the counter alone
     then decides, as before. */
  const F = `Compose_Claim_${tag}_Floor`;
  if (floor) {
    const G = `Get_Claim_${tag}_Floor`;
    out[G] = { ...http(site(floor.dataset), 'GET', `${items(floor.dataset)}?$select=${floor.column}&$filter=startswith(${floor.column},'${envPrefix}${prefix}-@{outputs('${Y}')}-')&$orderby=${floor.column} desc&$top=1`), runAfter: after(Y) };
    out[F] = compose(`@int(coalesce(last(split(string(coalesce(first(coalesce(body('${G}')?['value'], json('[]')))?['${floor.column}'], '0')), '-')), '0'))`, after(G, 'Succeeded', 'Failed', 'TimedOut'));
  }
  out[`Compose_Claim_${tag}_Count`] = compose(count, after(floor ? F : Y));
  const C = `outputs('Compose_Claim_${tag}_Count')`;
  const FL = floor ? `outputs('${F}')` : '0';
  /* The next number from a counter row: the row's sequence (never below the floor) plus the count. */
  const NEXT = (r) => (floor ? `add(max(int(coalesce(${r}?['CurrentSequence'], 0)), ${FL}), ${C})` : `add(int(coalesce(${r}?['CurrentSequence'], 0)), ${C})`);
  let prev = `Compose_Claim_${tag}_Count`;
  for (let k = 1; k <= attempts; k++) {
    const S = `Scope_Claim_${tag}_${k}`;
    const get = `Get_Counter_${tag}_${k}`;
    const row = `first(body('${get}')?['value'])`;
    const actions = {};
    /* 10 attempts with a 1 to 5 s Delay (spec 1.2.2). 5 attempts with 1 to 3 s gave 18 of 20 numbers when 20 claims
       arrived together (ID_Phase2_Claim_Test run 2, 4 October 2026): about one claim wins per Delay slot per round,
       and rand(1, 4) whole seconds gives only three slots. Worst case about 55 s, inside the 120 s HTTP response limit. */
    if (k > 1) actions[`Delay_Claim_${tag}_${k}`] = { type: 'Wait', inputs: { interval: { count: '@rand(1, 6)', unit: 'Second' } }, runAfter: {} };
    actions[get] = {
      ...http(site(dataset), 'GET', `${items(dataset)}?$select=ID,Title,CurrentSequence&$filter=Prefix eq '${prefix}' and Year eq '@{outputs('${Y}')}'`),
      runAfter: k > 1 ? after(`Delay_Claim_${tag}_${k}`) : {},
    };
    actions[`Condition_Counter_${tag}_${k}_Exists`] = {
      type: 'If',
      expression: { and: [{ not: { equals: [`@empty(body('${get}')?['value'])`, true] } }] },
      actions: {
        ...(lean ? {} : { [`Compose_Next_${tag}_${k}`]: compose(`@${NEXT(row)}`) }),
        [`Claim_Counter_${tag}_${k}`]: {
          ...http(site(dataset), 'POST', `${items(dataset)}(@{${row}?['ID']})`, {
            headers: { 'X-HTTP-Method': 'MERGE', 'IF-MATCH': `@{${row}?['odata.etag']}`, 'Content-Type': 'application/json;odata=nometadata' },
            body: {
              CurrentSequence: lean ? `@${NEXT(row)}` : `@outputs('Compose_Next_${tag}_${k}')`,
              LastReferenceId: `${envPrefix}${prefix}-@{outputs('${Y}')}-@{formatNumber(${lean ? NEXT(row) : `outputs('Compose_Next_${tag}_${k}')`}, '00000')}`,
              LastIssuedAt: '@utcNow()',
              ModifiedByFlowRun: "@workflow()?['run']?['name']",
            },
          }),
          runAfter: lean ? {} : after(`Compose_Next_${tag}_${k}`),
        },
        ...(lean ? {} : { [`Compose_Claimed_${tag}_${k}`]: compose(`@outputs('Compose_Next_${tag}_${k}')`, after(`Claim_Counter_${tag}_${k}`)) }),
      },
      else: {
        actions: {
          [`Create_Counter_${tag}_${k}`]: {
            ...http(site(dataset), 'POST', items(dataset), {
              headers: { 'Content-Type': 'application/json;odata=nometadata' },
              body: {
                Title: `${prefix}-@{outputs('${Y}')}`, Prefix: prefix, Year: `@{outputs('${Y}')}`,
                CurrentSequence: floor ? `@add(${FL}, ${C})` : `@${C}`,
                LastReferenceId: `${envPrefix}${prefix}-@{outputs('${Y}')}-@{formatNumber(${floor ? `add(${FL}, ${C})` : C}, '00000')}`,
                LastIssuedAt: '@utcNow()', ModifiedByFlowRun: "@workflow()?['run']?['name']",
              },
            }),
            runAfter: {},
          },
          ...(lean ? {} : { [`Compose_Created_${tag}_${k}`]: compose(floor ? `@add(${FL}, ${C})` : `@${C}`, after(`Create_Counter_${tag}_${k}`)) }),
        },
      },
      runAfter: after(get),
    };
    out[S] = { type: 'Scope', actions, runAfter: k === 1 ? after(prev) : after(prev, 'Failed', 'TimedOut') };
    prev = S;
  }
  /* Lean: the number of the attempt whose claim or create succeeded, read from the step's status. The counter row is read
     through actions(), which is null rather than an error for a step that did not run (if() evaluates both branches). */
  const leanRow = (k) => `first(coalesce(actions('Get_Counter_${tag}_${k}')?['outputs']?['body']?['value'], json('[]')))`;
  const last = Array.from({ length: attempts }, (_, i) => i + 1)
    .flatMap((k) => (lean
      ? [`if(equals(actions('Claim_Counter_${tag}_${k}')?['status'], 'Succeeded'), ${NEXT(leanRow(k))}, null)`,
        `if(equals(actions('Create_Counter_${tag}_${k}')?['status'], 'Succeeded'), ${floor ? `add(${FL}, ${C})` : C}, null)`]
      : [`actions('Compose_Claimed_${tag}_${k}')?['outputs']`, `actions('Compose_Created_${tag}_${k}')?['outputs']`]));
  /* Lean: the number is computed once, in its own Compose, and read from there. Inlined, the summary repeats it four times
     and passes the service's limit of 8192 characters per expression (DYNAMIC_ACTIONS refused, 2026-10-07). */
  const NUM = `Compose_Claim_${tag}_Number`;
  if (lean) out[NUM] = compose(`@coalesce(${last.join(', ')})`, after(prev, ...ALWAYS));
  const L = lean ? `outputs('${NUM}')` : `coalesce(${last.join(', ')})`;
  /* The number as an integer, 0 when no attempt succeeded. if() evaluates both of its branches, so int() must never
     see the null of a fully failed claim, or the summary itself fails and the host answers 500 instead of 503
     (tests/identification-phase3.test.mjs: 10 attempts lost). */
  const N = `int(coalesce(${L}, 0))`;
  out[`Compose_Claim_${tag}`] = compose({
    ok: `@not(equals(${L}, null))`,
    prefix,
    year: `@outputs('${Y}')`,
    last: `@${L}`,
    first: `@if(equals(${L}, null), null, sub(${N}, sub(${C}, 1)))`,
    references: `@if(equals(${L}, null), json('[]'), body('Select_Claim_${tag}_References'))`,
  }, after(`Select_Claim_${tag}_References`, ...ALWAYS));
  out[`Select_Claim_${tag}_References`] = {
    type: 'Select',
    inputs: {
      from: `@if(equals(${L}, null), json('[]'), range(sub(${N}, sub(${C}, 1)), ${C}))`,
      /* One expression, not text with @{…} in it: the designer requires a Select's map to be JSON or a single
         expression, and refused the text form with "Enter a valid JSON" (ID_Phase2_Claim_Test, 4 October 2026). */
      select: `@${valueExpr(`${envPrefix}${prefix}-@{outputs('${Y}')}-@{formatNumber(item(), '00000')}`)}`,
    },
    runAfter: lean ? after(NUM) : after(prev, ...ALWAYS),
  };
  /* The flat attempts above ARE the retry. Power Automate's own retry policy is switched off on every counter
     call, or a refused create or a 412 on the claim is held in the connector's exponential retries for minutes
     before the next attempt may start (ID_Phase2_Claim_Test, 4 October 2026: 20 parallel claims, run still going
     after 16 minutes). */
  const noRetry = (o) => { for (const a of Object.values(o)) {
    if (a.type === 'OpenApiConnection') a.inputs.retryPolicy = { type: 'none' };
    if (a.actions) noRetry(a.actions); if (a.else && a.else.actions) noRetry(a.else.actions);
  } };
  noRetry(out);
  return out;
}

/** 503 RETRY_LATER when every claim attempt failed (§8.2). Requires the host flow's HTTP trigger. */
export function claimFailedResponse(tag) {
  return {
    [`Condition_Claim_${tag}_Failed`]: {
      type: 'If',
      expression: { and: [{ equals: [`@outputs('Compose_Claim_${tag}')?['ok']`, false] }] },
      actions: {
        [`Response_Claim_${tag}_Retry_Later`]: {
          type: 'Response', kind: 'Http',
          inputs: { statusCode: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '5' }, body: { ok: false, code: 'RETRY_LATER', message: 'The reference service is busy. Try again in a few seconds.', requestId: "@outputs('Compose_Request_Context')?['requestId']" } },
          runAfter: {},
        },
        [`Terminate_Claim_${tag}`]: { type: 'Terminate', inputs: { runStatus: 'Succeeded' }, runAfter: after(`Response_Claim_${tag}_Retry_Later`) },
      },
      else: { actions: {} },
      runAfter: after(`Compose_Claim_${tag}`),
    },
  };
}

/* ── 4. VOID row (B8) ────────────────────────────────────────────────────────────────── */

/** Accounts for a claimed number whose record could not be written. `fields` adds the home list's
 *  own required columns: for INTAKE_REGISTER, Status = VOID and the validated SenderEmail. */
export function voidRow({ tag, dataset, referenceColumn, reference, reason, fields = {} }) {
  return {
    [`Create_Void_${tag}`]: {
      ...http(site(dataset), 'POST', items(dataset), {
        headers: { 'Content-Type': 'application/json;odata=nometadata' },
        body: { Title: reference, [referenceColumn]: reference, EntityKey: '@guid()', IdState: 'VOID', VoidReason: reason, CreatedByRequest: "@outputs('Compose_Request_Context')?['requestId']", ...fields },
      }),
      runAfter: {},
    },
  };
}

/* ── 5. Case Reference (ID-06) ───────────────────────────────────────────────────────── */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function caseReference({ tag = 'Case', attempts = 5, dataset = 'SUPPORT_CASES', envPrefix = "@{outputs('Compose_Environment_Prefix')}" }) {
  const out = {};
  let prev = null;
  const char = `substring('${ALPHABET}', rand(0, 32), 1)`;
  for (let k = 1; k <= attempts; k++) {
    const cand = `Compose_Case_Candidate_${tag}_${k}`;
    const get = `Get_Case_Collision_${tag}_${k}`;
    const S = `Scope_Case_${tag}_${k}`;
    out[S] = {
      type: 'Scope',
      actions: {
        [cand]: compose(`${envPrefix}CASE-@{${char}}@{${char}}@{${char}}@{${char}}@{${char}}@{${char}}`),
        [get]: { ...http(site(dataset), 'GET', `${items(dataset)}?$select=ID&$top=1&$filter=CaseRef eq '@{outputs('${cand}')}'`), runAfter: after(cand) },
        /* A collision must fail this attempt so the next one runs. int() of a non-number throws, and
           the error text names the reason. */
        [`Compose_Case_Unique_${tag}_${k}`]: compose(`@if(empty(body('${get}')?['value']), outputs('${cand}'), int('CASE_REFERENCE_COLLISION'))`, after(get)),
      },
      runAfter: prev ? after(prev, 'Failed', 'TimedOut') : {},
    };
    prev = S;
  }
  out[`Compose_CaseRef_${tag}`] = compose(
    `@coalesce(${Array.from({ length: attempts }, (_, i) => `actions('Compose_Case_Unique_${tag}_${i + 1}')?['outputs']`).join(', ')})`,
    after(prev, ...ALWAYS),
  );
  return out;
}

/* ── 6. Guarded Update and revision (B9, ID-21) ──────────────────────────────────────── */

/** Applies `changes` to item `itemId` of `dataset`, bumping Rev, with IF-MATCH. Up to `attempts`
 *  flat attempts; each re-reads the row, so a concurrent change is re-applied, never overwritten.
 *  Output Compose_Updated_<tag>: { ok, revAfter }. */
export function guardedUpdate({ tag, dataset, itemId, changes, attempts = 3, siteExpr, listExpr, revIf = 'true' }) {
  /* A target found at run time (DYNAMIC_ACTIONS) names its list by expression: siteExpr ('@…') and listExpr (the list
     GUID's expression). revIf is an expression that is true when the list has a Rev column: DGO DIGITAL OPS and
     Task_Comments have none, and SharePoint refuses a body or $select naming a column the list lacks. The IF-MATCH
     guard applies either way. */
  const S = siteExpr ?? site(dataset);
  const I = listExpr ? `_api/web/lists(guid'@{${listExpr}}')/items` : items(dataset);
  const plain = revIf === 'true';
  const out = {};
  let prev = null;
  for (let k = 1; k <= attempts; k++) {
    const get = `Get_Row_${tag}_${k}`;
    const S2 = `Scope_Update_${tag}_${k}`;
    const REV = `add(int(coalesce(body('${get}')?['Rev'], 0)), 1)`;
    out[S2] = {
      type: 'Scope',
      actions: {
        [get]: { ...http(S, 'GET', plain ? `${I}(${itemId})?$select=ID,Rev` : `${I}(${itemId})?$select=@{if(${revIf}, 'ID,Rev', 'ID')}`), runAfter: {} },
        [`Merge_Row_${tag}_${k}`]: {
          ...http(S, 'POST', `${I}(${itemId})`, {
            headers: { 'X-HTTP-Method': 'MERGE', 'IF-MATCH': `@{body('${get}')?['odata.etag']}`, 'Content-Type': 'application/json;odata=nometadata' },
            body: plain ? `@setProperty(${changes}, 'Rev', ${REV})` : `@if(${revIf}, setProperty(${changes}, 'Rev', ${REV}), ${changes})`,
          }),
          runAfter: after(get),
        },
        [`Compose_Rev_${tag}_${k}`]: compose(plain ? `@${REV}` : `@if(${revIf}, ${REV}, 0)`, after(`Merge_Row_${tag}_${k}`)),
      },
      runAfter: prev ? after(prev, 'Failed', 'TimedOut') : {},
    };
    prev = S2;
  }
  const rev = `coalesce(${Array.from({ length: attempts }, (_, i) => `actions('Compose_Rev_${tag}_${i + 1}')?['outputs']`).join(', ')})`;
  out[`Compose_Updated_${tag}`] = compose({ ok: `@not(equals(${rev}, null))`, revAfter: `@${rev}` }, after(prev, ...ALWAYS));
  return out;
}
export function clientRequestHashCheck({ tag, dataset, hash = "@{toLower(trim(string(coalesce(triggerBody()?['clientRequestHash'], ''))))}" }) {
  return {
    [`Compose_Client_Request_Hash_${tag}`]: compose(hash),
    [`Get_Replay_${tag}`]: {
      ...http(site(dataset), 'GET', `${items(dataset)}?$select=ID,EntityKey,Title&$top=1&$filter=ClientRequestHash eq '@{outputs('Compose_Client_Request_Hash_${tag}')}' and Created ge datetime'@{addDays(utcNow(), -7)}'`),
      runAfter: after(`Compose_Client_Request_Hash_${tag}`),
    },
    [`Compose_Replay_${tag}`]: compose(`@if(equals(length(outputs('Compose_Client_Request_Hash_${tag}')), 64), first(body('Get_Replay_${tag}')?['value']), null)`, after(`Get_Replay_${tag}`)),
  };
}

/* ── 8. Interim target resolution (B10) ──────────────────────────────────────────────── */

/** Classifies the request's target: an Entity Key (preferred), else spo:<listGuid>/<itemId> on a
 *  bound dataset, else unresolved. Output Compose_Target_<tag>: { kind, entityKey, targetList, itemId }.
 *  The host refuses with 400 TARGET_UNRESOLVED when kind is 'unresolved'. A bare item ID, RefIDD or
 *  title is never a target. */
export function resolveTarget({ tag, target = "@trim(string(coalesce(triggerBody()?['target'], triggerBody()?['entityKey'], '')))", datasets }) {
  const boundListIds = datasets;
  const T = `outputs('Compose_Target_Raw_${tag}')`;
  const isGuid = `and(equals(length(${T}), 36), equals(length(split(${T}, '-')), 5))`;
  const isSpo = `and(startsWith(${T}, 'spo:'), equals(length(split(substring(${T}, 4), '/')), 2))`;
  const listGuid = `toLower(first(split(substring(${T}, 4), '/')))`;
  return {
    [`Compose_Target_Raw_${tag}`]: compose(target),
    [`Compose_Target_${tag}`]: compose({
      kind: `@if(${isGuid}, 'entityKey', if(and(${isSpo}, contains(createArray(${boundListIds.map((k) => `toLower(string(${listRaw(k)}))`).join(', ')}), if(${isSpo}, ${listGuid}, ''))), 'locator', 'unresolved'))`,
      entityKey: `@if(${isGuid}, toLower(${T}), null)`,
      targetList: `@if(${isSpo}, ${listGuid}, null)`,
      itemId: `@if(${isSpo}, int(last(split(${T}, '/'))), null)`,
    }, after(`Compose_Target_Raw_${tag}`)),
  };
}

/* ── 9. Environment prefix (R-ENV) ───────────────────────────────────────────────────── */

export function environmentPrefix() {
  return {
    Compose_Environment_Prefix: compose("@if(equals(toLower(string(coalesce(outputs('Compose_Dataset_Bindings')?['ENVIRONMENT_CODE'], ''))), 'prd'), '', 'Z')"),
  };
}

/* ── chaining and packaging ──────────────────────────────────────────────────────────── */

/** Chains blocks in order: the first action of each block runs after the last of the previous. */
export function chain(...blocks) {
  const out = {};
  let last = null;
  for (const b of blocks) {
    const names = Object.keys(b);
    names.forEach((n, i) => {
      const a = structuredClone(b[n]);
      const hasOwnRunAfter = a.runAfter && Object.keys(a.runAfter).length;
      if (i === 0 && last && !hasOwnRunAfter) a.runAfter = after(last);
      else if (!a.runAfter) a.runAfter = i === 0 || !last ? {} : after(names[i - 1]);
      out[n] = a;
    });
    // the block's exit is the action nothing inside the block runs after
    const referenced = new Set(names.flatMap((n) => Object.keys(b[n].runAfter || {})));
    last = names.filter((n) => !referenced.has(n)).pop() || names[names.length - 1];
  }
  return out;
}

/** Every action type the kit may emit. Anything else is a defect (B1). */
export const ALLOWED_TYPES = new Set(['Compose', 'OpenApiConnection', 'Scope', 'If', 'Select', 'Wait', 'Response', 'Terminate']);
