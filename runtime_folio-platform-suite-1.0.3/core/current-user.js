import { State } from './state.js';
import { AuditLog } from './audit-log.js';
import { Roles, RoleList, Permissions, RoleRouteAccess, UserStatuses, canAccess as canAccessSubject, canonicalRole, canonicalStatus, explainAccess } from '../config/rbac.config.js';
import { isAuthEnforced } from '../config/auth.config.js';
import { getIdentity } from './auth.js';

export const BOOTSTRAP_ADMIN_EMAIL = 'dgsregistry@nitda.gov.ng';

export function normalizeEmail(email=''){
  return String(email||'').trim().toLowerCase();
}

export function roleToPersona(role='viewer'){
  const r=String(role||'viewer');
  if(r==='systemAdmin'||r==='userAdmin') return 'admin';
  if(r==='executive') return 'executive';
  if(r==='director'||r==='operator') return 'registry';
  return 'general';
}

/* I-08 / I-19 — a persona is stored as a lowercase slug and was rendered as one in three
   places: the sidebar identity block, the top-bar persona button and the Administration
   form. Users read the identity block to confirm they are acting as the right person, and
   "admin" is a database value, not a role a person recognises as theirs. */
const PERSONA_LABELS=Object.freeze({admin:'Administrator',executive:'Executive',registry:'Registry Officer',general:'Officer'});
export function personaLabel(persona=''){
  const p=String(persona||'').trim();
  return PERSONA_LABELS[p] || (p ? p.charAt(0).toUpperCase()+p.slice(1) : 'Officer');
}

/* I-19 — a shared mailbox is not a person, and greeting one by name reads as an error.
   The bootstrap identity is the registry mailbox; greet the workspace, not the account. */
export function isSharedAccount(user){
  return !user || user.pilotCohort==='bootstrap' || /^bootstrap-/.test(String(user.id||''));
}

export function bootstrapAdmin(profile={}){
  const email=normalizeEmail(profile.email||BOOTSTRAP_ADMIN_EMAIL);
  return {
    id:'bootstrap-registry-admin',
    fullName: profile.name || 'Registry',
    email,
    directorate:'Registry',
    department:'Office of the Director-General',
    unit:'Digital Operations',
    jobTitle:'Bootstrap Administrator',
    role:'systemAdmin',
    persona:'admin',
    status:'active',
    accessScope:['all'],
    pilotCohort:'bootstrap',
    createdAt:new Date().toISOString(),
    createdBy:'system-bootstrap'
  };
}

export function normalizeUserRecord(user={}, profile={}){
  // The role NEVER falls back to the local profile's persona.
  //
  // This previously read `(profile.persona==='admin' ? 'systemAdmin' : 'viewer')`, and the
  // packaged default profile in core/state.js carries `persona:'admin'`. So any directory
  // row that arrived without a Role — which was every row, until normalizeUser learned to
  // read the `Role` column — resolved to systemAdmin against a profile object the user
  // controls. An absent role is an unknown role, and an unknown role is `viewer`.
  //
  // The role is also RESOLVED rather than compared. DGO_UserDirectory stores it in a Choice
  // column, and config/rbac.config.js gates on the canonical spelling, so 'SystemAdmin' or
  // 'System Administrator' used to mean "no row in RoleRouteAccess" — which denies every
  // route in the platform, including home, and empties the sidebar with it. A value that
  // names no role at all still lands on 'viewer', the least-privileged role there is; the
  // original value and the fact that it was not recognised ride along on the record so the
  // denial screen can say what is wrong instead of guessing.
  const rawRole=user.roleRaw ?? (user.role || profile.role || '');
  const role=(rawRole ? canonicalRole(rawRole) : '') || 'viewer';
  const roleKnown=user.roleKnown ?? (!rawRole || Boolean(canonicalRole(rawRole)));
  const rawStatus=user.statusRaw ?? (user.status || '');
  const status=(rawStatus ? canonicalStatus(rawStatus) : '') || rawStatus || 'active';
  const statusKnown=user.statusKnown ?? (!rawStatus || Boolean(canonicalStatus(rawStatus)));
  const persona=user.persona || profile.persona || roleToPersona(role);
  return {
    id:user.id || normalizeEmail(user.email||profile.email) || crypto.randomUUID?.() || String(Date.now()),
    fullName:user.fullName || user.name || profile.name || user.email || profile.email || 'Unknown user',
    email:normalizeEmail(user.email || profile.email),
    directorate:user.directorate || user.department || profile.department || '',
    department:user.department || '',
    unit:user.unit || '',
    jobTitle:user.jobTitle || '',
    phone:user.phone || '',
    role,
    roleRaw:rawRole,
    roleKnown,
    persona,
    status,
    statusRaw:rawStatus,
    statusKnown,
    accessScope:Array.isArray(user.accessScope)?user.accessScope:(user.accessScope?String(user.accessScope).split(',').map(x=>x.trim()).filter(Boolean):[]),
    pilotCohort:user.pilotCohort || user.cohort || '',
    createdAt:user.createdAt || new Date().toISOString(),
    updatedAt:user.updatedAt || '',
    disabledReason:user.disabledReason || '',
    createdBy:user.createdBy || '',
    updatedBy:user.updatedBy || ''
  };
}

export function getCurrentUser(state=State.get()){
  // Enforced posture: identity and role come from the validated token, never from local
  // state. This is what closes the viewer -> systemAdmin escalation: editing localStorage
  // no longer influences the effective role, because the role is not read from there.
  if(isAuthEnforced()){
    const id=getIdentity();
    if(!id.email || !id.role){
      return normalizeUserRecord({id:'unauthenticated',email:id.email||'',fullName:id.name||'',role:'viewer',persona:'general',status:'unregistered'},{});
    }
    return {...normalizeUserRecord({id:id.email,email:id.email,fullName:id.name,role:id.role,persona:roleToPersona(id.role),status:'active'},{}), registered:true, verified:true, source:'token-claims'};
  }
  const profile=state.profile||{};
  const users=Array.isArray(state.users)?state.users:[];
  const email=normalizeEmail(profile.email);

  // Has DGO_UserDirectory ever been served to this browser? core/data-loader.js records it
  // the moment a backend response carries a users collection.
  //
  // This distinction is the whole safety property. Before it, `!users.length` meant
  // "nobody has configured users yet, so hand this browser a bootstrap administrator" —
  // and it could not tell that apart from "the directory answered, and you are not in it".
  // A backend returning `users: []` therefore promoted every caller to systemAdmin with
  // accessScope ['all']. The bootstrap is for a platform that has never had a directory,
  // never for one whose directory does not list you.
  const directoryServed = state.runtime?.directory?.served === true;

  if(!users.length){
    if(directoryServed){
      return normalizeUserRecord({id:'unregistered-current-user',email,fullName:profile.name||email,role:'viewer',persona:'general',status:'unregistered'}, profile);
    }
    return {...bootstrapAdmin(profile), bootstrap:true, registered:true};
  }
  const found=users.find(u=>normalizeEmail(u.email)===email);
  if(!found){
    return normalizeUserRecord({id:'unregistered-current-user',email,fullName:profile.name||email,role:'viewer',persona:'general',status:'unregistered'}, profile);
  }
  return {...normalizeUserRecord(found, profile), registered:true};
}

export function hasPermission(user, permission){
  if(!user || user.status!=='active') return false;
  const role=Roles[user.role];
  return role?.permissions?.includes(permission) || role?.permissions?.includes('*') || false;
}

export function canManageUsers(user=getCurrentUser()){
  return hasPermission(user, Permissions.USER_CREATE) || hasPermission(user, Permissions.ROLE_ASSIGN);
}

export function canCurrentUserAccess(route, state=State.get()){
  return canAccessSubject(getCurrentUser(state), route);
}

/**
 * What to tell somebody the workspace has just refused, and what to do about it.
 *
 * core/router.js printed one sentence for every denial that was not an outright disabled or
 * unregistered record: "Your current role cannot open this workspace." Three of the four ways
 * a real directory row gets refused are not about the role at all — a staged enrollment, a
 * status the runtime does not know, a role spelt differently in SharePoint — and in each of
 * them that sentence sent the reader to change the wrong column. Worse, every one of them
 * denies EVERY route, so the sidebar empties too and there is nothing left on screen to
 * disagree with.
 *
 * Returns plain strings. The caller escapes and renders them.
 */
export function accessDenial(route, state=State.get()){
  const user=getCurrentUser(state);
  const why=explainAccess(user, route);
  const who=user.email || user.fullName || 'this account';
  const row=`DGO_UserDirectory · ${who}`;
  const roleName=Roles[why.role]?.label || why.role || 'none';
  switch(why.reason){
    case 'status-staged':
      return {title:'Access denied', message:'Your directory record is staged, not active. Enrollment was prepared for you but never switched on, so the workspace stays closed.',
              detail:`${row} · Status is “staged”. An administrator sets it to “active” to let you in.`};
    case 'status-disabled':
      return {title:'Access denied', message:'This pilot user is disabled.',
              detail:user.disabledReason ? `${row} · ${user.disabledReason}` : `${row} · Status is “disabled”.`};
    case 'status-unregistered':
      return {title:'Access denied', message:'This profile is not enrolled for the pilot.',
              detail:`${row} · no row carries this address.`};
    case 'status-unknown':
      return {title:'Access denied', message:'Your directory record carries a status this platform does not recognise, so it cannot tell whether to let you in.',
              detail:`${row} · Status is “${why.statusRaw}”. It has to be one of: ${UserStatuses.join(', ')}.`};
    case 'role-unknown':
      return {title:'Access denied', message:'Your directory record carries a role this platform does not recognise.',
              detail:`${row} · Role is “${why.roleRaw}”. It has to be one of: ${RoleList.map(r=>r.id).join(', ')}.`};
    case 'route-denied':
      return {title:'Access denied',
              message:why.roleKnown
                ? `Your role — ${roleName} — does not open this workspace.`
                : `Your directory role “${why.roleRaw}” is not one this platform knows, so you are being treated as a ${roleName} until it is corrected.`,
              detail:why.roleKnown
                ? `A ${roleName} opens: ${(RoleRouteAccess[why.role]||[]).join(', ')}.`
                : `${row} · Role has to be one of: ${RoleList.map(r=>r.id).join(', ')}.`};
    default:
      return {title:'Access denied', message:'Your current role cannot open this workspace.', detail:''};
  }
}

export function ensureCurrentUserActive(action='open-workspace'){
  const user=getCurrentUser();
  if(user.status==='active') return user;
  AuditLog.record({event:'audit:access-denied',actor:State.get().profile||{},ref:user.email||'',meta:{reason:user.status, action}});
  throw new Error(user.status==='disabled'?'User account is disabled.':'User is not enrolled for this pilot.');
}

export function userSummary(user=getCurrentUser()){
  return `${user.fullName||user.email} · ${user.role} · ${user.status}`;
}
