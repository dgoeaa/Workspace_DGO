export const Personas = ['admin','executive','registry','general'];
/* 'acknowledgment' is open to every role that can be assigned a task. The emails that assign
   work carry an "Acknowledge Receipt" link to it, and until 2026-09-30 only systemAdmin could
   open it, so every other assignee who followed the link met "Access denied". Seeing the
   queue exposes nothing new: each of these roles already reads the same tasks in
   response-tracking, and the acknowledge action itself admits only the assigned officer. */
/* comments is open to every role that reads records (module rationalisation F-8, 2026-10-20): My Work showed Open
   Comments to executives, directors and viewers, and the route refused them. A comment is a minute on a task, which the
   server lets any role with My Work write. */
export const RoleRouteAccess = Object.freeze({
  systemAdmin: ['*'],
  userAdmin: ['home','settings','user-admin','diagnostics','operator-hud','admin-suite'],
  /* executive and viewer gained My Work (orchestrator) on 2026-10-10: an officer assigned a task could acknowledge it and
     never start or complete it. DYNAMIC_ACTIONS lets a role without this route update only a task assigned to it. */
  executive: ['home','executive','response-tracking','acknowledgment','orchestrator','comments','approvals','briefs','meetings','projects','reports','statistics','lookup','assistant','archive'],
  director: ['home','activities','correspondence','response-tracking','acknowledgment','orchestrator','comments','approvals','dispatch','scan-intake','briefs','meetings','projects','reports','statistics','lookup','assistant'],
  operator: ['home','activities','correspondence','response-tracking','acknowledgment','orchestrator','single-assignment','bulk-assignment','scan-intake','registry','comments','dispatch','correspondence-email','meetings','projects','lookup','assistant'],
  viewer: ['home','response-tracking','acknowledgment','orchestrator','comments','reports','statistics','lookup']
});
export const RolePersonaMap = Object.freeze({systemAdmin:'admin', userAdmin:'admin', executive:'executive', director:'registry', operator:'registry', viewer:'general'});
function routeAllowedForRole(role, route){ const xs=RoleRouteAccess[role]||[]; return xs.includes('*') || xs.includes(route); }

/* ── THE DIRECTORY'S VOCABULARY IS THIS FILE'S VOCABULARY ─────────────────────────────
 *
 * DGO_UserDirectory.Role and .Status are Choice columns whose options are exactly the ids
 * below — docs/reference/sharepoint-provisioning-spec.json, DGO_UserDirectory fields 9 and
 * 11: `systemAdmin; userAdmin; executive; director; operator; viewer` and
 * `staged; active; disabled; unregistered`.
 *
 * Every gate here compared those columns with `===`, which turned each one into a spelling
 * test against a value typed into SharePoint by a person:
 *
 *     Role   'Administrator'  ->  no row in RoleRouteAccess -> [] -> EVERY route denied
 *     Role   'SystemAdmin'    ->  same, for a capital letter
 *     Status 'Active'         ->  !== 'active'              -> EVERY route denied
 *     Status 'staged'         ->  a value the PROVISIONING SPEC DEFINES and this runtime
 *                                 was never taught, so it denied everything too
 *
 * All four produced one screen — "Access denied · Your current role cannot open this
 * workspace" — with an empty sidebar, because shared/shell.js filters the navigation
 * through this same predicate, and a role granted nothing has nothing to navigate to. In
 * three of the four cases the sentence blamed the role, and the role was not the problem.
 * Meanwhile modules/user-admin.js rendered any status that was not exactly 'disabled' as a
 * green "Active" pill, so the administration screen showed the locked-out user as fine.
 *
 * Folding is IDENTITY-PRESERVING. It recognises another spelling of a role that exists; it
 * invents nothing for a value that names no role. 'Administrator' deliberately does NOT
 * resolve: this platform has two administrators — systemAdmin and userAdmin — and a label
 * that cannot tell them apart must never be resolved to the larger of the two. Unresolved
 * stays unresolved, and is now REPORTED (see explainAccess) instead of being rendered as an
 * accusation against the role.
 */
const fold = v => String(v ?? '').trim().toLowerCase().replace(/[\s._\-\/]+/g, '');

/* Built from the tables above rather than restated beside them, so a role added to Roles
   cannot be missing here. Lazy because `Roles` is declared further down this file. */
let _roleIndex = null;
function roleIndex(){
  if (_roleIndex) return _roleIndex;
  _roleIndex = new Map();
  for (const id of Object.keys(RoleRouteAccess)) _roleIndex.set(fold(id), id);
  for (const role of Object.values(Roles)) { const key = fold(role.label); if (!_roleIndex.has(key)) _roleIndex.set(key, role.id); }
  return _roleIndex;
}

/** The canonical role id a directory value names, or null when it names none. */
export function canonicalRole(value){
  return roleIndex().get(fold(value)) || null;
}

/** The four Status options DGO_UserDirectory is provisioned with. */
export const UserStatuses = Object.freeze(['staged','active','disabled','unregistered']);
/* Two spellings that mean a provisioned value and nothing else. Anything further would be
   guesswork, and guesswork about a status is guesswork about whether to let someone in. */
const STATUS_ALIASES = Object.freeze({ enabled:'active', inactive:'disabled' });

/** The canonical status a directory value names, or null when it names none. */
export function canonicalStatus(value){
  const key = fold(value);
  if (!key) return null;
  return UserStatuses.find(s => s === key) || STATUS_ALIASES[key] || null;
}

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
/**
 * Why a subject may or may not open a route — the single decision, with its reason kept.
 *
 * canAccess() returns the boolean half of this. The reason half exists because the boolean
 * was the whole problem: the router had a denial and no fact to print, so it printed a
 * guess. Every caller that must TELL somebody why reads this instead.
 *
 * Shape: { allowed, reason, route, role, roleRaw, roleKnown, status, statusRaw }
 */
export function explainAccess(subject, route){
  const user = typeof subject === 'string' ? { persona:subject, role:'', status:'active' } : (subject || {});
  const roleRaw = String(user.role ?? '');
  const statusRaw = String(user.status ?? '');
  const role = roleRaw ? canonicalRole(roleRaw) : '';
  const status = statusRaw ? canonicalStatus(statusRaw) : 'active';
  const base = { route, role: role || '', roleRaw, roleKnown: !roleRaw || Boolean(role), status: status || '', statusRaw };

  if (statusRaw && !status) return { ...base, allowed:false, reason:'status-unknown' };
  if (status !== 'active') return { ...base, allowed:false, reason:`status-${status}` };
  if (roleRaw && !role) return { ...base, allowed:false, reason:'role-unknown' };

  /* A role is authoritative in both directions: it grants what its row lists and denies
     everything else. No fall-through. */
  if (role) { const allowed=routeAllowedForRole(role, route); return { ...base, allowed, reason:allowed ? 'ok' : 'route-denied' }; }

  const persona = user.persona;
  const byPersona =
    persona === 'admin' ? true :
    route === 'user-admin' ? false :
    persona === 'executive' ? !['settings','operator-hud','user-admin'].includes(route) :
    persona === 'general' ? !['executive','settings','operator-hud','diagnostics','user-admin'].includes(route) :
    persona === 'registry' ? route !== 'user-admin' : false;
  return { ...base, allowed:byPersona, reason:byPersona ? 'ok' : 'persona-denied' };
}
/** The boolean face of explainAccess(). One decision, two callers' worth of detail. */
export function canAccess(subject, route) {
  return explainAccess(subject, route).allowed;
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
