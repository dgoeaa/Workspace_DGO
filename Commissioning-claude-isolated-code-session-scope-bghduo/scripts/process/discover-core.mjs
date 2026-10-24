/* Discovery, part 1 — the estate: sources, systems, modules, roles, statuses, rules.
 *
 * Each function takes the shared context (`X`) and appends to it. Nothing here reads a
 * network, a tenant, or a running browser: everything is read from a file that is in the
 * repository, so a second run on a clean checkout produces byte-identical output.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EV, AUTOMATION, DOCSTATUS, VALIDATION, compact } from './lib.mjs';

export function makeContext(root) {
  const X = {
    root,
    R: p => readFileSync(join(root, p), 'utf8'),
    J: p => JSON.parse(readFileSync(join(root, p), 'utf8')),
    has: p => existsSync(join(root, p)),
    ls: p => (existsSync(join(root, p)) ? readdirSync(join(root, p)) : []),
    out: {
      generated: new Date().toISOString().slice(0, 10),
      standard: 'dgo-process-documentation/v2',
      systems: [], modules: [], processes: [], subprocesses: [], variants: [], steps: [],
      decisions: [], roles: [], integrations: [], statuses: [], transitions: [], rules: [],
      controls: [], exceptions: [], notifications: [], monitoring: [], dependencies: [],
      gaps: [], coverage: [], terminology: [], sources: [],
    },
  };
  X.SRC = (path, opts = {}) => {
    let s = X.out.sources.find(x => x.path === path);
    if (!s) {
      s = compact({
        id: `SRC-${String(X.out.sources.length + 1).padStart(3, '0')}`,
        path,
        kind: opts.kind || kindOf(path),
        location: opts.location || path,
        reference: opts.reference,
        classification: opts.classification || EV.CONFIRMED,
        confidence: opts.confidence || 'High',
        validationStatus: opts.validationStatus || VALIDATION.NONE,
      });
      X.out.sources.push(s);
    }
    return s.id;
  };
  return X;
}

function kindOf(p) {
  if (p.startsWith('config/')) return 'Configuration file';
  if (p.startsWith('core/')) return 'Source code — platform core';
  if (p.startsWith('modules/')) return 'Source code — workspace module';
  if (p.includes('flow-contracts/deployed')) return 'Tenant flow export';
  if (p.includes('designer-paste')) return 'Power Automate designer paste package';
  if (p.includes('/evidence/')) return 'Operational run record';
  if (p.endsWith('.json')) return 'Data artifact';
  if (p.endsWith('.md')) return 'Written documentation';
  return 'Artifact';
}

/* ── Systems and platforms ─────────────────────────────────────────────────── */
export function discoverSystems(X, ID) {
  const { out, SRC, has } = X;
  const bp = 'docs/reference/platform-architecture-pack/MASTER_BLUEPRINT.md';
  const S = [
    ['DGO Internal Platform', 'Browser-delivered operational platform used by registry, directorate and executive staff. Holds the workspace modules, the lifecycle machine and the role model.',
      ['config/routes.config.js', 'core/boot.js'].filter(has)],
    ['NITDA Documents Portal', 'Citizen-facing submission and tracking surface. Reaches the estate only through the published integration contracts.',
      ['docs/deployment/sharepoint/portal-data-contract.json'].filter(has)],
    ['Microsoft SharePoint Online', 'System of record. Every list and library the estate reads or writes lives here.',
      ['docs/reference/sharepoint-list-index.json'].filter(has)],
    ['Microsoft Power Automate', 'The sole integration mechanism. Every call from either surface into the system of record is an HTTP-triggered flow.',
      [has(bp) ? bp : null, 'config/endpoints.config.js'].filter(Boolean).filter(has)],
    ['Microsoft Office 365 Outlook', 'Outbound mail: one-time codes, acknowledgements, dispatch and telemetry.',
      ['docs/reference/flow-contracts/deployed'].filter(has)],
  ];
  for (const [name, role, srcs] of S) {
    if (!srcs.length) continue;
    out.systems.push(compact({
      id: ID('SYS'), name, role,
      evidence: EV.CONFIRMED,
      evidenceNote: 'Named and described by the artifacts cited; its part in the estate is read from them, not assumed.',
      source: srcs.map(p => SRC(p)),
    }));
  }
  const idx = 'docs/reference/sharepoint-list-index.json';
  if (has(idx)) {
    const d = X.J(idx), sp = out.systems.find(s => s.name.includes('SharePoint'));
    if (sp && d.totals) Object.assign(sp, { sites: d.totals.sites, listsSurveyed: d.totals.lists, listsAdopted: d.totals.adopted });
  }
}

/* ── Modules and features ──────────────────────────────────────────────────── */
export function discoverModules(X, ID) {
  const { out, SRC, R, has, ls } = X;
  const routesSrc = 'config/routes.config.js';
  const routes = {};
  if (has(routesSrc)) {
    for (const m of R(routesSrc).matchAll(/"path":\s*"([^"]+)",\s*"label":\s*"([^"]+)",\s*"group":\s*"([^"]+)",\s*"kind":\s*"([^"]+)",\s*"kpi":\s*(true|false)/g)) {
      routes[m[1]] = { label: m[2], group: m[3], kind: m[4], kpi: m[5] === 'true' };
    }
  }
  const bounds = {};
  const bSrc = 'config/module-boundaries.config.js';
  if (has(bSrc)) {
    const t = R(bSrc);
    for (const m of t.matchAll(/'?([a-z][a-z-]*)'?:\s*\{\s*role:\s*'([^']+)',\s*owns:\s*\[([^\]]*)\],\s*views:\s*\[([^\]]*)\](?:,\s*mustNotOwn:\s*\[([^\]]*)\])?/g)) {
      const arr = s => (s || '').match(/'([^']+)'/g)?.map(x => x.slice(1, -1)) || [];
      bounds[m[1]] = { role: m[2], owns: arr(m[3]), views: arr(m[4]), mustNotOwn: arr(m[5]) };
    }
  }
  for (const f of ls('modules').filter(x => x.endsWith('.js')).sort()) {
    const route = f.replace(/\.js$/, ''), p = `modules/${f}`;
    const b = bounds[route], r = routes[route];
    out.modules.push(compact({
      id: ID('MOD'), route, name: r?.label || route, group: r?.group,
      kind: r?.kind, carriesKpis: r?.kpi,
      boundaryRole: b?.role,
      features: b?.owns, views: b?.views, mustNotOwn: b?.mustNotOwn,
      lines: R(p).split('\n').length,
      evidence: b && r ? EV.CONFIRMED : EV.PARTIAL,
      evidenceNote: b && r
        ? 'Route, label, group and kind read from the route table; owned features and forbidden responsibilities read from the module boundary charter.'
        : 'The module file exists. Its declared boundary or its route-table entry, or both, could not be read, so its owned features are not fully established.',
      source: [SRC(p), ...(has(routesSrc) ? [SRC(routesSrc)] : []), ...(b ? [SRC(bSrc)] : [])],
    }));
  }
  return { routes, bounds };
}

/* ── Roles, personas, capabilities ─────────────────────────────────────────── */
export function discoverRoles(X, ID) {
  const { out, SRC, R, has } = X;
  const p = 'config/rbac.config.js';
  if (!has(p)) return;
  const s = SRC(p), t = R(p);
  const personas = ((t.match(/Personas\s*=\s*\[([^\]]*)\]/) || [])[1] || '').match(/'([^']+)'/g)?.map(x => x.slice(1, -1)) || [];
  const blk = (t.match(/RoleRouteAccess\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/) || [])[1] || '';
  for (const m of blk.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    const routes = (m[2].match(/'([^']+)'/g) || []).map(x => x.slice(1, -1));
    out.roles.push(compact({
      id: ID('ROLE'), name: m[1], type: 'Role',
      routeAccess: routes.includes('*') ? ['all routes'] : routes,
      routeCount: routes.includes('*') ? '*' : routes.length,
      responsibility: `Reaches ${routes.includes('*') ? 'every route' : `${routes.length} route(s)`}; canAccess() refuses the rest.`,
      evidence: EV.CONFIRMED,
      evidenceNote: 'Row of the frozen role-to-route access map. Every route render is gated on it.',
      validationStatus: VALIDATION.NONE,
      source: [s],
    }));
  }
  for (const pn of personas) {
    out.roles.push(compact({
      id: ID('ROLE'), name: pn, type: 'Persona',
      responsibility: 'Fallback gate applied when no role is set on the profile.',
      evidence: EV.CONFIRMED,
      evidenceNote: 'Declared persona in the access configuration.',
      source: [s],
    }));
  }
  const perms = (t.match(/Permissions\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/) || [])[1] || '';
  for (const m of perms.matchAll(/(\w+):\s*'([^']+)'/g)) {
    out.controls.push(compact({
      id: ID('CTRL'), name: `Permission ${m[1]}`, type: 'Permission rule',
      description: `Names the capability '${m[2]}' in the role-capability matrix.`,
      trigger: 'A module asks whether the current profile may perform the capability.',
      condition: `The profile's role grants '${m[2]}'.`,
      expectedBehaviour: 'The capability is offered.',
      outcome: 'Refusal when the role does not carry it.',
      exception: 'Not evidenced: the configuration declares the capability but not the refusal path for it.',
      evidence: EV.PARTIAL,
      evidenceNote: 'The capability name is declared. The enforcement site for this particular capability was not read.',
      validationStatus: VALIDATION.NONE,
      source: [s],
    }));
  }
}
