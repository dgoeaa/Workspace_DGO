/**
 * The intake list's email records (essentials plan UX-201, docs/architecture/ESSENTIALS_MAP.md E-2).
 *
 * Email is one of the four intakes, but its messages converged on a collection of their own (`emails`) and Intake showed
 * them behind a separate "Emails (n)" button. They now sit in the one intake list, as records not yet registered, with
 * Register as their first action. Once registered, a message is a correspondence record like any other and leaves the
 * list as a message.
 *
 * A message is registered when a record names it (`sourceEmailId`, written by Intake when it registers one), or, on a
 * device that did not register it, when an email record carries the subject and sender the register write sent: the
 * register write (core/server-payloads.js `register`) sends subject, channel and sender, and nothing else that would
 * identify the message. Pure: tests call it with a state object.
 */
export const NOT_REGISTERED = 'Not registered';

const txt = (v) => String(v ?? '').trim();
const same = (a, b) => !!txt(a) && txt(a).toLowerCase() === txt(b).toLowerCase();
const isEmailRecord = (r) => /^e-?mail$/i.test(txt(r.channel)) || txt(r.entryPoint) === 'email';

/** Whether a message has become a record: named by one, or matched by the subject and sender its registration sent. */
export function isRegistered(email, records = []) {
  return records.some((r) => (txt(r?.sourceEmailId) && txt(r.sourceEmailId) === txt(email?.id))
    || (r && isEmailRecord(r) && same(r.subject || r.title, email?.subject) && same(r.senderEmail, email?.fromAddress)));
}

/** The messages that are still to be registered, newest first. */
export function unregisteredEmails(state = {}) {
  const records = [...(state.correspondence || []), ...(state.activities || []), ...(state.portalRegister || [])];
  return (state.emails || [])
    .filter((e) => e && !isRegistered(e, records))
    .sort((a, b) => (Date.parse(b.receivedDateTime) || 0) - (Date.parse(a.receivedDateTime) || 0));
}
