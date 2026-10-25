/* Shared vocabulary for the process-documentation pipeline.
 *
 * Everything the generator emits is keyed to one of these evidence classes and carries the
 * artifact it was read from. Nothing here decides what is true; it only fixes the words used
 * to say how strongly a statement is supported, so the same phrase never means two things in
 * two documents. The seven classes are the directive's, verbatim.
 */
export const EV = {
  CONFIRMED: 'Confirmed',
  INFERRED: 'Inferred',
  PARTIAL: 'Partially evidenced',
  CONFLICTING: 'Conflicting',
  UNAVAILABLE: 'Unavailable',
  UNVERIFIABLE: 'Not verifiable from the supplied inputs',
  VALIDATE: 'Requires authoritative validation',
};

export const EV_DEFINITIONS = [
  [EV.CONFIRMED, 'A supplied artifact states this directly. Reading that artifact is sufficient to establish it.', 'High'],
  [EV.INFERRED, 'Derived by reasoning across two or more artifacts. No single artifact states it.', 'Medium'],
  [EV.PARTIAL, 'Some attributes are stated by an artifact and others are not. The record says which is which.', 'Medium'],
  [EV.CONFLICTING, 'Two artifacts disagree. Both readings are recorded; neither is silently preferred.', 'Low'],
  [EV.UNAVAILABLE, 'The information is required by this standard and no supplied artifact carries it.', 'None'],
  [EV.UNVERIFIABLE, 'The artifact exists but does not permit the statement to be checked from the supplied inputs alone.', 'None'],
  [EV.VALIDATE, 'Readable from an artifact, but the artifact is not authoritative for it. A named owner must confirm.', 'Low'],
];

/* Coverage statuses — section 13 of the directive, verbatim and in its order. */
export const COV = {
  FULL: 'Fully documented from confirmed evidence',
  MINOR: 'Documented with minor validation requirements',
  PARTIAL: 'Partially documented',
  CONFLICT: 'Conflicting evidence',
  INSUFFICIENT: 'Insufficient evidence',
  NOTVERIFIABLE: 'Not verifiable',
  NA: 'Not applicable',
};

/* Ownership types — section 11. Where an owner is missing, the register names which kind. */
export const OWNERSHIP_TYPES = ['Business owner', 'Product owner', 'Process owner', 'Technical owner',
  'Operational owner', 'Support owner', 'Approval authority', 'Security or access authority'];

export const AUTOMATION = {
  MANUAL: 'Manual',
  PARTIAL: 'Partially automated',
  FULL: 'Fully automated',
  SCHEDULED: 'Scheduled',
  UNKNOWN: 'Not determinable from the supplied inputs',
};

export const DOCSTATUS = {
  COMPLETE: 'Documented to this standard',
  PARTIAL: 'Documented in part; named attributes outstanding',
  MINIMAL: 'Existence documented only',
};

export const VALIDATION = {
  NONE: 'No external validation required',
  OWNER: 'Requires confirmation by the named owner',
  TENANT: 'Requires confirmation against the live tenant',
  REGISTRY: 'Requires confirmation by the registry owner',
};

/* Counter-backed identifier minting. Width follows the largest count so identifiers stay
   sortable as text; three digits is the floor the directive illustrates. */
export function minter(widths = {}) {
  const n = {};
  return (kind) => {
    n[kind] = (n[kind] || 0) + 1;
    const w = Math.max(3, widths[kind] || 0);
    return `${kind}-${String(n[kind]).padStart(w, '0')}`;
  };
}

export const ID_PATTERN = /^(PROC|SUBPROC|STEP|VAR|RULE|ROLE|SYS|MOD|DEP|INT|STAT|TRAN|EXC|CTRL|GAP|SRC|DEC|NOTIF|MON|COV|TRC|TERM)-\d{3,}$/;

/* Drop keys with no value so a record never claims a field it could not fill. Absence is
   reported by the coverage and gap registers, not by an empty string in a table cell. */
export function compact(o) {
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    r[k] = v;
  }
  return r;
}

/* Markdown table-cell safety: a pipe or a newline inside a value would split the row. */
export function cell(v) {
  if (v === undefined || v === null) return '—';
  if (Array.isArray(v)) return v.length ? v.map(cell).join('<br>') : '—';
  return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim() || '—';
}

/* Mermaid node text: quotes and brackets end a node early. */
export function mm(v) {
  return String(v == null ? '' : v).replace(/["[\]{}()<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function table(headers, rows) {
  if (!rows.length) return '_No rows._\n';
  return [`| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(r => `| ${r.map(cell).join(' | ')} |`)].join('\n') + '\n';
}

/* ── Phrase interning ───────────────────────────────────────────────────────
 * The step catalogue repeats the same evidence notes and system responses
 * thousands of times: the note that a step was read directly from a workflow
 * definition is identical whichever action it describes. Storing each copy
 * would triple the inventory for no added information. Long strings that recur
 * are lifted into a phrase table and referenced as "@@n"; every consumer calls
 * expand() before reading, so no record loses a field.
 */
const REF = /^@@(\d+)$/;

export function internPhrases(root, { minLength = 40, minUses = 4 } = {}) {
  const counts = new Map();
  const count = (v) => {
    if (typeof v === 'string') { if (v.length >= minLength) counts.set(v, (counts.get(v) || 0) + 1); return; }
    if (Array.isArray(v)) { v.forEach(count); return; }
    if (v && typeof v === 'object') Object.values(v).forEach(count);
  };
  count(root);
  const phrases = [...counts.entries()].filter(([, n]) => n >= minUses).map(([s]) => s).sort();
  const index = new Map(phrases.map((s, i) => [s, i]));
  const swap = (v) => {
    if (typeof v === 'string') return index.has(v) ? `@@${index.get(v)}` : v;
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = swap(x); return o; }
    return v;
  };
  return { phrases, interned: swap(root) };
}

export function expand(v, phrases) {
  if (typeof v === 'string') { const m = REF.exec(v); return m ? (phrases[+m[1]] ?? v) : v; }
  if (Array.isArray(v)) return v.map(x => expand(x, phrases));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = expand(x, phrases); return o; }
  return v;
}
