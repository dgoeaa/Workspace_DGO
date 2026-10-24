// A campaign is one letter sent to many addressees, each copy personalised. This module turns
// a campaign into the exact messages the send flow will receive, and says what is wrong with
// each before anything is transmitted. It is pure — no DOM, no storage, no network — so the
// same code that previews a message is the code tests/mailer.test.mjs holds to account.

import { merge, fieldsIn } from './merge.js';
import { FLOW_LIMITS, clampLimit } from './settings.js';
import { letterDate, isEmail, domainAllowed, splitAddresses, shortId, b64Bytes } from './util.js';
import { LETTERHEAD } from './letterhead.generated.js';
import { letterheadTemplate, renderLetterhead, letterheadDate, REQUIRED_LABEL, CONDITION_FIELDS } from './letterhead.js';

export const IMPORTANCE = ['Low', 'Normal', 'High'];

export function newCampaign(template, settings) {
  const today = new Date();
  return {
    id: `c${shortId()}`,
    name: template ? `${template.name} — ${today.toISOString().slice(0, 10)}` : 'Untitled campaign',
    createdAt: today.toISOString(),
    updatedAt: today.toISOString(),
    status: 'draft',
    templateKey: template?.key || '',
    ...templateParts(template),
    fields: { LetterTitle: '', Message: '' },
    referencePattern: settings?.referencePattern || 'NITDA/DGO/{{Key}}/{{Year}}/{{Seq}}',
    referenceStart: 1,
    date: today.toISOString().slice(0, 10),
    importance: 'Normal',
    recipients: [],
    overrides: {},
    cc: [],
    bcc: [],
    commonAttachments: [],
    perRecipient: {},
    requireAttachment: true,
    results: {},
  };
}

/**
 * What a campaign copies from its template. An HTML template is copied (so editing the template
 * later does not change a mailing in progress); an Agency letterhead template is referenced by
 * id, because its layout is the platform's and is not edited here.
 */
export function templateParts(template) {
  if (template?.kind === 'letterhead') {
    return { templateKind: 'letterhead', letterheadId: template.letterheadId, subject: template.subject, bodyHtml: '' };
  }
  return { templateKind: 'html', letterheadId: '', subject: template?.subject || '', bodyHtml: template?.bodyHtml || '' };
}

/** The fields every message gets from the sender profile in Settings. */
export function senderFields(settings = {}) {
  const s = settings.sender || {};
  return {
    SenderName: s.name || '',
    SenderTitle: s.title || '',
    SenderOffice: s.office || '',
    Organisation: s.organisation || '',
    SenderEmail: s.email || '',
    SenderPhone: s.phone || '',
    SignatureBlock: s.signatureHtml || '',
  };
}

export const RECIPIENT_FIELDS = ['Key', 'Institution', 'Addressee', 'Email', 'Website', 'Salutation', 'Category'];

function recipientFields(r) {
  return {
    Key: r.key, Institution: r.institution, Addressee: r.addressee, Email: r.email,
    Website: r.website, Salutation: r.salutation || 'Sir/Madam', Category: r.category,
  };
}

/**
 * A recipient's sequence number. Before anything is sent it follows the recipient's position.
 * The first live send freezes every recipient's number (freezeSequence): a number once issued
 * never changes, and a recipient added later takes the next unused number, so no two letters
 * of a mailing ever share a reference.
 */
export function seqFor(campaign, key, index) {
  const start = Number(campaign.referenceStart) || 1;
  const frozen = campaign.seq || {};
  if (frozen[key] != null) return frozen[key];
  const used = Object.values(frozen);
  if (!used.length) return start + index;
  const unnumbered = (campaign.recipients || []).filter((k) => frozen[k] == null);
  return Math.max(start - 1, ...used) + 1 + Math.max(0, unnumbered.indexOf(key));
}

/** Give every current recipient a fixed sequence number (called before a live send). */
export function freezeSequence(campaign) {
  const next = { ...(campaign.seq || {}) };
  (campaign.recipients || []).forEach((k, i) => { next[k] = seqFor({ ...campaign, seq: next }, k, i); });
  campaign.seq = next;
  return campaign;
}

export function referenceFor(campaign, key, index) {
  /* Parsed as a local date: "2026-01-01" read as UTC would be 31 December 2025 west of UTC. */
  const d = /^\d{4}-\d{2}-\d{2}$/.test(campaign.date || '') ? new Date(`${campaign.date}T12:00:00`) : new Date(campaign.date || Date.now());
  const seq = String(seqFor(campaign, key, index)).padStart(3, '0');
  return merge(campaign.referencePattern || '', {
    Key: key, Year: String(d.getFullYear()), Month: String(d.getMonth() + 1).padStart(2, '0'), Seq: seq,
  }).text;
}

/** The complete field set for one recipient: sender < campaign < recipient < overrides. */
export function fieldsFor(campaign, recipient, index, settings) {
  const ov = campaign.overrides?.[recipient.key] || {};
  const base = {
    ...senderFields(settings),
    Date: letterDate(campaign.date ? new Date(`${campaign.date}T12:00:00`) : new Date()),
    ...campaign.fields,
    ...recipientFields(recipient),
    Reference: referenceFor(campaign, recipient.key, index),
  };
  for (const [k, v] of Object.entries(ov)) if (!k.startsWith('_') && String(v ?? '').trim() !== '') base[k] = v;
  return base;
}

/**
 * Build every message in the campaign.
 * @param {object} args
 * @param {object} args.campaign
 * @param {object[]} args.directory
 * @param {object} args.settings
 * @param {Record<string, {name:string,size:number,type:string}>} args.files  attachment metadata by id
 * @returns {object[]} one entry per selected recipient, each with `issues` (blocking) and `warnings`
 */
export function buildMessages({ campaign, directory, settings, files = {} }) {
  const byKey = new Map(directory.map((r) => [r.key, r]));
  const allow = { suffixes: settings?.allowedSuffixes || [], domains: settings?.allowedDomains || [] };
  const maxMb = clampLimit(settings?.maxAttachmentMb || 20, FLOW_LIMITS.maxAttachmentMb);
  const maxBytes = maxMb * 1024 * 1024;
  const maxRecipients = clampLimit(settings?.maxRecipients || 10, FLOW_LIMITS.maxRecipients);

  return (campaign.recipients || []).map((key, index) => {
    const r = byKey.get(key);
    const issues = [];
    const warnings = [];
    if (!r) {
      return { key, index, issues: [`${key} is no longer in the directory.`], warnings, to: [], cc: [], bcc: [], attachments: [] };
    }
    const ov = campaign.overrides?.[key] || {};
    const data = fieldsFor(campaign, r, index, settings);
    const attachmentIds = [...(campaign.commonAttachments || []), ...(campaign.perRecipient?.[key] || [])];
    const attachments = attachmentIds.map((id) => ({ id, ...(files[id] || { name: '(missing file)', size: 0, missing: true }) }));
    const letter = campaign.templateKind === 'letterhead' ? letterheadMessage(campaign, data, attachments) : null;
    const subject = letter ? letter.subject : merge(campaign.subject, data, { html: false });
    const body = letter ? letter.body : merge(campaign.bodyHtml, data, { html: true });

    const to = splitAddresses(ov._to || r.email);
    const cc = [...new Set([...splitAddresses(r.cc), ...splitAddresses(ov._cc), ...splitAddresses(campaign.cc)])];
    const bcc = [...new Set([...splitAddresses(campaign.bcc), ...(settings?.bccSelf && settings?.operator?.email ? [settings.operator.email] : [])])];

    if (!to.length) issues.push('No email address — the directory entry has none. Enter a verified address first.');
    for (const a of [...to, ...cc, ...bcc]) {
      if (!isEmail(a)) issues.push(`"${a}" is not an email address.`);
      else if (!domainAllowed(a, allow)) issues.push(`${a} is outside the allowed domains (${allow.suffixes.join(', ') || 'none configured'}); the send flow would refuse it.`);
    }
    if (to.length + cc.length + bcc.length > maxRecipients) issues.push(`More than ${maxRecipients} addresses on one message.`);
    if (r.active === false && to.length) warnings.push('This directory entry is marked inactive.');
    if (r.caution) warnings.push(r.notes || `Verification: ${r.verification}`);

    const missing = [...new Set([...subject.missing, ...body.missing])];
    if (missing.length) issues.push(`Unfilled field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
    if (letter) issues.push(...letter.issues);
    if (!subject.text.trim()) issues.push('The subject is empty.');

    if (attachments.some((a) => a.missing)) issues.push('An attachment has been removed from this browser; re-attach it.');
    const bytes = attachments.reduce((n, a) => n + (a.size || 0), 0);
    if (bytes > maxBytes) issues.push(`Attachments total ${(bytes / 1048576).toFixed(1)} MB; the limit is ${maxMb} MB per message.`);
    if (campaign.requireAttachment && !(campaign.perRecipient?.[key] || []).length && !(campaign.commonAttachments || []).length) {
      issues.push('No letter is attached (this campaign requires one).');
    }

    return {
      key,
      index,
      recipient: r,
      messageId: `${campaign.id}-${key}`,
      reference: data.Reference,
      to, cc, bcc,
      subject: subject.text,
      htmlBody: body.text,
      attachments,
      attachmentBytes: bytes,
      issues,
      warnings,
    };
  });
}

/**
 * One message on the Agency letterhead. The mailer's fields are mapped onto the platform's
 * tokens; everything else — layout, conditional paragraphs, signature, footer — is the
 * platform's own, via renderLetterhead().
 *
 *   recipientName     RecipientName (per addressee) or the directory Salutation — "Dear Sir/Madam,"
 *   subject           LetterTitle
 *   referenceId       Reference (the mailing's pattern, per addressee)
 *   body              Message
 *   actionRequired    ActionRequired      } each also switches its paragraph on,
 *   dueDate           DueDate             } exactly as in the platform
 *   attachmentSummary AttachmentSummary, or the names of the files actually attached
 *   classification    Classification, default Official
 *   priority          the mailing's importance
 *   signatory         the signatory in Settings, else the platform's Registry default
 */
export function letterheadContext(campaign, data, attachments = []) {
  const d = LETTERHEAD.defaults;
  const v = (k) => String(data[k] ?? '').trim();
  return {
    recipientName: v('RecipientName') || v('Salutation') || 'Sir/Ma',
    subject: v('LetterTitle'),
    referenceId: v('Reference'),
    body: v('Message'),
    actionRequired: v('ActionRequired'),
    dueDate: v('DueDate'),
    attachmentSummary: v('AttachmentSummary') || attachments.filter((a) => !a.missing).map((a) => a.name).join('; '),
    classification: v('Classification') || d.classification,
    priority: String(campaign.importance || 'Normal').toLowerCase(),
    signatoryName: v('SignatoryName') || v('SenderName') || d.signatoryName,
    signatoryTitle: v('SignatoryTitle') || v('SenderTitle') || d.signatoryTitle,
  };
}

function letterheadMessage(campaign, data, attachments) {
  const t = letterheadTemplate(campaign.letterheadId);
  if (!t) return { subject: { text: '', missing: [] }, body: { text: '', missing: [] }, issues: [`The Agency letterhead template "${campaign.letterheadId}" no longer exists.`] };
  const ctx = letterheadContext(campaign, data, attachments);
  const date = letterheadDate(campaign.date ? `${campaign.date}T12:00:00` : Date.now());
  const r = renderLetterhead(t, ctx, date);
  /* The platform's validate() requires a subject and a body for every template, on top of each
     template's own list; the same rule applies here. */
  const required = [...new Set(['subject', 'body', ...(t.required || [])])];
  const issues = required.filter((f) => f !== 'recipientEmail' && !ctx[f])
    .map((f) => `${REQUIRED_LABEL[f] || f} is required by the ${t.label} template.`);
  return { subject: { text: r.subject, missing: [] }, body: { text: r.html, missing: [] }, issues };
}

/** Every field the campaign's template uses that is not supplied by the sender, recipient or reference. */
export function campaignFieldNames(campaign) {
  if (campaign.templateKind === 'letterhead') {
    const t = letterheadTemplate(campaign.letterheadId);
    return [...new Set((t?.sections || []).map((s) => CONDITION_FIELDS[s.when]).filter(Boolean))];
  }
  const automatic = new Set(['date', 'reference', ...RECIPIENT_FIELDS.map((f) => f.toLowerCase()),
    ...Object.keys(senderFields()).map((f) => f.toLowerCase())]);
  return fieldsIn(campaign.subject, campaign.bodyHtml).filter((f) => !automatic.has(f.toLowerCase()));
}

/** The request the send flow receives for one message. Attachment content is supplied by the caller. */
export function sendRequest(message, { campaign, settings, attachmentContent, requestId, validationOnly = false }) {
  return {
    operation: 'send',
    requestId,
    validationOnly,
    ...(settings.operatorKey ? { operatorKey: settings.operatorKey } : {}),
    operator: { email: settings.operator?.email || '', name: settings.operator?.name || '' },
    payload: {
      messageId: message.messageId,
      campaignId: campaign.id,
      recipientKey: message.key,
      institution: message.recipient?.institution || '',
      addressee: message.recipient?.addressee || '',
      reference: message.reference,
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      htmlBody: message.htmlBody,
      importance: IMPORTANCE.includes(campaign.importance) ? campaign.importance : 'Normal',
      attachments: message.attachments.map((a) => ({
        name: a.name,
        contentType: a.type || 'application/octet-stream',
        contentBase64: attachmentContent ? attachmentContent[a.id] : undefined,
      })),
    },
  };
}

/** Summarise results for a campaign card. */
export function tally(campaign) {
  const t = { total: campaign.recipients?.length || 0, sent: 0, failed: 0, pending: 0, simulated: 0 };
  for (const key of campaign.recipients || []) {
    const s = campaign.results?.[key]?.status;
    if (s === 'sent' || s === 'duplicate') t.sent++;
    else if (s === 'failed' || s === 'refused') t.failed++;
    else if (s === 'simulated') t.simulated++;
    else t.pending++;
  }
  return t;
}

export { b64Bytes };
