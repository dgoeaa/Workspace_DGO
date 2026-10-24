/**
 * The Inbox and the Overview (essentials plan UX-301, UX-303; core/inbox-view.js, core/overview.js).
 *
 * Inbox: every incoming record from the four intakes is listed once (the register and Activities joined by reference,
 * and every message not yet registered); it filters by source, by where a record stands, by category and to physical
 * files, and each filter's count is what it shows; where a record stands is what its record page says.
 * Overview: every figure is the count of the list it opens, and incoming by intake is the Inbox's source counts.
 */
globalThis.localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, querySelector() { return null; }, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; }, body: { appendChild() {} } };

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
console.log('\nThe Inbox and the Overview\n');

const { inboxRows, inboxList, INBOX_STATUSES } = await import('../core/inbox-view.js');
const { overview, FIGURES } = await import('../core/overview.js');
const { taskList } = await import('../core/task-views.js');
const { recordView } = await import('../core/record-view.js');
const { EntryPoints } = await import('../config/entry-points.config.js');
const { readFileSync } = await import('node:fs');

const NOW = Date.parse('2026-10-22T09:00:00Z');
const state = {
  profile: { email: 'me@nitda.gov.ng' },
  correspondence: [
    { id: 'P-1', referenceId: 'P-1', subject: 'Portal submission', channel: 'portal', entryPoint: 'public-portal', status: 'Received', receivedAt: '2026-10-20T09:00:00Z', category: 'Request' },
    { id: 'S-1', referenceId: 'S-1', subject: 'Counter deposit', channel: 'scan', status: 'In Treatment', receivedAt: '2026-10-19T09:00:00Z', category: 'Letter' },
    { id: 'I-1', referenceId: 'I-1', subject: 'Internal memo answered', channel: 'internal', entryPoint: 'internal', status: 'Accepted', receivedAt: '2026-10-18T09:00:00Z', category: 'Memo' },
    { id: 'E-1', referenceId: 'E-1', subject: 'Registered e-mail', channel: 'Email', status: 'Received', sourceEmailId: 'm-1', senderEmail: 'a@x.org', receivedAt: '2026-10-17T09:00:00Z', category: 'Letter' },
    { id: 'C-1', referenceId: 'C-1', subject: 'Closed record', channel: 'Registry', status: 'Archived', receivedAt: '2026-10-01T09:00:00Z' },
  ],
  activities: [{ id: '501', referenceId: 'S-1', title: 'Counter deposit', status: 'Not Treated', sender: 'Ministry of Works' }],
  emails: [
    { id: 'm-1', subject: 'Registered e-mail', fromAddress: 'a@x.org', receivedDateTime: '2026-10-17T09:00:00Z' },
    { id: 'm-2', subject: 'Still to register', fromAddress: 'b@y.org', receivedDateTime: '2026-10-21T09:00:00Z' },
  ],
  tracking: [
    { id: 't1', referenceId: 'S-1', title: 'Act on the deposit', assignedTo: 'me@nitda.gov.ng', status: 'In Progress', acknowledged: true, due: '2026-10-21' },
    { id: 't2', referenceId: 'I-1', title: 'Answer the memo', assignedTo: 'me@nitda.gov.ng', status: 'Completed', acknowledged: true },
  ],
  correspondenceEmails: [{ id: 'r1', referenceId: 'I-1', status: 'sent' }],
  archives: [{ ref: 'C-1' }],
  registryFiles: [{ id: 'f1', correspondenceId: 'S-1', registryNumber: 'NITDA/REG/0042', currentHolder: 'Registry' }],
};

const rows = inboxRows(state);
const keys = (xs) => xs.map((r) => r.key || 'email:' + r.emailId).sort().join(',');
ok(keys(rows) === 'C-1,E-1,I-1,P-1,S-1,email:m-2', 'every record is listed once, and a message not yet registered is a row', keys(rows));
ok(rows.find((r) => r.key === 'S-1').activityId === '501' && rows.find((r) => r.key === 'S-1').from === 'Ministry of Works', 'a record in both the register and Activities is one row, carrying both');
const intakesSeen = new Set(rows.map((r) => r.source));
ok(EntryPoints.every((e) => intakesSeen.has(e.sourceView)), 'all four intakes are in the one list', [...intakesSeen].join(','));

const at = (opts) => keys(inboxList(state, opts).rows);
ok(at({ status: 'open' }) === 'E-1,I-1,P-1,S-1,email:m-2', 'Open: everything not closed');
ok(at({ status: 'closed' }) === 'C-1', 'Closed: an archived record');
ok(at({ status: 'unassigned' }) === 'E-1,P-1', 'Unassigned: an open record with no task (a message is not yet a record)');
ok(at({ status: 'to-triage' }) === 'E-1,P-1,email:m-2', 'To triage: received and not yet acted on');
ok(at({ status: 'in-progress' }) === 'S-1', 'In progress: a task raised and no response yet');
ok(at({ status: 'responded' }) === 'I-1', 'Responded: a reply sent, not yet closed');
ok(at({ status: 'all', files: true }) === 'S-1', 'Physical files: the records with an official file');
ok(at({ status: 'all', source: EntryPoints.find((e) => e.id === 'email').sourceView }) === 'E-1,email:m-2', 'Source: Email lists the registered and the unregistered messages');
ok(at({ status: 'all', category: 'Letter' }) === 'E-1,S-1', 'Category filters');
ok(at({ status: 'all', q: 'ministry of works' }) === 'S-1' && at({ status: 'all', q: 'b@y.org' }) === 'email:m-2', 'search by sender, of a record or a message');

const l = inboxList(state, { status: 'open' });
ok(INBOX_STATUSES.every((x) => l.statusCounts[x.id] === inboxList(state, { status: x.id }).rows.length), "every status's count is what it shows");
ok(Object.entries(l.sourceCounts).every(([id, n]) => n === inboxList(state, { status: 'open', source: id }).rows.length), "every source's count is what it shows");
ok(l.fileCount === inboxList(state, { status: 'open', files: true }).rows.length, 'the Physical files count is what it shows');

/* Where a record stands is what its record page says. */
for (const r of rows.filter((x) => x.kind === 'record')) {
  const v = recordView(state, r.key);
  const reached = [...v.stages].reverse().find((s) => s.state !== 'todo');
  if (reached.id !== r.stage || v.response.responded !== (r.responded && !r.closed ? true : v.response.responded)) { ok(false, `${r.key}: the row and the record page disagree`, `${r.stage} vs ${reached.id}`); }
}
ok(rows.filter((x) => x.kind === 'record').every((r) => recordView(state, r.key)), 'every record row opens on its record page');

/* Overview */
const o = overview(state, { now: NOW });
ok(o.figures.map((f) => f.id).join() === FIGURES.map((f) => f.id).join(), 'the figures, in order');
ok(o.figures.every((f) => f.value === (f.list === 'inbox' ? inboxList(state, f.filter).rows.length : taskList(state, { view: f.filter.view, now: NOW }).rows.length)), 'every figure is the count of the list it opens', o.figures.map((f) => `${f.id}=${f.value}`).join(' '));
ok(o.intakes.length === 4 && o.intakes.every((i) => i.value === inboxList(state, i.filter).rows.length), 'incoming by intake: four figures, each the Inbox filtered to that intake');
ok(o.attention.length === 1 && o.attention[0].key === 't1' && o.attention[0].why === 'Overdue', 'needs attention: overdue work first');

/* The lists only filter and open. */
for (const f of ['modules/inbox.js', 'modules/overview.js']) {
  const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  ok(!/executeOwnedAction|Payloads|attempt\(|WriteManager/.test(src), `${f} writes nothing itself: its writes are the record page's and the screens it mounts`);
}
const inboxSrc = readFileSync(new URL('../modules/inbox.js', import.meta.url), 'utf8');
ok(!/data-record-act|data-quick-accept|data-delete/.test(inboxSrc), 'no Inbox row carries an action button');

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
