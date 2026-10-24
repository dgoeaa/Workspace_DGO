export const Personas = ['admin','executive','registry','general'];
export const RoleRouteAccess = Object.freeze({
  systemAdmin: ['*'],
  userAdmin: ['home','settings','user-admin','diagnostics','operator-hud','admin-suite'],
  executive: ['home','executive','response-tracking','approvals','briefs','meetings','projects','reports','statistics','lookup','assistant','archive'],
  director: ['home','activities','correspondence','response-tracking','orchestrator','approvals','dispatch','scan-intake','briefs','meetings','projects','reports','statistics','lookup','assistant'],
  operator: ['home','activities','correspondence','response-tracking','orchestrator','single-assignment','bulk-assignment','scan-intake','registry','comments','dispatch','correspondence-email','meetings','projects','lookup','assistant'],
  viewer: ['home','response-tracking','reports','statistics','lookup']
});
export const RolePersonaMap = Object.freeze({systemAdmin:'admin', userAdmin:'admin', executive:'executive', director:'registry', operator:'registry', viewer:'general'});
function routeAllowedForRole(role, route){ const xs=RoleRouteAccess[role]||[]; return xs.includes('*') || xs.includes(route); }
/* THE ROLE TABLE DECIDES. THE PERSONA IS NOT A SECOND CHANCE AT THE SAME QUESTION.
 *
 * Finding F-020. This used to fall THROUGH to the persona check when the role check failed:
 *
 *     if (user.role && routeAllowedForRole(user.role, route)) return true;
 *     ... persona checks ...
 *
 * A failed role check is a DENIAL, but written that way it was merely an unsuccessful attempt,
 * and the persona below then answered the same question with a different table. Because
 * normalizeUserRecord() derives the persona from the role through RolePersonaMap, every real
 * caller arrives carrying both — so the persona table, not RoleRouteAccess, is what actually
 * gated the app.
 *
 * The finding recorded this as operator and director reaching settings and diagnostics. It was
 * broader than that. Measured across every role and every route, five of the six roles were
 * granted more than their own row allows:
 *
 *     userAdmin    5 routes in the table, 26 granted   (persona 'admin' returned true outright)
 *     viewer       5                      21
 *     executive   12                      23           (incl. diagnostics)
 *     director    15                      25           (incl. settings, operator-hud, executive)
 *     operator    16                      25           (incl. settings, operator-hud, executive)
 *     systemAdmin 26                      26           the only role whose table was honoured
 *
 * So RoleRouteAccess was decorative for everything but systemAdmin, and a table that is read by
 * a human and not by the code is worse than no table: it is a document asserting a control that
 * does not exist.
 *
 * A role now answers from its own row, and only from its own row. The persona branch survives
 * for the ONE caller that has no role to offer — the R11.1 lineage shell passes a bare persona
 * string, `canAccess(profile.persona, path)` — which the string form above normalises to a
 * record with an empty role. That caller keeps its old behaviour exactly; every caller that
 * supplies a role gets the table it was always shown.
 */
export function canAccess(subject, route) {
  const user=typeof subject==='string'?{persona:subject,role:'',status:'active'}:(subject||{});
  if(user.status && user.status!=='active') return false;
  /* A role is authoritative in both directions: it grants what its row lists and denies
     everything else. No fall-through. */
  if(user.role) return routeAllowedForRole(user.role, route);
  const persona=user.persona;
  if (persona === 'admin') return true;
  if (route === 'user-admin') return false;
  if (persona === 'executive') return !['settings','operator-hud','user-admin'].includes(route);
  if (persona === 'general') return !['executive','settings','operator-hud','diagnostics','user-admin'].includes(route);
  return persona === 'registry' ? route !== 'user-admin' : false;
}
// Capability model ported from the R11.5 platform's rbac.config.js (roles/permissions), used by
// User Administration for the role-capability matrix. Route gating above is unchanged (canAccess()).
export const Permissions = Object.freeze({
  USER_VIEW: 'user:view', USER_CREATE: 'user:create', USER_UPDATE: 'user:update', USER_DISABLE: 'user:disable',
  ROLE_ASSIGN: 'role:assign', ROLE_VIEW: 'role:view', SETTINGS_MANAGE: 'settings:manage', AUDIT_VIEW: 'audit:view',
  DISPATCH_APPROVE: 'dispatch:approve', BULK_ASSIGN: 'bulk:assign', ROUTE_MANAGE: 'route:manage',
  EXECUTIVE_VIEW: 'executive:view', EXECUTIVE_EXPORT: 'executive:export'
});
export const Roles = Object.freeze({
  systemAdmin: { id: 'systemAdmin', label: 'System Administrator', permissions: Object.values(Permissions) },
  userAdmin: { id: 'userAdmin', label: 'User Administrator', permissions: [Permissions.USER_VIEW, Permissions.USER_CREATE, Permissions.USER_UPDATE, Permissions.USER_DISABLE, Permissions.ROLE_ASSIGN, Permissions.ROLE_VIEW, Permissions.AUDIT_VIEW] },
  executive: { id: 'executive', label: 'Executive', permissions: [Permissions.EXECUTIVE_VIEW, Permissions.EXECUTIVE_EXPORT, Permissions.AUDIT_VIEW] },
  director: { id: 'director', label: 'Director / Directorate Lead', permissions: [Permissions.EXECUTIVE_VIEW, Permissions.ROUTE_MANAGE, Permissions.DISPATCH_APPROVE, Permissions.BULK_ASSIGN] },
  operator: { id: 'operator', label: 'Operator', permissions: [Permissions.ROUTE_MANAGE, Permissions.BULK_ASSIGN] },
  viewer: { id: 'viewer', label: 'Read-only Viewer', permissions: [] }
});
export const RoleList = Object.values(Roles);

export const PersonaScopes = Object.freeze({
  admin: { directorateScope:['all'], canInspectQuarantine:true, canArchive:true, canClose:true },
  executive: { directorateScope:['all'], canInspectQuarantine:false, canArchive:true, canClose:true },
  registry: { directorateScope:['all'], canInspectQuarantine:true, canArchive:true, canClose:true },
  general: { directorateScope:[], canInspectQuarantine:false, canArchive:false, canClose:false }
});
