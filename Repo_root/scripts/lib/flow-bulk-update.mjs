/**
 * Bulk update of the live flows from their packages: check, apply, restore.
 *
 * A package is one top-level scope of one flow, in the designer's clipboard format. The packages
 * are the ones the identification builders list in registers/identification-phase*-status.json
 * (flow id, scope, file); a later phase that writes such a register joins without a change here.
 *
 *   check    reads each flow and compares its scope with the package. Writes nothing.
 *   apply    checks, backs up every flow it will change, then writes one flow at a time. Each
 *            write is read back: if the flow did not store what was sent, it is restored from
 *            the backup and the run stops. A flow saved by someone else since the check is not
 *            written over.
 *   restore  puts back every flow in a backup, and reads each back.
 *
 * Only the package's own scope is replaced, in place, keeping its runAfter (scripts/lib/flow-install.mjs,
 * the installer every other route uses). Steps outside it and the trigger are left as they are, so
 * trigger URLs do not change. Placement is never guessed: a scope the flow does not have yet is
 * BLOCKED, with the package README's instruction for the one-time paste.
 *
 * WHAT COUNTS AS CURRENT
 *   The flow's scope, compared with the installed package after key order, designer metadata and
 *   empty runAfter are set aside, together with the inputs.authentication the service adds to each
 *   connector step it stores (ESTATE_APPLY.md records that one addition). Each connection
 *   reference the package uses must name the package's connection. Both sides are reduced to a
 *   SHA-256, so a report shows the same proof anyone can recompute from the repository.
 *
 * This module does no I/O of its own: io.api(method, path, body) talks to the Flow service,
 * io.log/io.table print, io.save(name, value, { private }) writes a file, io.confirm(question)
 * asks. scripts/flows-update.mjs supplies them; tests/flows-update.test.mjs supplies a simulated tenant.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { installPackage, validateWiring } from './flow-install.mjs';
import { packageFingerprint, scopeFingerprint, emptySetVariables } from './package-fingerprint.mjs';

const REGISTERS = 'docs/folio-Master-Flows-and-Endpoints/registers';
const PACKAGES = 'docs/folio-Master-Flows-and-Endpoints/packages';

/** Every package a status register lists, with its file read. */
export function loadPackages(root) {
  const out = [];
  const registers = readdirSync(join(root, REGISTERS)).filter((f) => /^identification-phase\d+-status\.json$/.test(f)).sort();
  for (const r of registers) {
    const reg = JSON.parse(readFileSync(join(root, REGISTERS, r), 'utf8'));
    const dir = `${PACKAGES}/identification-phase${reg.phase}`;
    for (const s of reg.packages || []) {
      /* A flow not created yet (its id NOT_CAPTURED, as Folio_Failure_Watch until scripts/write-failure-watch-flow.mjs
         creates it) has nothing to update: its writer creates it whole. */
      if (!/^[0-9a-f-]{36}$/i.test(String(s.flowId))) continue;
      const path = `${dir}/${s.file}`;
      if (!existsSync(join(root, path))) throw new Error(`${REGISTERS}/${r} lists ${s.file}, which is not in ${dir}`);
      const pkg = JSON.parse(readFileSync(join(root, path), 'utf8'));
      if (pkg.nodeId !== s.root) throw new Error(`${path}: its scope is ${pkg.nodeId}, the register says ${s.root}`);
      out.push({
        id: s.file.replace(/\.paste\.json$/, ''), phase: reg.phase, key: s.key, flow: s.flow, flowId: String(s.flowId).toLowerCase(),
        scope: s.root, path, readme: `${dir}/README.md`, requires: s.requires || null, replaces: s.replaces || [],
        pkg: { nodeId: pkg.nodeId, serializedValue: pkg.serializedValue, allConnectionData: pkg.allConnectionData || {} },
      });
    }
  }
  return out;
}

/* ───────────────────────── comparing ───────────────────────── */

export const canon = (v) => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (k === 'metadata') continue;
      if (k === 'runAfter' && v[k] && typeof v[k] === 'object' && !Object.keys(v[k]).length) continue;
      out[k] = canon(v[k]);
    }
    return out;
  }
  return v;
};
const text = (v) => JSON.stringify(canon(v));
export const sha256 = (v) => createHash('sha256').update(text(v)).digest('hex');
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
const bodyOf = (scope) => { if (!scope || typeof scope !== 'object') return scope ?? null; const { runAfter, ...rest } = scope; return rest; };

const containers = (a) => {
  const out = [];
  if (a?.actions) out.push(['actions', a.actions]);
  if (a?.else?.actions) out.push(['else', a.else.actions]);
  for (const [k, c] of Object.entries(a?.cases || {})) if (c?.actions) out.push([`cases.${k}`, c.actions]);
  if (a?.default?.actions) out.push(['default', a.default.actions]);
  return out;
};
const walk = (actions, fn, path = '') => {
  for (const [n, a] of Object.entries(actions || {})) {
    fn(n, a, `${path}${n}`);
    for (const [, c] of containers(a)) walk(c, fn, `${path}${n}/`);
  }
};

/* The flow's copy of a scope without the inputs.authentication the service adds to a connector
   step, wherever the package's step carries none. */
export function withoutServiceAdded(have, want) {
  if (!have || typeof have !== 'object') return have;
  const c = { ...have };
  if (c.inputs && typeof c.inputs === 'object' && 'authentication' in c.inputs && !(want?.inputs && typeof want.inputs === 'object' && 'authentication' in want.inputs)) {
    c.inputs = { ...c.inputs }; delete c.inputs.authentication;
  }
  const kids = (x, w) => Object.fromEntries(Object.entries(x || {}).map(([n, a]) => [n, withoutServiceAdded(a, (w || {})[n])]));
  if (have.actions) c.actions = kids(have.actions, want?.actions);
  if (have.else?.actions) c.else = { ...have.else, actions: kids(have.else.actions, want?.else?.actions) };
  if (have.cases) c.cases = Object.fromEntries(Object.entries(have.cases).map(([k, v]) => [k, v?.actions ? { ...v, actions: kids(v.actions, want?.cases?.[k]?.actions) } : v]));
  if (have.default?.actions) c.default = { ...have.default, actions: kids(have.default.actions, want?.default?.actions) };
  return c;
}

/** Where two values first differ, as a path of names only (no values, which may hold anything). */
export function firstDiff(a, b, path = '') {
  const x = canon(a), y = canon(b);
  if (JSON.stringify(x) === JSON.stringify(y)) return null;
  if (x && y && typeof x === 'object' && typeof y === 'object' && Array.isArray(x) === Array.isArray(y)) {
    for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort()) {
      if (!(k in x)) return `${path}${k} (only in the package)`;
      if (!(k in y)) return `${path}${k} (only in the flow)`;
      const d = firstDiff(x[k], y[k], `${path}${k}.`);
      if (d) return d;
    }
  }
  return path.replace(/\.$/, '') || '(the whole scope)';
}

/* Every step's place and type, every variable write's value, and the triggers: what must survive
   a write unchanged everywhere, not only inside the scope written. */
export function skeleton(def) {
  const out = [];
  walk(def?.actions, (n, a, path) => {
    out.push(`${path}:${a?.type}<-${Object.keys(a?.runAfter || {}).sort().join(',')}`);
    if (/Variable$/.test(a?.type || '') && a.type !== 'InitializeVariable') out.push(`${path}=${text(a.inputs?.value)}`);
  });
  for (const [n, t] of Object.entries(def?.triggers || {})) out.push(`trigger ${n}:${t?.type}:${t?.inputs?.method || ''}:${text(t?.recurrence || null)}`);
  return out.sort().join('\n');
}

const VARIABLE_WRITES = new Set(['SetVariable', 'AppendToArrayVariable', 'AppendToStringVariable', 'IncrementVariable', 'DecrementVariable']);
function variablesUsed(scope) {
  const used = new Set();
  for (const m of JSON.stringify(scope).matchAll(/variables\(\s*'([^']+)'\s*\)/g)) used.add(m[1].toLowerCase());
  walk(scope?.actions, (n, a) => { if (VARIABLE_WRITES.has(a?.type) && a.inputs?.name) used.add(String(a.inputs.name).toLowerCase()); });
  return used;
}
function variablesDeclared(def, skip) {
  const out = new Set();
  for (const [n, a] of Object.entries(def?.actions || {})) {
    if (skip.has(n)) continue;
    const take = (x) => { if (x?.type === 'InitializeVariable') for (const v of x.inputs?.variables || []) out.add(String(v.name).toLowerCase()); };
    take(a);
  }
  return out;
}
function declaresInside(scope) {
  const found = [];
  walk(scope?.actions, (n, a, path) => { if (a?.type === 'InitializeVariable') found.push(path); });
  return found;
}
/* How many steps outside the given scopes use a connection reference. */
function referenceUseOutside(def, skip, key) {
  let n = 0;
  for (const [name, a] of Object.entries(def?.actions || {})) {
    if (skip.has(name)) continue;
    walk({ [name]: a }, (x, y) => { if (y?.type === 'OpenApiConnection' && (y.inputs?.host?.connectionName || y.inputs?.host?.connection) === key) n++; });
  }
  return n;
}

/* ───────────────────────── planning one flow ───────────────────────── */

/**
 * What the packages would do to one live flow. Nothing is written.
 * @param {object} live      the flow as GET /flows/{id} returns it
 * @param {object[]} pkgs    this flow's packages (loadPackages rows)
 * @param {Set<string>} named  package ids the operator named in full (a package with `requires` goes only when named)
 */
/** The service's limit on actions in one flow definition, and the count it applies (every action at any depth). */
export const ACTION_LIMIT = 500;
/* The service also refuses one template expression over 8,192 characters (tenant 2026-10-08: 10,391). */
export const EXPRESSION_LIMIT = 8192;
export function longExpressions(scope) {
  const out = [];
  const walk = (v, action) => {
    if (typeof v === 'string') { if (v.startsWith('@') && v.length > EXPRESSION_LIMIT) out.push({ action, length: v.length }); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, (x && typeof x === 'object' && x.type) ? k : action);
  };
  walk(scope, 'scope');
  return out.sort((a, b) => b.length - a.length);
}
export function countActions(actions) {
  let n = 0;
  for (const a of Object.values(actions || {})) {
    n++;
    n += countActions(a?.actions);
    if (a?.else) n += countActions(a.else.actions);
    for (const c of Object.values(a?.cases || {})) n += countActions(c.actions);
    if (a?.default) n += countActions(a.default.actions);
  }
  return n;
}
export function planFlow(live, pkgs, named = new Set()) {
  const props = live?.properties || {};
  const original = { definition: clone(props.definition) || {}, connectionReferences: clone(props.connectionReferences) || {} };
  /* What the comparisons read: the flow as stored, with a scope the package replaces under its own name. `original` stays
     exactly as stored, for the restore. */
  let cur = original.definition;
  let def = clone(cur), refs = clone(original.connectionReferences);
  /* What the flow already carries is not the package's doing: only a problem the install adds blocks it.
     Re-installing the flow's own copy of a scope gives the same checks over the unchanged flow. */
  const baseline = (scope) => new Set([...validateWiring(cur), ...installPackage({ definition: cur, connectionReferences: original.connectionReferences, pkg: { nodeId: scope, serializedValue: cur.actions[scope] }, mode: 'scope' }).problems]);
  const scopes = new Set(pkgs.map((p) => p.scope));
  const rows = [];
  for (const p of pkgs) {
    const row = { id: p.id, file: p.path.split('/').pop(), scope: p.scope, status: null, detail: '', packageHash: null, liveHash: null,
      fingerprint: packageFingerprint(p.pkg), liveFingerprint: null, liveEmptySetVariables: [], rebinds: [] };
    rows.push(row);
    if (pkgs.filter((q) => q.scope === p.scope).length > 1) { row.status = 'BLOCKED'; row.detail = `more than one package replaces ${p.scope} in this flow`; continue; }
    let have = cur.actions?.[p.scope];
    /* A top-level scope someone put in the package's place under another name, named by the package itself
       (`replaces`, recorded in its status entry): the package takes its place, keeping its position. Placement is still
       never guessed: only a name the package declares is replaced. */
    const stand = !have && (p.replaces || []).find((n) => cur.actions?.[n]);
    if (stand) {
      const rename = (d) => {
        const acts = {};
        for (const [n, a] of Object.entries(d.actions || {})) {
          const b = clone(a);
          if (b.runAfter && stand in b.runAfter) { b.runAfter[p.scope] = b.runAfter[stand]; delete b.runAfter[stand]; }
          acts[n === stand ? p.scope : n] = b;
        }
        return { ...d, actions: acts };
      };
      cur = rename(cur);
      def = rename(def);
      have = cur.actions[p.scope];
      row.replaced = stand;
    }
    if (!have) {
      row.status = 'BLOCKED';
      row.detail = `the flow has no top-level step ${p.scope}. It is added, not replaced: paste it once in the designer as ${p.readme} says; from then on this command keeps it current`;
      continue;
    }
    /* What the flow runs, in the paste ledger's terms (scripts/lib/package-fingerprint.mjs). */
    row.liveFingerprint = scopeFingerprint(have);
    row.liveEmptySetVariables = emptySetVariables(have);
    const inside = declaresInside(p.pkg.serializedValue);
    if (inside.length) { row.status = 'BLOCKED'; row.detail = `the package declares a variable inside its scope (${inside.slice(0, 3).join(', ')}); Power Automate accepts declarations only at the top level`; continue; }

    const r = installPackage({ definition: def, connectionReferences: refs, pkg: p.pkg, mode: 'scope' });
    const before = baseline(p.scope);
    const problems = r.problems.filter((x) => !before.has(x));
    const declared = variablesDeclared(r.definition, scopes);
    const undeclared = [...variablesUsed(p.pkg.serializedValue)].filter((v) => !declared.has(v));
    if (undeclared.length) problems.push(`it uses variables this flow does not declare: ${undeclared.slice(0, 6).join(', ')}${undeclared.length > 6 ? ` and ${undeclared.length - 6} more` : ''}`);
    if (problems.length) { row.status = 'BLOCKED'; row.detail = `does not install cleanly: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? ` (and ${problems.length - 3} more)` : ''}`; continue; }
    /* The service refuses a definition of more than 500 actions (TemplateValidationError, tenant 2026-10-08: DYNAMIC_ACTIONS
       with user-admin reached 524). Counted over the whole flow as it would be written, before anything is sent. */
    const total = countActions(r.definition.actions);
    if (total > ACTION_LIMIT) { row.status = 'BLOCKED'; row.detail = `the flow would hold ${total} actions; the service allows ${ACTION_LIMIT}`; continue; }
    const long = longExpressions(r.definition.actions[p.scope]);
    if (long.length) { row.status = 'BLOCKED'; row.detail = `${long.length} expression(s) exceed the service's ${EXPRESSION_LIMIT} characters (longest ${long[0].length}, in ${long[0].action})`; continue; }

    /* The package's connection is the decided one (for Office 365, the registry mailbox: ITEM-77). */
    const nextRefs = r.connectionReferences;
    const seen = new Set();
    for (const c of Object.values(p.pkg.allConnectionData || {})) {
      const key = c?.referenceKey, want = c?.connectionReference?.connectionName;
      if (!key || !want || seen.has(key)) continue;
      seen.add(key);
      const was = original.connectionReferences[key]?.connectionName || null;
      if (was === want) continue;
      nextRefs[key] = { ...(nextRefs[key] || {}), connectionName: want, id: c.connectionReference?.api?.id || nextRefs[key]?.id, source: nextRefs[key]?.source || 'Embedded' };
      row.rebinds.push({ reference: key, from: was, to: want, alsoUsedOutside: referenceUseOutside(cur, scopes, key) });
    }

    const want = r.definition.actions[p.scope];
    row.packageHash = sha256(bodyOf(want));
    row.liveHash = sha256(bodyOf(withoutServiceAdded(have, want)));
    if (row.packageHash === row.liveHash && !row.rebinds.length) { row.status = 'UP_TO_DATE'; continue; }
    const parts = [];
    if (row.replaced) parts.push(`replaces ${row.replaced}, the scope in its place`);
    if (row.packageHash !== row.liveHash) parts.push(`differs at ${firstDiff(bodyOf(withoutServiceAdded(have, want)), bodyOf(want))}`);
    const short = (c) => `${String(c).replace(/^shared-[a-z0-9]+-/i, '').slice(0, 8)}…`;
    for (const b of row.rebinds) parts.push(`connection ${b.reference}: ${b.from ? `${short(b.from)} → ` : 'added, '}${short(b.to)}${b.alsoUsedOutside ? ` (also used by ${b.alsoUsedOutside} step(s) outside the scope)` : ''}`);
    if (row.liveEmptySetVariables.length) parts.push(`the flow has ${row.liveEmptySetVariables.length} Set variable step(s) with no value, as a designer paste leaves them (ITEM-78): ${row.liveEmptySetVariables.slice(0, 4).join(', ')}`);
    row.detail = parts.join('; ');
    if (p.requires && !named.has(p.id)) { row.status = 'HELD'; row.detail = `${row.detail}. First: ${p.requires} Then name it: --only ${p.id}`; continue; }
    row.status = 'WILL_UPDATE';
    def = r.definition; refs = nextRefs;
  }
  const writing = rows.some((x) => x.status === 'WILL_UPDATE');
  return {
    flowId: String(live?.name || '').toLowerCase(), flow: props.displayName || '', state: props.state || '', lastModified: props.lastModifiedTime || null,
    rows, original, desired: writing ? { definition: def, connectionReferences: refs } : null,
  };
}

/** Does the flow as read back carry what was written? */
export function readBack(after, plan, pkgs) {
  const def = after?.properties?.definition, refs = after?.properties?.connectionReferences || {};
  if (!def) return 'the flow could not be read back';
  if (skeleton(def) !== skeleton(plan.desired.definition)) return 'the steps stored are not the steps sent';
  for (const row of plan.rows.filter((r) => r.status === 'WILL_UPDATE')) {
    const want = plan.desired.definition.actions[row.scope];
    const got = withoutServiceAdded(def.actions?.[row.scope], want);
    if (sha256(bodyOf(got)) !== row.packageHash) return `${row.scope} was stored with a difference at ${firstDiff(bodyOf(got), bodyOf(want))}`;
    for (const c of Object.values(pkgs.find((p) => p.id === row.id)?.pkg.allConnectionData || {})) {
      if (c?.referenceKey && refs[c.referenceKey]?.connectionName !== c.connectionReference?.connectionName) return `connection ${c.referenceKey} was not stored as sent`;
    }
  }
  return null;
}

/**
 * The paste ledger (registers/identification-paste-ledger.json) after a recorded run: each package whose scope was read
 * from the tenant gets an entry for what the flow runs. A flow that runs its package records the package's fingerprint.
 * One that runs something else records what it runs, or null where the ledger held no paste of it (a definition no
 * package produced). Nothing is recorded for a flow or scope that could not be read.
 */
export function ledgerUpdate(ledger, report, evidence) {
  const out = clone(ledger);
  const day = String(report.finishedUtc).slice(0, 10);
  const changed = [];
  for (const f of report.flows) {
    for (const p of f.packages) {
      if (!p.liveFingerprint || !p.file) continue;
      const at = out.entries.findIndex((e) => e.file === p.file);
      const prior = at >= 0 ? out.entries[at] : null;
      const runs = p.liveFingerprint === p.fingerprint;
      const entry = {
        file: p.file,
        fingerprint: runs ? p.fingerprint : (prior && prior.fingerprint !== null ? p.liveFingerprint : null),
        on: day,
        evidence: `npm run flows:update ${report.kind}, ${day}: ${f.flow} read live from the tenant (${evidence}); ${runs ? 'it runs this package' : `it runs another definition (fingerprint ${p.liveFingerprint})`}`,
        ...(p.emptySetVariables.length ? { emptySetVariables: p.emptySetVariables } : {}),
      };
      if (at >= 0) out.entries[at] = entry; else out.entries.push(entry);
      changed.push(p.file);
    }
  }
  return { ledger: out, changed };
}

/* ───────────────────────── the commands ───────────────────────── */

export function createFlowsUpdate({ packages, environment, commit = null }, io) {
  const say = (s) => io.log(s);

  async function read(flowId) {
    const r = await io.api('GET', `/flows/${flowId}`);
    if (r.ok) return { ok: true, flow: r.body };
    const why = r.status === 404 || r.status === 403 ? 'no flow with this id is visible to this account (is it shared with you?)' : `reading it returned ${r.status || 'no answer'}: ${String(r.body?.error?.message || '').slice(0, 200)}`;
    return { ok: false, why };
  }

  async function plan({ only = null } = {}) {
    const chosen = only ? packages.filter((p) => only.some((t) => [p.id, p.key, p.flow, p.flowId, p.scope].some((v) => String(v).toLowerCase().includes(t.toLowerCase())))) : packages;
    if (only && !chosen.length) throw new Error(`--only ${only.join(',')} names no package. Run check to see them all.`);
    /* Selecting is by any part of a name; releasing a package that needs something first takes its whole id. */
    const named = new Set(only ? chosen.filter((p) => only.some((t) => t.toLowerCase() === p.id.toLowerCase())).map((p) => p.id) : []);
    const byFlow = new Map();
    for (const p of chosen) byFlow.set(p.flowId, [...(byFlow.get(p.flowId) || []), p]);
    const ids = [...byFlow.keys()];
    const flows = new Array(ids.length);
    let next = 0;
    const worker = async () => { while (next < ids.length) { const i = next++; flows[i] = await read(ids[i]); } };
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
    return ids.map((id, i) => {
      const pkgs = byFlow.get(id);
      if (!flows[i].ok) return { flowId: id, flow: pkgs[0].flow, state: '', rows: pkgs.map((p) => ({ id: p.id, scope: p.scope, status: 'BLOCKED', detail: flows[i].why, rebinds: [] })), desired: null };
      return { ...planFlow(flows[i].flow, pkgs, named), pkgs };
    });
  }

  const COUNTED = ['UP_TO_DATE', 'WILL_UPDATE', 'APPLIED', 'HELD', 'BLOCKED', 'FAILED', 'CHANGED', 'NOT_RUN'];
  function print(flows, title) {
    say(`\n${title}`);
    io.table(flows.flatMap((f) => f.rows.map((r) => ({ package: r.id, flow: `${f.flow}${f.state && f.state !== 'Started' ? ` (${f.state})` : ''}`, status: r.status, detail: r.detail || '' }))));
    const all = flows.flatMap((f) => f.rows);
    say(COUNTED.map((s) => [s, all.filter((r) => r.status === s).length]).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(' · '));
  }

  function report(kind, flows) {
    return {
      schema: 'folio-flows-update-report/v1', kind, environment, commit, finishedUtc: io.now(),
      rule: 'A package is current when the SHA-256 of the flow\'s scope (key order, designer metadata, empty runAfter and the inputs.authentication the service adds set aside) equals the package\'s, and every connection reference it uses names the package\'s connection.',
      flows: flows.map((f) => ({
        flowId: f.flowId, flow: f.flow, state: f.state || null,
        packages: f.rows.map((r) => ({ id: r.id, file: r.file || null, scope: r.scope, status: r.status, packageHash: r.packageHash || null, liveHash: r.liveHash || null,
          fingerprint: r.fingerprint || null, liveFingerprint: r.liveFingerprint || null, emptySetVariables: r.liveEmptySetVariables || [], detail: r.detail || null, rebinds: r.rebinds || [] })),
      })),
    };
  }

  async function check({ only = null } = {}) {
    say(`Checking ${only ? 'the named packages' : `all ${packages.length} packages`} against the live flows (reads only)`);
    const flows = await plan({ only });
    print(flows, 'Check');
    const rep = report('check', flows);
    const n = (s) => flows.flatMap((f) => f.rows).filter((r) => r.status === s).length;
    if (n('WILL_UPDATE')) say(`To write the ${n('WILL_UPDATE')} that differ: npm run flows:update -- apply${only ? ` --only ${only.join(',')}` : ''}`);
    return { report: rep, current: flows.every((f) => f.rows.every((r) => r.status === 'UP_TO_DATE')) };
  }

  async function apply({ only = null, yes = false } = {}) {
    const flows = await plan({ only });
    const todo = flows.filter((f) => f.desired);
    print(flows, todo.length ? `Plan: ${todo.length} flow(s) to write` : 'Nothing to write');
    if (!todo.length) return { report: report('apply', flows), failed: false };
    if (!yes && !(await io.confirm(`Write ${todo.length} flow(s)? Each is backed up first and read back after. [y/N] `))) {
      say('Nothing written.');
      return { report: report('apply', flows), failed: false, declined: true };
    }

    const backup = { schema: 'folio-flows-backup/v1', environment, takenUtc: io.now(), flows: {} };
    for (const f of todo) backup.flows[f.flowId] = { name: f.flow, lastModified: f.lastModified, properties: f.original };
    const where = io.save(`flows-backup-${io.now().replace(/[:.]/g, '-')}.json`, backup, { private: true });
    say(`Backed up ${todo.length} flow(s) to ${where} before any write.`);

    let stopped = null;
    for (const f of todo) {
      const writing = f.rows.filter((r) => r.status === 'WILL_UPDATE');
      const mark = (status, detail) => { for (const r of writing) { r.status = status; r.detail = detail; } };
      if (stopped) { mark('NOT_RUN', `not written: the run stopped at ${stopped}`); continue; }
      say(`→ ${f.flow}: ${writing.map((r) => r.scope).join(', ')}`);

      /* Someone may have saved this flow in the designer since the check: never write over that. */
      const now = await read(f.flowId);
      if (!now.ok || (now.flow.properties?.lastModifiedTime || null) !== f.lastModified) {
        mark('CHANGED', now.ok ? 'the flow was saved by someone else after the check; nothing was written. Run again to see the change' : now.why);
        stopped = f.flow; continue;
      }
      const w = await io.api('PATCH', `/flows/${f.flowId}`, { properties: f.desired });
      if (!w.ok && !w.network) {
        mark('FAILED', `the service refused the write (${w.status}): ${String(w.body?.error?.code || '')} ${String(w.body?.error?.message || '').slice(0, 400)}`.trim());
        stopped = f.flow; continue;
      }
      const after = await read(f.flowId);
      const wrong = after.ok ? readBack(after.flow, f, f.pkgs) : after.why;
      if (wrong) {
        const back = await io.api('PATCH', `/flows/${f.flowId}`, { properties: f.original });
        const again = back.ok ? await read(f.flowId) : null;
        const restored = again?.ok && skeleton(again.flow.properties?.definition) === skeleton(f.original.definition);
        mark('FAILED', `${w.network ? 'the connection dropped during the write, and ' : ''}${wrong}; ${restored ? 'restored from the backup and confirmed' : `RESTORE NOT CONFIRMED — run: npm run flows:update -- restore ${where}`}`);
        stopped = f.flow; continue;
      }
      for (const r of writing) {
        const stored = after.flow.properties.definition.actions[r.scope];
        r.liveFingerprint = scopeFingerprint(stored); r.liveEmptySetVariables = emptySetVariables(stored);
      }
      for (const r of writing) { r.status = 'APPLIED'; r.liveHash = r.packageHash; r.detail = `written and read back: hash ${r.packageHash.slice(0, 12)}…${r.rebinds.length ? `; ${r.rebinds.length} connection(s) rebound` : ''}`; }
      say('  written and read back');
    }
    print(flows, stopped ? `Stopped at ${stopped}` : 'Done');
    return { report: report('apply', flows), failed: Boolean(stopped), backup: where };
  }

  async function restore(backup) {
    if (!backup?.flows || backup.schema !== 'folio-flows-backup/v1') throw new Error('That is not a flows backup (folio-flows-backup/v1).');
    if (backup.environment && backup.environment !== environment) throw new Error(`The backup is for environment ${backup.environment}, not ${environment}.`);
    const rows = [];
    for (const [flowId, f] of Object.entries(backup.flows)) {
      const w = await io.api('PATCH', `/flows/${flowId}`, { properties: f.properties });
      const after = (w.ok || w.network) ? await read(flowId) : null;
      const ok = after?.ok && skeleton(after.flow.properties?.definition) === skeleton(f.properties.definition);
      rows.push({ flow: f.name || flowId, status: ok ? 'RESTORED' : 'FAILED', detail: ok ? 'read back and confirmed' : `the service answered ${w.status || 'nothing'}: ${String(w.body?.error?.message || '').slice(0, 200)}` });
    }
    io.table(rows);
    return rows;
  }

  return { plan, check, apply, restore };
}
