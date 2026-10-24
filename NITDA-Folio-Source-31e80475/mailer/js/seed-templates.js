// Starter letter templates. Operators edit these in the Templates view; with DGO_MAIL_TEMPLATES
// wired they are shared through SharePoint, otherwise they live in this browser.
//
// Email bodies use inline styles only — Outlook strips <style> blocks and ignores most CSS
// classes, so anything not inline does not survive delivery.
//
// Fields:  recipient  Key Institution Addressee Email Website Salutation Category
//          campaign   LetterTitle Reference Date Message (and any custom field you add)
//          A trailing ? makes a field optional: {{Message?}} prints nothing when left empty.
//          sender     SenderName SenderTitle SenderOffice Organisation SenderEmail SenderPhone
//                     {{{SignatureBlock}}}  (triple braces: operator-authored HTML, not escaped)

const WRAP_OPEN = '<div style="font-family:Cambria,Georgia,\'Times New Roman\',serif;font-size:15px;line-height:1.6;color:#1b1b1b;max-width:700px">';
const WRAP_CLOSE = '</div>';

const HEADER = `
<p style="margin:0 0 14px"><strong>Ref:</strong> {{Reference}}<br><strong>Date:</strong> {{Date}}</p>
<p style="margin:0 0 14px">{{Addressee}}<br>{{Institution}}</p>
<p style="margin:0 0 14px">{{Salutation}},</p>
<p style="margin:0 0 14px;font-weight:bold;text-transform:uppercase;text-decoration:underline">{{LetterTitle}}</p>`;

const CLOSE = `
<p style="margin:0 0 14px">Please accept the assurances of the highest regards of the {{SenderOffice}}.</p>
{{{SignatureBlock}}}`;

export const SEED_TEMPLATES = Object.freeze([
  {
    key: 'cover-letter',
    name: 'Official letter — cover email (letter attached)',
    description: 'Transmits an attached signed letter. The letter itself is the attachment; this email introduces it.',
    subject: '{{LetterTitle}} — Ref: {{Reference}}',
    bodyHtml: `${WRAP_OPEN}${HEADER}
<p style="margin:0 0 14px">Please find attached a letter from the {{SenderOffice}}, {{Organisation}}, on the above subject, for your kind attention and necessary action.</p>
<p style="margin:0 0 14px">{{Message?}}</p>
<p style="margin:0 0 14px">We would be grateful if you could acknowledge receipt of this correspondence by replying to this email.</p>
${CLOSE}${WRAP_CLOSE}`,
  },
  {
    key: 'invitation',
    name: 'Invitation — meeting, workshop or engagement',
    description: 'Invites the addressee (or a representative) to an event. Add EventDate, EventTime and Venue as campaign fields.',
    subject: 'Invitation: {{LetterTitle}} — {{EventDate}}',
    bodyHtml: `${WRAP_OPEN}${HEADER}
<p style="margin:0 0 14px">The {{Organisation}} has the honour to invite {{Addressee}}, or a senior representative, to the <strong>{{LetterTitle}}</strong>.</p>
<table role="presentation" style="border-collapse:collapse;margin:0 0 14px">
<tr><td style="padding:4px 14px 4px 0;font-weight:bold">Date</td><td style="padding:4px 0">{{EventDate}}</td></tr>
<tr><td style="padding:4px 14px 4px 0;font-weight:bold">Time</td><td style="padding:4px 0">{{EventTime}}</td></tr>
<tr><td style="padding:4px 14px 4px 0;font-weight:bold">Venue</td><td style="padding:4px 0">{{Venue}}</td></tr>
</table>
<p style="margin:0 0 14px">{{Message?}}</p>
<p style="margin:0 0 14px">The formal letter of invitation is attached. Kindly confirm attendance by replying to this email.</p>
${CLOSE}${WRAP_CLOSE}`,
  },
  {
    key: 'follow-up',
    name: 'Follow-up — reminder on an earlier letter',
    description: 'Refers back to earlier correspondence. Add PreviousReference and PreviousDate as campaign or per-recipient fields.',
    subject: 'Reminder: {{LetterTitle}} — Ref: {{Reference}}',
    bodyHtml: `${WRAP_OPEN}${HEADER}
<p style="margin:0 0 14px">We refer to our letter Ref: <strong>{{PreviousReference}}</strong> dated {{PreviousDate}} on the above subject, a copy of which is attached for ease of reference.</p>
<p style="margin:0 0 14px">{{Message?}}</p>
<p style="margin:0 0 14px">We would appreciate your response at your earliest convenience.</p>
${CLOSE}${WRAP_CLOSE}`,
  },
].map(Object.freeze));
