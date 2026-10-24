// Settings are layered, lowest first:
//
//   DEFAULTS  <  mailer/config.js  <  mailer/config.local.js  <  what the operator saved
//
// The seven flow addresses normally come from the deployment: the hosted mailer's
// config.local.js, written by automatic setup and published with the app, so every device uses
// the same ones and nobody types them. The browser holds no key: operators sign in with a code
// mailed to them (session.js), and the flows' admin key stays inside the flows.

import { Store } from './store.js';
import { esc } from './util.js';

export const ENDPOINT_KEYS = Object.freeze([
  { key: 'MAIL_SEND', flow: 'DGO_MAIL_SEND', purpose: 'Sends each personalised message with its attachments, and logs it.' },
  { key: 'MAIL_LOG', flow: 'DGO_MAIL_LOG', purpose: 'Reads the send log back from SharePoint.' },
  { key: 'MAIL_DIRECTORY', flow: 'DGO_MAIL_DIRECTORY', purpose: 'Shares the addressee directory through SharePoint.' },
  { key: 'MAIL_TEMPLATES', flow: 'DGO_MAIL_TEMPLATES', purpose: 'Shares letter templates through SharePoint.' },
  { key: 'MAIL_PROVISION', flow: 'DGO_MAIL_PROVISION', purpose: 'Creates the SharePoint lists and library the other flows use.' },
  { key: 'MAIL_AUTH', flow: 'DGO_MAIL_AUTH', purpose: 'Signs operators in with a mailed code, and manages who may sign in.' },
  { key: 'MAIL_DATA', flow: 'DGO_MAIL_DATA', purpose: 'Keeps mailings, their results, reports and attached files in SharePoint, for every device.' },
]);

/* What DGO_MAIL_SEND itself accepts (MAILER.maxRecipients, and MAILER.maxAttachmentChars of
   base64: 30,000,000 characters is about 21.4 MB of files). Settings can lower these, never raise
   them: a message the flow would refuse is caught here, at Review, instead of at the send. */
export const FLOW_LIMITS = Object.freeze({ maxRecipients: 10, maxAttachmentMb: 21 });

/** A setting held to 1..the flow's own limit. */
export function clampLimit(value, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), max) : max;
}

const DEFAULTS = {
  endpoints: Object.fromEntries(ENDPOINT_KEYS.map((e) => [e.key, ''])),
  sender: { name: '', title: '', office: 'Office of the Director-General/CEO', organisation: 'National Information Technology Development Agency (NITDA)', email: '', phone: '', signatureHtml: '' },
  operator: { name: '', email: '' },
  allowedSuffixes: ['gov.ng', 'edu.ng'],
  allowedDomains: [],
  maxRecipients: 10,
  maxAttachmentMb: 20,
  sendDelayMs: 2500,
  referencePattern: 'NITDA/DGO/{{Key}}/{{Year}}/{{Seq}}',
  bccSelf: false,
  testAddress: '',
};

/* Where 1.x kept the operator key. Cleared on load: a browser holds no key any more. */
const LEGACY_KEY_STORE = 'dgo-mailer.operatorKey';

function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined || v === null) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = deepMerge(base[k], v);
    else if (typeof v === 'string' && v === '' && typeof base?.[k] === 'string' && base[k] !== '') continue; // an empty override does not blank a configured value
    else out[k] = v;
  }
  return out;
}

export function fileConfig() {
  return deepMerge(deepMerge(DEFAULTS, globalThis.DGO_MAILER_CONFIG || {}), globalThis.DGO_MAILER_CONFIG_LOCAL || {});
}

function forgetLegacyKey() {
  try { sessionStorage.removeItem(LEGACY_KEY_STORE); localStorage.removeItem(LEGACY_KEY_STORE); } catch { /* */ }
}

/** The flow addresses the deployment itself provides (config.js / config.local.js). */
export function deployedEndpoints() {
  const e = fileConfig().endpoints || {};
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v));
}

export async function loadSettings() {
  forgetLegacyKey();
  const saved = await Store.get('settings', {});
  delete saved.operatorKey;
  delete saved.rememberKey;
  const s = deepMerge(fileConfig(), saved);
  /* A deployed address always wins over one saved in this browser. */
  s.endpoints = { ...s.endpoints, ...deployedEndpoints() };
  return s;
}

export async function saveSettings(next) {
  const { operatorKey, rememberKey, ...rest } = next;
  await Store.set('settings', rest);
  return loadSettings();
}

/** True when every flow address comes from the deployment: the hosted mailer. */
export const isDeployed = () => ENDPOINT_KEYS.every((e) => deployedEndpoints()[e.key]);

/** Live when the send flow has a URL; otherwise every send is a simulation. */
export const isLive = (s) => Boolean(s.endpoints?.MAIL_SEND);

/** A signature block from the sender profile, used when none has been written by hand. */
export function signatureHtml(sender = {}) {
  if (sender.signatureHtml && sender.signatureHtml.trim()) return sender.signatureHtml;
  const lines = [
    sender.name && `<strong>${esc(sender.name)}</strong>`,
    sender.title && esc(sender.title),
    sender.office && esc(sender.office),
    sender.organisation && esc(sender.organisation),
    [sender.email && esc(sender.email), sender.phone && esc(sender.phone)].filter(Boolean).join(' · '),
  ].filter(Boolean);
  return `<p style="margin:18px 0 0">Yours faithfully,</p><p style="margin:28px 0 0">${lines.join('<br>')}</p>`;
}

/** Settings as the campaign builder sees them — with the signature resolved. */
export function effective(settings) {
  return {
    ...settings,
    maxRecipients: clampLimit(settings.maxRecipients, FLOW_LIMITS.maxRecipients),
    maxAttachmentMb: clampLimit(settings.maxAttachmentMb, FLOW_LIMITS.maxAttachmentMb),
    sender: { ...settings.sender, signatureHtml: signatureHtml(settings.sender) },
  };
}

/** Settings safe to export or share: no endpoint URLs. */
export function shareable(settings) {
  const { endpoints, operatorKey, rememberKey, ...rest } = settings;
  return { ...rest, endpoints: Object.fromEntries(Object.keys(endpoints || {}).map((k) => [k, ''])) };
}
