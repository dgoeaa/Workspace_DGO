/**
 * A package's fingerprint: what the flow does, independent of how the designer stores it.
 *
 * Pasting a package and exporting the flow again changes its form but not its meaning: the designer reorders keys,
 * writes host.connection as host.connectionName (and renames the reference), adds inputs.authentication and step
 * metadata. The fingerprint is taken over the root scope's steps with those normalised away, so a package and the
 * tenant export of the flow it was pasted into give the same fingerprint, and a rebuilt package that changes nothing
 * the tenant runs keeps it. Which connection a step binds is checked on its own (the PRE-1 binding check).
 *
 * The paste ledger (docs/folio-Master-Flows-and-Endpoints/registers/identification-paste-ledger.json) records the
 * fingerprint of what each flow runs; a package needs pasting again only when its fingerprint differs from that.
 *
 * Plain functions, no imports: tools/admin-console.html embeds this file verbatim to check a tenant export in the
 * browser, so the console and the builders compute one fingerprint. Not a security hash; it identifies content.
 */

function fpCanon(v) {
  if (Array.isArray(v)) return v.map(fpCanon);
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = fpCanon(v[k]);
  return out;
}

/* One step's own content (children excluded), normalised. */
function fpOwn(a) {
  const { metadata, description, trackedProperties, actions, else: e, cases, default: d, ...own } = a;
  const s = { ...own };
  if (s.inputs && typeof s.inputs === 'object' && !Array.isArray(s.inputs)) {
    const { authentication, ...inputs } = s.inputs;
    if (inputs.host && typeof inputs.host === 'object') {
      const { connection, connectionName, ...host } = inputs.host;
      inputs.host = host;
    }
    s.inputs = inputs;
  }
  if (s.runAfter && !Object.keys(s.runAfter).length) delete s.runAfter;
  return s;
}

/* Every step under a scope, flattened, with where it sits. */
function fpSteps(actions, parent, out) {
  out = out || {};
  for (const [n, a] of Object.entries(actions || {})) {
    out[n] = { parent: parent || '', own: JSON.stringify(fpCanon(fpOwn(a))), type: a.type, a };
    fpSteps(a.actions, n, out);
    if (a.else) fpSteps(a.else.actions, `${n}/else`, out);
    for (const [cn, c] of Object.entries(a.cases || {})) fpSteps(c.actions, `${n}/${cn}`, out);
    if (a.default) fpSteps(a.default.actions, `${n}/default`, out);
  }
  return out;
}

/* cyrb53: a fast 53-bit string hash, the same in Node and the browser. */
function fpHash(str, seed) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Each step's hash, by name: its own content and where it sits. */
export function stepHashes(scope) {
  const s = fpSteps(scope.actions);
  return Object.fromEntries(Object.keys(s).sort().map((n) => [n, fpHash(`${s[n].parent}\u0000${s[n].own}`, 7).slice(0, 10)]));
}

/** The fingerprint of a root scope ({ actions, ... }). */
export function scopeFingerprint(scope) {
  const h = stepHashes(scope);
  const s = Object.entries(h).map(([n, x]) => `${n}=${x}`).join('\n');
  return fpHash(s, 1) + fpHash(s, 2).slice(0, 2);
}

/** The Set variable steps under a scope that carry no value: what a paste drops (see composeVariableValues). */
export function emptySetVariables(scope) {
  const s = fpSteps(scope.actions);
  return Object.keys(s).filter((n) => s[n].type === 'SetVariable' && !(s[n].a.inputs && 'value' in s[n].a.inputs)).sort();
}

/** The root scope of a designer paste package. */
export function packageScope(pkg) {
  return typeof pkg.serializedValue === 'string' ? JSON.parse(pkg.serializedValue) : pkg.serializedValue;
}

/** The fingerprint of a designer paste package. */
export function packageFingerprint(pkg) {
  return scopeFingerprint(packageScope(pkg));
}

/** The scope named `root` in a flow definition ({ actions }), or null. */
export function findScope(definition, root) {
  const find = (acts) => {
    for (const [n, a] of Object.entries(acts || {})) {
      if (n === root) return a;
      const f = find(a.actions) || (a.else && find(a.else.actions))
        || Object.values(a.cases || {}).map((c) => find(c.actions)).find(Boolean) || (a.default && find(a.default.actions));
      if (f) return f;
    }
    return null;
  };
  return find(definition.actions);
}

/** A step name as the Folio Estate Console carries it: a name holding an e-mail address (some tenant steps are named
 *  after one) is replaced by its hash, so the console embeds no personal data and still matches the export's step. */
export function printName(n) {
  return n.includes('@') ? `#${fpHash(n, 3).slice(0, 10)}` : n;
}
