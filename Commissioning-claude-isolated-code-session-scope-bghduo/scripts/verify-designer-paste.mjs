#!/usr/bin/env node
/**
 * Are the designer-paste flow packages structurally valid, conformant, and safe to paste?
 *
 * WHY THIS EXISTS
 * `docs/deployment/sharepoint/flows/designer-paste/` holds complete flow bodies in the Power
 * Automate modern-designer clipboard format. They are pasted into the designer by hand, so a
 * defect in one is discovered by an operator mid-visit rather than by a test. This checks what
 * can be checked before that happens:
 *
 *   1. the clipboard envelope is the shape the designer accepts
 *   1b. the scope is a root — a package anchored to a neighbouring action is a designer copy
 *   2. every SharePoint action targets a provisioned list, by GUID, on the right site
 *   3. every `item/<column>` written exists on that list
 *   4. every column named in a `$filter` exists on that list
 *   5. every `runAfter` names an action that exists as a sibling
 *   5b. every `outputs('X')` reads an action the runtime has already run
 *   5c. every variable write still carries the value it writes
 *   6. every connector action is bound — an allConnectionData entry, right api, right referenceKey
 *   7. every caller field is read payload-first, not from the envelope's top level, and a
 *      portal package's routing is decided by a field the portal actually sends
 *   8. the ten build-standard checks in flow-standard.json are satisfied
 *   9. nothing carries a credential, and nothing carries prose
 *   9b. the two gateway headers that carry the inbound URL are blanked
 *
 * Usage:
 *   node scripts/verify-designer-paste.mjs
 *   node scripts/verify-designer-paste.mjs --strict   # exit 1 on any failure
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const strict = process.argv.includes('--strict');
const DIRS = [
  'docs/deployment/sharepoint/flows/designer-paste/',
  'docs/deployment/internal/flows/designer-paste/',
];

const spec = read('docs/deployment/sharepoint/portal-field-spec.json');
const std = read('docs/deployment/sharepoint/flow-standard.json');
const byGuid = new Map(spec.lists.map((l) => [l.listGuid.toLowerCase(), l]));

/* The internal platform's lists are not in portal-field-spec.json — that file records the twelve
   provisioned portal lists. They are resolved instead against the tenant capture, which carries
   every list on every site with an `adopted` flag saying which of the duplicates is the live one.
   Column names for those lists come from `internal-field-evidence.json`, where each one records
   the deployed definition or the client normaliser it was read from — never invented. */
const tenant = read('docs/reference/sharepoint-list-index.json');
const tenantByGuid = new Map(Object.entries(tenant.lists).map(([g, v]) => [g.toLowerCase(), v]));
let evidence = { lists: {} };
try { evidence = read('docs/deployment/internal/internal-field-evidence.json'); } catch { /* optional */ }
const evidenceByGuid = new Map(Object.entries(evidence.lists || {}).map(([g, v]) => [g.toLowerCase(), v]));

/* What the portal client literally posts to each endpoint. Only the calls whose body is an
   object literal are resolved here — SUBMISSION and SUPPORT pass a variable built elsewhere, and
   those shapes are the data contract's job (npm run test:datacontract). */
const portalSends = new Map();
/* One package can serve more than one endpoint — Portal_Verify and Portal_Verify_Confirm share a
   body — so the routing has to be decidable from the UNION of what those endpoints are sent.
   VERIFY alone is only ever sent { email }, and routing it to 'generate' by the absence of a code
   is correct; what must not happen is a discriminator neither endpoint ever supplies. */
const PORTAL_ENDPOINT = {
  'Portal_VERIFY_ECM_DOCS.designer-paste.json': ['VERIFY', 'VERIFY_CONFIRM'],
  'Portal_VERIFY_CONFIRM_ECM_DOCS.designer-paste.json': ['VERIFY', 'VERIFY_CONFIRM'],
  'Portal_STATUS_ECM_DOCS.designer-paste.json': ['STATUS'],
  'Portal_WRITEBACK_ECM_DOCS.designer-paste.json': ['WRITEBACK'],
};
{
  const src = readFileSync(join(ROOT, 'document-portal/js/core.js'), 'utf8');
  let current = null;
  for (const line of src.split('\n')) {
    const k = line.match(/endpointUrl\('([A-Z_]+)'\)/);
    if (k) current = k[1];
    const b = line.match(/body: JSON\.stringify\(\{(.*)\}\)/);
    if (b && current) {
      const fields = [...b[1].matchAll(/([A-Za-z_]\w*)\s*:/g)].map((m) => m[1]);
      if (fields.length) portalSends.set(current, new Set([...(portalSends.get(current) || []), ...fields]));
    }
    /* `status()` builds its body in a ternary a line or two above the fetch. */
    const t = line.match(/^\s*\?\s*\{(.*)\}$|^\s*:\s*\{(.*)\}$/);
    if (t && current) {
      const fields = [...(t[1] || t[2]).matchAll(/([A-Za-z_]\w*)\s*:/g)].map((m) => m[1]);
      if (fields.length) portalSends.set(current, new Set([...(portalSends.get(current) || []), ...fields]));
    }
  }
}

let failures = 0;
const fail = (f, msg) => { failures++; console.log(`  ✗ ${f}: ${msg}`); };

/** Walk every action object, yielding [name, action, siblingsMap]. */
function walkActions(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.actions && typeof node.actions === 'object') {
    for (const [name, act] of Object.entries(node.actions)) {
      visit(name, act, node.actions);
      walkActions(act, visit);
    }
  }
  if (node.else) walkActions(node.else, visit);
  if (node.cases) for (const c of Object.values(node.cases)) walkActions(c, visit);
  if (node.default) walkActions(node.default, visit);
}

/* THE SAME WALK, BUT KEEPING TRACK OF WHO CONTAINS WHAT.
   walkActions() flattens, which is all checks 2-5 need. Check 5b needs the tree: whether one
   action is guaranteed to have run before another depends on the runAfter chain WITHIN a
   container and on the chain of the action that owns that container. */
function containerModel(pkg) {
  const acts = new Map();       // action name -> { act, container }
  const containers = new Map(); // id -> { ownerName, parent, siblings }
  let n = 0;
  const add = (node, ownerName, parent) => {
    if (!node?.actions || typeof node.actions !== 'object') return;
    const id = `c${n++}`;
    containers.set(id, { ownerName, parent, siblings: node.actions });
    for (const [name, act] of Object.entries(node.actions)) {
      acts.set(name, { act, container: id });
      add(act, name, id);
      if (act.else) add(act.else, name, id);
      if (act.cases) for (const c of Object.values(act.cases)) add(c, name, id);
      if (act.default) add(act.default, name, id);
    }
  };
  add(pkg.serializedValue, pkg.nodeId, null);
  return { acts, containers };
}

/** Everything nested anywhere inside `name`. */
function nestedUnder(name, m) {
  const out = new Set();
  for (const [, c] of m.containers) {
    let cur = c;
    while (cur) {
      if (cur.ownerName === name) { for (const k of Object.keys(c.siblings)) out.add(k); break; }
      cur = cur.parent == null ? null : m.containers.get(cur.parent);
    }
  }
  return out;
}

/** Every action the runtime has finished running by the time `name` starts. */
function completedBefore(name, m) {
  const done = new Set();
  const walked = new Set();
  const visit = (n) => {
    if (walked.has(n)) return;
    walked.add(n);
    const info = m.acts.get(n);
    if (!info) return;
    const c = m.containers.get(info.container);
    /* Siblings this action waits on — and everything nested inside them, which finished too. */
    for (const dep of Object.keys(info.act.runAfter || {})) {
      if (!(dep in c.siblings)) continue;
      done.add(dep);
      for (const d of nestedUnder(dep, m)) done.add(d);
      visit(dep);
    }
    /* Climb out: whatever the enclosing action waited on has finished for us too. The enclosing
       action itself has NOT — we are running inside it. */
    if (c.ownerName && m.acts.has(c.ownerName)) visit(c.ownerName);
  };
  visit(name);
  return done;
}

const ACTION_REF = /\b(?:outputs|body|actions|result)\('([^']+)'\)/g;

/* The action types that write a variable through `inputs.value`. InitializeVariable is not one
   of them — it carries its value inside `inputs.variables[0]`, and the variables packages are
   held to that shape by `vars.everyDeclarationWellFormed` below. */
const WRITES_VARIABLE = new Set(['SetVariable', 'AppendToArrayVariable', 'AppendToStringVariable', 'IncrementVariable', 'DecrementVariable']);

const files = DIRS.flatMap((d) => (existsSync(join(ROOT, d))
  ? readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.json')).sort().map((f) => d + f) : []));

console.log('\nDesigner-paste flow packages\n');

for (const path of files) {
  const file = path.split('/').pop();
  const before = failures;
  let pkg;
  try { pkg = read(path); } catch (e) { fail(file, `not valid JSON — ${e.message}`); continue; }

  // 1. clipboard envelope
  for (const k of ['nodeId', 'serializedValue', 'allConnectionData', 'staticResults', 'isScopeNode', 'mslaNode']) {
    if (!(k in pkg)) fail(file, `envelope is missing '${k}'`);
  }
  if (pkg.isScopeNode !== true || pkg.mslaNode !== true) fail(file, 'isScopeNode and mslaNode must both be true');
  if (pkg.serializedValue?.type !== 'Scope') fail(file, 'serializedValue.type must be Scope');

  /* 1b. A PACKAGE IS A ROOT. THE DESIGNER'S COPY OF ONE IS NOT.
     Everything here is built with `runAfter: {}` at the top, because the scope is dropped into
     an empty flow and has nothing to wait for. Copy that same scope back out of the designer
     after pasting it and the anchor is filled in with whatever action it landed under — which
     is how a definition carrying `"runAfter":{"Initialize_variable_varBulkResults":...}` came
     back for review: FetchAll's scope had been pasted into the bulk-assignment flow. An anchor
     in a file under this directory means a designer copy was committed over the package, and
     with it whatever else that round trip rewrote. */
  const anchors = Object.keys(pkg.serializedValue?.runAfter || {});
  if (anchors.length) fail(file, `the scope is anchored to ${anchors.join(', ')} — a package is a root and ships runAfter: {}`);

  const names = new Set();
  const actions = [];
  walkActions(pkg.serializedValue, (name, act, siblings) => {
    names.add(name);
    actions.push({ name, act, siblings });
  });

  for (const { name, act, siblings } of actions) {
    const p = act?.inputs?.parameters;

    // 2/3/4. list targeting and columns
    if (p?.table) {
      const guid = String(p.table).toLowerCase();
      const portal = byGuid.get(guid);
      const tnt = tenantByGuid.get(guid);
      const ev = evidenceByGuid.get(guid);
      if (!portal && !tnt) { fail(file, `${name} targets ${p.table}, which is in neither the field spec nor the tenant capture`); continue; }

      const title = portal ? portal.listTitle : tnt.title;
      const siteUrl = portal ? portal.siteUrl : tnt.siteUrl;
      if (p.dataset !== siteUrl) fail(file, `${name} is on ${p.dataset} but ${title} lives on ${siteUrl}`);
      /* A duplicate list title on another site is the trap here: the tenant carries three
         DGO_UserDirectory lists and only one is live. */
      if (!portal && tnt && tnt.adopted !== true) fail(file, `${name} targets ${title} on ${tnt.site}, which is NOT the adopted copy`);

      const known = portal ? portal.fields.map((f) => f.internalName) : (ev ? Object.keys(ev.columns || {}) : null);
      const colOk = (col) => known === null || known.includes(col);
      for (const k of Object.keys(p)) {
        if (!k.startsWith('item/')) continue;
        const col = k.slice(5).split('/')[0];
        if (col === 'Title' || col === 'ID') continue;
        if (!colOk(col)) fail(file, `${name} writes ${title}.${col}, which is not in ${portal ? 'the field spec' : 'the evidence file'}`);
      }
      if (p.$filter) {
        for (const m of String(p.$filter).matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s+eq\s/g)) {
          const col = m[1];
          if (['Title', 'ID', 'Consumed', 'Redeemed', 'Active', 'Is_Verified'].includes(col)) continue;
          if (!colOk(col)) fail(file, `${name} filters ${title}.${col}, which is not in ${portal ? 'the field spec' : 'the evidence file'}`);
        }
      }
    }

    // 5. runAfter resolves to a sibling
    for (const dep of Object.keys(act?.runAfter || {})) {
      if (!(dep in siblings)) fail(file, `${name} runAfter names '${dep}', which is not a sibling`);
    }

    /* 5c. A VARIABLE WRITE WITH NO VALUE.
       `value` is not optional on any of these — Logic Apps refuses the definition at save time.
       It goes missing for one reason: the modern designer types a Set variable's Value field
       from the declared type of the variable named in it, so pasting a scope into a flow with
       no matching top-level `Initialize variable` leaves the value with no type to be edited as
       and the designer silently drops it, keeping `name` alone. The action then renders with an
       empty Value box, and a run that reaches it leaves the variable at its initial value —
       varStatusCode stays 500, varData stays {} — with nothing in the run history to say why.
       `Append to array variable` is untyped and survives, which is what makes the damage look
       partial. Committing such a definition here would ship it. */
    if (WRITES_VARIABLE.has(act?.type) && act?.inputs?.value === undefined) {
      fail(file, `${name} writes ${act?.inputs?.name ?? 'a variable'} with no value — the designer strips it when the variable is not declared at the flow's top level`);
    }
  }

  /* 5b. AN ACTION WITH NO `runAfter` IS A ROOT OF ITS SCOPE, NOT THE NEXT STEP IN IT.
     JSON object order is not execution order. Two actions in one scope that each omit `runAfter`
     are two branches that START TOGETHER, and Logic Apps refuses a definition in which one of
     them reads an action from the other:

       InvalidTemplate. The template action 'Compose_Bucket_Submission' at line '1' and column
       '1' references action 'Compose_Submission_SourceIp' which is not defined in the template
       or is defined after it.

     That is a SAVE-time refusal in the designer, which is why the operator meets it and no
     earlier check did: every name resolved, every runAfter named a real sibling, and the package
     still could not be saved. The seven portal packages and DGO_DYNAMIC_GLOBAL_ACTIONS each
     carried a second root — the rate-limit bucket, the identity gate — spread in after the chain
     of Composes it reads from, so the gate and everything it wrapped hung off the wrong branch.

     This resolves every `outputs()` / `body()` / `actions()` / `result()` reference against the
     set of actions the runtime has actually finished by then: the transitive runAfter chain
     inside the container, plus whatever the enclosing action waited on, plus everything nested
     inside those. A reference outside that set is unreachable, whatever the file's key order. */
  const cm = containerModel(pkg);
  for (const [name, info] of cm.acts) {
    const expr = JSON.stringify({ i: info.act.inputs, e: info.act.expression, f: info.act.foreach });
    const refs = new Set([...expr.matchAll(ACTION_REF)].map((m) => m[1]));
    if (!refs.size) continue;
    let done = null;
    for (const ref of refs) {
      if (ref === name) continue;
      if (!cm.acts.has(ref)) { fail(file, `${name} reads outputs of '${ref}', which is not an action in the package`); continue; }
      done ??= completedBefore(name, cm);
      if (!done.has(ref)) fail(file, `${name} reads '${ref}', which is not guaranteed to have run before it — no runAfter chain reaches it`);
    }
  }

  /* 6. connector bindings. An OpenApiConnection action with no allConnectionData entry pastes in
     unbound: the designer shows it with a broken-connection badge and the flow cannot be saved
     until someone notices. An entry whose referenceKey does not match the action's
     inputs.host.connection binds the action to the wrong connector. Both are silent in the JSON
     and loud in the designer, which is the wrong place to find them. */
  const conn = actions.filter(({ act }) => act?.type === 'OpenApiConnection');
  const acd = pkg.allConnectionData || {};
  for (const { name, act } of conn) {
    const entry = acd[name];
    if (!entry) { fail(file, `${name} is a connector action with no allConnectionData entry`); continue; }
    const api = act.inputs?.host?.connection;
    if (entry.referenceKey !== api) fail(file, `${name} runs on ${api} but its connection entry says ${entry.referenceKey}`);
    if (entry.connectionReference?.api?.id !== `/providers/Microsoft.PowerApps/apis/${api}`) {
      fail(file, `${name} connection entry names the wrong api id`);
    }
    const cn = entry.connectionReference?.connectionName;
    if (!cn) fail(file, `${name} connection entry has no connectionName`);
    else if (entry.connectionReference?.connection?.id !== `/providers/Microsoft.PowerApps/apis/${api}/connections/${cn}`) {
      fail(file, `${name} connection id and connectionName disagree`);
    }
  }
  for (const name of Object.keys(acd)) {
    if (!conn.some((c) => c.name === name)) fail(file, `allConnectionData names '${name}', which is not a connector action`);
  }

  /* 7. how caller fields are read. core/data-client.js nests the caller's payload:
       { action, payload: {...}, userEmail, requestId, timestamp }
     Only those four are top-level; the flat form (modules/single-assignment.js, flatPayload:true)
     adds the caller's fields alongside them. So a field read ONLY as triggerBody()?['x'] returns
     nothing on every endpoint but that one — and the flow answers as if the caller sent nothing.
     Silent, and indistinguishable from a caller who really did omit it. */
  const ENVELOPE = new Set(['action', 'userEmail', 'requestId', 'request_id', 'correlationId', 'timestamp', 'payload']);
  /* Only the internal set. document-portal/js/core.js posts a flat body — `{ email, code }`,
     `{ referenceId, verification, action, body }` — so a top-level read is correct there and a
     payload-first one would be noise. The internal platform reaches its flows through
     core/data-client.js, which nests. Two clients, two shapes, one check that knows which. */
  const nestsPayload = path.includes('/internal/');
  for (const { name, act } of (nestsPayload ? actions : [])) {
    const expr = JSON.stringify(act?.inputs ?? {});
    const nested = new Set([...expr.matchAll(/triggerBody\(\)\?\['payload'\]\?\['([A-Za-z_]\w*)'\]/g)].map((m) => m[1]));
    for (const m of expr.matchAll(/triggerBody\(\)\?\['([A-Za-z_]\w*)'\]/g)) {
      const key = m[1];
      if (ENVELOPE.has(key) || nested.has(key)) continue;
      fail(file, `${name} reads '${key}' only from the top level — the client nests it under 'payload'`);
    }
  }

  /* 7b. Portal routing. A package whose Switch decides behaviour from a body key the portal
     never sends takes the same branch on every call — and the fallback makes it look deliberate.
     That is exactly how VERIFY_CONFIRM came to route to 'generate': the package switched on
     `action`, document-portal/js/core.js sends none, and the default was 'generate', so entering
     a code mailed a fresh one and no proof was ever minted. Read the literal request bodies out
     of the portal client and require the switch expression to depend on at least one of them. */
  if (!nestsPayload) {
    const keys = PORTAL_ENDPOINT[file];
    const key = keys && keys.join(' / ');
    const sent = keys && new Set(keys.flatMap((k) => [...(portalSends.get(k) || [])]));
    if (sent && sent.size) {
      for (const { name, act, siblings } of actions) {
        if (act?.type !== 'Switch') continue;
        const reads = new Set();
        const seen = new Set();
        /* Follow outputs('X') back through the Compose chain to the body keys it rests on. */
        (function expand(expr) {
          if (!expr || seen.has(expr)) return;
          seen.add(expr);
          for (const m of String(expr).matchAll(/triggerBody\(\)\?\['([A-Za-z_]\w*)'\]/g)) reads.add(m[1]);
          for (const m of String(expr).matchAll(/outputs\('([^']+)'\)/g)) {
            const up = siblings[m[1]];
            if (up) expand(JSON.stringify(up.inputs ?? ''));
          }
        })(act.expression);
        if (reads.size && ![...reads].some((r) => sent.has(r))) {
          fail(file, `${name} routes on ${[...reads].sort().join(', ')} — the portal sends none of those to ${key} (it sends ${[...sent].sort().join(', ')})`);
        }
      }
    }
  }

  // 8. build standard
  const raw = JSON.stringify(pkg);
  /* Every standard variable the package touches, whether it writes one (a "name" field on a
     Set/Append/Initialize action) or merely reads one. Reads matter as much as writes here:
     since the declarations moved out of the package, a read-only variable such as
     varReceivedAtUtc appears nowhere else. */
  const vars = [
    ...[...raw.matchAll(/"name":"(var[A-Za-z]+)"/g)].map((m) => m[1]),
    ...[...raw.matchAll(/variables\('(var[A-Za-z]+)'\)/g)].map((m) => m[1]),
  ];
  const varSet = new Set(vars);
  const checks = {
    /* The package must READ the standard variables and must not DECLARE them. Logic Apps
       accepts InitializeVariable only at a workflow's top level — all 504 in the 58 tenant
       exports sit there and none is nested — and a clipboard package is a scope, so anything
       it declares lands nested and the definition will not save. The declarations travel
       beside the package in <flow>.variables.md instead. */
    'vars.core': ['varStatusCode', 'varData', 'varErrors'].every((v) => varSet.has(v)),
    'vars.timing': ['varReceivedAtUtc', 'varCompletedAtUtc', 'varDurationMs'].every((v) => varSet.has(v)),
    'vars.notDeclaredInScope': !actions.some(({ act }) => act?.type === 'InitializeVariable'),
    /* Only the internal set ships its declarations as a companion file. The gateway packages
       paste into flows whose variables are already provisioned, and their prerequisites are
       recorded with those flows rather than beside the package. */
    /* `file` is a basename — testing it for '/internal/' was always false, so this check passed
       vacuously for every package and never once confirmed a prerequisite file exists. It reads
       the full path now, which is the only value that carries the directory. */
    'vars.prerequisiteFileExists': !path.includes('/internal/')
      || existsSync(join(ROOT, path.replace('.designer-paste.json', '.variables.md'))),
    'names.unique': (() => {
      const seen = new Set(); let dup = false;
      for (const { name } of actions) { if (seen.has(name)) dup = true; seen.add(name); }
      return !dup;
    })(),
    'scope.global': [...names].some((n) => /^Scope_Global_/.test(n)),
    'scope.catch': actions.some(({ act }) => act?.type === 'Scope'
      && Object.values(act.runAfter || {}).some((s) => Array.isArray(s) && s.includes('Failed'))),
    'response.envelope': names.has('Compose__Standard_Response_Revised'),
    'response.action': actions.some(({ act }) => act?.type === 'Response'),
    'telemetry.capture': names.has('Scope_Flow_Data_Capture'),
    'telemetry.record': names.has('Compose_Flow_Run_Record'),
    'redaction.headers': std.redaction.headers.every((h) => raw.includes(h)),
    'redaction.queries': std.redaction.queries.every((q) => raw.includes(`'${q}','***REDACTED***'`)),
  };
  /* A variables package is declarations and nothing else — no global scope, no catch, no
     response, no telemetry — so measuring it against the endpoint skeleton would report 40% for a
     file that is exactly what it should be. It is held to what does apply: unique names, every
     declaration well formed, no connection, and — the point of moving from one shared carrier to
     one file per flow — that it declares precisely what its own flow uses. Neither more nor less
     is now checkable, where against a union only "the union is present" ever was. */
  const isVariablesPackage = (f) => f.endsWith('.variables.designer-paste.json');
  if (isVariablesPackage(file)) {
    const declared = new Set(actions
      .filter(({ act }) => act?.type === 'InitializeVariable')
      .map(({ act }) => act.inputs?.variables?.[0]?.name));
    const flow = file.split('/').pop().replace('.variables.designer-paste.json', '');
    const ownPackage = files.find((f) => f.endsWith(`/${flow}.designer-paste.json`));
    const used = new Set();
    if (ownPackage) {
      const ownRaw = readFileSync(join(ROOT, ownPackage), 'utf8');
      for (const m of ownRaw.matchAll(/variables\('(var[A-Za-z]+)'\)/g)) used.add(m[1]);
      for (const m of ownRaw.matchAll(/"name":\s*"(var[A-Za-z]+)"/g)) used.add(m[1]);
    }
    const wellFormed = actions.every(({ act }) => {
      const v = act?.inputs?.variables?.[0];
      return v && v.name && v.type && v.value !== undefined;
    });
    const varChecks = {
      'names.unique': checks['names.unique'],
      'vars.onlyDeclarations': actions.every(({ act }) => act?.type === 'InitializeVariable'),
      'vars.everyDeclarationWellFormed': wellFormed,
      'vars.noConnections': Object.keys(pkg.allConnectionData || {}).length === 0,
      'vars.ownFlowPackageExists': Boolean(ownPackage),
      'vars.declaresEverythingItsFlowUses': [...used].every((v) => declared.has(v)),
      'vars.declaresNothingItsFlowDoesNotUse': [...declared].every((v) => used.has(v)),
    };
    const gaps = Object.entries(varChecks).filter(([, v]) => !v).map(([k]) => k);
    if (gaps.length) fail(file, `variables package incomplete: ${gaps.join(', ')}`);
    for (const v of used) if (!declared.has(v)) fail(file, `does not declare ${v}, which ${flow} uses`);
    console.log(`  ${failures > before ? '\u2717' : '\u2705'} ${file.padEnd(46)} ${String(actions.length).padStart(3)} declarations \u00b7 exactly what ${flow} uses`);
    continue;
  }

  /* THE BUILD STANDARD IS A STANDARD FOR REQUEST-RESPONSE FLOWS.
     Every rule in flow-standard.json was read out of the deployed estate, and every flow in that
     estate answers an HTTP request: the response envelope, the request-scoped variable block and
     the two redaction rules all exist because there is a caller and an inbound URL to protect.
     A scheduled flow has neither. It is woken by a clock, answers nobody, and has no inbound URL
     whose token could leak — so `response.*` and `redaction.*` are not requirements it fails,
     they are requirements that do not apply to it.
     The alternative — bolting an unreachable Response onto a Recurrence flow to satisfy a
     checker — would put a lie in the artifact to make a number go green. The category is
     declared here by name rather than inferred from the absence of a Response, because an HTTP
     package that lost its Response is broken and must still fail. */
  const SCHEDULED = new Set(['DGO_SCHEDULED_SWEEP.designer-paste.json']);
  const REQUEST_ONLY = ['vars.core', 'vars.timing', 'scope.global', 'response.envelope',
    'response.action', 'redaction.headers', 'redaction.queries'];
  const applicable = SCHEDULED.has(file)
    ? Object.fromEntries(Object.entries(checks).filter(([k]) => !REQUEST_ONLY.includes(k)))
    : checks;
  const missing = Object.entries(applicable).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) fail(file, `build standard missing: ${missing.join(', ')}`);
  if (SCHEDULED.has(file)) {
    /* What a scheduled package must still do: record its run. The telemetry sink is the only
       part of the standard that survives the category change, and it is asserted, not skipped. */
    if (!raw.includes('Create_Sweep_Telemetry') && !checks['telemetry.record']) {
      fail(file, 'a scheduled package must still write a run record to Portal Flow Telemetry');
    }
  }

  /* 9b. THE TWO HEADERS THAT CARRY THE WHOLE INBOUND URL, TOKEN INCLUDED.
     `x-ms-igw-external-uri` and `x-ms-igw-raw-target` are set by the Power Automate gateway and
     hold the request URL as received — which for these flows means the trigger URL and its
     `sig=` token. The run record composes the headers and is emailed as an attachment on every
     run, so a flow that captures them mails out a live credential each time it is called. Four
     deployed flows do exactly that today; item 22 in OPEN_ITEMS is the rotation that follows.

     This is NOT in flow-standard.json's redaction list and must not be added there. That file
     records what the deployed estate already does, derived from the 57 exported definitions —
     and not redacting these is precisely the finding. Putting the rule there would make the
     standard describe an estate that does not exist. It is a build requirement on the packages
     generated here, so it is checked here, against the packages, on its own. */
  const IGW = ['x-ms-igw-external-uri', 'x-ms-igw-raw-target'];
  const redactor = actions.find(({ name }) => name === 'Compose_Redacted_Headers');
  if (redactor) {
    const expr = String(redactor.act.inputs ?? '');
    for (const h of IGW) {
      if (!expr.includes(`'${h}','***REDACTED***'`)) {
        fail(file, `Compose_Redacted_Headers does not blank ${h} — the run record would carry the trigger URL and its token`);
      }
    }
  }

  // 9. no credentials, no prose
  if (/sig=(?!REDACTED)[A-Za-z0-9_%-]{8,}/.test(raw)) fail(file, 'carries a signature');
  for (const { name, act } of actions) {
    for (const k of Object.keys(act || {})) {
      if (['why', 'note', 'comment', 'description', 'concurrency'].includes(k)) fail(file, `${name} carries a '${k}' key — the package must be paste-clean`);
    }
  }

  const conformance = Math.round((Object.values(checks).filter(Boolean).length / 10) * 100);
  const unbound = new Set(conn.filter(({ name }) => String(acd[name]?.connectionReference?.connectionName || '').startsWith('REPLACE_WITH_')).map(({ act }) => act.inputs.host.connection));
  const bind = `${conn.length} bound${unbound.size ? ` (${[...unbound].sort().join(', ')} to pick)` : ''}`;
  console.log(`  ${failures > before ? '✗' : '✅'} ${file.padEnd(46)} ${String(actions.length).padStart(3)} actions · standard ${conformance}% · ${bind}`);
}

console.log(`\n  ${files.length} package(s), ${failures} failure(s).\n`);
process.exit(strict && failures ? 1 : 0);
