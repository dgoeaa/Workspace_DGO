// DGO Correspondence Mailer — committed configuration.
//
// THIS FILE CARRIES NO ENDPOINT URLS, AND MUST NEVER CARRY ONE. A Power Automate trigger URL
// is signed (sig=…) and possession of it is enough to call the flow. Put the seven URLs in
// mailer/config.local.js (git-ignored — copy config.local.example.js), or paste them into
// Settings → Endpoints in the running app, which keeps them in this browser only.
//
// With no URL for MAIL_SEND the mailer runs in SIMULATION mode: every screen works, messages
// are built and previewed exactly as they would be sent, and nothing is transmitted.

window.DGO_MAILER_CONFIG = {
  endpoints: {
    MAIL_SEND: '',
    MAIL_LOG: '',
    MAIL_DIRECTORY: '',
    MAIL_TEMPLATES: '',
    MAIL_PROVISION: '',
    MAIL_AUTH: '',
    MAIL_DATA: '',
  },
  sender: {
    name: '',
    title: '',
    office: 'Office of the Director-General/CEO',
    organisation: 'National Information Technology Development Agency (NITDA)',
    email: '',
    phone: '',
    signatureHtml: '',
  },
  // Mirrors the allowlist inside DGO_MAIL_SEND's Compose_Config. The flow enforces it; the
  // mailer checks it first so a refusal is caught before anything is transmitted.
  allowedSuffixes: ['gov.ng', 'edu.ng'],
  allowedDomains: [],
  maxRecipients: 10,
  maxAttachmentMb: 20,
  // Pause between messages in a batch. Keeps a 25-letter run well inside the Office 365
  // connector's per-connection throttling and makes a stop take effect promptly.
  sendDelayMs: 2500,
  referencePattern: 'NITDA/DGO/{{Key}}/{{Year}}/{{Seq}}',
};
