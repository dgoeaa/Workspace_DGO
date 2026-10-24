// Copy to mailer/config.local.js (git-ignored) and fill in. Anything set here overrides
// mailer/config.js; anything an operator saves in Settings overrides this.
//
// Each URL is the "HTTP URL" shown on the flow's "When an HTTP request is received" trigger
// after you import and save it. They are credentials: never commit this file once filled.

window.DGO_MAILER_CONFIG_LOCAL = {
  endpoints: {
    MAIL_SEND: '',       // DGO_MAIL_SEND
    MAIL_LOG: '',        // DGO_MAIL_LOG
    MAIL_DIRECTORY: '',  // DGO_MAIL_DIRECTORY
    MAIL_TEMPLATES: '',  // DGO_MAIL_TEMPLATES
    MAIL_PROVISION: '',  // DGO_MAIL_PROVISION
    MAIL_AUTH: '',       // DGO_MAIL_AUTH  (operator sign-in; leave empty for no sign-in)
    MAIL_DATA: '',       // DGO_MAIL_DATA  (letters and files shared in SharePoint; needs MAIL_AUTH)
  },
  sender: {
    name: '',            // e.g. the signatory's name
    title: '',           // e.g. Director-General/CEO
    email: '',
    phone: '',
    signatureHtml: '',   // optional; leave empty to use the generated signature block
  },
};
