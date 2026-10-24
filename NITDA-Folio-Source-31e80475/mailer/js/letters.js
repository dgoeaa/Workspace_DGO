// What the Letters pages share: the kinds of letter in plain words, starting a new letter, and
// how ready a letter is to send. Pure apart from app.saveCampaign; the pages render from this.

import { newCampaign, buildMessages, tally } from './campaign.js';
import { effective, isLive } from './settings.js';

/* The Agency letterhead templates, named the way a registry officer would describe the letter.
   The first is the default for a new letter: the email covers the signed letter, attached. */
export const LETTER_TYPES = Object.freeze([
  { key: 'agency-document-transmittal', label: 'Sending documents', hint: 'A cover email for signed letters or documents attached to it.' },
  { key: 'agency-official-correspondence', label: 'Official letter', hint: 'The letter itself, written in the email, with an optional action and deadline.' },
  { key: 'agency-request-for-information', label: 'Request for information', hint: 'Asks each institution for information or documents by a date.' },
  { key: 'agency-meeting-invitation', label: 'Invitation', hint: 'Invites each institution to a meeting, workshop or engagement.' },
  { key: 'agency-circular-notice', label: 'Circular or notice', hint: 'The same notice to every institution.' },
  { key: 'agency-closure-response', label: 'Final response', hint: 'Closes a matter with a final reply.' },
]);
export const DEFAULT_TYPE = LETTER_TYPES[0].key;

/** The plain name of a letter's kind (a template name for the office's own templates). */
export function typeLabel(app, c) {
  const t = LETTER_TYPES.find((x) => x.key === c.templateKey);
  return t ? t.label : app.state.templates.find((x) => x.key === c.templateKey)?.name || 'Letter';
}

const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** A new draft of the given kind, saved, with a name that follows its title until renamed. */
export async function createLetter(app, templateKey = DEFAULT_TYPE) {
  const tpl = app.state.templates.find((t) => t.key === templateKey) || app.state.templates.find((t) => t.key === DEFAULT_TYPE) || app.state.templates[0];
  const c = newCampaign(tpl, app.state.settings);
  c.name = `New letter — ${today()}`;
  c.autoName = true;
  await app.saveCampaign(c);
  return c;
}

/** A copy of a letter as a fresh draft: same wording, addressees and files; nothing sent. */
export async function duplicateLetter(app, src) {
  const copy = JSON.parse(JSON.stringify(src));
  Object.assign(copy, {
    id: `c${Math.random().toString(36).slice(2, 12)}`,
    name: `${src.name} (copy)`,
    autoName: false,
    status: 'draft',
    results: {},
    tests: [],
    seq: undefined,
    syncedAt: undefined,
    createdAt: new Date().toISOString(),
  });
  await app.saveCampaign(copy);
  return copy;
}

/**
 * How ready a letter is: what is missing before it can go, in the order a person fixes it.
 * `checks` is the checklist shown on the page; `ready` is true when nothing blocks sending.
 */
export function readiness(app, c) {
  const settings = effective(app.state.settings);
  const messages = buildMessages({ campaign: c, directory: app.state.directory, settings, files: app.state.fileIndex });
  const t = tally(c);
  const sentKeys = new Set(Object.entries(c.results || {}).filter(([, r]) => ['sent', 'duplicate'].includes(r.status)).map(([k]) => k));
  const outstanding = messages.filter((m) => !sentKeys.has(m.key));
  const withIssues = outstanding.filter((m) => m.issues.length);
  const lettered = messages.filter((m) => (c.perRecipient?.[m.key] || []).length || (c.commonAttachments || []).length);
  const letterhead = c.templateKind === 'letterhead';
  /* Every letterhead letter needs a title and a message (the platform's own rule). */
  const hasText = letterhead ? Boolean(String(c.fields?.LetterTitle || '').trim() && String(c.fields?.Message || '').trim())
    : Boolean(String(c.subject || '').trim());
  const addressIssue = outstanding.some((m) => m.issues.some((i) => /allowed domains|not an email|No email address|More than/.test(i)));
  const sizeIssue = outstanding.some((m) => m.issues.some((i) => /MB; the limit/.test(i)));
  const checks = [
    { id: 'to', ok: c.recipients.length > 0, text: c.recipients.length ? `${c.recipients.length} addressee${c.recipients.length === 1 ? '' : 's'} chosen` : 'Choose at least one addressee' },
    { id: 'letter', ok: hasText && !outstanding.some((m) => m.issues.some((i) => /required by the|Unfilled field|subject is empty/.test(i))), text: hasText ? 'The letter is written' : 'Write the title and message' },
    { id: 'files', ok: !c.requireAttachment || (messages.length > 0 && lettered.length === messages.length), text: c.requireAttachment ? `${lettered.length} of ${messages.length} addressee${messages.length === 1 ? ' has' : 's have'} a letter attached` : 'Attachments are optional for this letter' },
    { id: 'addresses', ok: messages.length > 0 && !addressIssue, text: addressIssue ? 'Some addresses cannot be sent to' : 'Every address can be sent to' },
    { id: 'size', ok: !sizeIssue, text: sizeIssue ? 'Some emails are over the size limit' : 'Every email is within the size limit' },
  ];
  return {
    messages,
    outstanding,
    withIssues,
    sendable: outstanding.filter((m) => !m.issues.length),
    checks,
    ready: outstanding.length > 0 && withIssues.length === 0,
    live: isLive(settings),
    settings,
    tally: t,
    lettered: lettered.length,
  };
}

/** Relative time in plain words: "just now", "5 min ago", "yesterday", then the date. */
export function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
