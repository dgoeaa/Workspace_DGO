/**
 * The record page's model (essentials plan UX-202, core/record-view.js): one record, whole.
 *
 * A record is found by its reference, its id or one of its tasks; its timeline joins the document, its tasks, minutes,
 * approvals, decisions and escalations in time order; a decision recorded as an APR row reads as a decision, not as a
 * request; a task's `ack` (the date its acknowledgement is due) does not count as an acknowledgement; and a task whose
 * document has not loaded is still shown on its own.
 *
 * UX-203: a record is answered by a reply sent on it or a dispatch of its tasks; only then is it Responded. A letter sent
 * as a dispatch is drawn once, and a closed record reads Closed.
 */
globalThis.localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, querySelector() { return null; }, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; }, body: { appendChild() {} } };

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
console.log('\nThe record page: one record, whole\n');

const { recordView, findRecord, isAcknowledged } = await import('../core/record-view.js');

const state = {
  correspondence: [{ id: '101', referenceId: 'NITDA/REG/2026/0101', subject: 'Clearance for a platform', channel: 'Document', receivedAt: '2026-09-30T09:00:00Z', status: 'In Treatment', sender: 'Federal Ministry of Health' }],
  tracking: [
    { id: '201', referenceId: 'NITDA/REG/2026/0101', title: 'Assess the architecture', assignedTo: 'a@nitda.gov.ng', created: '2026-10-01T09:00:00Z', ack: '2026-10-03', status: 'In Progress' },
    { id: '299', referenceId: 'NITDA/REG/2026/0999', title: 'A task whose document has not loaded', assignedTo: 'b@nitda.gov.ng', created: '2026-10-05T09:00:00Z', status: 'Not Started' },
  ],
  comments: [{ id: '301', referenceId: 'NITDA/REG/2026/0101', body: 'Recommending clearance.', author: 'A. Officer', ts: '2026-10-13T09:00:00Z' }],
  approvals: [
    { id: 'AP-1', referenceId: 'NITDA/REG/2026/0101', title: 'Issue the clearance', requestedBy: 'a@nitda.gov.ng', status: 'approved', createdAt: '2026-10-15T09:00:00Z', decidedAt: '2026-10-18T09:00:00Z' },
    { id: 'decision-101', referenceId: 'NITDA/REG/2026/0101', title: 'DG/CEO decision: Clearance for a platform', status: 'accepted', ts: '2026-10-19T09:00:00Z' },
  ],
  escalations: [{ id: 'e1', taskId: '201', referenceId: 'NITDA/REG/2026/0101', level: 1, reason: 'Due soon', createdAt: '2026-10-12T09:00:00Z' }],
};

const byRef = recordView(state, 'NITDA/REG/2026/0101');
ok(!!byRef && byRef.doc.id === '101', 'a record is found by its reference');
ok(recordView(state, '101')?.doc.id === '101', 'a record is found by its id');
const byTask = recordView(state, '201');
ok(byTask?.doc.id === '101' && byTask.task?.id === '201', 'a task opens its document, with that task in focus');
ok(byRef.tasks.length === 1 && byRef.tasks[0].id === '201', 'the record carries the tasks raised on it, and only those');

const kinds = byRef.timeline.map((e) => e.kind);
const titles = byRef.timeline.map((e) => e.title);
ok(kinds[0] === 'received' && titles[0] === 'Received · Document', 'the timeline opens with the record being received', titles[0]);
ok(byRef.timeline.every((e, i, a) => i === 0 || new Date(a[i - 1].at) <= new Date(e.at)), 'the timeline is in time order');
ok(['assigned', 'escalated', 'minute', 'approval', 'decision'].every((k) => kinds.includes(k)), 'assignment, escalation, minute, approval and decision are all on it', kinds.join(','));
ok(!titles.some((t) => /requested: DG\/CEO decision/i.test(t)) && titles.includes('Accepted: DG/CEO decision'), 'a decision recorded as an APR row reads as a decision, not a request', titles.join(' | '));
ok(!isAcknowledged(state.tracking[0]) && !kinds.includes('acknowledged'), "a task's ack (the date acknowledgement is due) is not an acknowledgement");
ok(isAcknowledged({ acknowledged: true }) && isAcknowledged({ assignedToAcknowledgementStatus: 'Acknowledged' }), 'an acknowledged task, by flag or by status, is acknowledged');

const stages = Object.fromEntries(byRef.stages.map((s) => [s.id, s.state]));
ok(stages.received === 'done' && stages.assigned === 'done' && stages.closed === 'todo', 'the stage bar: received and assigned done, not yet closed', JSON.stringify(stages));

const orphan = findRecord(state, '299');
ok(orphan?.doc.taskOnly === true && recordView(state, '299').tasks[0]?.id === '299', 'a task whose document has not loaded is shown on its own');
ok(recordView(state, 'nothing-like-this') === null, 'an unknown key opens nothing');

/* ── responding and closing (UX-203) ── */
const { responseOf } = await import('../core/record-view.js');
const REF = 'NITDA/REG/2026/0101';
const none = responseOf(state, state.correspondence[0], [state.tracking[0]]);
ok(!none.responded && !none.archived, 'with no reply and no dispatch, the record is not yet answered');
const drafted = { ...state, correspondenceEmails: [{ id: 'CMAIL-1', referenceId: REF, status: 'draft', subjectLine: 'Clearance', recipientEmail: 'x@moh.gov.ng', createdAt: '2026-10-20T09:00:00Z', sourceKind: 'correspondence' }] };
ok(!responseOf(drafted, drafted.correspondence[0], [drafted.tracking[0]]).responded && recordView(drafted, REF).timeline.some((e) => e.title === 'Reply drafted: Clearance'), 'a draft reply is on the timeline but does not answer the record');
const replied = { ...state, correspondenceEmails: [{ ...drafted.correspondenceEmails[0], status: 'sent', sentAt: '2026-10-21T09:00:00Z' }], dispatches: [{ id: 'EMAILDISP-1', referenceId: REF, channel: 'Email', status: 'dispatched', at: '2026-10-21T09:00:00Z', correspondenceEmailId: 'CMAIL-1' }] };
const rv = recordView(replied, REF);
ok(rv.response.responded && rv.stages.find((x) => x.id === 'responded').state === 'done', 'a sent reply answers the record, and the stage bar says so');
ok(rv.timeline.filter((e) => /Reply sent|Dispatched/.test(e.title)).length === 1, 'the letter and the dispatch row it leaves are drawn once', rv.timeline.map((e) => e.title).join(' | '));
const dispatched = { ...state, dispatches: [{ id: 'd1', taskId: '201', referenceId: REF, channel: 'Courier', recipient: 'MoH', status: 'closed', at: '2026-10-21T09:00:00Z', receiptAt: '2026-10-22T09:00:00Z' }] };
const dv = recordView(dispatched, REF);
ok(dv.response.responded && dv.timeline.some((e) => e.title === 'Dispatched by Courier') && dv.timeline.some((e) => e.title === 'Receipt confirmed'), 'a dispatch of its task answers the record; its hand-over and receipt are on the timeline');
const nodisp = { ...state, dispatches: [{ id: 'd2', taskId: '201', status: 'no-dispatch', reason: 'Answered by phone', at: '2026-10-21T09:00:00Z' }] };
ok(recordView(nodisp, REF).response.responded && recordView(nodisp, REF).timeline.some((e) => e.title === 'No dispatch needed' && e.body === 'Answered by phone'), 'a dispatch marked as not needed, with its reason, answers it too');
const archived = { ...dispatched, archives: [{ ref: REF, archivedAt: '2026-10-23T09:00:00Z', closureSummary: 'Done' }] };
const av = recordView(archived, REF);
ok(av.response.archived && av.stages.find((x) => x.id === 'closed').state === 'done' && av.timeline.at(-1).title === 'Closed and archived', 'an archived record is Closed, and its closure ends the timeline');

/* ── file custody (UX-204) ── */
const custody = { ...state, registryFiles: [{ id: 'f1', correspondenceId: '101', referenceId: REF, registryNumber: 'NITDA/REG/0042', currentHolder: 'Legal', status: 'Received', registeredAt: '2026-10-02T09:00:00Z', registeredBy: 'registry@nitda.gov.ng' }],
  fileMovements: [{ id: 'm1', registryFileId: 'f1', from: 'Central Registry', to: 'Legal', action: 'FOR_ACTION', minute: 'For your review.', status: 'Received', releasedAt: '2026-10-03T09:00:00Z', receivedAt: '2026-10-04T09:00:00Z', receivedBy: 'legal@nitda.gov.ng' }] };
const cv = recordView(custody, REF), ct = cv.timeline.map((e) => e.title);
ok(cv.files.length === 1 && cv.files[0].moves.length === 1, "the record carries its official file and the file's movements");
ok(ct.includes('File opened: NITDA/REG/0042') && ct.includes('File sent to Legal · for action') && ct.includes('File received by Legal'), "the file's opening, hand-over and receipt are on the timeline", ct.join(' | '));
ok(recordView(state, REF).files.length === 0 && !recordView(state, REF).timeline.some((e) => e.kind === 'custody'), 'a record with no file has no custody events');

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
