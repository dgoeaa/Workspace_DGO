/**
 * Install a designer-paste package into a flow definition — the one implementation.
 *
 * Two callers use this and must not drift apart:
 *   · scripts/patch-flow-package.mjs --install   (an exported zip, imported with Update)
 *   · docs/folio-Master-Flows-and-Endpoints/deployment/ESTATE_APPLY.console.js     (the Flow API, from the maker portal)
 * The second embeds these functions by their source text, so they must stay self-contained:
 * no imports, no reference to anything outside their own bodies except each other.
 *
 * TWO MODES
 *   body   everything below the trigger is replaced: the package's Initialize variable actions
 *          at the top level (Logic Apps accepts them nowhere else), then the package's scope
 *          after the last of them. The trigger keeps its identity, so its URL does not move.
 *   scope  one top-level action whose name is the package's nodeId is replaced in place, keeping
 *          its runAfter. For a package that is a part of a host flow rather than the whole of one.
 *          If the host has no such action, nothing is installed: placement is never guessed.
 */

/**
 * Every runAfter names a sibling, every container can start, and no action reads the output of
 * an action that is not certain to have finished.
 *
 * Parallel branches are legal and deliberate (two independent reads side by side). What is a
 * defect is a branch that READS another branch — the gate that once started beside the Compose
 * it read, and ran on outputs the runtime had not promised. So the rule is the data dependency
 * itself: a reference to outputs/body/actions/result/items/iterationIndexes('X') is sound only
 * when X is an enclosing action, or is in the runAfter closure of the referring action (or of an
 * enclosing one), or sits inside such a predecessor.
 */
export function validateWiring(definition) {
  const problems = [];
  const REF = /\b(?:outputs|body|actions|result|items|iterationIndexes)\('([^']+)'\)/g;
  const childContainers = (a) => {
    const out = [];
    if (a?.actions) out.push(['', a.actions]);
    if (a?.else?.actions) out.push(['else', a.else.actions]);
    if (a?.default?.actions) out.push(['default', a.default.actions]);
    for (const [cn, b] of Object.entries(a?.cases || {})) if (b?.actions) out.push([`case:${cn}`, b.actions]);
    return out;
  };
  const descendants = (a, into = new Set()) => {
    for (const [, c] of childContainers(a)) for (const [n, x] of Object.entries(c)) { into.add(n); descendants(x, into); }
    return into;
  };
  const known = new Set();
  const index = (c) => { for (const [n, a] of Object.entries(c || {})) { known.add(n); for (const [, cc] of childContainers(a)) index(cc); } };
  index(definition.actions);
  const ownText = (a) => {
    const { actions, else: e, cases, default: d, runAfter, ...rest } = a || {};
    return JSON.stringify(rest);
  };
  const check = (container, path, allowedOuter) => {
    const names = new Set(Object.keys(container));
    let firsts = 0;
    const closure = new Map();
    const visiting = new Set();
    const preds = (name) => {
      if (closure.has(name)) return closure.get(name);
      const set = new Set();
      if (visiting.has(name)) return set;
      visiting.add(name);
      for (const dep of Object.keys(container[name]?.runAfter || {})) {
        if (!names.has(dep)) continue;
        set.add(dep);
        for (const x of preds(dep)) set.add(x);
      }
      visiting.delete(name);
      closure.set(name, set);
      return set;
    };
    for (const [name, action] of Object.entries(container)) {
      const deps = Object.keys(action.runAfter || {});
      if (!deps.length) firsts += 1;
      for (const dep of deps) {
        if (!names.has(dep)) problems.push(`${path || '(root)'}: ${name} runs after ${dep}, which is not a sibling`);
      }
    }
    if (Object.keys(container).length && firsts === 0) {
      problems.push(`${path || '(root)'}: every action depends on another - the container cannot start`);
    }
    for (const [name, action] of Object.entries(container)) {
      const allowed = new Set(allowedOuter);
      allowed.add(name);
      for (const p of preds(name)) { allowed.add(p); descendants(container[p], allowed); }
      const here = path ? `${path}/${name}` : name;
      for (const m of ownText(action).matchAll(REF)) {
        const x = m[1];
        if (known.has(x) && !allowed.has(x)) problems.push(`${here} reads ${x}, which is not certain to have finished (add it to runAfter)`);
      }
      for (const [label, c] of childContainers(action)) check(c, label ? `${here}/${label}` : here, allowed);
    }
  };
  check(definition.actions || {}, '', new Set());
  return [...new Set(problems)];
}

/**
 * @param {object} o
 * @param {object} o.definition            the flow's definition (not mutated)
 * @param {object} o.connectionReferences  the flow's connection references (not mutated)
 * @param {object} o.pkg                   { nodeId, serializedValue, allConnectionData }
 * @param {object|null} o.declarations     Initialize variable actions, in order (body mode)
 * @param {'body'|'scope'} [o.mode]
 * @param {string|null} [o.method]         HTTP verb for a Request trigger; null leaves it
 * @param {object|null} [o.triggers]       replaces definition.triggers when given
 * @param {string[]} [o.hostActions]       scope mode: top-level actions the host must hold
 * @returns {{ definition, connectionReferences, problems: string[], stats }}
 */
export function installPackage({ definition, connectionReferences, pkg, declarations = null, mode = 'body', method = null, triggers = null, hostActions = [] }) {
  const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
  const def = clone(definition) || {};
  const refs = clone(connectionReferences) || {};
  const problems = [];
  const stats = { declarations: 0, writes: 0, connectorActions: 0, referencesAdded: [], triggerChanged: false };
  const scope = clone(pkg?.serializedValue);
  if (!pkg?.nodeId || !scope) return { definition: def, connectionReferences: refs, problems: ['not a scope package'], stats };

  if (mode === 'body') {
    const declared = declarations || {};
    const names = Object.keys(declared);
    if (!names.length) problems.push(`${pkg.nodeId} has no variable declarations to install beside it`);
    if (!names.every((n) => declared[n]?.type === 'InitializeVariable')) problems.push('a declaration is not an Initialize variable action');
    const last = names[names.length - 1];
    def.actions = { ...clone(declared), [pkg.nodeId]: { ...scope, runAfter: last ? { [last]: ['Succeeded'] } : {} } };
    stats.declarations = names.length;
  } else {
    const actions = def.actions || {};
    if (!Object.prototype.hasOwnProperty.call(actions, pkg.nodeId)) {
      problems.push(`the flow has no top-level action named ${pkg.nodeId}; placement is not guessed`);
    } else {
      for (const h of hostActions) if (!(h in actions)) problems.push(`the host flow has no top-level action ${h}, which the scope reads`);
      actions[pkg.nodeId] = { ...scope, runAfter: actions[pkg.nodeId].runAfter || {} };
      def.actions = actions;
    }
  }

  /* Clipboard spells a connector's host `connection`; a definition spells it `connectionName`.
     The service rejects the clipboard spelling outside the designer. */
  const walk = (actions, fn, path = '') => {
    for (const [n, a] of Object.entries(actions || {})) {
      fn(n, a, path);
      walk(a?.actions, fn, `${path}${n}/`); if (a?.else) walk(a.else.actions, fn, `${path}${n}/else/`);
      for (const c of Object.values(a?.cases || {})) walk(c?.actions, fn, `${path}${n}/`);
      walk(a?.default?.actions, fn, `${path}${n}/`);
    }
  };
  walk(def.actions, (n, a) => {
    const h = a?.inputs?.host;
    if (a?.type === 'OpenApiConnection' && h && h.connection && !h.connectionName) {
      h.connectionName = h.connection;
      delete h.connection;
    }
  });

  if (triggers) { def.triggers = clone(triggers); stats.triggerChanged = true; }
  if (method) {
    for (const t of Object.values(def.triggers || {})) {
      if (t?.type === 'Request' && t.inputs?.method !== method) {
        t.inputs = { ...(t.inputs || {}), method };
        stats.triggerChanged = true;
      }
    }
  }

  /* A connector the package binds must be referenced by the flow. Existing references are kept
     exactly: they name connections this tenant already authorised. */
  for (const conn of Object.values(pkg.allConnectionData || {})) {
    const key = conn?.referenceKey;
    if (!key || refs[key]) continue;
    refs[key] = {
      connectionName: conn.connectionReference?.connectionName,
      source: 'Embedded',
      id: conn.connectionReference?.api?.id,
      tier: 'NotSpecified',
      apiName: key.replace(/^shared_/, ''),
      isProcessSimpleApiReferenceConversionAlreadyDone: false,
    };
    stats.referencesAdded.push(key);
  }

  problems.push(...validateWiring(def));

  const WRITES = new Set(['SetVariable', 'AppendToArrayVariable', 'AppendToStringVariable', 'IncrementVariable', 'DecrementVariable']);
  walk(def.actions, (n, a, path) => {
    if (a?.type === 'OpenApiConnection') {
      stats.connectorActions++;
      const h = a.inputs?.host || {};
      const missing = ['apiId', 'connectionName', 'operationId'].filter((k) => !h[k]);
      if (missing.length || h.connection) problems.push(`${path}${n}: host is not the definition shape${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
      else if (!refs[h.connectionName]) problems.push(`${path}${n}: connection reference ${h.connectionName} is not held by the flow`);
    }
    if (WRITES.has(a?.type)) {
      stats.writes++;
      if (a.inputs?.value === undefined) problems.push(`${path}${n}: variable write with no value`);
    }
  });

  return { definition: def, connectionReferences: refs, problems, stats };
}
