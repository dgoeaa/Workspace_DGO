/**
 * Apply a remediation artifact to a flow definition.
 *
 * The artifact is the specification — which action moves to which list, what the rate-limit gate
 * is, what D9's code comparison looks like. This module is only the hand that carries it out. It
 * decides nothing: every value, every expression and every placement comes out of the artifact,
 * so the worksheet an operator reads and the definition a package carries are generated from one
 * source and cannot disagree.
 *
 * PLACEMENT IS A FIXPOINT, NOT A SEQUENCE
 * Several placements depend on containers that other placements create — Increment_Attempts goes
 * inside the condition D9 adds, and the action that caps attempts goes inside a condition placed
 * after Increment_Attempts. Rather than hard-code an order that would silently rot as artifacts
 * change, every operation is queued and retried until no further progress is possible. Anything
 * still unplaced at that point is reported by name, which is what a genuine specification error
 * looks like from here.
 */

import {
  resolveContainer, insertAfter, insertFirst, replaceParameters,
  repointSwitch, addCase, setActionInputs, moveActions,
} from './flow-patch.mjs';

const connector = (inputs) => ({
  type: 'OpenApiConnection',
  inputs: { host: inputs.host, parameters: inputs.parameters },
});

const ifAction = (expression) => ({
  type: 'If', expression, actions: {}, else: { actions: {} },
});

/** Place one action per its `place`, or throw so the caller can retry it later. */
function place(definition, name, action, spec) {
  const container = resolveContainer(definition, spec.parent);
  if (container[name]) return `${name} — already present, left alone`;
  if (spec.first) { insertFirst(container, name, action); return `${name} — first in ${spec.parent}`; }
  insertAfter(container, name, action, spec.after, spec.states);
  return `${name} — after ${spec.after} in ${spec.parent}`;
}

export function applyArtifact(definition, artifact, flowName) {
  const applied = [];
  const queue = [];

  /* 1. Existing actions: connector parameters replaced, wiring untouched. */
  for (const [key, spec] of Object.entries(artifact.actions || {})) {
    const [flow, actionName] = key.split(' / ');
    if (flow !== flowName) continue;
    queue.push({
      label: `${actionName} — parameters repointed`,
      run: () => replaceParameters(definition, spec.path, spec.replaceParametersWith),
    });
  }

  /* 2. D8's prerequisite: a branch's status code has to survive the finalize scope. */
  const pre = artifact.rateLimitGate?.prerequisite;
  if (pre && (pre.appliesTo || []).includes(flowName)) {
    queue.push({
      label: `${pre.addFirst.name} — captures the branch status`,
      run: () => place(definition, pre.addFirst.name,
        { type: 'Compose', inputs: pre.addFirst.inputs }, pre.addFirst.place),
    });
    queue.push({
      label: 'Set_variable_varStatusCode — an explicit failure code now survives',
      run: () => setActionInputs(definition, pre.path,
        { name: 'varStatusCode', value: pre.replaceValueWith }),
    });
  }

  /* 3. D9: the comparison the flow has never had, with the success path moved inside it. */
  const cc = artifact.codeComparison;
  if (cc && cc.flow === flowName) {
    queue.push({
      label: `${cc.add.name} — the presented code is compared to the stored one`,
      run: () => {
        const parent = resolveContainer(definition, cc.add.place.parent);
        if (parent[cc.add.name]) return;
        const cond = ifAction(cc.add.expression);
        const movers = cc.add.moveIntoIfYes.filter((n) => parent[n]);
        if (movers.length !== cc.add.moveIntoIfYes.length) {
          throw new Error(`expected ${cc.add.moveIntoIfYes.join(', ')} in ${cc.add.place.parent}`);
        }
        const anchor = parent[movers[0]].runAfter || {};
        parent[cc.add.name] = { ...cond, runAfter: anchor };
        moveActions(parent, movers, parent[cc.add.name].actions);
      },
    });
    queue.push({
      label: `${cc.attemptsCap.name} — the cap that makes Attempts mean something`,
      run: () => place(definition, cc.attemptsCap.name,
        ifAction(cc.attemptsCap.expression), cc.attemptsCap.place),
    });
  }

  /* 4. New SharePoint actions, each at the place the artifact names. */
  for (const spec of artifact.newActionsRequired || []) {
    if (spec.flow !== flowName && spec.flow !== 'BOTH') continue;
    if (!spec.place) throw new Error(`${spec.name} has no place — the artifact cannot be applied`);
    queue.push({
      label: `${spec.name} — ${spec.operation} on ${spec.list}`,
      run: () => place(definition, spec.name, connector(spec.inputs), spec.place),
    });
  }

  /* 5. D8's gate: bucket, counter, key, and the case that returns 429. */
  const gate = (artifact.rateLimitGate?.perFlow || []).find((g) => g.flow === flowName);
  if (gate) {
    queue.push({
      label: `${gate.composeBucket.name} — the rate-limit bucket key`,
      run: () => place(definition, gate.composeBucket.name,
        { type: 'Compose', inputs: gate.composeBucket.inputs }, gate.composeBucket.place),
    });
    for (const a of gate.add) {
      if (a.type === 'Compose') {
        queue.push({
          label: `${a.name} — routes to the refusal when over ${gate.limitPerHour}/hour`,
          run: () => place(definition, a.name, { type: 'Compose', inputs: a.inputs }, a.place),
        });
      } else if (a.type === 'If') {
        queue.push({
          label: `${a.name} — update an existing bucket, create a missing one`,
          run: () => place(definition, a.name, ifAction({ and: [{ equals: [a.expression, true] }] }), a.place),
        });
      } else if (a.type === 'SwitchCase') {
        queue.push({
          label: `${a.name} — returns ${a.actions[0].value} through the standard envelope`,
          run: () => {
            const actions = {};
            let previous = null;
            for (const sub of a.actions) {
              const isAppend = /^Append_to_string/.test(sub.name);
              actions[sub.name] = {
                type: isAppend ? 'AppendToStringVariable' : 'SetVariable',
                inputs: { name: isAppend ? 'varResponse' : 'varStatusCode', value: sub.value },
                runAfter: previous ? { [previous]: ['Succeeded'] } : {},
              };
              previous = sub.name;
            }
            addCase(definition, a.place.switch, a.name, a.caseValue, actions);
          },
        });
      }
    }
    queue.push({
      label: `Switch — now reads ${gate.repoint.expressionTo}`,
      run: () => repointSwitch(definition, gate.add.find((a) => a.type === 'SwitchCase').place.switch,
        gate.repoint.expressionTo),
    });
  }

  /* 6. The expired branch, which Condition_1 still guards. */
  const eb = artifact.codeComparison?.expiredBranch;
  if (cc && cc.flow === flowName && eb) {
    for (const name of eb.add) {
      const spec = (artifact.newActionsRequired || []).find((a) => a.name === name);
      if (spec) continue; // already queued in step 4 with its own place
      throw new Error(`${name} is named by expiredBranch but has no definition`);
    }
  }

  /* The fixpoint. */
  let pending = queue;
  const failures = new Map();
  while (pending.length) {
    const next = [];
    for (const op of pending) {
      try { op.run(); applied.push(op.label); failures.delete(op.label); }
      catch (err) { failures.set(op.label, err.message); next.push(op); }
    }
    if (next.length === pending.length) {
      const detail = next.map((op) => `      ${op.label}\n        ${failures.get(op.label)}`).join('\n');
      throw new Error(`${next.length} change(s) could not be placed:\n${detail}`);
    }
    pending = next;
  }
  return applied;
}
