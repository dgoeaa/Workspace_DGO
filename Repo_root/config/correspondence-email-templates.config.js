/* The letterhead names the Agency, not the platform that sent it. An addressee in another
   ministry knows NITDA; "NITDA Folio" is the name of an internal tool, and printing it as the
   title of an official letter made the tool look like the sender. The same values are compiled
   into the DGO Correspondence Mailer (npm run mailer:letterhead), so both send one letterhead. */
export const CorrespondenceEmailTemplateConfig = Object.freeze({
  schema: 'dgo-correspondence-email-templates/v1',
  brand: Object.freeze({
    agency: 'National Information Technology Development Agency',
    office: 'Office of the Director-General/CEO',
    ministry: 'Federal Ministry of Communications, Innovation & Digital Economy',
    deepGreen: '#05583B',
    smartGreen: '#17B255',
    ink: '#373435',
    line: '#E8E6E7',      // --dgo-ink-100
    paper: '#FAFAF9',     // --dgo-ink-25
    muted: '#5F5C5D',     // --dgo-ink-500: secondary text, e.g. the confidentiality notice
    onAccent: '#011610'   // --dgo-green-950: text on Smart Green (white on it is 2.79:1)
  }),
  defaults: Object.freeze({
    fromName: 'Office of the Director-General / Registry',
    replyTo: 'dgsregistry@nitda.gov.ng',
    classification: 'Official',
    signatoryName: 'Registry, Office of the Director-General',
    signatoryTitle: 'For: Director-General/CEO'
  }),
  /* Each template names its design in the e-mail template package (docs/folio-Master-Flows-and-Endpoints/email-templates/,
     rows TR-082 to TR-087 for the Desk, TR-094 to TR-099 for the Mailer letterhead). The design's fragment
     (config/email-fragments.generated.js) holds the wording and layout; `variants` names the design sent when a
     condition's field is empty (for example a letter with no reply-by date); `optional` lists the lines left out
     when their field is empty. */
  templates: Object.freeze([
    { id:'official-correspondence', label:'Official Correspondence', category:'Formal Response', tone:'formal', subject:'{{referenceId}} — {{subject}}', required:['recipientEmail','subject','referenceId','body'],
      design:'CL-Official', variants:[{ when:['hasActionRequired','hasDueDate'], otherwise:'CL-Official--no-optional-lines' }], optional:['actionRequired','dueDate'] },
    { id:'request-for-information', label:'Request for Information / Documents', category:'Request', tone:'diplomatic', subject:'Request for Information — {{referenceId}}', required:['recipientEmail','referenceId','body'],
      design:'CL-Request-Info', variants:[{ when:['hasDueDate'], otherwise:'CL-Request-Info--no-due-date' }], optional:['dueDate'] },
    { id:'document-transmittal', label:'Document Transmittal', category:'Transmittal', tone:'formal', subject:'Transmittal — {{referenceId}} — {{subject}}', required:['recipientEmail','referenceId'],
      design:'CL-Transmittal', variants:[{ when:['hasAttachments'], otherwise:'CL-Transmittal--no-attachments' }], optional:['attachmentSummary'] },
    { id:'meeting-invitation', label:'Meeting / Engagement Invitation', category:'Invitation', tone:'formal', subject:'Invitation — {{subject}} — {{referenceId}}', required:['recipientEmail','subject','body'],
      design:'CL-Invitation', variants:[{ when:['hasDueDate'], otherwise:'CL-Invitation--no-due-date' }], optional:['dueDate'] },
    { id:'circular-notice', label:'Circular / General Notice', category:'Notice', tone:'official', subject:'Circular / Notice — {{subject}}', required:['recipientEmail','subject','body'],
      design:'CL-Circular', variants:[], optional:[] },
    { id:'closure-response', label:'Closure / Final Response', category:'Closure', tone:'formal', subject:'Final Response — {{referenceId}}', required:['recipientEmail','referenceId','body'],
      design:'CL-Closure', variants:[], optional:[] }
  ].map(Object.freeze))
});
export const CorrespondenceEmailTemplates = CorrespondenceEmailTemplateConfig.templates;
export function correspondenceEmailTemplate(id){ return CorrespondenceEmailTemplates.find(t=>t.id===id) || CorrespondenceEmailTemplates[0]; }
