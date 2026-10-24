/**
 * The designer's save-time rule (IP_SCAN_INTAKE save of 5 October 2026: "The inputs of template action
 * 'Create_Scan_Record' ... cannot reference action 'Compose_Scan_Stored_Name'. Action 'Compose_Scan_Stored_Name' must
 * either be in 'runAfter' path or within a scope action on the 'runAfter' path of action 'Create_Scan_Record', or be a
 * Trigger."): an action may read only actions that run before it, through runAfter, in its own container or in any
 * container that encloses it, or actions inside a scope on that path.
 *
 * Returns one message per reference that breaks the rule.
 */
const KIDS = (a) => [
  ...(a.actions ? [['actions', a.actions]] : []),
  ...(a.else?.actions ? [['else', a.else.actions]] : []),
  ...Object.entries(a.cases || {}).map(([c, v]) => [`case:${c}`, v.actions]),
  ...(a.default?.actions ? [['default', a.default.actions]] : []),
];

export function runAfterReach(rootActions) {
  const info = new Map(); // name -> { a, siblings, parent }
  const index = (acts, parent) => {
    for (const [n, a] of Object.entries(acts || {})) {
      info.set(n, { a, siblings: acts, parent });
      for (const [, k] of KIDS(a)) index(k, n);
    }
  };
  index(rootActions, null);
  const descendants = (n, out) => { for (const [, k] of KIDS(info.get(n).a)) for (const c of Object.keys(k)) { out.add(c); descendants(c, out); } return out; };
  const reach = (n) => {
    const out = new Set();
    let cur = n;
    while (cur) {
      const { siblings } = info.get(cur);
      const stack = Object.keys(siblings[cur].runAfter || {});
      const seen = new Set();
      while (stack.length) {
        const p = stack.pop(); if (seen.has(p) || !siblings[p]) continue;
        seen.add(p); out.add(p); descendants(p, out);
        stack.push(...Object.keys(siblings[p].runAfter || {}));
      }
      cur = info.get(cur).parent;
      if (cur) out.add(cur); // an enclosing container is in progress; items() and its own state are readable
    }
    return out;
  };
  const errors = [];
  for (const [n, { a }] of info) {
    const own = JSON.stringify({ i: a.inputs, e: a.expression, f: a.foreach });
    const ok = reach(n);
    for (const m of own.matchAll(/(?:outputs|body|actions|result)\('([^']+)'\)/g)) {
      const ref = m[1];
      if (!info.has(ref) || ref === n) continue;
      if (!ok.has(ref)) errors.push(`${n} reads ${ref}, which is not on its runAfter path`);
    }
  }
  return [...new Set(errors)];
}
