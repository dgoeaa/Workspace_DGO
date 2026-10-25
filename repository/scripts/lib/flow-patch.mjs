/**
 * Structural edits to a Power Automate definition, done safely.
 *
 * WHY THIS EXISTS
 * The remediation is 123 edits across 11 flows. Typed into the designer that is roughly twenty
 * hours, and the designer saves a flow whose action names do not resolve, so mistakes surface
 * one export later. Applied to the definition instead, the same edits are a diff that can be
 * verified before the tenant is touched.
 *
 * THE ONE THING THAT MAKES THIS SAFE
 * Logic Apps orders actions by `runAfter`, not by position. Adding an action without repairing
 * the chain leaves the flow valid and silently wrong: the new action runs in parallel with the
 * one it was meant to follow, and whatever used to follow that action still does. So insertion
 * here always SPLICES - it takes over the successor's dependency - and the tests assert the
 * chain is unbroken afterwards.
 */

/** Walk a path like `Scope_Global/Switch/case:Case_Verify/Condition/else` to its actions map. */
export function resolveContainer(definition, path) {
  if (!path) return definition.actions;
  let node = { actions: definition.actions };
  const segments = path.split('/');
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg === 'else') {
      if (!node.else) throw new Error(`no else branch at ${segments.slice(0, i).join('/')}`);
      node = node.else;
    } else if (seg === 'default') {
      if (!node.default) throw new Error(`no default branch at ${segments.slice(0, i).join('/')}`);
      node = node.default;
    } else if (seg.startsWith('case:')) {
      const name = seg.slice(5);
      if (!node.cases?.[name]) throw new Error(`no case ${name} at ${segments.slice(0, i).join('/')}`);
      node = node.cases[name];
    } else {
      const next = node.actions?.[seg];
      if (!next) throw new Error(`no action ${seg} at ${segments.slice(0, i).join('/') || '(root)'}`);
      node = next;
    }
  }
  if (!node.actions) node.actions = {};
  return node.actions;
}

/** The action a container starts with: the one nothing else in the container depends on. */
export function firstOf(container) {
  return Object.keys(container).find((k) => !Object.keys(container[k].runAfter || {}).length) || null;
}

const OK = ['Succeeded'];

/**
 * Insert `action` so it runs after `afterName`, and hand it everything that used to follow
 * `afterName`. Without the second half the insert is a fork, not a step in the sequence.
 */
export function insertAfter(container, name, action, afterName, states = OK) {
  if (container[name]) throw new Error(`${name} already exists here`);
  if (!container[afterName]) throw new Error(`cannot insert after ${afterName}: not in this container`);
  for (const [k, v] of Object.entries(container)) {
    if (v.runAfter && Object.prototype.hasOwnProperty.call(v.runAfter, afterName)) {
      v.runAfter[name] = v.runAfter[afterName];
      delete v.runAfter[afterName];
    }
  }
  container[name] = { ...action, runAfter: { [afterName]: states } };
  return container[name];
}

/** Insert as the container's first action; whatever was first now runs after it. */
export function insertFirst(container, name, action) {
  if (container[name]) throw new Error(`${name} already exists here`);
  const was = firstOf(container);
  container[name] = { ...action, runAfter: {} };
  if (was) container[was].runAfter = { [name]: OK };
  return container[name];
}

/** Replace an existing action's connector parameters, leaving its wiring untouched. */
export function replaceParameters(definition, path, parameters) {
  const segments = path.split('/');
  const name = segments.pop();
  const container = resolveContainer(definition, segments.join('/'));
  const action = container[name];
  if (!action) throw new Error(`no action at ${path}`);
  if (!action.inputs) throw new Error(`${path} has no inputs to replace`);
  action.inputs.parameters = { ...parameters };
  return action;
}

/** Point a Switch at a different expression. */
export function repointSwitch(definition, path, expression) {
  const segments = path.split('/');
  const name = segments.pop();
  const container = resolveContainer(definition, segments.join('/'));
  const sw = container[name];
  if (!sw || sw.type !== 'Switch') throw new Error(`${path} is not a Switch`);
  sw.expression = expression;
  return sw;
}

/** Add a case to an existing Switch. */
export function addCase(definition, path, caseName, caseValue, actions) {
  const segments = path.split('/');
  const name = segments.pop();
  const container = resolveContainer(definition, segments.join('/'));
  const sw = container[name];
  if (!sw || sw.type !== 'Switch') throw new Error(`${path} is not a Switch`);
  if (!sw.cases) sw.cases = {};
  if (sw.cases[caseName]) throw new Error(`case ${caseName} already exists`);
  sw.cases[caseName] = { case: caseValue, actions };
  return sw.cases[caseName];
}

/** Set one key inside an existing Compose's object inputs. */
export function setComposeKey(definition, path, outerKey, key, value) {
  const segments = path.split('/');
  const name = segments.pop();
  const container = resolveContainer(definition, segments.join('/'));
  const action = container[name];
  if (!action) throw new Error(`no action at ${path}`);
  const target = outerKey ? action.inputs?.[outerKey] : action.inputs;
  if (!target || typeof target !== 'object') throw new Error(`${path} has no object at ${outerKey || 'inputs'}`);
  target[key] = value;
  return action;
}

/** Every action, with the path it sits at. */
export function collect(definition) {
  const out = [];
  const walk = (actions, path) => {
    for (const [name, action] of Object.entries(actions || {})) {
      const here = path ? `${path}/${name}` : name;
      out.push({ name, action, path: here, container: actions });
      walk(action.actions, here);
      walk(action.else?.actions, `${here}/else`);
      walk(action.default?.actions, `${here}/default`);
      for (const [cn, branch] of Object.entries(action.cases || {})) {
        walk(branch?.actions, `${here}/case:${cn}`);
      }
    }
  };
  walk(definition.actions, '');
  return out;
}

/**
 * Every container must have exactly one entry point and every runAfter must name a sibling.
 * A dangling runAfter is the failure mode a hand edit produces and a save does not catch.
 */
export function validate(definition) {
  const problems = [];
  const check = (container, path) => {
    const names = new Set(Object.keys(container));
    let firsts = 0;
    for (const [name, action] of Object.entries(container)) {
      const deps = Object.keys(action.runAfter || {});
      if (!deps.length) firsts += 1;
      for (const dep of deps) {
        if (!names.has(dep)) problems.push(`${path || '(root)'}: ${name} runs after ${dep}, which is not a sibling`);
      }
      const here = path ? `${path}/${name}` : name;
      if (action.actions) check(action.actions, here);
      if (action.else?.actions) check(action.else.actions, `${here}/else`);
      if (action.default?.actions) check(action.default.actions, `${here}/default`);
      for (const [cn, branch] of Object.entries(action.cases || {})) {
        if (branch?.actions) check(branch.actions, `${here}/case:${cn}`);
      }
    }
    if (Object.keys(container).length && firsts === 0) {
      problems.push(`${path || '(root)'}: every action depends on another - the container cannot start`);
    }
    if (firsts > 1) {
      const parallel = Object.entries(container).filter(([, a]) => !Object.keys(a.runAfter || {}).length).map(([n]) => n);
      problems.push(`${path || '(root)'}: ${firsts} actions start in parallel (${parallel.join(', ')})`);
    }
  };
  check(definition.actions, '');
  return problems;
}

/** Merge keys into an existing action's `inputs` — for a SetVariable's value, say. */
export function setActionInputs(definition, path, patch) {
  const segments = path.split('/');
  const name = segments.pop();
  const container = resolveContainer(definition, segments.join('/'));
  const action = container[name];
  if (!action) throw new Error(`no action at ${path}`);
  action.inputs = { ...action.inputs, ...patch };
  return action;
}

/**
 * Lift named actions out of one container and hand them to another, preserving the order they
 * ran in and repairing both chains. Used to move a success path into a condition that did not
 * exist before — the edit that is slow and risky in the designer and is this, here.
 */
export function moveActions(fromContainer, names, toContainer) {
  const ordered = [];
  let cursor = firstOf(fromContainer);
  const seen = new Set();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    if (names.includes(cursor)) ordered.push(cursor);
    cursor = Object.keys(fromContainer).find((k) => Object.keys(fromContainer[k].runAfter || {})[0] === cursor);
  }
  for (const n of names) if (!ordered.includes(n)) ordered.push(n);

  for (const n of ordered) {
    if (!fromContainer[n]) throw new Error(`cannot move ${n}: not in the source container`);
  }
  /* Anything staying behind that depended on a mover inherits what the first mover depended on,
     or becomes the entry point when there is nothing left to depend on. */
  const firstMoverDeps = fromContainer[ordered[0]].runAfter || {};
  for (const [k, v] of Object.entries(fromContainer)) {
    if (ordered.includes(k)) continue;
    const deps = Object.keys(v.runAfter || {});
    if (!deps.some((dep) => ordered.includes(dep))) continue;
    const kept = Object.fromEntries(Object.entries(v.runAfter).filter(([dep]) => !ordered.includes(dep)));
    v.runAfter = { ...kept, ...firstMoverDeps };
  }
  let previous = null;
  for (const n of ordered) {
    const action = fromContainer[n];
    delete fromContainer[n];
    toContainer[n] = action;
    action.runAfter = previous ? { [previous]: ['Succeeded'] } : {};
    previous = n;
  }
  return ordered;
}
