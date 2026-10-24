#!/usr/bin/env node
// A stand-in for the mailer's seven Power Automate flows, answering the same contract from
// memory — so the mailer can be driven end to end on a laptop, and by tests/mailer.e2e.mjs,
// without a tenant.
//
//   node scripts/mailer-mock-flows.mjs [--port 8084] [--key <admin key>] [--operator <email>]
//
// It prints the config.local.js block that points the mailer at it. It is a mock: nothing is
// emailed and nothing is written to SharePoint. Sign-in codes are "mailed" to its own mailbox
// and printed on the console. What it reproduces faithfully is the part that matters to the
// client — the envelope, sign-in with a mailed code and session tokens checked on every call,
// the allowlist refusals, messageId de-duplication and the in-progress refusal, healthCheck/verify, provisioning's
// plan/provision split, and the shared mailings, reports and files — taken from the same MAILER
// settings the flow generator uses, so the two cannot drift apart.

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { MAILER, LIST_SCHEMA } from './build-mailer-flows.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };

/** The endpoint keys of the seven flows, in catalogue order. */
export const KEYS = Object.freeze(['MAIL_SEND', 'MAIL_LOG', 'MAIL_DIRECTORY', 'MAIL_TEMPLATES', 'MAIL_PROVISION', 'MAIL_AUTH', 'MAIL_DATA']);
const OPEN = new Set(['verify', 'healthcheck']);
const AUTH_OPEN = new Set(['requestcode', 'verifycode']);

export function createMockFlows({
  operatorKey = 'mock-operator-key-0001',
  failFor = [],
  operators = [{ email: 'operator@nitda.gov.ng', name: 'Mock Operator', role: 'admin', active: true }],
  allowedOrigin = '*',
  log = () => {},
  /* As SharePoint does: an operation on a list that was never created fails (the flow answers
     FLOW_FAILED). Off by default; the setup tests turn it on. */
  strictLists = false,
  /* Recipient keys whose send goes out but whose answer is lost (504, as when Power Automate's
     synchronous window closes while the run carries on): what the client must reconcile from the
     log instead of sending again. */
  lostAnswerFor = [],
} = {}) {
  const lists = {
    log: [], directory: new Map(), templates: new Map(),
    operators: new Map(operators.map((o) => [o.email.toLowerCase(), { ...o, email: o.email.toLowerCase(), active: o.active !== false, role: o.role === 'admin' ? 'admin' : 'operator' }])),
    sessions: new Map(), campaigns: new Map(), reports: new Map(), files: new Map(),
  };
  const provisioned = new Set();
  const privateLists = new Set();
  const indexedLists = new Set();
  const rates = new Map(); // address -> { count, until }
  /* Set true to make every signed-in call answer as the flows do when SharePoint does not answer
     the session look-up: 503 SIGN_IN_CHECK_FAILED, not a sign-out. */
  const faults = { sessionLookup: false };
  let nextId = 1;
  const sent = [];
  const mailbox = []; // sign-in codes "mailed": { to, code, at }
  const now = () => Date.now();
  const token = () => `${randomUUID()}${randomUUID()}`.replace(/-/g, '');

  const domainOk = (a) => {
    const parts = String(a).trim().toLowerCase().split('@');
    if (parts.length !== 2 || !parts[1].includes('.') || /\s/.test(a)) return false;
    const labels = parts[1].split('.');
    return MAILER.allowedDomains.includes(parts[1]) || MAILER.allowedSuffixes.includes(labels.slice(-2).join('.'));
  };

  /** ctx.lists: the provisioning schema the calling flow's own definition holds. */
  function handle(key, body, ctx = {}) {
    const operation = String(body?._platform?.operation || body?.operation || '').toLowerCase();
    const requestId = body?.requestId || body?._platform?.correlationId || `mock-${Date.now()}`;
    const env = (success, data = null, error = null, validationOnly = false) => ({ success, validationOnly, endpoint: { key }, requestId, runId: `mock-run-${nextId}`, data, error });
    const errOut = (status, code, message, details = null) => [status, env(false, null, { code, message, details })];

    if (operation === 'verify') {
      return [200, { verified: true, flowIdentity: `DGO_${key}`, environment: 'mock', contractVersion: MAILER.contractVersion, correlationId: body._platform?.correlationId, endpoint: { key } }];
    }
    if (operation === 'healthcheck') {
      if (body.validationOnly !== true) return errOut(400, 'VALIDATION_ONLY_REQUIRED', 'healthCheck must be called with validationOnly:true.');
      return [200, env(true, { operatorKeyConfigured: true, sharePointReachable: true, listsFound: [...provisioned].map((t) => ({ Title: t })), listsExpected: LIST_SCHEMA.map((l) => l.title) }, null, true)];
    }
    const p = body.payload || {};
    const vOnly = body.validationOnly === true;

    /* Who is calling: setup's admin key, or an active session of an active operator. */
    const isAdmin = body?.operatorKey === operatorKey;
    const sess = !isAdmin && body?.sessionToken ? [...lists.sessions.values()].find((x) => x.token && x.token === body.sessionToken && x.status === 'Active' && x.tokenExpiresAt > now()) : null;
    const op = sess ? lists.operators.get(sess.email) : null;
    const caller = isAdmin ? { email: body.operator?.email || '', name: body.operator?.name || '', role: 'admin', via: 'admin-key' }
      : sess && op?.active ? { email: sess.email, name: op.name || '', role: op.role, via: 'session', session: sess } : null;
    const open = key === 'MAIL_AUTH' && AUTH_OPEN.has(operation);
    if (faults.sessionLookup && !isAdmin && !open && body?.sessionToken) return errOut(503, 'SIGN_IN_CHECK_FAILED', 'The sign-in could not be checked just now (SharePoint did not answer). Nothing was done; try again in a moment.');
    if (!caller && !open) return errOut(401, 'SIGN_IN_REQUIRED', 'Sign in first: the session is missing, has expired, was signed out, or its operator is no longer active.');

    if (key === 'MAIL_AUTH') {
      if (operation === 'requestcode') {
        const email = String(p.email || '').trim().toLowerCase();
        const challengeId = token();
        const known = lists.operators.get(email);
        /* As the flow does: at most codesPerWindow codes per address per window, then silence. */
        const rate = rates.get(email);
        const open = rate && rate.until > now();
        const allowed = !open || rate.count < MAILER.codesPerWindow;
        if (known?.active && !vOnly && allowed) {
          rates.set(email, open ? { ...rate, count: rate.count + 1 } : { count: 1, until: now() + MAILER.codeWindowMinutes * 60000 });
          const code = String(10000000 + Math.floor(Math.random() * 90000000));
          lists.sessions.set(challengeId, { email, name: known.name, code, codeExpiresAt: now() + MAILER.codeMinutes * 60000, attempts: 0, status: 'Pending' });
          mailbox.push({ to: email, code, at: new Date().toISOString() });
          log(`sign-in code for ${email}: ${code}`);
        }
        return [200, env(true, { challengeId, expiresAt: new Date(now() + MAILER.codeMinutes * 60000).toISOString(), message: 'If this address belongs to a mailer operator, a sign-in code has been mailed to it.' }, null, vOnly)];
      }
      if (operation === 'verifycode') {
        const ch = lists.sessions.get(String(p.challengeId || '').trim());
        if (!ch || ch.status !== 'Pending' || ch.codeExpiresAt < now() || ch.attempts >= MAILER.maxCodeAttempts) return errOut(401, 'CODE_EXPIRED', 'This code has expired, was already used, or had too many wrong tries. Ask for a new code.');
        /* As the flow does: every try is counted before the code is compared. */
        ch.attempts++;
        if (ch.attempts >= MAILER.maxCodeAttempts) ch.status = 'Locked';
        if (String(p.code || '').trim() !== ch.code) {
          return errOut(401, 'CODE_INVALID', `That code is not right. ${Math.max(0, MAILER.maxCodeAttempts - ch.attempts)} try(s) left for this code.`);
        }
        Object.assign(ch, { status: 'Active', token: token(), tokenExpiresAt: now() + MAILER.sessionHours * 3600000, code: '' });
        return [200, env(true, { token: ch.token, expiresAt: new Date(ch.tokenExpiresAt).toISOString(), email: ch.email, name: ch.name || '' })];
      }
      if (operation === 'signout') { if (caller.session) caller.session.status = 'Revoked'; return [200, env(true, { signedOut: true })]; }
      if (operation === 'whoami') return [200, env(true, { email: caller.email, name: caller.name, role: caller.role, via: caller.via, expiresAt: caller.session ? new Date(caller.session.tokenExpiresAt).toISOString() : null })];
      if ((operation === 'listoperators' || operation === 'upsertoperator') && strictLists && !provisioned.has(MAILER.lists.operators)) {
        return errOut(500, 'FLOW_FAILED', 'The flow failed before it could answer. Run id: mock-run', `List '${MAILER.lists.operators}' does not exist at site with URL '${MAILER.siteUrl}'.`);
      }
      if (operation === 'listoperators' || operation === 'upsertoperator') {
        if (caller.role !== 'admin') return errOut(403, 'FORBIDDEN', 'Only a mailer admin can manage operators.');
        if (operation === 'listoperators') { const items = [...lists.operators.values()]; return [200, env(true, { items, count: items.length })]; }
        const o = p.operator || {};
        const email = String(o.email || '').trim().toLowerCase();
        if (!email.includes('@')) return errOut(400, 'EMAIL_REQUIRED', 'payload.operator.email must be an email address.');
        const item = { email, name: String(o.name || ''), active: o.active !== false, role: String(o.role || '').toLowerCase() === 'admin' ? 'admin' : 'operator' };
        if (vOnly) return [200, env(true, { item }, null, true)];
        lists.operators.set(email, item);
        return [200, env(true, { operator: item })];
      }
    }

    if (key === 'MAIL_DATA') {
      const records = { mailings: ['mailing', lists.campaigns], reports: ['report', lists.reports] };
      for (const [plural, [one, store]] of Object.entries(records)) {
        if (operation === `list${plural}`) {
          const items = [...store.values()].sort((a, b) => String(b.modified).localeCompare(String(a.modified))).slice(0, Math.min(1000, p.top || 500));
          return [200, env(true, { items, count: items.length })];
        }
        const rec = p[one] || {};
        const id = String(rec.id || '').trim();
        if (operation === `save${one}`) {
          if (!id) return errOut(400, 'ID_REQUIRED', `payload.${one}.id is required.`);
          const created = !store.has(id);
          if (vOnly) return [200, env(true, { id, wouldCreate: created }, null, true)];
          const stamp = new Date().toISOString();
          store.set(id, { ...rec, id, data: String(rec.data ?? ''), updatedBy: caller.email, operator: caller.email, created: store.get(id)?.created || stamp, modified: stamp });
          return [200, env(true, { id, created, savedBy: caller.email })];
        }
        if (operation === `delete${one}`) {
          const existed = store.has(id);
          if (!vOnly) store.delete(id);
          return [200, env(true, { id, deleted: existed && !vOnly }, null, vOnly)];
        }
      }
      const f = p.file || {};
      const storedName = String(f.storedName || `${String(f.id || '').trim()}__${String(f.name || '').trim()}`);
      const unsafe = !storedName.trim() || /[/\\]/.test(storedName);
      if (['uploadfile', 'downloadfile', 'deletefile'].includes(operation) && unsafe && (operation !== 'uploadfile' || (f.id && f.name))) {
        return errOut(400, 'BAD_FILE_NAME', 'A shared file name must be a plain file name, without "/" or "\\".');
      }
      if (operation === 'uploadfile') {
        if (!String(f.id || '').trim() || !String(f.name || '').trim() || !f.contentBase64) return errOut(400, 'FILE_REQUIRED', 'payload.file needs id, name and contentBase64.');
        if (vOnly) return [200, env(true, { storedName }, null, true)];
        lists.files.set(storedName, { bytes: Buffer.from(f.contentBase64, 'base64'), created: new Date().toISOString() });
        return [200, env(true, { id: f.id, storedName, uploadedBy: caller.email })];
      }
      if (operation === 'downloadfile') {
        const file = lists.files.get(storedName);
        return file ? [200, env(true, { storedName, contentBase64: file.bytes.toString('base64') })] : errOut(404, 'NOT_FOUND', `No shared file ${storedName}.`);
      }
      if (operation === 'listfiles') {
        const items = [...lists.files.entries()].map(([name, x]) => ({ storedName: name, id: name.split('__')[0], size: x.bytes.length, created: x.created }));
        return [200, env(true, { items, count: items.length })];
      }
      if (operation === 'deletefile') {
        if (vOnly) return [200, env(true, { storedName }, null, true)];
        return [200, env(true, { storedName, deleted: lists.files.delete(storedName) })];
      }
    }

    if (key === 'MAIL_SEND' && operation === 'send') {
      const to = p.to || [], cc = p.cc || [], bcc = p.bcc || [], att = p.attachments || [];
      const all = [...new Set([...to, ...cc, ...bcc])];
      const bad = all.filter((a) => !domainOk(a));
      const code = !to.length ? 'NO_RECIPIENT' : all.length > MAILER.maxRecipients ? 'TOO_MANY_RECIPIENTS' : bad.length ? 'RECIPIENT_NOT_ALLOWED'
        : !String(p.subject || '').trim() ? 'NO_SUBJECT' : !p.htmlBody ? 'NO_BODY' : att.some((a) => !a.name || !a.contentBase64) ? 'ATTACHMENT_MALFORMED'
          : JSON.stringify(att).length > MAILER.maxAttachmentChars ? 'ATTACHMENTS_TOO_LARGE' : '';
      if (code) return errOut(code === 'ATTACHMENTS_TOO_LARGE' ? 413 : 400, code, `The message was refused: ${code}`, { disallowedRecipients: bad });
      if (vOnly) return [200, env(true, { messageId: p.messageId, wouldSendTo: all, attachmentCount: att.length }, null, true)];
      const prior = lists.log.find((r) => r.messageId === p.messageId && r.status === 'Sent');
      if (prior) return [200, env(true, { messageId: p.messageId, status: 'Sent', duplicate: true, sentAt: prior.sentAt, logItemId: prior.logItemId })];
      const running = lists.log.find((r) => r.messageId === p.messageId && r.status === 'Sending' && now() - Date.parse(r.created) < MAILER.inProgressMinutes * 60000);
      if (running) return [409, env(false, { messageId: p.messageId, status: 'Sending', logItemId: running.logItemId }, { code: 'IN_PROGRESS', message: 'This message is already being sent by another request. Nothing was sent again; read the log for its outcome.' })];
      const row = { logItemId: nextId++, messageId: p.messageId, campaignId: p.campaignId, recipientKey: p.recipientKey, institution: p.institution, addressee: p.addressee, to: to.join('; '), cc: cc.join('; '), subject: p.subject, reference: p.reference, attachmentNames: att.map((a) => a.name).join('; '), attachmentCount: att.length, status: 'Sending', operatorEmail: caller.email, operatorName: caller.name, created: new Date().toISOString() };
      lists.log.unshift(row);
      if (failFor.includes(p.recipientKey)) {
        row.status = 'Failed'; row.error = 'Mock: the mail connector rejected the message.';
        return [502, { ...env(false, { messageId: p.messageId, status: 'Failed', logItemId: row.logItemId }, { code: 'SEND_FAILED', message: row.error }) }];
      }
      row.status = 'Sent'; row.sentAt = new Date().toISOString();
      sent.push({ to, cc, bcc, subject: p.subject, htmlBody: p.htmlBody, attachments: att.map((a) => ({ name: a.name, bytes: Buffer.from(a.contentBase64, 'base64').length })) });
      if (lostAnswerFor.includes(p.recipientKey)) return [504, '<html><body>Gateway Timeout</body></html>'];
      return [200, env(true, { messageId: p.messageId, status: 'Sent', duplicate: false, sentAt: row.sentAt, logItemId: row.logItemId, logUpdated: true, to, attachmentCount: att.length, sentFrom: 'connection-owner' })];
    }

    if (key === 'MAIL_LOG') {
      if (operation === 'list') {
        if (p.since && Number.isNaN(Date.parse(p.since))) return errOut(400, 'BAD_SINCE', 'payload.since must be a date and time, e.g. 2026-09-01T00:00:00Z.');
        /* As the flow does: only the newest 5,000 rows are read, then filtered. */
        const items = lists.log.slice(0, 5000).filter((r) => (!p.campaignId || r.campaignId === p.campaignId) && (!p.status || r.status === p.status)).slice(0, Math.min(1000, p.top || 200));
        return [200, env(true, { items, count: items.length })];
      }
      if (operation === 'get') {
        const h = lists.log.filter((r) => r.messageId === p.messageId);
        return h.length ? [200, env(true, { item: h[0], history: h })] : errOut(404, 'NOT_FOUND', 'No log entry carries that messageId.');
      }
    }

    const records = key === 'MAIL_DIRECTORY' ? ['record', lists.directory] : key === 'MAIL_TEMPLATES' ? ['template', lists.templates] : null;
    if (records) {
      const [name, store] = records;
      if (operation === 'list') return [200, env(true, { items: [...store.values()], count: store.size })];
      const rec = p[name] || {};
      const k = String(rec.key || '').trim();
      if (!k) return errOut(400, 'KEY_REQUIRED', `payload.${name}.key is required.`);
      if (operation === 'upsert') {
        const created = !store.has(k);
        if (vOnly) return [200, env(true, { key: k, wouldCreate: created, item: rec }, null, true)];
        store.set(k, { ...rec, key: k, id: store.get(k)?.id || nextId++, modified: new Date().toISOString() });
        return [200, env(true, { key: k, created, id: store.get(k).id })];
      }
      if (operation === 'delete') {
        if (!store.has(k)) return errOut(404, 'NOT_FOUND', 'No record carries that key.');
        if (vOnly) return [200, env(true, { key: k, wouldDelete: true }, null, true)];
        store.delete(k);
        return [200, env(true, { key: k, deleted: true })];
      }
    }

    if (key === 'MAIL_PROVISION' && operation === 'provision') {
      const schema = ctx.lists ? LIST_SCHEMA.filter((l) => ctx.lists.some((x) => x.title === l.title)) : LIST_SCHEMA;
      const report = schema.map((l) => {
        const existed = provisioned.has(l.title);
        if (!vOnly) provisioned.add(l.title);
        /* As the flow does: a private list is made private on every run that is not a plan. */
        if (l.private && !vOnly) privateLists.add(l.title);
        /* As the flow does: Title and Created are indexed on every run that is not a plan. */
        if (!vOnly) indexedLists.add(l.title);
        return { list: l.title, existed, created: !existed && !vOnly, private: l.private === true, isPrivate: privateLists.has(l.title), indexed: indexedLists.has(l.title), missingFields: existed ? [] : l.fields.map((f) => ({ name: f.name })), fieldsCreated: existed || vOnly ? 0 : l.fields.length };
      });
      return [200, env(true, { mode: vOnly ? 'plan' : 'provision', siteUrl: MAILER.siteUrl, lists: report }, null, vOnly)];
    }

    return errOut(400, 'UNKNOWN_OPERATION', `Unsupported operation '${operation}'.`);
  }

  const server = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const key = decodeURIComponent(req.url.split('?')[0].replace(/^\//, ''));
    if (req.method !== 'POST' || !KEYS.includes(key)) {
      res.writeHead(404, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'NotFound', message: 'No mock flow at this path.' } }));
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* treated as empty */ }
      const [status, out] = handle(key, body);
      const raw = typeof out === 'string';
      res.writeHead(status, { ...cors, 'Content-Type': raw ? 'text/html' : 'application/json' });
      res.end(raw ? out : JSON.stringify(out));
    });
  });

  /** The newest code mailed to an address — what a test reads instead of a mailbox. */
  const lastCode = (email) => [...mailbox].reverse().find((m) => m.to === String(email).toLowerCase())?.code || null;
  return { server, lists, sent, mailbox, lastCode, provisioned, operatorKey, handle, faults };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(arg('--port', 8084));
  const key = arg('--key', 'mock-operator-key-0001');
  const operator = arg('--operator', 'operator@nitda.gov.ng');
  const { server } = createMockFlows({ operatorKey: key, operators: [{ email: operator, name: 'Mock Operator', role: 'admin' }], log: (m) => console.log(`  ${m}`) });
  server.listen(port, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${port}`;
    console.log(`Mock mailer flows on ${base} — nothing is emailed.\n`);
    console.log('Put this in config.local.js next to the app\'s index.html (never commit it):\n');
    console.log(`window.DGO_MAILER_CONFIG_LOCAL = {\n  endpoints: {\n${KEYS.map((k) => `    ${k}: '${base}/${k}',`).join('\n')}\n  },\n};\n`);
    console.log(`Sign in as ${operator}; the code is printed here when you ask for one.`);
  });
}
