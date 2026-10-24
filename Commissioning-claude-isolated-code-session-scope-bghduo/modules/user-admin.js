import { hydrateGovernance, executeOwnedAction } from '../core/governed-actions.js';
import { State } from '../core/state.js';
import { head, esc, toast, confirmAction, emptyFor, loadFlags, focusField } from '../core/ui.js';
import { UIState } from '../core/ui-state.js';
import { RoleList, RolePersonaMap } from '../config/rbac.config.js';
import { capRows, RenderBudget } from '../core/render-budget.js';
import { getCurrentUser, canManageUsers, normalizeEmail, roleToPersona, personaLabel } from '../core/current-user.js';

/* I-19 — roles and access groups were shown as lowercase system slugs ('admin', 'viewer')
   in six places on this screen: the access-group select, the users table, the capability
   matrix, the actor line under the form, and both sides of the role-change confirmation.
   Users read these to confirm they are granting the access they think they are, and a
   database value is not a role a person recognises. roleLabel() reads the label already
   carried in config/rbac.config.js; personaLabel() is the existing shared helper, used here
   rather than a second mapping so the sidebar, the top bar and this screen cannot drift. */
const roleLabel = id => RoleList.find(r => r.id === id)?.label || String(id || '—');
const statusLabel = v => String(v || 'active') === 'disabled' ? 'Disabled' : 'Active';
import { invoke } from '../core/api.js';
import { PendingQueue } from '../core/pending-queue.js';
export async function mount(el){hydrateGovernance();render(el); }
const split=x=>String(x||'').split(',').map(s=>s.trim()).filter(Boolean);
async function persistUserMutation(operation,user){
  try{ await invoke('DYNAMIC_ACTIONS',{operation:'user-admin:'+operation,module:'user-admin',user}); }
  catch(e){ PendingQueue.enqueue({key:'DYNAMIC_ACTIONS',operation:'user-admin:'+operation,payload:{user},ref:user.email,error:e.message,retryable:true,queueType:'user-admin'}); }
}
function userForm(editing, actor){
  const role=editing?.role||'viewer', persona=editing?.persona||RolePersonaMap[role]||roleToPersona(role);
  return `<form class="grid" id="ua-form">
    <label>Full Name<input name="fullName" value="${esc(editing?.fullName || '')}" required><small class="meta">Required — the name shown on records this person assigns or approves.</small></label>
    <label>Email<input name="email" type="email" value="${esc(editing?.email || '')}" required><small class="meta">Required — their official email address. This is how they sign in and where their notices go.</small></label>
    <label>Directorate / DSU<input name="directorate" value="${esc(editing?.directorate || '')}"></label>
    <label>Department<input name="department" value="${esc(editing?.department || '')}"></label>
    <label>Unit<input name="unit" value="${esc(editing?.unit || '')}"></label>
    <label>Job Title<input name="jobTitle" value="${esc(editing?.jobTitle || '')}"></label>
    <label>Phone / Support Contact<input name="phone" value="${esc(editing?.phone || '')}"></label>
    <label>Pilot Cohort<input name="pilotCohort" value="${esc(editing?.pilotCohort || '')}" placeholder="Cohort 1"></label>
    <label>Role<select name="role">${RoleList.map(r => `<option value="${r.id}" ${role === r.id ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select><small class="meta">What this person is allowed to do. The capability list at the bottom of this screen shows exactly what each role grants.</small></label>
    <label>Access group<select name="persona">${Object.entries(RolePersonaMap).map(([,p])=>p).filter((v,i,a)=>a.indexOf(v)===i).map(p=>`<option value="${p}" ${persona===p?'selected':''}>${esc(personaLabel(p))}</option>`).join('')}</select><small class="meta">Which set of screens this person sees. It normally follows the role above — change it only when someone needs a different view.</small></label>
    <label>Status<select name="status"><option value="active" ${editing?.status !== 'disabled' ? 'selected' : ''}>Active</option><option value="disabled" ${editing?.status === 'disabled' ? 'selected' : ''}>Disabled</option></select></label>
    <label class="wide">Access Scope<input name="accessScope" value="${esc((editing?.accessScope||[]).join?.(', ') || editing?.accessScope || '')}" placeholder="all, Registry, Operations"></label>
    <label class="wide">Reason for disabling<input name="disabledReason" value="${esc(editing?.disabledReason || '')}" placeholder="Why access is being withdrawn"><small class="meta">Fill this in when you set the status to Disabled — it is kept in the audit trail.</small></label>
    <div class="wide"><button class="btn">${editing ? 'Save changes' : 'Add this person'}</button> <button type="button" class="btn ghost" data-clear>${editing ? 'Cancel editing' : 'Clear the form'}</button><p class="meta">You are signed in as ${esc(actor.fullName||actor.email)} · ${esc(roleLabel(actor.role))} · ${esc(statusLabel(actor.status))}. Every change on this screen is recorded against you.</p></div>
  </form>`;
}
function render(el) {
  const s = State.get(); const users = s.users||[];
  const actor=getCurrentUser(s);
  if(!canManageUsers(actor)){ el.innerHTML=`<div class="workspace">${head('User Administration','The people who can sign in, and what each of them is allowed to do.')}<section class="panel"><div class="empty dgo-empty"><h2 class="dgo-empty__title">You cannot manage users</h2><p>Your role, ${esc(roleLabel(actor.role))}, does not include managing people and access. Nothing on this screen is hidden from you by mistake.</p><p>Ask a System Administrator if you need this access.</p></div></section></div>`; return; }
  const u = UIState.get('user-admin', { editing: null });
  const editing = users.find(x => x.id === u.editing) || null;
  const { failed, loaded } = loadFlags(s.runtime);
  el.innerHTML = `<div class="workspace">${head('User Administration','The people who can sign in, and what each of them is allowed to do.')}
    <section class="panel"><div class="eyebrow panel-eyebrow">Restricted · IT and user administrators</div>
      <p class="meta">Add people, set what they are allowed to do, and withdraw access. Changes take effect the next time the person loads the workspace, and every one of them is recorded against your name. Connection and service checks live on <a href="#/diagnostics">System Health (IT only)</a>.</p></section>
    <div class="split user-admin-split"><div class="detail-col panel">
      <div class="eyebrow panel-eyebrow">Add or edit a person</div>
      ${userForm(editing, actor)}</div>
    <div class="panel"><div class="eyebrow panel-eyebrow">People and their access</div>
      ${users.length ? `<div class="tablewrap dgo-table-wrap"><table class="dgo-table"><thead><tr><th>Name</th><th>Email</th><th>Directorate</th><th>Role</th><th>Access group</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        ${capRows(users, RenderBudget.tableRows).map(x => `<tr class="${editing?.id === x.id ? 'row-active' : ''}"><td>${esc(x.fullName || '—')}</td><td>${esc(x.email)}</td><td>${esc(x.directorate || '—')}</td><td>${esc(roleLabel(x.role))}</td><td>${esc(personaLabel(x.persona||RolePersonaMap[x.role]||'general'))}</td><td><span class="pill ${x.status === 'disabled' ? 'danger' : 'ok'}">${esc(statusLabel(x.status))}</span></td>
        <td><button class="btn ghost compact" data-edit="${esc(x.id)}">Edit</button> <button class="btn ghost compact" data-disable="${esc(x.id)}" ${x.status === 'disabled' ? 'disabled' : ''}>Withdraw access</button></td></tr>`).join('')}
        </tbody></table></div>` : emptyFor({ failed, loaded, noun: 'users', createLabel: 'Add the first user', createAttr: 'data-focus-form' })}
      </div></div>
    <div class="panel stack-panel"><div class="eyebrow panel-eyebrow">What each role can do</div>
      <p class="meta">What each role is allowed to do. Use this to check a role before you assign it.</p>
      ${RoleList.map(r => `<details class="role-details"><summary><b>${esc(r.label)}</b> · ${r.permissions.length} permission${r.permissions.length===1?'':'s'} · sees the ${esc(personaLabel(RolePersonaMap[r.id]||roleToPersona(r.id)))} screens</summary>
        <div class="chips">${r.permissions.length ? r.permissions.map(p => `<span class="chip">${esc(p)}</span>`).join('') : '<span class="chip">Can read only — no elevated permissions</span>'}</div></details>`).join('')}
    </div></div>`;
  const form=el.querySelector('#ua-form');
  form.onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    if (!d.email.includes('@')) { focusField(e.target, 'email'); toast('Email — enter a valid email address. This is how the person signs in and where their notices go.', 'error'); return; }
    const previous=editing||{}; const email=normalizeEmail(d.email);
    const rec = { id: editing?.id || crypto.randomUUID(), fullName: d.fullName.trim(), email, directorate: d.directorate.trim(), department:d.department.trim(), unit:d.unit.trim(), jobTitle:d.jobTitle.trim(), phone:d.phone.trim(), role: d.role, persona: d.persona || RolePersonaMap[d.role] || roleToPersona(d.role), status: d.status, accessScope: split(d.accessScope), pilotCohort:d.pilotCohort.trim(), disabledReason:d.status==='disabled'?d.disabledReason.trim():'', createdAt: editing?.createdAt || new Date().toISOString(), createdBy: editing?.createdBy || actor.email, updatedAt:new Date().toISOString(), updatedBy:actor.email };
    const list = editing ? users.map(x => x.id === rec.id ? rec : x) : [...users, rec];
    const roleChanged=editing && (previous.role!==rec.role || previous.persona!==rec.persona);
    const action = editing ? (roleChanged ? 'assign-role' : 'update-user') : 'create-user';
    if(roleChanged && !await confirmAction({title:'Change this person’s access',body:`<p><b>${esc(rec.fullName||rec.email)}</b> changes from <b>${esc(previous.role?roleLabel(previous.role):'no role')}</b> to <b>${esc(roleLabel(rec.role))}</b>, and will see the ${esc(personaLabel(rec.persona))} screens.</p><p class="meta">This takes effect the next time they load the workspace, and is recorded against your name.</p>`,confirmText:'Change access',cancelText:'Cancel'})) return;
    await executeOwnedAction('user-admin', action, async () => { State.patch({ users: list }, { module: 'user-admin', action: 'user:'+action, ref: rec.email, event: action==='assign-role'?'audit:user-role-assigned':undefined }); await persistUserMutation(action, rec); }, { ref: rec.email, meta:{previousRole:previous.role||'',newRole:rec.role,previousPersona:previous.persona||'',newPersona:rec.persona} });
    UIState.set('user-admin', { editing: null }); toast(`${editing?'Saved':'Added'} ${rec.fullName||rec.email} as ${roleLabel(rec.role)}`, 'success'); render(el);
  };
  el.querySelector('[data-clear]').onclick = () => { UIState.set('user-admin', { editing: null }); render(el); };
  // I-13 — the three arms of the empty state each offer one action, so each needs a handler.
  el.querySelector('[data-focus-form]')?.addEventListener('click', () => focusField(form, 'fullName'));
  el.querySelectorAll('[data-retry-load]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { const { requestSync } = await import('../core/data-loader.js'); await requestSync({ source: 'user-admin', mode: 'refresh' }); toast('User list reloaded from the registry', 'success'); }
    catch { toast('The registry could not be reached — the user list was not reloaded', 'error'); }
    finally { b.disabled = false; }
    render(el);
  });
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { UIState.set('user-admin', { editing: b.dataset.edit }); render(el); });
  el.querySelectorAll('[data-disable]').forEach(b => b.onclick = async () => {
    const x = users.find(y => y.id === b.dataset.disable); if (!x) return;
    if (!await confirmAction({ title: 'Withdraw this person’s access', body: `<p>Withdraw access for <b>${esc(x.fullName || x.email)}</b> (${esc(roleLabel(x.role))})?</p><p>They will not be able to open the workspace or act on any record. Work already assigned to them stays assigned — reassign it separately if someone else must take it on.</p><p class="meta">You can restore access later by setting their status back to Active.</p>`, confirmText:'Withdraw access', cancelText:'Cancel' })) return;
    const row={...x,status:'disabled',disabledReason:'Disabled by '+actor.email,updatedAt:new Date().toISOString(),updatedBy:actor.email};
    await executeOwnedAction('user-admin', 'disable-user', async () => { State.patch({ users: users.map(y => y.id === x.id ? row : y) }, { module: 'user-admin', action: 'user:disable', ref: x.email }); await persistUserMutation('disable-user', row); }, { ref: x.email });
    toast(`Access withdrawn for ${x.fullName || x.email}`, 'success'); render(el);
  });
}
