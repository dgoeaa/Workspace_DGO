#!/usr/bin/env node
/* Designer-compatibility validator for Power Automate clipboard packages.
 *
 * The existing repository check verifies connection identity and envelope field reads. It does
 * not verify that each action carries what the designer needs to render and save it. This does:
 * per-type required fields, connector parameter completeness, run-after resolvability,
 * expression well-formedness, placeholder detection, name uniqueness and nesting depth.
 *
 * Every finding names the action and what specifically is absent or malformed. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* Every directory that holds clipboard packages. A package that will not paste, or that pastes
   into a definition the designer refuses to save, is a defect the rest of the suite does not
   look for: verify-designer-paste.mjs checks connection identity and the build standard, not
   whether each action carries what the designer needs to render it. */
const DIRS = [
  'docs/deployment/internal/flows/designer-paste',
  'docs/deployment/sharepoint/flows/designer-paste',
  'docs/deployment/sharepoint/flows/designer-paste/correspondence-gateway',
];
const findings = [];
const F = (file, action, severity, kind, detail) =>
  findings.push({ file, action, severity, kind, detail });

/* ---------- what the lists actually accept ----------
 *
 * Create_Assign_Audit wrote a single `item/Title` into DGO_AuditLog, a list whose specification
 * declares fourteen columns and marks four of them required. Nothing in this suite looked, so a
 * row SharePoint rejects outright shipped as a passing package — and because the write sat on the
 * success path, the rejection answered 500 after the assignment had already committed.
 *
 * Two specifications describe the estate and neither covers the other: portal-field-spec.json is
 * keyed by list GUID and covers the portal lists; sharepoint-provisioning-spec.json is keyed by
 * list title and covers the governance lists. The tenant capture maps GUID to title, which is
 * what lets a package's `table` parameter be checked against either. A list neither specification
 * declares is an adopted operational list whose columns this repository does not own; those are
 * skipped rather than guessed at. */
const readJson = (rel) => JSON.parse(readFileSync(rel, 'utf8'));
const GUID_TITLE = new Map(Object.entries(readJson('docs/reference/sharepoint-list-index.json').lists)
  .map(([guid, l]) => [guid.toLowerCase(), l.title]));
const LIST_FIELDS = new Map();   // list title -> Map(internalName -> {required, type, choices})
const declare = (title, name, required, type, choices) => {
  if (!LIST_FIELDS.has(title)) LIST_FIELDS.set(title, new Map());
  LIST_FIELDS.get(title).set(name, { required, type, choices });
};
for (const l of readJson('docs/deployment/sharepoint/portal-field-spec.json').lists)
  for (const f of l.fields) declare(l.listTitle, f.internalName, !!f.required, f.fieldType, f.choices || null);
for (const f of readJson('docs/reference/sharepoint-provisioning-spec.json').fields)
  declare(f.ListTitle, f.InternalName, f.Required === 'Yes', f.FieldType,
    f.ChoiceValues ? f.ChoiceValues.split(';').map((c) => c.trim()) : null);
/* Title is every list's native column and is never declared as one to add. */
for (const cols of LIST_FIELDS.values()) cols.set('Title', { required: false, type: 'Text', choices: null });

/* result() returns the results of the actions INSIDE a scope, so its argument must be a
   scope-type action. The tenant's own definitions only ever apply it to Scope and Switch; a
   single action's outcome is read with actions(). */
const SCOPE_TYPES = new Set(['Scope', 'Foreach', 'Until', 'Switch', 'If']);

/* A COLUMN DECLARED BUT NOT PROVISIONED CANNOT APPEAR IN A WRITE.
   The designer validates every `item/<Column>` against the connector's operation definition for
   that list at SAVE time and refuses the flow outright:
     WorkflowOperationParametersExtraParameter — 'The API operation does not contain a
     definition for parameter 'item/RunRecordJson'.'
   Because it fails at save, no run-time fallback can catch it — the flow never runs. All
   fourteen packages once named a PENDING column here and none of them could be saved. Reads are
   unaffected: a $filter or an item()?['Column'] expression is not schema-validated, which is
   why the origin lookup reads ConfigValue while the telemetry write could not name
   RunRecordJson. This check is scoped to write parameters for exactly that reason. */
const CHOICE_COLUMNS = (() => {
  const m = new Map();
  const spec = readJson('docs/deployment/sharepoint/portal-field-spec.json');
  const titleToGuid = new Map(spec.lists.map((l) => [l.listTitle, l.listGuid.toLowerCase()]));
  for (const l of spec.lists) {
    const cols = l.fields.filter((f) => f.fieldType === 'Choice').map((f) => f.internalName);
    if (cols.length) m.set(l.listGuid.toLowerCase(), new Set(cols));
  }
  /* Governance lists are specified in the provisioning workbook, keyed by title, so they resolve
     through the tenant capture. */
  for (const [guid, l] of Object.entries(readJson('docs/reference/sharepoint-list-index.json').lists))
    titleToGuid.set(l.title, guid.toLowerCase());
  for (const f of readJson('docs/reference/sharepoint-provisioning-spec.json').fields) {
    if (f.FieldType !== 'Choice') continue;
    const guid = titleToGuid.get(f.ListTitle);
    if (!guid) continue;
    if (!m.has(guid)) m.set(guid, new Set());
    m.get(guid).add(f.InternalName);
  }
  return m;
})();

const PENDING_COLUMNS = (() => {
  const spec = readJson('docs/deployment/sharepoint/portal-field-spec.json');
  const m = new Map();
  for (const l of spec.lists) {
    /* PENDING says what the 2026-08-14 capture found; provisionedBy says the tenant has the
       column now, with a run record's ledger as the evidence. A column is unwritable only while
       both hold — declared after the capture AND not since provisioned. Reading capturedState
       alone kept rejecting RunRecordJson after it had been created in the tenant, and the fix
       must not be to rewrite capturedState: that is the only record of what the estate started
       from. scripts/lib/designer-paste-builder.mjs gates on exactly the same pair. */
    const cols = l.fields
      .filter((f) => f.capturedState === 'PENDING' && !f.provisionedBy)
      .map((f) => f.internalName);
    if (cols.length) m.set(l.listGuid.toLowerCase(), new Set(cols));
  }
  return m;
})();

/* Actions the designer renders from a connector. Each needs a host triple and parameters. */
const CONNECTOR_TYPES = new Set(['OpenApiConnection', 'ApiConnection', 'OpenApiConnectionWebhook']);

/* Per-type required input fields, from the Logic Apps workflow definition language. */
const REQUIRED = {
  Compose: (v) => (v.inputs === undefined ? ['inputs'] : []),
  InitializeVariable: (v) => {
    const vars = v.inputs?.variables;
    if (!Array.isArray(vars) || !vars.length) return ['inputs.variables'];
    const miss = [];
    vars.forEach((x, i) => {
      if (!x || typeof x.name !== 'string' || !x.name) miss.push(`inputs.variables[${i}].name`);
      if (!x || typeof x.type !== 'string' || !x.type) miss.push(`inputs.variables[${i}].type`);
    });
    return miss;
  },
  SetVariable: (v) => {
    const m = [];
    if (!v.inputs || typeof v.inputs.name !== 'string' || !v.inputs.name) m.push('inputs.name');
    if (!v.inputs || !('value' in v.inputs)) m.push('inputs.value');
    return m;
  },
  IncrementVariable: (v) => (v.inputs?.name ? [] : ['inputs.name']),
  AppendToArrayVariable: (v) => {
    const m = [];
    if (!v.inputs?.name) m.push('inputs.name');
    if (!v.inputs || !('value' in v.inputs)) m.push('inputs.value');
    return m;
  },
  AppendToStringVariable: (v) => {
    const m = [];
    if (!v.inputs?.name) m.push('inputs.name');
    if (!v.inputs || !('value' in v.inputs)) m.push('inputs.value');
    return m;
  },
  ParseJson: (v) => {
    const m = [];
    if (!v.inputs || !('content' in v.inputs)) m.push('inputs.content');
    if (!v.inputs || !v.inputs.schema) m.push('inputs.schema');
    return m;
  },
  Response: (v) => (v.inputs && 'statusCode' in v.inputs ? [] : ['inputs.statusCode']),
  If: (v) => (v.expression ? [] : ['expression']),
  Switch: (v) => {
    const m = [];
    if (v.expression === undefined) m.push('expression');
    if (!v.cases || !Object.keys(v.cases).length) m.push('cases');
    return m;
  },
  Foreach: (v) => (v.foreach === undefined ? ['foreach'] : []),
  Until: (v) => {
    const m = [];
    if (!v.expression) m.push('expression');
    if (!v.limit) m.push('limit');
    return m;
  },
  Query: (v) => {
    const m = [];
    if (!v.inputs || !('from' in v.inputs)) m.push('inputs.from');
    if (!v.inputs || !('where' in v.inputs)) m.push('inputs.where');
    return m;
  },
  Select: (v) => {
    const m = [];
    if (!v.inputs || !('from' in v.inputs)) m.push('inputs.from');
    if (!v.inputs || !('select' in v.inputs)) m.push('inputs.select');
    return m;
  },
  Table: (v) => {
    const m = [];
    if (!v.inputs || !('from' in v.inputs)) m.push('inputs.from');
    if (!v.inputs || !v.inputs.format) m.push('inputs.format');
    return m;
  },
  Http: (v) => {
    const m = [];
    if (!v.inputs?.method) m.push('inputs.method');
    if (!v.inputs?.uri) m.push('inputs.uri');
    return m;
  },
  Terminate: (v) => (v.inputs?.runStatus ? [] : ['inputs.runStatus']),
  Join: (v) => {
    const m = [];
    if (!v.inputs || !('from' in v.inputs)) m.push('inputs.from');
    if (!v.inputs || !('joinWith' in v.inputs)) m.push('inputs.joinWith');
    return m;
  },
};

const PLACEHOLDER = /^(TODO|TBD|REPLACE(_ME)?|PLACEHOLDER|CHANGEME|XXX+|<[^>]+>|\{\{[^}]+\}\}|YOUR_[A-Z_]+)$/i;

/* An expression is a whole-string expression when it starts with '@'. A '@' that appears later
   in a plain string is interpolation only if wrapped as @{...}; a bare '@' mid-string is a
   literal and any expression inside it will never evaluate. */
function expressionFindings(file, name, path, s) {
  if (typeof s !== 'string' || !s.includes('@')) return;
  if (s.startsWith('@@')) return;                       // escaped literal '@'
  if (s.startsWith('@')) {
    const body = s.slice(1);
    let depth = 0, q = null;
    for (const ch of body) {
      if (q) { if (ch === q) q = null; continue; }
      if (ch === "'") { q = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth < 0) break;
    }
    if (depth !== 0) F(file, name, 'error', 'malformed-expression',
      `${path}: unbalanced parentheses in "${s.slice(0, 90)}"`);
    return;
  }
  /* Not a whole-string expression. Any function-looking '@name(' that is not inside @{ } will
     be rendered as literal text by the designer. */
  const bare = /(^|[^@{])@([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(s);
  if (bare && !/@\{/.test(s)) {
    F(file, name, 'error', 'inert-expression',
      `${path}: "@${bare[2]}(" appears inside a literal string and will never evaluate — "${s.slice(0, 90)}"`);
  }
}

function scanValues(file, name, obj, path, seen = new Set()) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') { expressionFindings(file, name, path, obj);
    if (PLACEHOLDER.test(obj.trim())) F(file, name, 'error', 'placeholder-value', `${path} = "${obj}"`);
    return; }
  if (typeof obj !== 'object') return;
  if (seen.has(obj)) return; seen.add(obj);
  for (const [k, v] of Object.entries(obj)) scanValues(file, name, v, path ? `${path}.${k}` : k, seen);
}

function validate(file, pkg) {
  const sv = typeof pkg.serializedValue === 'string' ? JSON.parse(pkg.serializedValue) : pkg.serializedValue;
  if (!sv) { F(file, '(package)', 'error', 'envelope', 'serializedValue absent or unparseable'); return; }

  for (const k of ['nodeId', 'serializedValue', 'allConnectionData']) {
    if (!(k in pkg)) F(file, '(package)', 'error', 'envelope', `envelope key '${k}' absent`);
  }

  const all = [];               // {name, v, siblings, depth}
  (function walk(actions, depth, container) {
    const names = Object.keys(actions || {});
    for (const name of names) {
      const v = actions[name];
      all.push({ name, v, siblings: names, depth, container });
      walk(v.actions, depth + 1, name);
      if (v.else?.actions) walk(v.else.actions, depth + 1, name);
      if (v.cases) for (const c of Object.values(v.cases)) walk(c.actions, depth + 1, name);
      if (v.default?.actions) walk(v.default.actions, depth + 1, name);
    }
  })(sv.actions, 1, pkg.nodeId);

  /* Name uniqueness — the designer keys every action by name across the whole flow. */
  const counts = {};
  for (const a of all) counts[a.name] = (counts[a.name] || 0) + 1;
  for (const [n, c] of Object.entries(counts)) if (c > 1)
    F(file, n, 'error', 'duplicate-action-name', `appears ${c} times; the designer requires unique action names`);

  const declaredConns = new Set(Object.keys(pkg.allConnectionData || {}));
  const usedConns = new Set();

  for (const a of all) {
    const { name, v, siblings, depth } = a;

    if (!v.type) { F(file, name, 'error', 'missing-type', 'action has no "type"'); continue; }

    /* Logic Apps accepts InitializeVariable only at a workflow's top level. All 504 of them
       across the 58 tenant exports in this repository sit there; not one is nested. A clipboard
       package is a scope, so a declaration inside it lands nested and the designer will not save
       the definition. Declarations belong in the companion <flow>.variables.md.

       DGO_VARIABLE_INITIALIZATION is the single deliberate exception, and the distinction is
       between pasting and saving: the designer ACCEPTS the paste, and refuses only to save a
       definition that still has them nested. That package exists to be pasted once and then
       emptied — the operator drags the declarations out to the top level and deletes the husk
       before saving — which beats hand-typing nine declarations seven times over. It is named
       here rather than detected by shape, so a flow package cannot acquire the exemption by
       accident. */
    if (v.type === 'InitializeVariable' && !file.endsWith('.variables.designer-paste.json'))
      F(file, name, 'error', 'variable-declared-in-scope',
        'InitializeVariable inside a clipboard package pastes nested, which Logic Apps rejects; declare it at the flow top level instead');
    if (depth > 8) F(file, name, 'error', 'nesting-depth', `nested ${depth} deep; Logic Apps permits 8`);

    const req = REQUIRED[v.type];
    if (req) { const miss = req(v); for (const m of miss)
      F(file, name, 'error', 'missing-required-field', `${v.type} requires ${m}`); }

    if (CONNECTOR_TYPES.has(v.type)) {
      /* A designer clipboard package binds a connector action to its connection through
         allConnectionData, which is keyed by ACTION NAME. inputs.host carries apiId, the
         reference key (as `connection`) and operationId. This shape was confirmed against a
         package from this estate that pasted and ran successfully. */
      const h = v.inputs?.host;
      if (!h) F(file, name, 'error', 'missing-connector-host', `${v.type} has no inputs.host`);
      else {
        if (!h.apiId) F(file, name, 'error', 'missing-api-id', 'inputs.host.apiId absent');
        if (!h.operationId) F(file, name, 'error', 'missing-operation-id', 'inputs.host.operationId absent');
        const refKey = h.connection || h.connectionName;
        if (!refKey) F(file, name, 'error', 'missing-connection-ref', 'inputs.host declares neither connection nor connectionName');
        else {
          usedConns.add(name);
          const entry = (pkg.allConnectionData || {})[name];
          if (!entry) F(file, name, 'error', 'unbound-connector-action',
            `no allConnectionData entry for this action; the designer will paste it with no connection bound`);
          else {
            if (!entry.connectionReference?.connection?.id)
              F(file, name, 'error', 'incomplete-connection-entry', 'allConnectionData entry has no connectionReference.connection.id');
            if (entry.referenceKey && entry.referenceKey !== refKey)
              F(file, name, 'error', 'connection-key-mismatch',
                `inputs.host.connection is '${refKey}' but allConnectionData.referenceKey is '${entry.referenceKey}'`);
            const apiInEntry = entry.connectionReference?.api?.id;
            if (apiInEntry && h.apiId && apiInEntry !== h.apiId)
              F(file, name, 'error', 'api-id-mismatch',
                `inputs.host.apiId is '${h.apiId}' but allConnectionData api.id is '${apiInEntry}'`);
          }
        }
      }
      const p = v.inputs?.parameters;
      if (p === undefined) F(file, name, 'error', 'missing-parameters', `${v.type} has no inputs.parameters`);
      else if (p && typeof p === 'object' && !Object.keys(p).length)
        F(file, name, 'warn', 'empty-parameters', 'inputs.parameters is an empty object');
      else if (p) for (const [k, val] of Object.entries(p)) {
        if (val === '' ) F(file, name, 'warn', 'empty-parameter-value', `parameters['${k}'] is an empty string`);
        if (val === null) F(file, name, 'error', 'null-parameter-value', `parameters['${k}'] is null`);
      }
    }

    /* runAfter must name a sibling in the same actions object. */
    for (const prev of Object.keys(v.runAfter || {})) {
      if (!siblings.includes(prev))
        F(file, name, 'error', 'unresolvable-runafter',
          `runAfter names '${prev}', which is not a sibling in the same scope`);
      const sts = v.runAfter[prev];
      if (!Array.isArray(sts) || !sts.length)
        F(file, name, 'error', 'empty-runafter-status', `runAfter['${prev}'] has no status list`);
      else for (const s of sts) if (!['Succeeded', 'Failed', 'Skipped', 'TimedOut'].includes(s))
        F(file, name, 'error', 'bad-runafter-status', `runAfter['${prev}'] contains '${s}'`);
    }

    scanValues(file, name, v.inputs, 'inputs');
    if (v.expression !== undefined) scanValues(file, name, v.expression, 'expression');
  }

  /* result('X') must name a scope. */
  const byName = new Map(all.map((a) => [a.name, a.v]));
  for (const m of JSON.stringify(sv).matchAll(/result\('([^']+)'\)/g)) {
    const target = byName.get(m[1]);
    if (target && !SCOPE_TYPES.has(target.type))
      F(file, m[1], 'error', 'result-on-non-scope',
        `result('${m[1]}') names a ${target.type}; result() takes a scope-type action — read a single action's outcome with actions('${m[1]}')`);
  }

  /* Every item/<Column> written must exist, and a create must carry every required column. */
  for (const a of all) {
    const op = a.v.inputs?.host?.operationId;
    if (op !== 'PostItem' && op !== 'PatchItem') continue;
    const guid = String(a.v.inputs?.parameters?.table || '').toLowerCase();
    const title = GUID_TITLE.get(guid);
    /* THE TWO WAYS A WRITE IS REFUSED AT SAVE TIME, BOTH REPORTED BY THE DESIGNER.

       A Choice column is modelled as an OBJECT and takes its string at `item/<Col>/Value`:
         OpenApiOperationParameterValidationFailed — The parameter with value '"info"' in path
         'item/Severity' with type/format 'String' is not convertible to type/format 'Object'.

       And an update must carry Title, which is required on a Generic List and which the
       connector demands on every patch rather than leaving alone:
         Invalid parameter for 'Update Rate Limit Otp Request'. Error: 'Title' is required

       Both rules are visible in the two tenant-captured packages — ECM_DOCS_INTAKE writes
       `item/Status/Value`, and every PatchItem in both carries `item/Title` derived from the row
       it is updating. Thirty-eight generated writes broke one or the other and only the first
       two the designer reached were reported. */
    for (const [k] of Object.entries(a.v.inputs.parameters)) {
      if (!k.startsWith('item/')) continue;
      const col = k.slice(5).split('/')[0];
      if (CHOICE_COLUMNS.get(guid)?.has(col) && !k.endsWith('/Value'))
        F(file, a.name, 'error', 'choice-not-addressed-by-value',
          `writes '${k}', but ${title}.${col} is a Choice column — the connector models it as an object and takes the string at 'item/${col}/Value'. The designer refuses to save otherwise.`);
    }
    if (op === 'PatchItem' && !Object.keys(a.v.inputs.parameters).some((k) => k === 'item/Title' || k.startsWith('item/Title/')))
      F(file, a.name, 'error', 'patch-without-title',
        `updates ${title} without 'item/Title'. Title is required on a Generic List and the connector demands it on every patch — supply the row's existing Title so the update preserves it.`);


    const cols = title && LIST_FIELDS.get(title);
    if (!cols) continue;                       // adopted list, columns not owned here
    const written = new Set();
    for (const k of Object.keys(a.v.inputs.parameters)) {
      if (!k.startsWith('item/')) continue;
      /* The SharePoint connector addresses a Choice column's value as `item/<Col>/Value`, a
         person's as `/Claims` and a lookup's as `/Id`. All three name the column before the
         suffix — `item/Status/Value` IS a write to Status, and reading it as a column called
         "Status/Value" reports a missing required column that is in fact supplied. */
      const col = k.slice(5).split('/')[0];
      written.add(col);
      const spec = cols.get(col);
      if (!spec) {
        F(file, a.name, 'error', 'undeclared-list-column',
          `writes '${k}' but ${title} declares no column '${col}'`);
        continue;
      }
      const val = a.v.inputs.parameters[k];
      if (spec.type === 'Choice' && typeof val === 'string' && !val.includes('@') && spec.choices?.length && !spec.choices.includes(val))
        F(file, a.name, 'error', 'choice-value-not-declared',
          `writes '${k}' = '${val}', which is not one of ${title}.${col}'s choices (${spec.choices?.join(', ')})`);
    }
    const pend = PENDING_COLUMNS.get(guid);
    if (pend) {
      for (const col of written) {
        if (pend.has(col))
          F(file, a.name, 'error', 'writes-unprovisioned-column',
            `writes 'item/${col}', which ${title} does not have yet — portal-field-spec.json marks it PENDING and no run record claims it. The designer refuses to SAVE a flow naming a column the list lacks, so this cannot be caught at run time. Provision the column and record the run that did it in the field's provisionedBy, or drop the write.`);
      }
    }

    if (op !== 'PostItem') continue;           // a patch supplies only what it changes
    const missing = [...cols].filter(([n, f]) => f.required && !written.has(n)).map(([n]) => n);
    if (missing.length)
      F(file, a.name, 'error', 'missing-required-list-column',
        `creates an item in ${title} without ${missing.map((n) => `'${n}'`).join(', ')}; the list marks ${missing.length > 1 ? 'them' : 'it'} required, so SharePoint rejects the row`);
  }

  /* A Foreach runs its repetitions in parallel by default (20 at a time). Concurrent appends
     to one variable race, and the loop silently under-reports its own results. The tenant's own
     carefully built flows pin repetitions to 1 whenever they do this. */
  for (const a of all) {
    if (a.v.type !== 'Foreach') continue;
    const inner = JSON.stringify(a.v.actions || {});
    if (!/"(AppendToArrayVariable|SetVariable|IncrementVariable)"/.test(inner)) continue;
    if (a.v.runtimeConfiguration?.concurrency?.repetitions !== 1)
      F(file, a.name, 'error', 'parallel-foreach-writes-variable',
        'writes a variable inside a Foreach with no runtimeConfiguration.concurrency.repetitions = 1; parallel repetitions race and lose appends');
  }

  /* A connector READ whose output nothing consumes is a round-trip that can only fail. It buys
     nothing, and chained runAfter Succeeded it can turn a committed write into a 5xx — which is
     exactly what DGO_OTP did to a consumed, single-use code. */
  const READ_OPS = new Set(['GetItems', 'GetItem', 'GetFileContent', 'GetFileMetadata']);
  const consumed = new Set([...JSON.stringify(sv).matchAll(/(?:outputs|body|actions|result)\('([^']+)'\)/g)].map((m) => m[1]));
  for (const a of all) {
    if (!READ_OPS.has(a.v.inputs?.host?.operationId)) continue;
    if (!consumed.has(a.name))
      F(file, a.name, 'error', 'unread-connector-read',
        `${a.v.inputs.host.operationId} whose output nothing reads; delete it rather than leaving a call that can only fail`);
  }

  /* BLANKING AN EXISTING ROW BECAUSE A FIELD WAS ABSENT.
     A patch value that resolves to a caller field defaulting to '' erases the column when the
     caller simply omits it — and the flow answers 200. Both assignment flows did this to
     AssignedTo, and transitionstatus did it to Status on a 21,249-item list. A value is
     accepted when the request is validated (a length/empty test on the compose), when it falls
     back to the row's current value, or when the compose is the identity the gate resolved —
     that one is provably non-empty, because it is matched against a required Email column and
     the branch only runs if the lookup returned a row. */
  const txt = JSON.stringify(sv);
  for (const a of all) {
    if (a.v.inputs?.host?.operationId !== 'PatchItem') continue;
    for (const [k, v] of Object.entries(a.v.inputs.parameters)) {
      if (!k.startsWith('item/') || typeof v !== 'string') continue;
      if (v.includes('first(outputs(')) continue;                       // falls back to current value
      /* The value may name a Compose, or carry the expression inline — transitionstatus wrote
         `@trim(string(coalesce(<body>,'')))` straight into item/Status with no compose at all,
         so checking only the indirect form misses the very defect this exists to catch. */
      const ref = v.match(/^@?outputs\('([^']+)'\)$/);
      const producer = ref && byName.get(ref[1]);
      if (ref && producer?.type !== 'Compose') continue;
      const src = ref ? ref : [v, `${k} (inline)`];
      const pi = ref ? JSON.stringify(producer.inputs) : v;
      if (!pi.includes('triggerBody()') || !/,\s*''\s*\)/.test(pi)) continue;   // no empty default
      /* An expression that CHOOSES '' through an if() is writing a value, not losing one:
         unflagging a document clears the marker on purpose. Only an accidental empty — the
         coalesce default that fires because the field was absent — is the defect. */
      if (/^"?@if\(/.test(pi)) continue;
      /* Any test that refuses the request when the value is absent counts: a length or empty
         check, or membership of an allow-list — ECM_DOCS_INTAKE validates its status against
         seven permitted values, which is stricter than either. */
      const named = ref ? `outputs\\('${src[1]}'\\)` : null;
      const validated = Boolean(named) && (new RegExp(`(?:length|empty)\\(\\s*${named}`).test(txt)
        || new RegExp(`createArray\\([^)]*\\),\\s*${named}`).test(txt));
      /* The row being patched was FOUND by a $filter on this same value, and the branch only
         runs because that lookup returned something. An empty value therefore either cannot
         reach here (the identity gate: Email is a required column, so no row matches '') or
         rewrites the very row it matched (the rate-limit bucket) — a no-op either way. */
      const foundByThisValue = Boolean(named) && new RegExp(`"\\$filter":"[^"]*${named}`).test(txt);
      if (!validated && !foundByThisValue)
        F(file, a.name, 'error', 'blank-on-absent-field',
          `${k} resolves to ${ref ? `outputs('${src[1]}')` : 'an inline expression'} that defaults to '' when the caller omits the field — this patch erases the column and still answers success`);
    }
  }

  /* NO PLACEHOLDERS, ANYWHERE.
     A package that pastes cleanly and then does nothing useful because a value was left for
     someone to fill in is not provisioned, it is half-built — and both of the ones this estate
     shipped were load-bearing: `https://your-host` made a browser refuse every response, and
     REPLACE_WITH_OFFICE365_CONNECTION_ID meant no mail could send. Neither failed any check.
     This is that check. A value that must vary by environment belongs in a list the flow reads,
     not in the package. */
  const PLACEHOLDERS = [
    /REPLACE_WITH/i, /\byour-host\b/i, /\bTODO\b/, /\bCHANGEME\b/i, /\bFIXME\b/,
    /\bexample\.com\b/i, /\bcontoso\b/i, /<[A-Z_]{3,}>/, /\bXXXX+\b/,
  ];
  for (const a of all) {
    const blob = JSON.stringify({ i: a.v.inputs, e: a.v.expression });
    for (const rx of PLACEHOLDERS) {
      const hit = blob.match(rx);
      if (hit) F(file, a.name, 'error', 'placeholder-value',
        `carries the placeholder '${hit[0]}'; every value must be real, or read at run time from a list`);
    }
  }
  for (const [name, c] of Object.entries(pkg.allConnectionData || {})) {
    const id = String(c?.connectionReference?.connectionName || '');
    if (!/^[0-9a-f]{16,}$/i.test(id) && !id.startsWith('shared-'))
      F(file, name, 'error', 'placeholder-connection',
        `connectionName '${id}' is not a tenant connection id; the action would paste unbound`);
  }

  /* allConnectionData is keyed by action name, so an entry with no matching action is an
     orphan binding the designer will ignore. */
  for (const c of declaredConns) if (!usedConns.has(c))
    F(file, '(package)', 'warn', 'orphan-connection-entry',
      `allConnectionData declares '${c}' but no connector action of that name exists`);
}

const files = [];
for (const dir of DIRS) {
  let entries;
  try { entries = readdirSync(dir); } catch { continue; }
  for (const f of entries.filter((x) => x.endsWith('.designer-paste.json')).sort()) {
    const rel = `${dir}/${f}`;
    files.push(rel);
    let pkg;
    try { pkg = JSON.parse(readFileSync(rel, 'utf8')); }
    catch (e) { F(rel, '(file)', 'error', 'unparseable', e.message); continue; }
    validate(rel, pkg);
  }
}
console.log(`\nDesigner paste packages — schema and compatibility (${files.length} package(s))`);

const byFile = {};
for (const x of findings) (byFile[x.file] ||= []).push(x);
const errs = findings.filter((x) => x.severity === 'error').length;
const warns = findings.length - errs;

for (const f of files) {
  const rows = byFile[f] || [];
  const e = rows.filter((r) => r.severity === 'error').length;
  console.log(`\n${e ? '❌' : rows.length ? '⚠️ ' : '✅'} ${f}  — ${e} error(s), ${rows.length - e} warning(s)`);
  const kinds = {};
  for (const r of rows) (kinds[r.kind] ||= []).push(r);
  for (const [k, list] of Object.entries(kinds)) {
    console.log(`    ${list[0].severity === 'error' ? 'ERROR' : 'warn '} ${k} × ${list.length}`);
    for (const r of list.slice(0, 4)) console.log(`        ${r.action}: ${r.detail}`);
    if (list.length > 4) console.log(`        … and ${list.length - 4} more`);
  }
}
console.log(`\n${errs ? '❌' : '✅'} ${errs} error(s), ${warns} warning(s) across ${files.length} package(s)`);
process.exit(errs ? 1 : 0);
