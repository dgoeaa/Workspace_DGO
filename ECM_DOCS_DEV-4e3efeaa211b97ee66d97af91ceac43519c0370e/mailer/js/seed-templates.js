// Starter letter templates. Operators edit these in the Templates view; with DGO_MAIL_TEMPLATES
// wired they are shared through SharePoint, otherwise they live in this browser.
//
// Each is a letter of the e-mail template package (ML-Cover-Letter, ML-Invitation, ML-Follow-Up; register rows
// TR-091 to TR-093), compiled into seed-letters.generated.js: a complete document with inline styles only —
// Outlook strips <style> blocks and ignores most CSS classes, so anything not inline does not survive delivery;
// the document's <style> holds only the mobile and print refinements.
//
// Fields:  recipient  Key Institution Addressee Email Website Salutation Category
//          campaign   LetterTitle Reference Date Year Message (and any custom field you add)
//          A trailing ? makes a field optional: {{Message?}} prints nothing when left empty.
//          sender     SenderName SenderTitle SenderOffice Organisation SenderEmail SenderPhone

import { SEED_LETTERS } from './seed-letters.generated.js';

const letter = (id) => SEED_LETTERS[id];

export const SEED_TEMPLATES = Object.freeze([
  {
    key: 'cover-letter',
    name: 'Official letter — cover email (letter attached)',
    description: 'Transmits an attached signed letter. The letter itself is the attachment; this email introduces it.',
    design: 'ML-Cover-Letter',
    subject: letter('ML-Cover-Letter').subject,
    bodyHtml: letter('ML-Cover-Letter').bodyHtml,
  },
  {
    key: 'invitation',
    name: 'Invitation — meeting, workshop or engagement',
    description: 'Invites the addressee (or a representative) to an event. Add EventDate, EventTime and Venue as campaign fields.',
    design: 'ML-Invitation',
    subject: letter('ML-Invitation').subject,
    bodyHtml: letter('ML-Invitation').bodyHtml,
  },
  {
    key: 'follow-up',
    name: 'Follow-up — reminder on an earlier letter',
    description: 'Refers back to earlier correspondence. Add PreviousReference and PreviousDate as campaign or per-recipient fields.',
    design: 'ML-Follow-Up',
    subject: letter('ML-Follow-Up').subject,
    bodyHtml: letter('ML-Follow-Up').bodyHtml,
  },
].map(Object.freeze));
