/**
 * Header search (essentials plan UX-304, core/record-search.js): find a record from anywhere and open it.
 *
 * A record is found by its reference, its sender or its subject, grouped as documents and tasks; a minute, an approval
 * or a registered e-mail finds the record it belongs to; a message not yet registered is listed as one. Everything Lookup
 * & Direct Action found (its groups() over activities, tasks, e-mails, comments and approvals) is found here, and every
 * document or task hit opens on the record page (core/record-view.js resolves its key).
 */
globalThis.localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, querySelector() { return null; }, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; }, body: { appendChild() {} } };

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
console.log('\nHeader search: find a record, open it on its page\n');

const { searchRecords, MIN_QUERY } = await import('../core/record-search.js');
const { recordView } = await import('../core/record-view.js');

const REF = 'NITDA/REG/2026/0101';
const state = {
  correspondence: [
    { id: '101', referenceId: REF, subject: 'Clearance for a platform', sender: 'Federal Ministry of Health', senderEmail: 'dg@health.gov.ng', status: 'In Treatment', receivedAt: '2026-09-30T09:00:00Z' },
    { id: '102', referenceId: 'NITDA/REG/2026/0102', subject: 'Request for a data-sharing agreement', sender: 'Ministry of Works', status: 'Pending', sourceEmailId: 'm-2', senderEmail: 'works@works.gov.ng', receivedAt: '2026-10-01T09:00:00Z' },
  ],
  activities: [{ id: '501', referenceId: 'NITDA/ACT/2026/0501', title: 'Annual audit', status: 'Treated', category: 'Audit', created: '2026-10-02T09:00:00Z' }],
  tracking: [
    { id: '201', referenceId: REF, title: 'Assess the architecture', assignedTo: 'a.officer@nitda.gov.ng', status: 'In Progress', created: '2026-10-01T09:00:00Z' },
    { id: '299', referenceId: 'NITDA/REG/2026/0999', title: 'A task whose document has not loaded', assignedTo: 'b@nitda.gov.ng', status: 'Not Started' },
  ],
  comments: [{ id: '301', referenceId: REF, body: 'Recommending clearance subject to a penetration test.', author: 'A. Officer' }],
  approvals: [{ id: 'AP-1', referenceId: REF, ref: REF, title: 'Issue the hosting certificate', status: 'pending' }],
  emails: [
    { id: 'm-1', subject: 'Invitation to the summit', fromAddress: 'events@example.org', fromName: 'Events', bodyPreview: 'You are invited', receivedDateTime: '2026-10-05T09:00:00Z' },
    { id: 'm-2', subject: 'Request for a data-sharing agreement', fromAddress: 'works@works.gov.ng', bodyPreview: 'Please find the draft MoU attached' },
  ],
};
const keys = (g) => g.map((h) => h.key);

ok(searchRecords(state, 'c').total === 0 && MIN_QUERY === 2, 'one letter searches nothing');
const byRef = searchRecords(state, REF);
ok(byRef.documents[0]?.key === REF, 'a reference finds its document first', keys(byRef.documents).join(','));
ok(keys(byRef.tasks).includes('201'), 'a reference finds the tasks raised on it');
ok(keys(searchRecords(state, 'ministry of health').documents).includes(REF), 'a sender finds the record');
ok(keys(searchRecords(state, 'dg@health').documents).includes(REF), "a sender's address finds the record");
ok(keys(searchRecords(state, 'clearance for').documents).includes(REF), 'a subject finds the record');
ok(keys(searchRecords(state, 'ministry of health').tasks).includes('201'), "a task is found by its document's sender");
ok(keys(searchRecords(state, 'assess the').tasks).join() === '201', 'a task is found by its title');

const viaMinute = searchRecords(state, 'penetration test');
ok(keys(viaMinute.documents).join() === REF && /^.*Minute:/.test(viaMinute.documents[0].meta), 'a minute finds the record it was written on, and says so', viaMinute.documents[0]?.meta);
ok(keys(searchRecords(state, 'hosting certificate').documents).join() === REF, 'an approval finds its record');

const mou = searchRecords(state, 'draft mou');
ok(keys(mou.documents).join() === 'NITDA/REG/2026/0102' && mou.messages.length === 0, 'a registered e-mail finds the record it became, not a message');
const summit = searchRecords(state, 'summit');
ok(summit.messages.length === 1 && summit.messages[0].emailId === 'm-1' && summit.documents.length === 0, 'an e-mail not yet registered is a message to register');
ok(keys(searchRecords(state, 'annual audit').documents).join() === 'NITDA/ACT/2026/0501', 'an activity outside the register is found');
ok(keys(searchRecords(state, 'NITDA/REG/2026/0999').tasks).join() === '299', 'a task whose document has not loaded is found');

/* Every document and task hit opens on the record page. */
const all = [REF, 'ministry', 'audit', 'assess', 'NITDA/REG/2026/0999', 'agreement'].flatMap((q) => { const r = searchRecords(state, q); return [...r.documents, ...r.tasks]; });
ok(all.length > 0 && all.every((h) => recordView(state, h.key)), 'every document and task found opens on its record page', all.filter((h) => !recordView(state, h.key)).map((h) => h.key).join(','));
ok(recordView(state, 'NITDA/ACT/2026/0501')?.doc.id === '501', 'the record page opens an activity outside the register');

/* Superset of Lookup: whatever Lookup's groups() matched is found here, as its record or as a message. */
const lookupHits = (s, q) => {
  const v = (x) => String(x || '').toLowerCase(), hit = (...xs) => xs.some((x) => v(x).includes(v(q)));
  return {
    activities: s.activities.filter((a) => hit(a.title, a.referenceId, a.status, a.category, a.assignedTo)),
    tasks: s.tracking.filter((t) => hit(t.title, t.referenceId, t.assignedTo, t.status, t.priority)),
    emails: s.emails.filter((e) => hit(e.subject, e.bodyPreview, e.fromAddress, e.from)),
    comments: s.comments.filter((c) => hit(c.body, c.author, c.referenceId)),
    approvals: s.approvals.filter((a) => hit(a.title, a.ref, a.status)),
  };
};
const missed = [];
for (const q of ['clearance', 'audit', 'officer', 'pending', 'progress', 'invited', 'certificate', 'NITDA', 'works']) {
  const l = lookupHits(state, q), r = searchRecords(state, q, { limit: 99 });
  const docKeys = new Set(keys(r.documents).map((k) => k.toLowerCase())), taskKeys = new Set(keys(r.tasks)), msgIds = new Set(r.messages.map((m) => m.emailId));
  const recordOf = (ref) => docKeys.has(String(ref).toLowerCase()) || [...taskKeys].some((id) => state.tracking.find((t) => t.id === id)?.referenceId === ref);
  for (const a of l.activities) if (!docKeys.has(a.referenceId.toLowerCase())) missed.push(`${q}: activity ${a.id}`);
  for (const t of l.tasks) if (!taskKeys.has(t.id)) missed.push(`${q}: task ${t.id}`);
  for (const e of l.emails) if (!msgIds.has(e.id) && !keys(r.documents).length) missed.push(`${q}: email ${e.id}`);
  for (const c of l.comments) if (!recordOf(c.referenceId)) missed.push(`${q}: comment ${c.id}`);
  for (const a of l.approvals) if (!recordOf(a.ref)) missed.push(`${q}: approval ${a.id}`);
}
ok(!missed.length, 'anything Lookup found is found by header search', missed.join('; '));

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
