/**
 * Header search (essentials plan UX-304, docs/architecture/ESSENTIALS_MAP.md §7.11): find a record from anywhere.
 *
 * Lookup & Direct Action searched activities, tasks, e-mails, comments and approvals, each as its own kind of result,
 * and opened each in a detail pane of its own. Here every hit is a record: a document or a task, found by its reference,
 * its sender or its subject, and opened on its record page. A comment or an approval is not a result of its own; it finds
 * the record it was written on. An e-mail finds the record it was registered as, or, until it is registered, is listed as
 * a message to register, which Intake does.
 *
 * Everything Lookup matched on still matches here (its fields are a subset of these), so any record Lookup found is
 * found. Pure: tests call it with a state object.
 */
import { unregisteredEmails } from './intake-list.js';

const txt = (v) => String(v ?? '').trim();
const low = (v) => txt(v).toLowerCase();
const same = (a, b) => !!txt(a) && low(a) === low(b);

/** The shortest query searched; one letter matches nearly everything. */
export const MIN_QUERY = 2;

/** Every document loaded on this device, once: the register (correspondence), Lookup's activities and the Intake Register,
    joined by reference. Where both hold a record, the register's fields win and the activity fills what it leaves out. */
export function allDocuments(state = {}) {
  const byKey = new Map();
  /* A Portal submission can be in the Intake Register before it is in the register of records (essentials plan UX-401: the
     Portal submissions tab that listed it is the record page now), so the Intake Register's rows fill in last. */
  const intake = (state.portalRegister || []).map((r) => ({ id: r.referenceId || r.id, referenceId: r.referenceId, entityKey: r.entityKey, subject: r.subject, senderEmail: r.senderEmail, receivedAt: r.submittedAtUtc, channel: r.channel, entryPoint: r.entryPoint, status: r.statusLabel || r.status }));
  for (const d of [...(state.correspondence || []), ...(state.activities || []), ...intake]) {
    const k = low(d?.referenceId) || low(d?.id);
    if (!d || !k) continue;
    const prev = byKey.get(k);
    byKey.set(k, prev ? { ...Object.fromEntries(Object.entries(d).filter(([, v]) => txt(v))), ...Object.fromEntries(Object.entries(prev).filter(([, v]) => txt(v))) } : d);
  }
  return [...byKey.values()];
}

/* How well a row answers the query: its reference or id exactly, then the start of its reference, then anything else. */
function rank(q, refs, fields) {
  if (refs.some((r) => low(r) === q)) return 0;
  if (refs.some((r) => low(r).startsWith(q))) return 1;
  if (refs.some((r) => low(r).includes(q))) return 2;
  return fields.some((f) => low(f).includes(q)) ? 3 : -1;
}
const byRank = (a, b) => a.rank - b.rank || String(b.at || '').localeCompare(String(a.at || ''));

/**
 * The records a query finds, grouped: documents, tasks, and messages not yet registered. Each hit carries the key the
 * record page opens it by (`key`), what to show (`title`, `meta`) and, for a message, the e-mail's id (`emailId`).
 */
export function searchRecords(state = {}, query = '', { limit = 8 } = {}) {
  const q = low(query);
  const out = { documents: [], tasks: [], messages: [], total: 0 };
  if (q.length < MIN_QUERY) return out;
  const docs = allDocuments(state), tasks = state.tracking || [];
  const docOf = (ref) => docs.find((d) => same(d.referenceId, ref) || same(d.id, ref));

  /* Documents: by reference, sender or subject, and by what Lookup also read (status, category, assignee). */
  const hits = new Map();
  const hitDoc = (d, r, via = '') => {
    const k = low(d.referenceId) || low(d.id);
    const prev = hits.get(k);
    if (!prev || r < prev.rank) hits.set(k, { doc: d, rank: r, via: prev && prev.rank <= r ? prev.via : via });
  };
  for (const d of docs) {
    const r = rank(q, [d.referenceId, d.id], [d.subject, d.title, d.sender, d.senderEmail, d.fromAddress, d.status, d.category, d.assignedTo]);
    if (r >= 0) hitDoc(d, r);
  }
  /* A minute or an approval finds the record it was written on. */
  for (const c of state.comments || []) {
    const d = docOf(c.referenceId);
    if (d && rank(q, [], [c.body, c.author]) >= 0) hitDoc(d, 4, `Minute: ${txt(c.body).slice(0, 60)}`);
  }
  for (const a of state.approvals || []) {
    const d = docOf(a.referenceId || a.ref);
    if (d && rank(q, [a.ref, a.referenceId], [a.title, a.status]) >= 0) hitDoc(d, 4, `Approval: ${txt(a.title)}`);
  }

  /* E-mails: a registered one finds its record; one not yet registered is a message to register. */
  const pending = new Set(unregisteredEmails(state).map((e) => txt(e.id)));
  const messages = [];
  for (const e of state.emails || []) {
    const r = rank(q, [], [e.subject, e.bodyPreview, e.fromAddress, e.from, e.fromName]);
    if (r < 0) continue;
    if (pending.has(txt(e.id))) { messages.push({ emailId: txt(e.id), key: '', title: txt(e.subject) || '(No subject)', meta: [txt(e.fromName || e.fromAddress || e.from), 'Not registered'].filter(Boolean).join(' · '), rank: r, at: txt(e.receivedDateTime) }); continue; }
    const d = docs.find((x) => same(x.sourceEmailId, e.id) || (same(x.subject || x.title, e.subject) && same(x.senderEmail, e.fromAddress)));
    if (d) hitDoc(d, Math.max(r, 3), 'Registered from an e-mail');
  }

  out.documents = [...hits.values()].map(({ doc: d, rank: r, via }) => ({
    key: txt(d.referenceId || d.id), title: txt(d.subject || d.title) || txt(d.referenceId) || 'Record',
    meta: [txt(d.referenceId || d.id), txt(d.sender || d.senderEmail), txt(d.status), via].filter(Boolean).join(' · '),
    rank: r, at: txt(d.receivedAt || d.createdAt || d.created),
  })).sort(byRank);

  out.tasks = tasks.map((t) => {
    const parent = docOf(t.referenceId);
    const r = rank(q, [t.referenceId, t.id, t.taskRef], [t.title, t.assignedTo, t.status, t.priority, parent?.sender, parent?.senderEmail, parent?.subject]);
    return r < 0 ? null : { key: txt(t.id), title: txt(t.title) || 'Task', meta: [txt(t.referenceId), txt(t.assignedTo), txt(t.status) || 'Not started'].filter(Boolean).join(' · '), rank: r, at: txt(t.created || t.startDate) };
  }).filter(Boolean).sort(byRank);

  out.messages = messages.sort(byRank);
  out.total = out.documents.length + out.tasks.length + out.messages.length;
  out.documents = out.documents.slice(0, limit); out.tasks = out.tasks.slice(0, limit); out.messages = out.messages.slice(0, limit);
  return out;
}
