/**
 * Module rationalisation (docs/architecture/MODULE_RATIONALISATION.md): the report's own reproductions, run against the
 * fixed code. §8.1 and §8.2 showed one task and one document holding two statuses (F-2); §8.5 showed a load wiping what
 * the screens had done (F-17). Each now holds, plus the archive bundle surviving a load (F-19), one overdue rule (F-9),
 * the retry rule (F-22) and the 13-workspace navigation (Phase 2).
 */
globalThis.localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, querySelector() { return null; }, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; }, body: { appendChild() {} } };

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
console.log('\nModule rationalisation: the reproductions, against the fixed code\n');

const { State } = await import('../core/state.js');
const ED = await import('../core/enterprise-domain.js');
const { applyFetchAll } = await import('../core/data-loader.js');

/* §8.1 — a task completed in My Work and the Activities copy */
State.patch({ activities: [], tracking: [{ id: '9', sourceId: 9, referenceId: 'R1', title: 'x', status: 'In Progress', due: '2026-01-01' }] });
ok(State.get().operations[0]?.status === 'In Progress', '§8.1: after load, the task and its view agree (In Progress)');
const u = ED.updateTaskState(State.get(), '9', { status: 'Completed' }, 'a@b', { surface: 'orchestrator' });
State.patch(u.patch);
ok(State.get().tracking[0].status === 'Completed' && State.get().operations[0].status === 'Completed', '§8.1 (F-2): after My Work completes it, the Activities view says Completed too', State.get().operations[0]?.status);

/* §8.2 — a document marked Treated and the Intake copy */
State.patch({ activities: [{ id: '22001', sourceId: 22001, title: 'Letter', status: 'Not Treated' }] });
ok(State.get().correspondence.find((c) => c.id === '22001')?.status === 'Received', '§8.2: a Not Treated document reads Received in Intake');
State.patch({ activities: [{ id: '22001', sourceId: 22001, title: 'Letter', status: 'Treated' }] });
ok(State.get().correspondence.find((c) => c.id === '22001')?.status === 'In Treatment', '§8.2 (F-2): once Treated on the server, Intake reads In Treatment, not Received', State.get().correspondence.find((c) => c.id === '22001')?.status);
State.patch({ correspondence: State.get().correspondence.map((c) => c.id === '22001' ? { ...c, status: 'Accepted' } : c) });
State.patch({ activities: [{ id: '22001', sourceId: 22001, title: 'Letter', status: 'Not Treated' }] });
ok(State.get().correspondence.find((c) => c.id === '22001')?.status === 'Received', 'F-2: a finer status set on this device does not outlast the server setting the document back to Not Treated');

/* A decision recorded on the server, read back on another device */
State.patch({ activities: [{ id: '22002', sourceId: 22002, entityKey: '1ddddddd-0000-4000-8000-00000000000d', title: 'Invitation', status: 'Not Treated' }], approvals: [{ id: 'k1', entityKey: 'k1', parentKey: 'OPS:1ddddddd-0000-4000-8000-00000000000d', title: 'DG/CEO decision: Invitation', status: 'delegated', ts: '2026-10-20T08:00:00Z' }] });
const dec = State.get().correspondence.find((c) => c.id === '22002');
ok(dec?.status === 'Delegated' && dec?.decidedBy === 'DG/CEO hub', 'F-4, F-18: a decision recorded on the server (APR naming the document) is the record\'s status everywhere, and says which screen decided it', JSON.stringify({ s: dec?.status, by: dec?.decidedBy }));

/* Records logged in Folio (register) join Intake's list */
State.patch({ portalRegister: [{ id: 'NITDA-2026-00030', referenceId: 'NITDA-2026-00030', entityKey: '2eeeeeee-0000-4000-8000-00000000000e', subject: 'Memo', channel: 'internal', status: 'received' }, { id: 'NITDA-2026-00031', referenceId: 'NITDA-2026-00031', channel: 'portal', subject: 'Portal' }] });
const ids = State.get().correspondence.map((c) => c.id);
ok(ids.includes('NITDA-2026-00030') && !ids.includes('NITDA-2026-00031'), 'F-16: a memo logged in Folio (register) is in Intake\'s list; a portal submission keeps its own tab');

/* §8.5 — a load does not wipe what the screens did */
const server = { status: { http: 200 }, data: { docs: [{ ID: 1, Title: 'Doc', Status: { Value: 'Not Treated' } }], tasks: [{ ID: 9, Title: 'Task', Progress: { Value: 'Completed' }, EntityKey: '1ccccccc-0000-4000-8000-00000000000c' }], comments: [{ ID: 5, Title: 'R1', Description: 'Recorded minute', RefIDD: 'R1' }], approvals: [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', entityKey: 'aaaaaaaa-0000-4000-8000-000000000001', title: 'Travel', status: 'approved' }], briefs: [{ id: 'bbbbbbbb-0000-4000-8000-000000000002', entityKey: 'bbbbbbbb-0000-4000-8000-000000000002', title: 'Brief' }] } };
State.patch({ comments: [{ id: 'local-1', referenceId: 'R9', body: 'A note with no task', deviceOnly: true }], approvals: [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', title: 'Travel', status: 'approved', minute: 'Go ahead', summary: 'Lagos, 3 days' }], briefs: [{ id: 'bbbbbbbb-0000-4000-8000-000000000002', title: 'Brief', status: 'Submitted' }] });
try { applyFetchAll(server); } catch (e) { ok(false, 'applyFetchAll runs', e.message); }
const st = State.get();
ok(st.tracking.find((t) => String(t.sourceId) === '9')?.status === 'Completed', '§8.5 (F-17): a task completed on the server stays Completed after a load', JSON.stringify(st.tracking.map((t) => [t.sourceId, t.status])));
ok(st.comments.some((c) => c.body === 'Recorded minute') && st.comments.some((c) => c.id === 'local-1' && c.deviceOnly), '§8.5 (F-17): the server\'s comments load, and a comment kept on this device only is not wiped');
const ap = st.approvals.find((a) => a.id === 'aaaaaaaa-0000-4000-8000-000000000001');
ok(ap?.status === 'approved' && ap?.minute === 'Go ahead' && ap?.summary === 'Lagos, 3 days', '§8.5 (F-17, F-18): an approval keeps its server decision and this device\'s minute and summary after a load', JSON.stringify(ap));
ok(st.briefs.find((b) => b.id === 'bbbbbbbb-0000-4000-8000-000000000002')?.status === 'Submitted', 'a brief\'s status set here is not reset by a load of the register, which holds only its title');
ok(st.tracking.find((t) => String(t.sourceId) === '9')?.entityKey === '1ccccccc-0000-4000-8000-00000000000c', 'tasks carry their server key, which a minute needs as parentKey');
ok(!JSON.parse(localStorage.getItem(Object.keys(localStorage._s)[0]) || '{}').operations, 'Phase 3: the task view (operations) is not stored; it is recomputed from the tasks');

/* F-19 — the archive bundle survives a load */
const { Entities } = await import('../core/entity-store.js');
State.patch({ archives: [{ ref: 'NITDA-2026-00001', records: {}, auditThread: [], hash: 'abc', archivedAt: '2026-10-20T08:00:00Z' }] });
Entities.hydrateFromState(State.get());
ok(Entities.getArchive('NITDA-2026-00001')?.hash === 'abc', 'F-19: a sealed bundle is restored at every load, not lost with the in-memory map');

/* F-9 — one overdue rule */
const { isOverdue } = await import('../core/work-measures.js');
const past = '2026-01-01T00:00:00Z';
ok(isOverdue({ due: past, status: 'In Progress' }) && !isOverdue({ due: past, status: 'Closed' }) && !isOverdue({ due: past, status: 'Completed' }) && isOverdue({ dueDate: past, status: 'Not Started' }), 'F-9: overdue means past due and not finished, on every screen');

/* F-22 — the retry rule */
const { refusal } = await import('../core/data-client.js');
ok(refusal({ status: 400 }) && refusal({ status: 403 }) && refusal({ status: 404 }) && !refusal({ status: 408 }) && !refusal({ status: 429 }) && !refusal({ status: 503 }) && !refusal(new Error('network')), 'F-22: a 4xx (not 408 or 429) is a refusal and is not queued; a lost connection, a timeout and a 5xx are');

/* The navigation. Module rationalisation phase 2 made 13 workspaces of tabs; the essentials cut-over (UX-401/402,
   2026-10-22) made them three places, with Administration behind the profile menu and every other route redirected. */
const { VisibleWorkspaces, HiddenTechnicalRoutes, workspaceOfRoute, RouteRedirects, AdministrationWorkspace } = await import('../config/workflow-clarity.config.js');
const { Routes } = await import('../config/routes.config.js');
const { RoleRouteAccess } = await import('../config/rbac.config.js');
const lands = (r) => workspaceOfRoute(r) || workspaceOfRoute(RouteRedirects[r]?.to);
ok(VisibleWorkspaces.length === 3 && Routes.every((r) => lands(r.path)), `UX-401: 3 places, and every one of the ${Routes.length} routes is a place, an Administration tab or redirects to one, so every old address still opens`);
const may = (role, r) => RoleRouteAccess[role].includes('*') || RoleRouteAccess[role].includes(r);
const count = (role) => VisibleWorkspaces.filter((w) => may(role, w.route) && w.merges.some((r) => may(role, r))).length;
ok([['systemAdmin', 3], ['director', 3], ['operator', 3], ['executive', 2], ['viewer', 2], ['userAdmin', 1]].every(([r, n]) => count(r) === n), 'UX-401: the sidebar per role is 3 / 3 / 3 / 2 / 2 / 1 (ESSENTIALS_MAP §8.2: 2-3)', ['systemAdmin', 'director', 'operator', 'executive', 'viewer', 'userAdmin'].map((r) => `${r} ${count(r)}`).join(', '));
ok(RouteRedirects['scan-intake'].to === 'correspondence' && RouteRedirects.archive.to === 'orchestrator' && RouteRedirects.fasttrack.tasks.view === 'at-risk', 'Counter deposit lands on the Inbox, Close & archive on Tasks, SLA risk on Tasks › At risk');
ok(['systemAdmin', 'userAdmin'].every((r) => AdministrationWorkspace.tabs.some((t) => may(r, t.route))) && !['executive', 'director', 'operator', 'viewer'].some((r) => AdministrationWorkspace.tabs.some((t) => may(r, t.route))), 'UX-402: Administration is for systemAdmin and userAdmin only');
ok(!VisibleWorkspaces.some((w) => w.id === 'administration' || w.group === 'SYSTEM'), 'UX-402: no administration screen is in the office sidebar');
ok(['executive', 'director', 'viewer', 'operator'].every((r) => RoleRouteAccess[r].includes('comments')), 'F-8: every role that reads records may open Comments');
ok(Object.values(HiddenTechnicalRoutes).every((h) => h.workspace && h.tab), 'every hidden route names the place that shows it, and its tab');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
