// Meetings — ported from the ECM Activity Hub under decision D6(b).
//
// A meeting request, approved or declined, whose agreed actions become ordinary tasks in
// the platform's `operations` collection.
//
// The conversion is the reason this capability is worth porting at all. In the Activity Hub
// it was a remote call and nothing else: with no backend configured it toasted "No backend
// conversion; create tasks manually". Here the conversion happens locally and the tasks are
// real records, so the capability works whether or not a backend answers.

import { saveRegisterRecord, Payloads, attempt, isServerKey } from '../core/server-writes.js';
import { hydrateGovernance, executeOwnedAction } from '../core/governed-actions.js';
import { State } from '../core/state.js';
import { emptyFor, loadFlags, head, kpis, esc, badge, toast, confirmAction, fmtDateTime, mdBack, mdSwitch, resetDetailScroll } from '../core/ui.js';
import { requestSync } from '../core/data-loader.js';
import { UIState, pageSlice, pager } from '../core/ui-state.js';
import { audit } from '../core/enterprise-domain.js';
import { debouncedInput } from '../core/ui-interactions.js';
import { Meetings, MeetingStates } from '../core/executive-register.js';

const LOCATIONS = ['Virtual', 'DG Conference Room', 'Boardroom', 'External venue'];

export async function mount(el) { hydrateGovernance(); render(el); }

function render(el) {
  const s = State.get();
  const u = UIState.get('meetings', { q: '', status: 'All', page: 1, size: 20, selected: null, md: 'list', creating: false, deciding: '', converting: false });
  const all = s.meetings || [];
  const rows = all
    .filter(m => u.status === 'All' || m.status === u.status)
    .filter(m => !u.q || [m.title, m.requestor, m.agenda, m.location].some(v => String(v || '').toLowerCase().includes(u.q.toLowerCase())));
  const p = pageSlice(rows, u.page, u.size);
  const sel = all.find(m => m.id === u.selected);

  el.innerHTML = `<div class="workspace">
    ${head('Meetings', 'Meeting requests, their approval, and the conversion of agreed actions into tracked tasks.')}
    ${kpis([
      ['Total', all.length],
      ['Awaiting decision', all.filter(m => m.status === 'Requested').length],
      ['Approved', all.filter(m => m.status === 'Approved').length],
      ['Held', all.filter(m => m.status === 'Held').length],
    ])}
    <div class="toolbar">
      <input data-q value="${esc(u.q)}" placeholder="Search title, requestor, agenda or location">
      <select data-status><option>All</option>${MeetingStates.map(x => `<option>${esc(x)}</option>`).join('')}</select>
      <button class="btn" data-new>Request a meeting</button>
    </div>
    ${u.creating ? createForm() : ''}
    <div class="split" ${mdSwitch(sel ? u.md : 'list')}>
      <div><div class="list-col">${p.rows.map(m => `
        <article class="list-item ${m.id === sel?.id ? 'active' : ''}" data-select="${esc(m.id)}">
          <div>${badge(m.status)}</div>
          <h4>${esc(m.title)}</h4>
          <div class="meta">${esc(m.date)}${m.time ? ' · ' + esc(m.time) : ''} · ${esc(m.location)}</div>
        </article>`).join('') || emptyFor({ filtered: !!(u.q || u.status !== 'All'), ...loadFlags(s.runtime), noun: 'meetings', createLabel: 'Request a meeting', createAttr: 'data-new-meeting' })}</div>${pager(p)}</div>
      <div class="detail-col panel-stack">${sel ? detail(sel, u, s) : '<section class="panel"><div class="empty dgo-empty"><h2 class="dgo-empty__title">No meeting selected</h2><p>Choose a request from the list to read it, approve or decline it, or turn what was agreed into tasks.</p></div></section>'}</div>
    </div>
  </div>`;

  bind(el, s, u, all, sel);
}

function createForm() {
  return `<section class="panel"><form class="grid" data-create-form>
    <h3 class="wide">Request a meeting</h3>
    <label class="wide">Title *<input name="title" required placeholder="What the meeting is for"></label>
    <label>Date *<input name="date" type="date" required></label>
    <label>Time<input name="time" type="time"></label>
    <label>Location<select name="location">${LOCATIONS.map(l => `<option>${esc(l)}</option>`).join('')}</select></label>
    <label>Requestor<input name="requestor" placeholder="Defaults to you"></label>
    <label class="wide">Agenda<textarea name="agenda" rows="3"></textarea></label>
    <label class="wide">Attendees<textarea name="attendees" rows="2" placeholder="One per line, or comma separated."></textarea></label>
    <div class="wide form-row"><button class="btn">Submit request</button><button type="button" class="btn ghost" data-cancel>Cancel</button></div>
  </form></section>`;
}

function detail(m, u, s) {
  const next = Meetings.nextStates(m);
  const converted = m.actions || [];
  return `${mdBack('Back to meetings')}
  <section class="panel">
    <div class="eyebrow panel-eyebrow">Meeting</div>
    <div class="status-strip">${badge(m.status)}</div>
    <h2>${esc(m.title)}</h2>
    <dl class="detail-grid">
      <dt>When</dt><dd>${esc(m.date)}${m.time ? ' at ' + esc(m.time) : ''}</dd>
      <dt>Where</dt><dd>${esc(m.location)}</dd>
      <dt>Requested by</dt><dd>${esc(m.requestor || '—')}</dd>
      <dt>Logged</dt><dd>${esc(fmtDateTime(m.createdAt))}</dd>
      ${m.decidedAt ? `<dt>Decided</dt><dd>${esc(fmtDateTime(m.decidedAt))} by ${esc(m.decidedBy || '—')}</dd>` : ''}
      ${m.attendees ? `<dt>Attendees</dt><dd>${esc(m.attendees)}</dd>` : ''}
      ${m.agenda ? `<dt>Agenda</dt><dd>${esc(m.agenda)}</dd>` : ''}
    </dl>
    <div class="form-row">
      ${next.includes('Approved') ? '<button type="button" class="btn" data-to="Approved">Approve</button>' : ''}
      ${next.includes('Declined') ? '<button type="button" class="btn ghost" data-to="Declined" style="color:var(--dgo-color-action-danger)">Decline</button>' : ''}
      ${next.includes('Held') ? '<button type="button" class="btn" data-to="Held">Mark as held</button>' : ''}
      ${m.status === 'Approved' || m.status === 'Held' ? `<button type="button" class="btn ghost" data-convert-toggle>${u.converting ? 'Close' : 'Record agreed actions'}</button>` : ''}
      ${next.length || m.status === 'Held' ? '' : '<p class="meta">This request is closed.</p>'}
    </div>
    ${m.decisionComments ? `<p class="meta">${esc(m.decisionComments)}</p>` : ''}
  </section>
  ${u.deciding ? `<section class="panel"><form class="grid" data-decide-form>
    <h3 class="wide">${u.deciding === 'Approved' ? 'Approve' : 'Decline'} this request</h3>
    <label class="wide">Decision note<textarea name="comments" rows="3"></textarea></label>
    <div class="wide form-row"><button class="btn">Record decision</button><button type="button" class="btn ghost" data-decide-cancel>Cancel</button></div>
  </form></section>` : ''}
  ${u.converting ? `<section class="panel"><form class="grid" data-convert-form>
    <h3 class="wide">Agreed actions</h3>
    <label class="wide">One action per line<textarea name="actions" rows="5" required placeholder="Draft the policy note&#10;Circulate the minutes"></textarea></label>
    <label>Owner's e-mail *<input name="owner" type="email" required placeholder="Who carries these actions"></label>
    <label>Due date *<input name="dueDate" type="date" required></label>
    <div class="wide form-row"><button class="btn">Record actions</button><button type="button" class="btn ghost" data-convert-cancel>Cancel</button></div>
    <p class="wide meta">Each line is recorded on the server as an action for the owner, linked to this meeting. The owner is e-mailed a reminder on the due date.</p>
  </form></section>` : ''}
  ${converted.length ? `<section class="panel">
    <h3>Actions from this meeting</h3>
    <ul class="timeline">${converted.map(t => `<li><b>${esc(t.title)}</b><div class="meta">${esc(t.assignedTo || '')}${t.dueDate ? ' · due ' + esc(t.dueDate) : ''}</div></li>`).join('')}</ul>
  </section>` : ''}`;
}

function bind(el, s, u, all, sel) {
  const st = el.querySelector('[data-status]'); if (st) { st.value = u.status; st.onchange = e => { UIState.set('meetings', { status: e.target.value, page: 1 }); render(el); }; }
  debouncedInput(el.querySelector('[data-q]'), v => { UIState.set('meetings', { q: v, page: 1 }); render(el); }, { refind: () => el.querySelector('[data-q]') });
  el.querySelectorAll('[data-select]').forEach(x => x.onclick = () => { UIState.set('meetings', { selected: x.dataset.select, md: 'detail' }); render(el); resetDetailScroll(el); });
  el.querySelector('[data-md-back]')?.addEventListener('click', () => { UIState.set('meetings', { md: 'list' }); render(el); });
  el.querySelectorAll('[data-page]').forEach(x => x.onclick = () => { UIState.set('meetings', { page: +x.dataset.page }); render(el); });
  el.querySelectorAll('[data-new],[data-new-meeting]').forEach(b => b.addEventListener('click', () => { UIState.set('meetings', { creating: true }); render(el); }));
  el.querySelector('[data-cancel]')?.addEventListener('click', () => { UIState.set('meetings', { creating: false }); render(el); });
  /* I-13 — "No meetings in this queue." read the same whether the queue was clear, the filters
     excluded everything, or nothing had loaded. emptyFor() separates the three; these handlers
     are what make each one's action work. loadFlags() reads lastLoad.ok, which is where
     core/data-loader.js actually records a failed load. */
  el.querySelectorAll('[data-clear-filters]').forEach(b => b.addEventListener('click', () => { UIState.set('meetings', { q: '', status: 'All', page: 1 }); render(el); }));
  el.querySelectorAll('[data-retry-load]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await requestSync({ source: 'meetings', mode: 'refresh' }); toast('Meetings reloaded from the server', 'success'); }
    catch { toast('The server could not be reached — nothing was reloaded', 'error'); }
    finally { b.disabled = false; }
    render(el);
  }));
  el.querySelector('[data-convert-toggle]')?.addEventListener('click', () => { UIState.set('meetings', { converting: !u.converting }); render(el); });
  el.querySelector('[data-convert-cancel]')?.addEventListener('click', () => { UIState.set('meetings', { converting: false }); render(el); });

  el.querySelector('[data-create-form]')?.addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    let meeting;
    try { meeting = Meetings.create(d, s.profile.email); }
    catch (err) { return toast(err.reason === 'missing_date' ? 'A meeting needs a date' : 'A meeting needs a title', 'error'); }
    if (!await confirmAction({ title: 'Log this meeting request', body: `<p>${esc(meeting.title)}</p><p class="meta">${esc(meeting.date)} · ${esc(meeting.location)}</p>` })) return;

    /* F-16: created on the server first (upsert-record MTG), and kept here under the key the server issues. */
    let out; try { out = await executeOwnedAction('meetings', 'request-meeting', async () => {
      const w = await saveRegisterRecord('MTG', { ...meeting, creating: true }, { module: 'meetings', title: meeting.title });
      if (!w.ok) return w;
      meeting.id = w.entityKey; meeting.entityKey = w.entityKey;
      const st = State.get();
      State.patch({
        meetings: [meeting, ...(st.meetings || [])],
        audit: [audit('Meeting Requested', 'meeting', meeting.id, { title: meeting.title }, st.profile.email), ...st.audit],
      }, { module: 'meetings', action: 'meetings:request', ref: meeting.id });
      return { ok: true };
    }, { ref: 'new-meeting' }); } catch { return render(el); }
    if (!out.ok) return toast(out.message, 'error');

    UIState.set('meetings', { creating: false, selected: meeting.id, md: 'detail' });
    toast('Meeting request logged on the server', 'success');
    render(el);
  });

  el.querySelectorAll('[data-to]').forEach(b => b.onclick = () => {
    // Marking held needs no note; a decision does, so it opens the inline form instead.
    if (b.dataset.to === 'Held') return apply(el, s, all, sel, 'Held', '');
    UIState.set('meetings', { deciding: b.dataset.to });
    render(el);
  });
  el.querySelector('[data-decide-cancel]')?.addEventListener('click', () => { UIState.set('meetings', { deciding: '' }); render(el); });
  el.querySelector('[data-decide-form]')?.addEventListener('submit', e => {
    e.preventDefault();
    apply(el, s, all, sel, u.deciding, Object.fromEntries(new FormData(e.target)).comments || '');
  });

  el.querySelector('[data-convert-form]')?.addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    convert(el, s, sel, d.actions, d.dueDate, d.owner);
  });
}

async function apply(el, s, all, sel, to, comments) {
  const verb = { Approved: 'Approve', Declined: 'Decline', Held: 'Mark as held' }[to] || to;
  if (!await confirmAction({ title: `${verb} this meeting`, body: `<p>${esc(sel.title)}</p>` })) return;

  let next;
  try {
    next = Meetings.transition(sel, to, { comments, by: s.profile.email });
  } catch (err) {
    return toast(err.reason === 'illegal_transition'
      ? 'That is not a legal step for this meeting' : err.message, 'error');
  }

  /* transition_status names a document, not a meeting, so the flow answered 404. The step is recorded against the
     meeting's key on the server before it is shown. */
  let out; try { out = await executeOwnedAction('meetings', 'decide-meeting', async () => {
    const w = await saveRegisterRecord('MTG', sel, { module: 'meetings', title: next.title, status: to });
    if (!w.ok) return w;
    const st = State.get();
    State.patch({
      meetings: (st.meetings || []).map(m => m.id === sel.id ? { ...next, deviceOnly: !!w.deviceOnly } : m),
      audit: [audit(`Meeting ${to}`, 'meeting', sel.id, { from: sel.status, to }, st.profile.email), ...st.audit],
    }, { module: 'meetings', action: `meetings:${to.toLowerCase()}`, ref: sel.id });
    return w;
  }, { ref: sel.id }); } catch { return render(el); }
  if (!out.ok) return toast(out.message, 'error');

  UIState.set('meetings', { deciding: '' });
  toast(out.deviceOnly ? `Meeting ${to.toLowerCase()}. ${out.message}` : `Meeting ${to.toLowerCase()}, recorded on the server`, 'success');
  render(el);
}

/* F-16, F-20: "actions to tasks" sent each one as upsert_record, which the flow refuses, so the tasks existed on one device
   only. A task on the server is created from a document in the Assignment Desk; a meeting's agreed action is recorded as
   a reminder (upsert-record RMD) for its owner, linked to the meeting, which the daily sweep e-mails on the due date. */
async function convert(el, s, sel, actions, dueDate, owner) {
  let tasks;
  try { tasks = Meetings.actionsToTasks(sel, actions, { by: s.profile.email, dueDate }); }
  catch (err) { return toast(err.reason === 'no_actions' ? 'Enter at least one action' : err.message, 'error'); }
  const assignedTo = String(owner || '').trim();
  if (!/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(assignedTo)) return toast('Give the owner\'s e-mail address', 'error');
  if (!dueDate) return toast('Give a due date', 'error');
  if (!await confirmAction({
    title: `Record ${tasks.length} action${tasks.length === 1 ? '' : 's'} from this meeting`,
    body: `<ul>${tasks.map(t => `<li>${esc(t.title)}</li>`).join('')}</ul><p class="meta">Each is recorded on the server for ${esc(assignedTo)}, due ${esc(dueDate)}, who is e-mailed a reminder that day.</p>`,
    confirmText: 'Record actions', cancelText: 'Cancel',
  })) return;
  const dueAt = new Date(`${dueDate}T08:00:00+01:00`).toISOString();
  let out; try { out = await executeOwnedAction('meetings', 'meeting-actions-to-tasks', async () => {
    const done = [];
    for (const t of tasks) {
      const w = await attempt(Payloads.record('RMD', { title: t.title, ref: sel.title, assignedTo, dueAt, parentKey: isServerKey(sel.entityKey) ? `MTG:${sel.entityKey}` : '', text: `Agreed at: ${sel.title}` }), { module: 'meetings', ref: sel.id });
      if (!w.ok) return { ...w, done };
      done.push({ id: w.data.entityKey, title: t.title, assignedTo, dueDate });
    }
    const st = State.get();
    State.patch({
      meetings: (st.meetings || []).map(m => m.id === sel.id ? { ...m, actions: [...(m.actions || []), ...done] } : m),
      audit: [audit('Meeting Actions Recorded', 'meeting', sel.id, { actions: done.length }, st.profile.email), ...st.audit],
    }, { module: 'meetings', action: 'meetings:actions-to-tasks', ref: sel.id });
    return { ok: true, done };
  }, { ref: sel.id }); } catch { return render(el); }
  if (!out.ok) return toast(`${out.message}${out.done?.length ? ` (${out.done.length} recorded before it stopped.)` : ''}`, 'error');
  UIState.set('meetings', { converting: false });
  toast(`${tasks.length} action${tasks.length === 1 ? '' : 's'} recorded on the server`, 'success');
  render(el);
}
