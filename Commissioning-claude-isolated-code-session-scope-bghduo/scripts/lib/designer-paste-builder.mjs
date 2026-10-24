import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

/* A COLUMN THAT IS NOT IN THE TENANT CANNOT BE WRITTEN — NOT EVEN OPTIMISTICALLY.
 *
 * The designer validates every `item/<Column>` parameter against the connector's operation
 * definition for that list AT SAVE TIME, and refuses the whole flow:
 *
 *   Flow save failed with code 'WorkflowOperationParametersExtraParameter' and message
 *   'The API operation does not contain a definition for parameter 'item/RunRecordJson'.'
 *
 * That is a SAVE-time failure, not a run-time one, which is what makes a fallback write useless:
 * the flow never runs, so nothing can catch anything. A second action that omitted the column
 * was built on the assumption that SharePoint would reject the item at run time. It does not get
 * that far.
 *
 * So the spec gates it, and the gate is whether the TENANT HAS THE COLUMN — not what the
 * 2026-08-14 capture found. Those were the same thing until a column declared after that capture
 * was actually provisioned. `capturedState` stays PENDING because that is what the capture saw,
 * and rewriting it would destroy the only record of what the estate started from; the field
 * instead gains `provisionedBy`, naming the run whose ledger is the evidence. A column is
 * stripped while it is PENDING AND unprovisioned, and stops being stripped the moment a run
 * record accounts for it.
 *
 * Filters and expressions are untouched — only `item/` write parameters are schema-validated,
 * which is why the origin lookup reads ConfigValue happily while the telemetry write could not
 * name RunRecordJson. */
const PENDING = (() => {
  const spec = JSON.parse(readFileSync(REPO + 'docs/deployment/sharepoint/portal-field-spec.json', 'utf8'));
  const byGuid = new Map();
  for (const l of spec.lists) {
    const cols = l.fields
      .filter((f) => f.capturedState === 'PENDING' && !f.provisionedBy)
      .map((f) => f.internalName);
    if (cols.length) byGuid.set(l.listGuid.toLowerCase(), new Set(cols));
  }
  return byGuid;
})();

/* A CHOICE COLUMN IS AN OBJECT; ITS VALUE LIVES AT /Value.
 *
 *   OpenApiOperationParameterValidationFailed — The parameter with value '"info"' in path
 *   'item/Severity' with type/format 'String' is not convertible to type/format 'Object'.
 *
 * The connector models a Choice column as an object and takes the string at `item/<Col>/Value`.
 * Both tenant-captured packages do exactly this — ECM_DOCS_INTAKE writes `item/Status/Value` —
 * and the rule was written into this repository's own column check before it was broken here.
 * Deriving it from the specifications rather than remembering it is the only version that holds.
 *
 * A PATCH MUST CARRY Title.
 *
 *   Invalid parameter for 'Update Rate Limit Otp Request'. Error: 'Title' is required
 *
 * Title is required on a Generic List, and the connector's update operation demands it on every
 * patch rather than leaving it alone. Every PatchItem in both tenant-captured packages carries
 * it — Update_item, Update_Rate_Limit_Verify_Source and Update_Registry_Status all do — and each
 * one preserves the row's existing Title rather than inventing one. Same derivation here: the
 * patch already addresses the row by `first(outputs('Get_X')?['body/value'])?['ID']`, so the
 * Title comes from that same row. */
const CHOICE = (() => {
  const byGuid = new Map();
  const spec = JSON.parse(readFileSync(REPO + 'docs/deployment/sharepoint/portal-field-spec.json', 'utf8'));
  const titleToGuid = new Map(spec.lists.map((l) => [l.listTitle, l.listGuid.toLowerCase()]));
  for (const l of spec.lists) {
    const cols = l.fields.filter((f) => f.fieldType === 'Choice').map((f) => f.internalName);
    if (cols.length) byGuid.set(l.listGuid.toLowerCase(), new Set(cols));
  }
  /* The governance lists are specified in the provisioning workbook, not the field spec, and are
     keyed there by title — so they resolve through the tenant capture. */
  const idx = JSON.parse(readFileSync(REPO + 'docs/reference/sharepoint-list-index.json', 'utf8')).lists;
  for (const [guid, l] of Object.entries(idx)) titleToGuid.set(l.title, guid.toLowerCase());
  const prov = JSON.parse(readFileSync(REPO + 'docs/reference/sharepoint-provisioning-spec.json', 'utf8'));
  for (const f of prov.fields) {
    if (f.FieldType !== 'Choice') continue;
    const guid = titleToGuid.get(f.ListTitle);
    if (!guid) continue;
    if (!byGuid.has(guid)) byGuid.set(guid, new Set());
    byGuid.get(guid).add(f.InternalName);
  }
  /* AND THE ONLY SOURCE THAT COVERS EVERY LIST: WHAT THE ESTATE ALREADY DOES.
     Both sources above are specifications this repository owns, and they cover the portal and
     governance estates. They say nothing about DGO DIGITAL OPS or Global Tracking Queue, whose
     schemas live in the tenant and nowhere else — so the map was EMPTY for them, and this
     generator wrote item/Status, item/Marked_Item, item/Priority and item/Progress directly into
     DGO_DYNAMIC_GLOBAL_ACTIONS. That is the same OpenApiOperationParameterValidationFailed the
     comment above was written for, on four more columns, and it reached a live flow.

     docs/reference/connector/sharepoint-operation-shape.json is learned from 361 SharePoint
     operations inside definitions Power Automate has ACCEPTED. A column the estate's own working
     flows address through /Value is a Choice column, whatever any specification here does or
     does not say about it. Evidence covers the lists a specification cannot. */
  const shape = JSON.parse(readFileSync(REPO + 'docs/reference/connector/sharepoint-operation-shape.json', 'utf8'));
  for (const [guid, cols] of Object.entries(shape.columnsAddressedByValue || {})) {
    for (const c of cols) {
      if (!byGuid.has(guid)) byGuid.set(guid, new Set());
      byGuid.get(guid).add(c.column);
    }
  }
  return byGuid;
})();

const ID_SHAPE = /^@first\(outputs\('([^']+)'\)\?\['body\/value'\]\)\?\['ID'\]$/;

/* Learned from every write the estate's accepted definitions make — see the PatchItem note in
   normalizeItemParams. Not a specification; a specification for these lists does not exist here. */
const REQUIRED_BY_LIST = new Map(Object.entries(
  JSON.parse(readFileSync(REPO + 'docs/reference/connector/sharepoint-operation-shape.json', 'utf8')).requiredByList || {}));

/** Strip unprovisioned columns, address Choice values at /Value, and give every patch a Title. */
function normalizeItemParams(op, table, params) {
  const guid = String(table).toLowerCase();
  const pend = PENDING.get(guid);
  const choice = CHOICE.get(guid);
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (!k.startsWith('item/')) { out[k] = v; continue; }
    const col = k.slice(5).split('/')[0];
    if (pend?.has(col)) continue;
    out[choice?.has(col) && !k.endsWith('/Value') ? `item/${col}/Value` : k] = v;
  }
  /* A PATCH MUST CARRY EVERY REQUIRED COLUMN OF THE LIST, NOT JUST Title.
   *
   *   The API operation 'PatchItem' is missing required property 'item/OTP_Code'.
   *
   * The connector validates an update against the list's required set and refuses the SAVE when
   * one is absent. Narrowing a patch to the fields that change is therefore not tidier, it is a
   * flow that will not save — and this generator shipped three such patches: OTP_Code and
   * Expires_At dropped from the OTP updates, Year, Prefix and CurrentSequence from the sequence
   * counter, ReferenceId and SenderEmail from the registry. Each was described here as removing
   * a redundant write. Each would have failed in the designer.
   *
   * Which columns are required is in the list schema, which this repository does not hold for
   * every list. requiredByList is learned instead from every write the estate's own accepted
   * definitions make: a column present in ALL of them is required, or near enough that omitting
   * it is not worth a failed save. Each missing one is supplied FROM THE ROW BEING PATCHED, so
   * the value is preserved rather than replaced — which is also what keeps a required column
   * from becoming a lost update. */
  if (op === 'PatchItem') {
    const need = new Set(['Title', ...((REQUIRED_BY_LIST.get(guid) || {}).PatchItem?.alwaysPresent || [])]);
    const missing = [...need].filter((c) => !Object.keys(out).some((k) => k === `item/${c}` || k.startsWith(`item/${c}/`)));
    if (missing.length) {
      const m = ID_SHAPE.exec(String(out.id ?? ''));
      if (!m) throw new Error(`PatchItem on ${table} must carry ${missing.join(', ')} — the connector `
        + `refuses the save without them — and its id (${out.id}) is not the `
        + `first(outputs('Get_X')?['body/value'])?['ID'] shape these are derived from. Supply them explicitly.`);
      for (const c of missing) {
        const src = `@first(outputs('${m[1]}')?['body/value'])?['${c}']`;
        out[choice?.has(c) ? `item/${c}/Value` : `item/${c}`] = src;
      }
    }
  }
  return out;
}
const OUT = REPO + 'docs/deployment/sharepoint/flows/designer-paste/';
mkdirSync(OUT, { recursive: true });

/* Connection bindings written into every package's `allConnectionData`.
   The OTP_GENERATE and OTP_VERIFY flow_run_record files under
   `docs/reference/foundational/flows/definitions/OTP_FLOWS/` record the tenant's
   connectionReferences. SharePoint resolves to exactly one connection across the whole
   corpus, so it is bound here and the pasted actions come in already wired. Office 365 Outlook
   resolves to three across the corpus (0e5c949a…, c0b9e7a5…, shared-office365-1fb94487-…) and no
   exported definition said which of them sends this estate's mail. That ambiguity is now settled
   from the tenant: the Send an email (V2) action the operator pasted back carries
   nodeConnectionData.connectionName c0b9e7a5b0854c39a435fd8ce92f48ad on the OTP send, so that is
   the mailbox these endpoints use and all three mail actions ship bound to it. No package
   contains a placeholder of any kind.
   A connection id names an environment resource; the credential lives in the connection itself
   and is never in this repository. */
const CONNECTIONS = {
  shared_sharepointonline: '3f1943c5955a4cb8b301e8f22f2b590d',
  shared_office365: 'c0b9e7a5b0854c39a435fd8ce92f48ad',
};

const GDDC = 'https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre';
const NEDMS = 'https://nitdanigeria.sharepoint.com/sites/NEDMS';
const ACT = 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING';
const T = {
  registry: '4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667',
  attachments: 'ecf2ba9b-968f-4fbc-ac9c-7b5e36d5099e',
  timeline: '5b486a5e-0ce7-46d7-a159-d84c77f3d1fd',
  tickets: 'd777f3cd-0696-426e-8096-ffc860e7c0d4',
  rate: 'd6b97198-489c-4bd7-8647-1133c55efdf9',
  otp: '3f85213c-1fdc-4be0-8c0c-e28aa77fbe56',
  proofs: 'f5c9698e-4b6c-4ec7-97ee-dc540efab8a9',
  support: 'b984645b-8e3a-457f-a305-b95650fd3f23',
  seq: 'd95409a4-2b48-4d34-9f60-da5d27db862d',
  audit: 'f59026cc-9fd7-4322-b681-73c599b852c6',
  telemetry: '726c210d-09d5-45d9-952d-7a506b644b13',
  outbox: '88a81ca1-319a-45f5-8409-f91a24538ffa',
  /* `Flow Configuration` is an adopted list that already exists in the tenant with a row in it.
     Nothing in the corpus reads it, so its columns beyond Title are unknown — which is why the
     allowed origins are keyed ON Title (`ALLOWED_ORIGIN:<origin>`) rather than in a `Value`
     column this repository would be inventing. Title is every list's native column. */
  config: '9bc168c3-06e5-4d58-982b-0df06205fd35',
};
const SITE = {
  [T.registry]: NEDMS, [T.attachments]: NEDMS, [T.timeline]: NEDMS, [T.tickets]: NEDMS,
  [T.rate]: GDDC, [T.otp]: GDDC, [T.proofs]: GDDC, [T.support]: GDDC,
  [T.seq]: GDDC, [T.audit]: GDDC, [T.telemetry]: GDDC, [T.outbox]: GDDC,
  [T.config]: ACT,
};

let seq = 0;
const mid = () => { seq++; return `a0000000-0000-4000-8000-${String(seq).padStart(12, '0')}`; };
const meta = () => ({ operationMetadataId: mid() });

const SP = 'shared_sharepointonline';
const O365 = 'shared_office365';
const host = (op, api = SP) => ({ apiId: `/providers/Microsoft.PowerApps/apis/${api}`, connection: api, operationId: op });

function sp(op, table, params, after) {
  const a = {
    type: 'OpenApiConnection',
    inputs: { parameters: { dataset: SITE[table], table, ...normalizeItemParams(op, table, params) }, host: host(op) },
    metadata: meta(),
  };
  if (after) a.runAfter = after;
  return a;
}
const get = (t, p, after) => sp('GetItems', t, p, after);
const post = (t, p, after) => sp('PostItem', t, p, after);
const patch = (t, p, after) => sp('PatchItem', t, p, after);

const compose = (inputs, after) => { const a = { type: 'Compose', inputs, metadata: meta() }; if (after) a.runAfter = after; return a; };
const setVar = (name, value, after) => { const a = { type: 'SetVariable', inputs: { name, value }, metadata: meta() }; if (after) a.runAfter = after; return a; };
const appendErr = (value, after) => { const a = { type: 'AppendToArrayVariable', inputs: { name: 'varErrors', value }, metadata: meta() }; if (after) a.runAfter = after; return a; };
const cond = (expression, actions, elseActions, after) => {
  const a = { type: 'If', expression, actions, metadata: meta() };
  if (elseActions) a.else = { actions: elseActions };
  if (after) a.runAfter = after;
  return a;
};
const scope = (actions, after) => { const a = { type: 'Scope', actions, metadata: meta() }; if (after) a.runAfter = after; return a; };
const ok = (n) => ({ [n]: ['Succeeded'] });
const filt = (col, srcExpr) => `@concat('${col} eq ''',replace(${srcExpr},'''',''''''),'''')`;

/* ---------- standard variable block ---------- */
function initVars() {
  const v = (name, type, value, after) => {
    const a = { type: 'InitializeVariable', inputs: { variables: [{ name, type, value }] }, metadata: meta() };
    if (after) a.runAfter = after;
    return a;
  };
  return {
    Initialize_variable_varStatusCode: v('varStatusCode', 'integer', 500),
    Initialize_variable_varData: v('varData', 'object', {}, ok('Initialize_variable_varStatusCode')),
    Initialize_variable_varErrors: v('varErrors', 'array', [], ok('Initialize_variable_varData')),
    Initialize_variable_varRequestId: v('varRequestId', 'string', "@coalesce(triggerBody()?['requestId'],triggerBody()?['request_id'],guid())", ok('Initialize_variable_varErrors')),
    Initialize_variable_varStartTicks: v('varStartTicks', 'integer', '@ticks(utcNow())', ok('Initialize_variable_varRequestId')),
    Initialize_variable_varReceivedAtUtc: v('varReceivedAtUtc', 'string', '@utcNow()', ok('Initialize_variable_varStartTicks')),
    Initialize_variable_varCompletedAtUtc: v('varCompletedAtUtc', 'string', '', ok('Initialize_variable_varReceivedAtUtc')),
    Initialize_variable_varDurationMs: v('varDurationMs', 'integer', 0, ok('Initialize_variable_varCompletedAtUtc')),
  };
}

/* ---------- rate limit gate ---------- */
/* `after` CHAINS THE BUCKET ONTO WHAT IT READS.
   The bucket expression is built from a Compose earlier in the scope — the source IP, the
   caller's email — and an action with no `runAfter` is a ROOT of its scope: it starts at the
   same instant as the first action of the chain it is reading from. So the whole rate-limit
   triad, and everything the gate wraps, ran as a second parallel branch that referenced an
   action the runtime could not promise had finished. Every caller of rateLimit() names the
   action the bucket rests on, and the triad becomes one link in a single chain. */
function rateLimit(tag, bucketExpr, limit, after) {
  const G = `Get_Rate_Limit_${tag}`, C = `Condition_Rate_Limit_${tag}_Exists`;
  const win = (f) => `@if(greater(ticks(coalesce(first(outputs('${G}')?['body/value'])?['WindowStartUtc'],'1900-01-01T00:00:00Z')),ticks(addHours(utcNow(),-1))),${f},${f === 'x' ? 'x' : ''})`;
  return {
    [`Compose_Bucket_${tag}`]: compose(bucketExpr, after),
    [G]: get(T.rate, { $filter: filt('Title', `outputs('Compose_Bucket_${tag}')`), $top: 1 }, ok(`Compose_Bucket_${tag}`)),
    [C]: cond(
      { greater: [`@length(coalesce(outputs('${G}')?['body/value'],json('[]')))`, 0] },
      {
        [`Update_Rate_Limit_${tag}`]: patch(T.rate, {
          id: `@first(outputs('${G}')?['body/value'])?['ID']`,
          'item/RequestCount': `@if(greater(ticks(coalesce(first(outputs('${G}')?['body/value'])?['WindowStartUtc'],'1900-01-01T00:00:00Z')),ticks(addHours(utcNow(),-1))),add(int(coalesce(first(outputs('${G}')?['body/value'])?['RequestCount'],0)),1),1)`,
          'item/WindowStartUtc': `@if(greater(ticks(coalesce(first(outputs('${G}')?['body/value'])?['WindowStartUtc'],'1900-01-01T00:00:00Z')),ticks(addHours(utcNow(),-1))),first(outputs('${G}')?['body/value'])?['WindowStartUtc'],utcNow())`,
          'item/UpdatedAtUtc': '@utcNow()',
        }),
      },
      {
        [`Create_Rate_Limit_${tag}`]: post(T.rate, {
          'item/Title': `@outputs('Compose_Bucket_${tag}')`,
          'item/WindowStartUtc': '@utcNow()',
          'item/UpdatedAtUtc': '@utcNow()',
          'item/RequestCount': 1,
        }),
      },
      ok(G)),
    [`Compose_Rate_Limited_${tag}`]: compose(
      `@and(greater(length(coalesce(outputs('${G}')?['body/value'],json('[]'))),0),greater(ticks(coalesce(first(outputs('${G}')?['body/value'])?['WindowStartUtc'],'1900-01-01T00:00:00Z')),ticks(addHours(utcNow(),-1))),greaterOrEquals(int(coalesce(first(outputs('${G}')?['body/value'])?['RequestCount'],0)),${limit}))`,
      ok(C)),
  };
}
const rateLimitedActions = (tag) => ({
  [`Set_variable_varStatusCode_${tag}_429`]: setVar('varStatusCode', 429),
  [`Set_variable_varData_${tag}_RateLimited`]: setVar('varData', { code: 'RATE_LIMITED', message: 'Too many requests from this source. Try again later.' }, ok(`Set_variable_varStatusCode_${tag}_429`)),
});

/* ---------- catch / finalize / capture ---------- */
function catchScope(tag, processName) {
  return scope({
    [`Set_variable_varStatusCode_${tag}_500`]: setVar('varStatusCode', 500),
    [`Append_to_array_variable_varErrors_${tag}_Catch`]: appendErr({
      scope: tag, stage: 'processing', status: 'failed',
      message: `${tag} processing failed, skipped, or timed out.`,
      details: `@result('${processName}')`, trackedAtUtc: '@utcNow()',
    }, ok(`Set_variable_varStatusCode_${tag}_500`)),
    [`Set_variable_varData_${tag}_Catch`]: setVar('varData', { code: 'SERVER_ERROR', message: `${tag} could not be completed.` }, ok(`Append_to_array_variable_varErrors_${tag}_Catch`)),
  }, { [processName]: ['Failed', 'TimedOut', 'Skipped'] });
}

/**
 * WHO IS READING THIS RESPONSE?
 *
 * Two clients, two shapes, and the difference is not cosmetic.
 *
 * The INTERNAL platform reads through core/contracts.js `assertEnvelope`, which returns
 * `response.data ?? response` and reads ok / status.http / errors / request / timing / meta.
 * It needs the envelope.
 *
 * The PORTAL reads the parsed body directly — document-portal/js/core.js `readJson()` unwraps
 * nothing — and portal-data-contract.json (status: AUTHORITATIVE) specifies every field it reads
 * at the TOP LEVEL, each with the function that reads it: `referenceId`, `sent`, `verification`,
 * `record`, `caseRef`, `stored`. Wrapping those in `data` puts every one of them a level out of
 * reach, and because the HTTP status is still 200 the portal reads success with the field missing:
 * a submission with no reference, a correct code refused, an upload reported not stored.
 *
 * The contract's precedence clause settles it — "where this disagrees with a deployed flow, the
 * flow is wrong" — so the portal's Response body is `varData`, flat, and the envelope is still
 * composed for the run record and the build standard.
 *
 * A second reason points the same way: these are anonymous public endpoints, and the envelope
 * carries meta.runId, meta.flowName and the echoed request. None of that is a citizen's business.
 */
function finalizeScope(tag, processName, action, operation, audience = 'internal') {
  return scope({
    [`Set_variable_varCompletedAtUtc_${tag}`]: setVar('varCompletedAtUtc', '@utcNow()'),
    [`Set_variable_varDurationMs_${tag}`]: setVar('varDurationMs', "@max(div(sub(ticks(variables('varCompletedAtUtc')),variables('varStartTicks')),10000),0)", ok(`Set_variable_varCompletedAtUtc_${tag}`)),
    Compose__Standard_Response_Revised: compose({
      ok: "@less(int(variables('varStatusCode')),400)",
      status: {
        http: "@variables('varStatusCode')",
        code: "@if(less(int(variables('varStatusCode')),400),'OK',concat('ERR',string(variables('varStatusCode'))))",
        message: "@if(less(int(variables('varStatusCode')),400),'Success','Failed')",
      },
      request: {
        requestId: "@variables('varRequestId')",
        /* core/contracts.js responseMeta() reads request.trackingId; without it every internal
           response reports an empty tracking id. The deployed flows carry it. */
        trackingId: "@trim(string(coalesce(triggerBody()?['payload']?['trackingId'],triggerBody()?['trackingId'],'')))",
        action: `@coalesce(triggerBody()?['action'],'${action}')`,
        /* Payload-first: the portal posts a flat body, but core/data-client.js nests the
           caller's fields under `payload`, so the internal packages need both. */
        operation: `@coalesce(triggerBody()?['payload']?['operation'],triggerBody()?['operation'],'${operation}')`,
        source: "@coalesce(triggerBody()?['payload']?['source'],triggerBody()?['source'],'portal')",
      },
      timing: {
        receivedAtUtc: "@variables('varReceivedAtUtc')",
        completedAtUtc: "@variables('varCompletedAtUtc')",
        durationMs: "@variables('varDurationMs')",
      },
      data: "@variables('varData')",
      errors: "@variables('varErrors')",
      meta: {
        ts: "@variables('varCompletedAtUtc')",
        runId: "@workflow()?['run']?['name']",
        flowName: "@workflow()?['name']",
        contractVersion: '2026-08-21.1',
      },
    }, ok(`Set_variable_varDurationMs_${tag}`)),
    /* One named place the response body comes from, so the run record can report what was
       actually sent rather than what was composed. */
    Compose_Response_Body: compose(
      audience === 'portal' ? "@coalesce(variables('varData'),json('{}'))" : "@outputs('Compose__Standard_Response_Revised')",
      ok('Compose__Standard_Response_Revised')),
    /* THE ORIGIN IS NOT A LITERAL ANY MORE.
       Every endpoint returned `Access-Control-Allow-Origin: https://your-host`, so a browser
       refused every response from the real portal — and the fix could not be a different literal
       baked into fourteen packages, because that is the same fault with a better-looking value.
       The estate carries the allowed origins instead: rows in `Flow Configuration` whose Title
       begins `ALLOWED_ORIGIN`, each holding one origin in `ConfigValue`, and every response
       echoes the caller's own Origin only when it appears in that list.

       Two properties matter. It FAILS CLOSED: no rows, an unreadable list, or an origin that is
       not listed yields an empty header, which a browser rejects — access is never granted by
       accident. And it never blocks the response: the read is chained on every status and the
       projection coalesces, so a missing or renamed list costs the CORS header, not the answer. */
    [`Get_Allowed_Origins_${tag}`]: get(T.config, {
      $filter: "startswith(Title,'ALLOWED_ORIGIN')", $top: 20,
    }, ok('Compose_Response_Body')),
    [`Select_Allowed_Origins_${tag}`]: {
      type: 'Select',
      inputs: {
        from: `@coalesce(outputs('Get_Allowed_Origins_${tag}')?['body/value'],json('[]'))`,
        select: "@trim(string(coalesce(item()?['ConfigValue'],'')))",
      },
      runAfter: { [`Get_Allowed_Origins_${tag}`]: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] },
      metadata: meta(),
    },
    [`Compose_Request_Origin_${tag}`]: compose(
      "@trim(string(coalesce(triggerOutputs()?['headers']?['Origin'],triggerOutputs()?['headers']?['origin'],'')))",
      ok(`Select_Allowed_Origins_${tag}`)),
    [`Compose_Allowed_Origin_${tag}`]: compose(
      `@if(contains(coalesce(body('Select_Allowed_Origins_${tag}'),json('[]')),outputs('Compose_Request_Origin_${tag}')),outputs('Compose_Request_Origin_${tag}'),string(coalesce(first(coalesce(body('Select_Allowed_Origins_${tag}'),json('[]'))),'')))`,
      ok(`Compose_Request_Origin_${tag}`)),
    [`Response_${tag}`]: {
      type: 'Response', kind: 'Http',
      inputs: {
        statusCode: "@variables('varStatusCode')",
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': `@outputs('Compose_Allowed_Origin_${tag}')`,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Correlation-ID',
          'Vary': 'Origin',
        },
        body: "@outputs('Compose_Response_Body')",
      },
      runAfter: ok(`Compose_Allowed_Origin_${tag}`),
      metadata: meta(),
    },
  }, { [processName]: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'], [`Scope_Catch_${tag}`]: ['Succeeded', 'Skipped'] });
}

function captureScope(tag, processName, bodyRedacted) {
  return scope({
    Compose_Redacted_Queries: compose("@setProperty(setProperty(coalesce(triggerOutputs()?['queries'],json('{}')),'sig','***REDACTED***'),'code','***REDACTED***')"),
    /* x-ms-igw-external-uri and x-ms-igw-raw-target carry the trigger's full invocation URL,
       `sig=` SAS token and all. They are bearer credentials, so a run record that keeps them is a
       credential at rest in a SharePoint list. The four correspondence-gateway packages already
       redact both; these did not until the run record gained a durable sink. */
    Compose_Redacted_Headers: compose("@setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(coalesce(triggerOutputs()?['headers'],json('{}')),'Authorization','***REDACTED***'),'Cookie','***REDACTED***'),'x-api-key','***REDACTED***'),'Ocp-Apim-Subscription-Key','***REDACTED***'),'x-ms-igw-external-uri','***REDACTED***'),'x-ms-igw-raw-target','***REDACTED***')", ok('Compose_Redacted_Queries')),
    Compose_Flow_Run_Record: compose({
      capture_metadata: { telemetry_kind: 'flow_run_record', capture_version: '2.0.0', captured_at_utc: '@utcNow()', capture_scope: 'Scope_Flow_Data_Capture' },
      workflow_identity: { internal_name: "@workflow()?['name']", full_resource_id: "@workflow()?['id']", type: "@workflow()?['type']", location: "@workflow()?['location']", tags: "@coalesce(workflow()?['tags'],json('{}'))" },
      run_identity: { run_name: "@workflow()?['run']?['name']", run_resource_id: "@workflow()?['run']?['id']" },
      trigger_record: { method: "@triggerOutputs()?['method']", headers_redacted: "@coalesce(outputs('Compose_Redacted_Headers'),json('{}'))", queries_redacted: "@coalesce(outputs('Compose_Redacted_Queries'),json('{}'))" },
      request: { body_redacted: bodyRedacted },
      design_definition: { contract_version: '2026-08-21.1', endpoint: tag },
      /* WHAT THIS RECORD MAY NOT CARRY.
         `body_sent` was `Compose_Response_Body`, whose internal shape is the envelope with
         `data: varData` inside it, and `all_scope_action_results` was `result()` over the whole
         process scope — every action's inputs AND outputs, which on the assignment and directory
         flows means live user rows, emails and roles. Neither mattered while this compose fed
         nothing; both become a durable disclosure the moment it is written to a list, which it
         now is. The record keeps the status code, the outcome flag and the error count: enough to
         answer "which runs failed and how long did they take" without holding a payload. */
      response_record: { status_code_sent: "@variables('varStatusCode')", error_count: "@length(coalesce(variables('varErrors'),json('[]')))" },
      outcome: { flow_outcome: "@if(less(int(variables('varStatusCode')),400),'Succeeded','Failed')" },
      timing: { received_at_utc: "@variables('varReceivedAtUtc')", completed_at_utc: "@variables('varCompletedAtUtc')", duration_ms: "@variables('varDurationMs')" },
    }, ok('Compose_Redacted_Headers')),
    Create_Flow_Telemetry: post(T.telemetry, {
      'item/Title': "@coalesce(workflow()?['tags']?['flowDisplayName'],workflow()?['name'])",
      'item/Flow': "@coalesce(workflow()?['tags']?['flowDisplayName'],workflow()?['name'])",
      'item/RunId': "@workflow()?['run']?['name']",
      'item/StartedAtUtc': "@variables('varReceivedAtUtc')",
      'item/CompletedAtUtc': "@variables('varCompletedAtUtc')",
      'item/Outcome': "@if(less(int(variables('varStatusCode')),400),'Succeeded','Failed')",
      'item/DurationMs': "@variables('varDurationMs')",
      'item/ErrorMessage': "@string(variables('varErrors'))",
      /* Compose_Flow_Run_Record was computed and then read by nothing — zero downstream
         references across all fourteen generated packages — so every run threw its own record
         away. This is its sink, and it is emitted ONLY once the column is in the tenant:
         dropPending() strips it while portal-field-spec.json still marks RunRecordJson PENDING,
         because a write naming a column the list does not have stops the flow being saved at
         all. Provision the column, flip its capturedState, regenerate, and it appears. */
      'item/RunRecordJson': "@string(outputs('Compose_Flow_Run_Record'))",
    }, ok('Compose_Flow_Run_Record')),
  }, { [`Scope_Finalize_Response_${tag}`]: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] });
}

/* ---------- assemble ---------- */
/* Logic Apps accepts InitializeVariable only at the top level of a workflow: across the 58
   tenant exports in this repository there are 504 of them and not one is nested inside a scope.
   A clipboard package IS a scope, so anything it carries lands nested — which is why the
   variables are emitted separately (see emitVariables) and the pasted scope declares none.
   The gateway packages, which paste and run in this tenant, carry none either. */
function assemble(tag, globalActions, bodyRedacted, action, operation, audience = 'internal') {
  const processName = `Scope_Global_${tag}`;
  const actions = {
    [processName]: scope(globalActions, {}),
    [`Scope_Catch_${tag}`]: catchScope(tag, processName),
    [`Scope_Finalize_Response_${tag}`]: finalizeScope(tag, processName, action, operation, audience),
    Scope_Flow_Data_Capture: captureScope(tag, processName, bodyRedacted),
  };
  return { type: 'Scope', actions, runAfter: {}, metadata: meta() };
}

function connData(serialized) {
  const out = {};
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && v.type === 'OpenApiConnection') {
        const api = v.inputs.host.connection;
        const id = CONNECTIONS[api];
        if (!id) throw new Error(`${k} uses ${api}, which has no entry in CONNECTIONS`);
        out[k] = {
          connectionReference: {
            api: { id: `/providers/Microsoft.PowerApps/apis/${api}` },
            connection: { id: `/providers/Microsoft.PowerApps/apis/${api}/connections/${id}` },
            connectionName: id,
          },
          referenceKey: api,
        };
      }
      walk(v);
    }
  })(serialized);
  return out;
}

function emit(file, nodeId, serializedValue) {
  const pkg = { nodeId, serializedValue, allConnectionData: connData(serializedValue), staticResults: {}, isScopeNode: true, mslaNode: true };
  writeFileSync(OUT + file, JSON.stringify(pkg));
  emitVariables(file);
  return pkg;
}

/* The eight run-scoped variables every internal flow needs, written beside each package as the
   prerequisite they are. They are created once at the flow's top level, before the scope is
   pasted; the scope reads them and writes them but must not declare them. */
function emitVariables(file, extra = [], outDir = OUT, auditWriter = false) {
  const vars = initVars();
  const entries = Object.entries(vars).map(([action, a]) => [action, a.inputs.variables[0]])
    .concat(extra.map((v) => ['Initialize_variable_' + v.name, v]));
  const rows = entries.map(([action, v]) => {
    const val = typeof v.value === 'string' ? v.value : JSON.stringify(v.value);
    return '| `' + v.name + '` | ' + v.type + ' | `' + val + '` | `' + action + '` |';
  });
  const flow = file.replace('.designer-paste.json', '');
  const md = [
    '# ' + flow + ' \u2014 top-level variables (create these first)',
    '',
    '> Generated by `scripts/build-internal-designer-paste.mjs`. Do not edit.',
    '',
    'Power Automate accepts **Initialize variable** only at the top level of a workflow. A',
    'clipboard package is a scope, so these cannot travel inside',
    '`' + flow + '.designer-paste.json` \u2014 pasting them there produces a definition the',
    'designer will not save.',
    '',
    'Add these actions at the top of the flow, in this order, **before** pasting the scope.',
    'Each one is an *Initialize variable* action.',
    '',
    '| Variable | Type | Initial value | Action name to use |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    "The pasted scope reads and writes every one of them. If any is missing the flow fails at",
    "run time with `The variable 'name' is not defined`.",
    '',
    '## Do not paste this. Install it.',
    '',
    'The clipboard route broke four flows in this tenant — IP_FETCH_ALL_ENDPOINT,',
    'IP_Single_Assignment_Endpoint, IP_OTP_Endpoint and CG_Verification_Endpoint — each pasted',
    'from a package whose every *Set variable* carried a value, and each arriving with those',
    'values gone. It is not an operator error and no amount of care avoids it; see the two',
    'failure modes below for why. Use the route that has no paste in it:',
    '',
    '```bash',
    '# 1. Export the flow from Power Automate:  ⋯ → Export → Package (.zip)',
    '# 2. Install this package into its own definition:',
    'node scripts/patch-flow-package.mjs --in <exported.zip> --out <ready.zip> \\',
    '    --install ' + flow,
    '# 3. Import ready.zip choosing UPDATE — never "Create as new", which mints a new trigger URL.',
    '```',
    '',
    'That writes the declarations above to the flow\'s top level and this package\'s scope beneath',
    'them, in one definition, and sets the trigger Method = POST. It refuses to write if any',
    'variable write has lost its value, any `runAfter` fails to resolve, or any connector host is',
    'not in the definition shape. All four flows above were repaired this way and re-exported',
    'clean: 0 missing, 0 different, 0 extra, every value intact, flow ids unchanged.',
    '',
    'The declarations still have to exist — the installer reads them from',
    '`' + flow + '.variables.designer-paste.json`, which is why that file ships. You do not',
    'create them by hand for this route.',
    '',
    '## If you paste anyway: paste into an empty flow, and paste it last',
    '',
    'Two things the designer does silently, both of which have already cost a visit:',
    '',
    '1. **Paste the scope before the declarations exist and every *Set variable* loses its value.**',
    '   The designer types a Set variable\'s Value field from the declared type of the variable named',
    '   in it. With no matching *Initialize variable* at the top level the name resolves to nothing,',
    '   the value has no type to be edited as, and it is dropped — leaving the action with a name and',
    '   an empty Value box, and no error anywhere. The run then returns whatever the variables were',
    '   initialised to: HTTP 500 with an empty `data`, on a flow that read every list correctly.',
    '   *Append to array variable* is untyped and keeps its value, so the damage looks partial.',
    '2. **Paste it under an existing action and it is anchored to that action.** The package ships',
    '   `runAfter: {}` because it is a root. A scope that comes back carrying an anchor was pasted',
    '   into a flow that already had something in it — and if that anchor belongs to another flow\'s',
    '   variables, into the wrong flow entirely, where the response and telemetry actions every',
    '   endpoint shares under the same names collide with the ones already there.',
    '',
    'Neither is repairable in place: delete the scope, create the declarations above, paste again.',
    'To check what a paste actually did, copy the scope back out of the designer to a file and run',
    '`node scripts/diagnose-designer-paste.mjs <file>` — it reports both faults against this',
    'package, with the value each Set variable should be carrying.',
    '',
    '## List columns this package writes',
    '',
    'A SharePoint column that does not exist rejects the whole item, so these are prerequisites in',
    'the same sense the variables are. Each row names the specification that declares it.',
    '',
    '| List | Column | Type | Declared in | Why |',
    '| --- | --- | --- | --- | --- |',
    '| `Portal Flow Telemetry` | `RunRecordJson` | Note | `docs/deployment/sharepoint/portal-field-spec.json` (provision with `scripts/provision-sharepoint-fields.browser.js`) | Holds `Compose_Flow_Run_Record`. **Blocking for telemetry only**: `Create_Flow_Telemetry` writes `item/RunRecordJson`, so without the column that one action fails and the run record is lost. The endpoint has already answered by then — `Scope_Flow_Data_Capture` runs after the Response — so the caller is unaffected. Earlier revisions of this file promised a `Create_Flow_Telemetry_Without_Run_Record` fallback; no package has ever contained one, and the claim is withdrawn rather than left standing. |',
    ...(auditWriter ? [
      '| `DGO_AuditLog` | `AuditId`, `Event`, `Severity`, `CreatedAt` | Text / Text / Choice / DateTime | `docs/reference/sharepoint-provisioning-spec.json` | **Required** by the list. A row missing any of the four is rejected outright. |',
      '| `DGO_AuditLog` | `RequestId`, `Module`, `Action`, `ActorEmail`, `ActorRole`, `ActorPersona`, `EntityType`, `EntityId`, `Ref`, `MetaJson` | Text (`MetaJson`: Note) | `docs/reference/sharepoint-provisioning-spec.json` | Optional, and all written — without them the row records that something happened but not who did it or to what. |',
    ] : []),
    '',
    ...(auditWriter ? [
      '`Severity` is a Choice column: `info`, `warning`, `error`, `security`. A value outside that set',
      'is rejected exactly like a missing required column.',
      '',
      'The browser provisioner does **not** cover `DGO_AuditLog` — the governance estate is not in',
      "`portal-field-spec.json`. Confirm that list's columns against the tenant separately.",
      '',
    ] : []),
  ].join('\n');
  writeFileSync(outDir + flow + '.variables.md', md);
}

export { T, SITE, GDDC, NEDMS, ACT, normalizeItemParams, sp, get, post, patch, compose, setVar, appendErr, cond, scope, ok, filt, meta, mid, initVars, rateLimit, rateLimitedActions, assemble, connData, emit, emitVariables, CONNECTIONS, REPO, OUT };
