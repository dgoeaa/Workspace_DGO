/* Every remediation artifact must be executable against the estate that exists.
 *
 * An artifact is a set of actions someone will paste into a live flow. If it names a list that
 * was never provisioned, or writes a column that is not there, the paste fails in production
 * against a tenant nobody can roll back with a git revert. That is the same class of mistake
 * this whole exercise began with - a provisioner written against an estate that did not exist -
 * so the artifacts are checked against the field specification rather than trusted.
 *
 * What this does NOT check is whether the tenant has been changed yet. That is
 * `npm run test:wiring`, the strict acceptance gate. */
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log('  ✅ ' + name); return; }
  failed++; console.log('  ❌ ' + name + (detail ? '\n     ' + detail : ''));
};

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const spec = JSON.parse(read('docs/deployment/sharepoint/portal-field-spec.json'));
const wiring = JSON.parse(read('docs/deployment/sharepoint/portal-wiring.json'));
const decisions = read('docs/deployment/sharepoint/DECISIONS.md');
const byTitle = new Map(spec.lists.map((l) => [l.listTitle, l]));
const byGuid = new Map(spec.lists.map((l) => [l.listGuid.toLowerCase(), l]));

const dir = new URL('docs/deployment/sharepoint/remediation/', root);
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const artifacts = files.map((f) => ({ file: f, a: JSON.parse(readFileSync(new URL(f, dir), 'utf8')) }));

console.log('\nRemediation artifacts');
ok('there are artifacts to check', artifacts.length > 0);
ok('every artifact declares an id, what it closes, and what it applies to',
   artifacts.every(({ a }) => a.remediationId && a.closes && Array.isArray(a.appliesTo) && a.appliesTo.length),
   artifacts.filter(({ a }) => !(a.remediationId && a.closes && a.appliesTo?.length)).map(({ file }) => file).join(', '));

/* Collect every SharePoint action across every artifact, wherever it is filed and whichever
 * shape it is filed in. The OTP artifact keys its edits by the action they replace, because it
 * is a set of substitutions into an existing flow; the later artifacts are lists, because they
 * are actions to add. Both are read here rather than one being normalised to the other, since
 * the difference carries meaning about what the operator does with it. */
const ACTION_KEYS = ['actions', 'uploadActions', 'supportActions', 'newActionsRequired'];
function inferOperation(params) {
  if (!params || typeof params !== 'object') return undefined;
  const keys = Object.keys(params);
  const writes = keys.some((k) => k.startsWith('item/'));
  if (keys.some((k) => k === '$filter' || k === '$top')) return 'GetItems';
  if (writes) return params.id !== undefined ? 'PatchItem' : 'PostItem';
  if (params.id !== undefined) return 'GetItem';
  return undefined;
}
const asActionList = (v) => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    return Object.entries(v).map(([name, act]) => ({
      name,
      /* A substitution states only the parameters that replace the originals. */
      inputs: act.inputs || { parameters: act.replaceParametersWith || {} },
      /* A substitution has no host block, so the operation is read off the parameters it
       * replaces: a filter is a query, item/ keys with an id is a patch, item/ keys without
       * one is an insert. Guessing from the action's name would break the moment someone
       * renamed one. */
      operation: act.operation || act.inputs?.host?.operationId || inferOperation(act.replaceParametersWith),
      list: act.list,
      substitution: !act.inputs,
    }));
  }
  return [];
};
const allActions = [];
for (const { file, a } of artifacts) {
  for (const key of ACTION_KEYS) for (const act of asActionList(a[key])) allActions.push({ file, act });
  if (a.alsoForVerify?.action) allActions.push({ file, act: a.alsoForVerify.action });
}
ok('the artifacts carry actions to paste', allActions.length > 0, `${allActions.length} found`);

// 1. Every action targets a provisioned list, by the GUID the specification records.
const badTarget = allActions.filter(({ act }) => {
  const t = act.inputs?.parameters?.table;
  return t && !byGuid.has(String(t).toLowerCase());
});
ok('every action targets a list in the field specification',
   badTarget.length === 0,
   badTarget.map(({ file, act }) => `${file}: ${act.name} -> ${act.inputs?.parameters?.table}`).join('\n     '));

// 2. Site and list name agree with the GUID. A right GUID under a wrong dataset is a 404.
const badSite = allActions.filter(({ act }) => {
  const p = act.inputs?.parameters || {};
  if (!p.table || !byGuid.has(String(p.table).toLowerCase())) return false;
  const l = byGuid.get(String(p.table).toLowerCase());
  return p.dataset !== l.siteUrl || (act.list && act.list !== l.listTitle);
});
ok('every action names the site and list the GUID belongs to', badSite.length === 0,
   badSite.map(({ file, act }) => `${file}: ${act.name}`).join('\n     '));

// 3. Every item/<column> written exists on that list. Title is native to every list.
const badColumn = [];
for (const { file, act } of allActions) {
  const p = act.inputs?.parameters || {};
  if (!p.table || !byGuid.has(String(p.table).toLowerCase())) continue;
  const l = byGuid.get(String(p.table).toLowerCase());
  for (const k of Object.keys(p)) {
    if (!k.startsWith('item/')) continue;
    const col = k.slice(5);
    if (col === 'Title') continue;
    if (!l.fields.some((f) => f.internalName === col)) badColumn.push(`${file}: ${act.name} writes ${l.listTitle}.${col}, which does not exist`);
  }
}
ok('every column an action writes exists on its list', badColumn.length === 0, badColumn.join('\n     '));

// 4. Every column a $filter names exists too - a filter on a missing column is a 400 at run time.
const badFilter = [];
for (const { file, act } of allActions) {
  const p = act.inputs?.parameters || {};
  const f = p.$filter;
  if (!f || !p.table || !byGuid.has(String(p.table).toLowerCase())) continue;
  const l = byGuid.get(String(p.table).toLowerCase());
  for (const m of String(f).matchAll(/(^|\s|\()([A-Za-z_][A-Za-z0-9_]*)\s+eq\s/g)) {
    const col = m[2];
    if (col === 'Title' || col === 'ID') continue;
    if (!l.fields.some((x) => x.internalName === col)) badFilter.push(`${file}: ${act.name} filters ${l.listTitle}.${col}, which does not exist`);
  }
}
ok('every column a filter names exists on its list', badFilter.length === 0, badFilter.join('\n     '));

// 5. An artifact for a public endpoint covers every operation the wiring requires of it.
const shortfall = [];
for (const { file, a } of artifacts) {
  const eps = String(a.endpoint || '').split(',').map((s) => s.trim()).filter((s) => /^[A-Z_]+$/.test(s));
  for (const ep of eps) {
    const w = wiring.endpoints.find((e) => e.endpoint === ep);
    if (!w) continue;
    const provided = new Set();
    for (const key of ACTION_KEYS) {
      for (const act of asActionList(a[key])) {
        const t = act.inputs?.parameters?.table;
        if (!t || !byGuid.has(String(t).toLowerCase())) continue;
        const op = { GetItems: 'read', GetItem: 'read', PostItem: 'create', PatchItem: 'update' }[act.operation];
        if (op) provided.add(`${String(t).toLowerCase()}|${op}`);
      }
    }
    for (const r of w.requiredOperations) {
      if (!provided.has(`${r.listGuid.toLowerCase()}|${r.operation}`)) {
        shortfall.push(`${file} (${ep}): no action for ${r.operation} ${r.list}`);
      }
    }
  }
}
ok('every endpoint artifact covers the operations the wiring requires', shortfall.length === 0, shortfall.join('\n     '));

// 6. Nothing in a remediation touches a list outside the portal estate without saying so.
const portalGuids = new Set(spec.lists.filter((l) => l.estate === 'Document portal').map((l) => l.listGuid.toLowerCase()));
const outside = allActions.filter(({ act }) => {
  const t = act.inputs?.parameters?.table;
  return t && byGuid.has(String(t).toLowerCase()) && !portalGuids.has(String(t).toLowerCase());
});
ok('no action writes outside the portal estate', outside.length === 0,
   outside.map(({ file, act }) => `${file}: ${act.name}`).join('\n     '));

// 7. Each artifact says how it is verified, and the set covers every visit in the sequence.
ok('every artifact states how to verify it',
   artifacts.every(({ a }) => Array.isArray(a.verification) && a.verification.length),
   artifacts.filter(({ a }) => !a.verification?.length).map(({ file }) => file).join(', '));
const visits = new Set(artifacts.map(({ a }) => a.visit).filter((v) => typeof v === 'number' && v > 0));
ok('the set covers visits 1 through 5', [1, 2, 3, 4, 5].every((v) => visits.has(v)),
   'missing visits: ' + [1, 2, 3, 4, 5].filter((v) => !visits.has(v)).join(', '));

// 8. No artifact carries a credential. They are pasted from a repository into a live tenant.
const LIVE = [/sig=(?!REDACTED)[A-Za-z0-9_%-]{8,}/, /\bsk-[A-Za-z0-9_-]{20,}/, /\bAIza[0-9A-Za-z_-]{30,}/, /\bhf_[A-Za-z0-9]{20,}/];
const leaking = artifacts.filter(({ file }) => {
  const t = readFileSync(new URL(file, dir), 'utf8');
  return LIVE.some((rx) => rx.test(t));
}).map(({ file }) => file);
ok('no artifact carries a credential', leaking.length === 0, leaking.join(', '));

// 9. The execution guide and the worksheets name real flows. A guide citing an internal name
//    that belongs to nothing sends an operator to a flow that does not exist, and the export
//    command built from it fails after the designer work is already done.
const deployedDir = new URL('docs/reference/flow-contracts/deployed/', root);
const deployedNames = new Map();
for (const f of readdirSync(deployedDir).filter((x) => x.endsWith('.json'))) {
  const wi = JSON.parse(readFileSync(new URL(f, deployedDir), 'utf8')).workflow_identity || {};
  if (wi.internal_name) deployedNames.set(String(wi.internal_name).toLowerCase(), wi.tags?.flowDisplayName || f);
}
const ENV_GUID = 'ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1'; // the environment, not a flow
const guideFiles = ['EXECUTION.md', ...readdirSync(dir).filter((f) => f.startsWith('WORKSHEET-'))];
const unknownIds = [];
for (const g of guideFiles) {
  const text = readFileSync(new URL(g, dir), 'utf8');
  for (const m of text.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g)) {
    const id = m[0].toLowerCase();
    if (id === ENV_GUID) continue;
    if (byGuid.has(id)) continue;                 // a list GUID, checked elsewhere
    if (!deployedNames.has(id)) unknownIds.push(`${g}: ${m[0]}`);
  }
}
ok('every flow id the guides cite belongs to an exported flow', unknownIds.length === 0,
   [...new Set(unknownIds)].join('\n     '));

ok('there is a worksheet for every artifact that has a visit',
   artifacts.filter(({ a }) => typeof a.visit === 'number')
     .every(({ a }) => guideFiles.includes(`WORKSHEET-${String(a.visit).padStart(2, '0')}.md`)),
   'missing worksheets for visits: ' + artifacts.filter(({ a }) => typeof a.visit === 'number'
     && !guideFiles.includes(`WORKSHEET-${String(a.visit).padStart(2, '0')}.md`)).map(({ a }) => a.visit).join(', '));

// 10. D7 - each visit carries its own standard work, named per flow, with the estate's own
//     expressions rather than a rewritten dialect.
const std = JSON.parse(read('docs/deployment/sharepoint/flow-standard.json'));
const checkIds = new Set(std.checks.map((c) => c.id));
const withVisits = artifacts.filter(({ a }) => typeof a.visit === 'number' && a.visit > 0);
ok('every visit artifact carries its per-flow standard conformance work',
   withVisits.every(({ a }) => a.standardConformance?.perFlow?.length),
   withVisits.filter(({ a }) => !a.standardConformance?.perFlow?.length).map(({ file }) => file).join(', '));
const badCheck = [];
for (const { file, a } of withVisits) {
  for (const p of a.standardConformance?.perFlow || []) {
    for (const m of p.missing || []) {
      if (!checkIds.has(m.check)) badCheck.push(`${file}: ${p.flow} cites unknown rule ${m.check}`);
      if (!m.how || !m.why) badCheck.push(`${file}: ${p.flow} / ${m.check} has no remedy or no reason`);
    }
  }
}
ok('every conformance item names a real rule and carries a remedy', badCheck.length === 0, badCheck.join('\n     '));

/* The redaction composes must be the estate's, character for character. A rewritten one that
 * misses a header is a leak that looks like conformance. */
const redacted = withVisits.flatMap(({ a }) => (a.standardConformance?.perFlow || [])
  .flatMap((p) => (p.missing || []).filter((m) => m.check.startsWith('redaction.'))));
ok('redaction remedies blank every header and query the standard names',
   redacted.every((m) => (m.check === 'redaction.headers'
     ? std.redaction.headers.every((h) => String(m.inputs).includes(h))
     : std.redaction.queries.every((q) => String(m.inputs).includes(`'${q}'`)))),
   'a redaction remedy omits something the standard blanks');

ok('the standard work is ordered before the wiring work',
   withVisits.every(({ a }) => /FIRST/.test(a.standardConformance?.order || '')),
   'variables and Scope_Global must exist before an action can reference them');
/* A remedy for something the flow already has is worse than a missing remedy: it reads as an
 * instruction, and following it puts a second catch scope, or a second set of variables, into
 * a working flow. This is exactly what happened when the conformance check matched catch
 * scopes by name — so it is asserted against the live measurement, not against a copy. */
const live = JSON.parse(execFileSync(process.execPath,
  [fileURLToPath(new URL('scripts/verify-flow-standard.mjs', root)), '--json'], { encoding: 'utf8' }));
const measured = new Map(live.flows.map((f) => [f.flow, new Set(f.missing)]));
const prescribedButPresent = [];
for (const { file, a } of withVisits) {
  for (const p of a.standardConformance?.perFlow || []) {
    const gaps = measured.get(p.flow);
    if (!gaps) { prescribedButPresent.push(`${file}: ${p.flow} is not in the export at all`); continue; }
    for (const m of p.missing || []) {
      if (!gaps.has(m.check)) prescribedButPresent.push(`${file}: ${p.flow} already satisfies ${m.check}`);
    }
    for (const id of gaps) {
      if (!(p.missing || []).some((m) => m.check === id)) prescribedButPresent.push(`${file}: ${p.flow} is missing ${id} and no remedy is given`);
    }
  }
}
ok('every conformance item is a gap the flow actually has, and none is left out',
   prescribedButPresent.length === 0, prescribedButPresent.join('\n     '));

ok('D7 is in the decision record', decisions.includes('## D7 '));

console.log(failed ? `\n❌ ${failed} failed` : '\n✅ all passed');
process.exit(failed ? 1 : 0);
