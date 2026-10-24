// The send engine. It lives outside any view so a batch keeps running, and keeps reporting,
// while the operator moves between screens.
//
// One message at a time, in order, with a pause between each. For each message:
//   200                    → sent (or "sent earlier" when the flow found the messageId already Sent)
//   401 SIGN_IN_REQUIRED   → the run pauses and the message stays pending: sign in, then Resume.
//   503 SIGN_IN_CHECK_FAILED → nothing was done (SharePoint did not answer the sign-in look-up):
//                            asked again after a pause.
//   502 SEND_FAILED        → failed. The flow logged it Failed; it is never re-sent automatically,
//                            because the mail service may have taken it anyway.
//   other 4xx with JSON    → refused: the flow looked at it and said no. Retrying cannot help.
//   anything else          → the outcome is UNKNOWN: no answer, a timeout, a 5xx, or 409
//                            IN_PROGRESS. The run may still be sending, or may have sent. The log
//                            (DGO_MAIL_LOG get) is read until it says Sent, Failed or nothing:
//                            Sent is taken as sent, nothing at all means the request never
//                            started a run and it is safe to send again, and anything else is
//                            marked failed with "check the log" — never sent a second time blind.
//
// messageId is stable (campaign id + recipient key), DGO_MAIL_SEND will not send a messageId its
// log records as Sent or still Sending, and it runs one send at a time.
//
// A dry run (dryRun) walks the same queue through the same flow with validationOnly:true: the
// flow runs every check it runs for a real send (key, allowlist, recipients, subject, body,
// attachments) and stops before its first write. Nothing is sent, logged or marked.
//
// Every run — send, dry run, test — produces a report (reports.js) with one line per message.

import { buildMessages, sendRequest, freezeSequence } from './campaign.js';
import { callFlow, describe, envelope } from './api.js';
import { Store } from './store.js';
import { effective, isLive } from './settings.js';
import { shortId, sleep, uid, fmtBytes } from './util.js';
import { Reports } from './reports.js';

const RETRY_BACKOFF_MS = [4000, 10000];
/* How often, and how long, the log is read to learn the outcome of a send whose answer was lost. */
const RECONCILE_WAITS_MS = [5000, 10000, 20000, 30000];

export const Sender = {
  run: null,
  listeners: new Set(),
  /* Set by app.js when data is shared: fetch a file this browser does not hold, and save what is
     waiting to SharePoint before a batch, so every device sees the same mailing. */
  fetchFile: null,
  beforeSend: null,

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { for (const fn of this.listeners) { try { fn(this.run); } catch { /* a view went away */ } } },

  busy() { return Boolean(this.run && !this.run.finished); },
  pause() { if (this.run) { this.run.paused = true; this.emit(); } },
  resume() { if (this.run) { this.run.paused = false; this.emit(); } },
  stop() { if (this.run) { this.run.stopped = true; this.run.paused = false; this.emit(); } },

  /**
   * Send the campaign's outstanding messages.
   * @param {object} app  the App (for state and persistence)
   * @param {string} campaignId
   * @param {{keys?: string[]}} opts  limit to these recipients (e.g. retry the failed ones)
   */
  async start(app, campaignId, { keys, quiet = false } = {}) {
    if (this.busy()) throw new Error('A batch is already being sent. Stop it first.');
    /* Claimed before the first await: a second Send (or a Dry run) pressed while the uploads
       below are saved finds the run busy, instead of starting a second loop over the same
       messages. */
    this.run = { mode: 'send', campaignId, starting: true, live: false, total: 0, index: 0, current: null, paused: false, stopped: false, finished: false, startedAt: new Date().toISOString() };
    this.emit();
    let campaign;
    try {
      await this.beforeSend?.();
      campaign = app.state.campaigns.find((c) => c.id === campaignId);
      if (!campaign) throw new Error('Campaign not found.');
    } catch (e) {
      this.run = null;
      this.emit();
      throw e;
    }

    const settings = effective(app.state.settings);
    const live = isLive(settings);
    /* A live send issues reference numbers: they are fixed now, so adding or removing a recipient
       later never renumbers a letter that has gone out. */
    if (live) freezeSequence(campaign);
    const messages = buildMessages({ campaign, directory: app.state.directory, settings, files: app.state.fileIndex });
    const done = (k) => ['sent', 'duplicate'].includes(campaign.results?.[k]?.status) || (!live && campaign.results?.[k]?.status === 'simulated');
    const queue = messages.filter((m) => (keys ? keys.includes(m.key) : !done(m.key)));

    Object.assign(this.run, { starting: false, live, total: queue.length });
    const report = Reports.begin(app, 'send', campaign.name, {
      Mode: live ? 'Live — sent through DGO_MAIL_SEND' : 'Simulation — nothing transmitted',
      Mailing: `${campaign.name} (${campaign.id})`,
      Template: templateName(app, campaign),
      Messages: keys ? `${queue.length} (retrying failed ones)` : String(queue.length),
    });
    /* A letter deleted while it is being sent stops the run, and is never saved back (saving
       would bring the deleted letter back here and in SharePoint). */
    const deleted = () => !app.state.campaigns.some((x) => x.id === campaign.id);
    const save = async () => { if (!deleted()) await app.saveCampaign(campaign); };
    campaign.status = 'sending';
    campaign.results ||= {};
    await save();
    this.emit();

    for (const m of queue) {
      while (this.run.paused && !this.run.stopped) await sleep(250);
      if (deleted()) { this.run.stopped = true; this.run.deleted = true; }
      if (this.run.stopped) break;
      this.run.current = m.key;
      this.emit();

      if (m.issues.length) {
        campaign.results[m.key] = { status: 'skipped', at: new Date().toISOString(), error: m.issues.join(' '), messageId: m.messageId };
      } else {
        const before = campaign.results[m.key];
        let result;
        for (;;) {
          campaign.results[m.key] = { ...(before || {}), status: 'sending', messageId: m.messageId };
          await save();
          this.emit();
          result = live ? await sendOne(settings, campaign, m) : await simulate(m);
          if (result.status !== 'signin') break;
          /* The session ended mid-batch. Nothing was sent for this message: it stays as it was,
             and the run waits for the operator to sign in again and press Resume. */
          if (before) campaign.results[m.key] = before; else delete campaign.results[m.key];
          await save();
          this.run.paused = true;
          this.run.waitingForSignIn = true;
          this.emit();
          while (this.run.paused && !this.run.stopped) await sleep(250);
          this.run.waitingForSignIn = false;
          if (this.run.stopped) break;
        }
        if (this.run.stopped && result?.status === 'signin') break;
        /* The reference the letter actually carried, kept with its result. */
        campaign.results[m.key] = { ...result, reference: m.reference };
      }
      await save();
      addSendLine(report, m, campaign.results[m.key]);
      this.run.index++;
      this.emit();
      if (this.run.index < queue.length && !this.run.stopped) await sleep(live ? Number(settings.sendDelayMs) || 0 : 150);
    }
    const stoppedEarly = this.run.stopped && this.run.index < queue.length;
    if (stoppedEarly) for (const m of queue.slice(this.run.index)) report.add(label(m), 'skip', 'Not attempted: the run was stopped before this message.');

    const all = campaign.recipients.map((k) => campaign.results?.[k]?.status);
    /* A simulated result counts only in a simulation: in a live run it means nothing was sent. */
    campaign.status = all.every((s) => s === 'sent' || s === 'duplicate' || (!live && s === 'simulated')) ? 'done' : 'partial';
    campaign.lastRunAt = new Date().toISOString();
    await save();
    this.run.finished = true;
    this.run.current = null;
    this.emit();
    await report.finish(this.run.deleted ? `The letter was deleted during the send: ${this.run.index} of ${queue.length} went; the rest were not sent.`
      : stoppedEarly ? `Stopped by the operator after ${this.run.index} of ${queue.length} messages.` : '', { show: !quiet });
    this.run.reportId = report.id;
    return campaign;
  },

  /**
   * Dry run: every outstanding message through DGO_MAIL_SEND with validationOnly:true.
   * Nothing is sent, logged or marked; the report says what would happen to each message.
   */
  async dryRun(app, campaignId, { keys, quiet = false } = {}) {
    if (this.busy()) throw new Error('A batch is already running. Wait for it to finish.');
    const campaign = app.state.campaigns.find((c) => c.id === campaignId);
    if (!campaign) throw new Error('Campaign not found.');
    const settings = effective(app.state.settings);
    const live = isLive(settings);
    const messages = buildMessages({ campaign, directory: app.state.directory, settings, files: app.state.fileIndex });
    const queue = keys ? messages.filter((m) => keys.includes(m.key)) : messages;
    this.run = { mode: 'dryrun', campaignId, live, total: queue.length, index: 0, current: null, paused: false, stopped: false, finished: false, startedAt: new Date().toISOString(), outcomes: {} };
    /* Each message's verdict, by key, for a page that shows it on the addressee's own row. */
    const note = (m, outcome, detail) => { this.run.outcomes[m.key] = { outcome, detail: String(detail).split('\n')[0] }; };
    const report = Reports.begin(app, 'dryrun', campaign.name, {
      Mode: live ? 'Checked by DGO_MAIL_SEND (validationOnly) — nothing sent' : 'Checked in the mailer only — MAIL_SEND is not wired',
      Mailing: `${campaign.name} (${campaign.id})`,
      Template: templateName(app, campaign),
      Messages: String(queue.length),
      Attachments: 'Sizes and names checked; file content is not uploaded during a dry run',
    });
    this.emit();
    for (const m of queue) {
      if (this.run.stopped) break;
      this.run.current = m.key;
      this.emit();
      const what = `To ${m.to.join(', ') || '—'}${m.cc.length ? `; cc ${m.cc.join(', ')}` : ''}${m.bcc.length ? `; bcc ${m.bcc.join(', ')}` : ''}\nSubject: ${m.subject}\nAttachments: ${m.attachments.map((a) => `${a.name} (${fmtBytes(a.size)})`).join(', ') || 'none'}`;
      const warn = m.warnings.length ? `\nNote: ${m.warnings.join(' ')}` : '';
      if (m.issues.length) { report.add(label(m), 'fail', `Would not be sent: ${m.issues.join(' ')}\n${what}`); note(m, 'fail', `Would not be sent: ${m.issues.join(' ')}`); }
      else if (!live) { report.add(label(m), m.warnings.length ? 'warn' : 'ok', `Passes the mailer's checks.\n${what}${warn}`); note(m, m.warnings.length ? 'warn' : 'ok', 'Passes the checks.'); }
      else {
        const placeholder = Object.fromEntries(m.attachments.map((a) => [a.id, 'UFJFRkxJR0hU']));
        const res = await callFlow(settings, 'MAIL_SEND', sendRequest(m, { campaign, settings, attachmentContent: placeholder, requestId: uid('dry'), validationOnly: true }), { timeoutMs: 60000 });
        if (res.ok && res.json?.validationOnly) { report.add(label(m), m.warnings.length ? 'warn' : 'ok', `Accepted by the flow; would be sent.\n${what}${warn}`); note(m, m.warnings.length ? 'warn' : 'ok', 'Accepted by the send flow; would be sent.'); }
        else { report.add(label(m), 'fail', `Refused: ${describe(res)}\n${what}`); note(m, 'fail', `Refused: ${describe(res)}`); }
        if (!res.reached || [401, 503].includes(res.status)) {
          for (const rest of queue.slice(this.run.index + 1)) report.add(label(rest), 'skip', 'Not checked: the flow could not be used (see the line above).');
          this.run.index = queue.length;
          break;
        }
      }
      this.run.index++;
      this.emit();
      if (live) await sleep(300);
    }
    this.run.finished = true;
    this.run.current = null;
    this.emit();
    const c = report.counts();
    await report.finish(c.fail ? `${c.fail} of ${queue.length} message(s) would not be sent. Fix them before sending.` : `All ${queue.length} message(s) would be sent. Nothing was sent.`, { show: !quiet });
    this.run.reportId = report.id;
    return report;
  },

  /** One message, for real, to a test address instead of the addressee. */
  async test(app, campaign, key, address) {
    const settings = effective(app.state.settings);
    const m = buildMessages({ campaign, directory: app.state.directory, settings, files: app.state.fileIndex }).find((x) => x.key === key);
    if (!m) throw new Error(`${key} is not a recipient of this mailing.`);
    const blocking = m.issues.filter((i) => !/outside the allowed domains|not an email address|No email address/.test(i));
    if (blocking.length) throw new Error(blocking.join(' '));
    const probe = {
      ...m,
      messageId: `${campaign.id}-TEST-${shortId()}`,
      to: [address], cc: [], bcc: [],
      subject: `[TEST — not sent to ${m.recipient.institution}] ${m.subject}`,
    };
    if (!isLive(settings)) {
      await sleep(300);
      return { status: 'simulated', messageId: probe.messageId, at: new Date().toISOString() };
    }
    const r = await sendOne(settings, campaign, probe);
    if (r.status === 'signin') throw new Error('Your session has ended. Sign in again, then send the test.');
    return r;
  },
};

async function loadContent(message) {
  const content = {};
  for (const a of message.attachments) {
    /* A file attached on another device is fetched from SharePoint (app.js sets fetchFile). */
    const f = Sender.fetchFile ? await Sender.fetchFile(a.id) : await Store.getFile(a.id);
    if (!f) throw new Error(`Attachment ${a.name} is neither in this browser nor in SharePoint.`);
    content[a.id] = f.data;
  }
  return content;
}

/** How a send answer is handled; see the header of this file. */
export function classifySend(res, messageId) {
  const code = res.json?.error?.code || '';
  if (res.ok && res.json?.success === true && (!res.json?.data?.messageId || res.json.data.messageId === messageId)) return 'sent';
  if (code === 'SIGN_IN_REQUIRED') return 'signin';
  if (code === 'SIGN_IN_CHECK_FAILED') return 'retry';
  if (code === 'SEND_FAILED') return 'failed';
  if (code === 'IN_PROGRESS') return 'unknown';
  if (res.reached && !res.blocked && res.json && res.status >= 400 && res.status < 500) return 'refused';
  return 'unknown';
}

/**
 * Read the log for a message whose send answer was lost.
 * @returns {Promise<{state:'sent'|'failed'|'absent'|'unknown', item?:object, why?:string}>}
 */
/* "No row" is believed only when a second read, this long after the first, agrees: a run that
   is still signing the caller in has not written its row yet. */
const ABSENT_CONFIRM_MS = 30000;

async function reconcile(settings, messageId, waits = RECONCILE_WAITS_MS, absentAfterMs = ABSENT_CONFIRM_MS) {
  let why = 'the log still shows it Sending';
  let firstAbsent = 0;
  for (let i = 0; i <= waits.length; i++) {
    let res;
    try { res = await callFlow(settings, 'MAIL_LOG', envelope(settings, 'get', { messageId }), { timeoutMs: 60000 }); }
    catch (e) { return { state: 'unknown', why: e.message }; }
    if (res.status === 404 && res.json?.error?.code === 'NOT_FOUND') {
      if (firstAbsent && Date.now() - firstAbsent >= absentAfterMs) return { state: 'absent' };
      if (!firstAbsent) firstAbsent = Date.now();
      await sleep(Math.max(0, absentAfterMs - (Date.now() - firstAbsent)));
      i--; // the confirming read does not use up a wait
      continue;
    }
    if (res.ok) {
      const history = res.json?.data?.history || [res.json?.data?.item].filter(Boolean);
      const sent = history.find((h) => h?.status === 'Sent');
      if (sent) return { state: 'sent', item: sent };
      if (!history.some((h) => h?.status === 'Sending')) return { state: 'failed', item: history[0], why: history[0]?.error || 'the log shows it Failed' };
    } else {
      why = `the log could not be read (${describe(res)})`;
      if (res.json?.error?.code === 'SIGN_IN_REQUIRED') return { state: 'unknown', why };
    }
    if (i < waits.length) await sleep(waits[i]);
  }
  return { state: 'unknown', why };
}

async function sendOne(settings, campaign, message, { waits = RECONCILE_WAITS_MS, backoff = RETRY_BACKOFF_MS, absentAfterMs = ABSENT_CONFIRM_MS } = {}) {
  let content;
  try { content = await loadContent(message); }
  catch (e) {
    /* A signed letter kept only in SharePoint cannot be fetched once the session has ended: the
       run pauses for sign-in, as it does for the send itself, instead of failing the message. */
    if (/SIGN_IN_REQUIRED/.test(e.message || '')) return { status: 'signin', messageId: message.messageId };
    return { status: 'failed', at: new Date().toISOString(), error: e.message, messageId: message.messageId, attempts: 0 };
  }

  const out = (status, extra = {}) => ({ status, at: new Date().toISOString(), messageId: message.messageId, ...extra });
  let last = null;
  let attempts = 0;
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    const body = sendRequest(message, { campaign, settings, attachmentContent: content, requestId: uid('req') });
    const res = await callFlow(settings, 'MAIL_SEND', body);
    last = res;
    attempts = attempt + 1;
    const verdict = classifySend(res, message.messageId);
    if (verdict === 'sent') {
      const d = res.json?.data || {};
      return out(d.duplicate ? 'duplicate' : 'sent', {
        at: d.sentAt || new Date().toISOString(),
        logItemId: d.logItemId ?? null,
        logUpdated: d.logUpdated ?? null,
        runId: res.json?.runId || null,
        attempts,
      });
    }
    if (verdict === 'signin') return out('signin');
    if (verdict === 'refused') return out('refused', { error: describe(res), httpStatus: res.status, runId: res.json?.runId || null, attempts });
    if (verdict === 'failed') {
      return out('failed', { error: `${describe(res)} It was logged Failed and is not re-sent automatically: check the recipient's mailbox or the log, then use Retry failed.`, httpStatus: res.status, runId: res.json?.runId || null, logItemId: res.json?.data?.logItemId ?? null, attempts });
    }
    if (verdict === 'unknown') {
      /* The request may have started a run that is sending, or has sent. Find out before anything else. */
      const r = await reconcile(settings, message.messageId, waits, absentAfterMs);
      if (r.state === 'sent') return out('sent', { at: r.item.sentAt || new Date().toISOString(), logItemId: r.item.logItemId ?? null, runId: r.item.flowRunId || null, attempts, reconciled: true });
      if (r.state === 'failed') return out('failed', { error: `${describe(res)} The log shows it Failed${r.why ? ` (${r.why})` : ''}; it is not re-sent automatically.`, httpStatus: res.status, logItemId: r.item?.logItemId ?? null, attempts });
      if (r.state !== 'absent') {
        return out('failed', { uncertain: true, error: `Outcome unknown — ${describe(res)}; ${r.why}. It may have been sent: check the Outbox log before retrying (a retry never sends a message the log shows as Sent).`, httpStatus: res.status, attempts });
      }
      /* The log has no row: the request never started a send, so asking again cannot send twice. */
    }
    if (attempt < backoff.length) await sleep(backoff[attempt]);
  }
  return out('failed', { error: describe(last), httpStatus: last.status, runId: last.json?.runId || null, attempts });
}

/* For tests: the one-message send with its waits shortened. */
export const _sendOne = sendOne;

async function simulate(message) {
  await sleep(350);
  return { status: 'simulated', at: new Date().toISOString(), messageId: message.messageId, attempts: 1 };
}

const label = (m) => `${m.key} — ${m.recipient?.institution || ''}`.replace(/ — $/, '');

function templateName(app, campaign) {
  return app.state.templates.find((t) => t.key === campaign.templateKey)?.name || campaign.templateKey || '—';
}

const SEND_OUTCOME = {
  sent: ['ok', 'Sent'],
  duplicate: ['ok', 'Already sent earlier — not sent again'],
  simulated: ['info', 'Simulated — nothing transmitted'],
  refused: ['fail', 'Refused by the flow'],
  failed: ['fail', 'Failed'],
  skipped: ['skip', 'Not sent'],
};

function addSendLine(report, m, r = {}) {
  const [outcome, headline] = SEND_OUTCOME[r.status] || ['info', r.status || 'Unknown'];
  const lines = [
    headline + (r.error ? `: ${r.error}` : ''),
    `To ${m.to.join(', ') || '—'}${m.cc.length ? `; cc ${m.cc.join(', ')}` : ''}`,
    `Reference ${m.reference}`,
    `Attachments: ${m.attachments.map((a) => a.name).join(', ') || 'none'}`,
  ];
  if (r.logItemId) lines.push(`Log entry #${r.logItemId}`);
  if (r.attempts > 1) lines.push(`${r.attempts} attempts`);
  if (r.runId) lines.push(`Flow run ${r.runId}`);
  report.add(label(m), outcome, lines.join('\n'), { messageId: m.messageId });
}
