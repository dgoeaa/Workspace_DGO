/**
 * Which HTTP flow registry lists Step 5 provisions — derived once, from the corrected flow
 * definitions.
 *
 * WHY THIS IS A MODULE AND NOT A CONSTANT
 *
 * The same decision was written out by hand in three generators: the runbook, the browser
 * provisioner, and the end-to-end walkthrough. All three said lists 1, 2 and 6, and none of them
 * was derived from anything — the walkthrough's copy even carried the comment "read from the
 * emitted provisioner's own generator inputs", which it was not.
 *
 * Three hand-kept copies of one decision drifted from the thing that actually constrains it. The
 * runbook told the operator to exercise all four corrected flows and then deferred four of the
 * lists those flows read and write, including DGO_HTTPFlowConsumerRegistry — without which the
 * retirement guard cannot answer 409 at all, so its blocked-path test would have reported a 200
 * and read like a pass.
 *
 * The constraint is not a judgement: a flow that writes to a list needs that list. So the scope
 * is computed from the definitions, and a flow that starts touching another list moves the scope
 * on the next build rather than on the next incident.
 *
 * The configuration list is the one addition. Nothing writes to it — the registry flows read
 * their control parameters out of it — so it would not appear in a purely write-derived set.
 */

export const CONFIG_LIST = 'DGO_HTTPFlowRegistryConfiguration';

/**
 * @param {object}   args
 * @param {object}   args.spec         parsed docs/reference/http-flow-registry-spec.json
 * @param {object[]} args.corrections  parsed *.corrected.json documents, each with a `definition`
 * @param {string}  [args.configList]  the list the flows read parameters from
 * @returns {{
 *   specLists: string[],
 *   listsTouchedBy: (c: object) => string[],
 *   required: string[],
 *   provisionNow: string[],
 *   deferred: string[],
 *   configList: string,
 * }}
 */
export function provisioningScope({ spec, corrections, configList = CONFIG_LIST }) {
  const specLists = (spec.lists || []).map((l) => l.listTitle);
  if (!specLists.length) throw new Error('the registry specification names no lists');

  /* Substring rather than a token match: these titles are distinctive enough that a false
     positive is implausible, and a definition references them inside OData URIs and setProperty
     expressions where no tokeniser would agree with another tokeniser. */
  const listsTouchedBy = (c) => {
    const text = JSON.stringify(c.definition ?? {});
    return specLists.filter((t) => text.includes(t));
  };

  const required = [...new Set(corrections.flatMap(listsTouchedBy))]
    .sort((a, b) => specLists.indexOf(a) - specLists.indexOf(b));

  const provisionNow = specLists.filter((t) => required.includes(t) || t === configList);
  const deferred = specLists.filter((t) => !provisionNow.includes(t));

  const missing = required.filter((t) => !provisionNow.includes(t));
  if (missing.length) {
    throw new Error(`the scope would defer ${missing.join(', ')}, which a corrected flow writes to`);
  }

  return { specLists, listsTouchedBy, required, provisionNow, deferred, configList };
}
