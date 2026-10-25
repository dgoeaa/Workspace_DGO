# Correspondence email templates

These are the email templates used by the **Correspondence Email Desk** in the internal
platform (`modules/correspondence-email.js`). They are extracted as standalone HTML.

> **Generated. Don't edit these files.** The templates come from
> `config/correspondence-email-templates.config.js`. Their letterhead comes from `render()` in
> `core/correspondence-email-service.js`. Change those files, then run
> `npm run extract:emailtemplates`. `npm run test:emailtemplates` fails while this folder is out of date.

## How a correspondence email is built and sent

1. The desk's composer collects the fields: template, reference, subject, recipient, Cc/Bcc,
   classification, priority, due date, required action, attachment references, body and signatory.
2. `render()` fills the template's design from the e-mail template package
   (`docs/folio-Master-Flows-and-Endpoints/email-templates/`, CL-*): the reference and date, the greeting, the body,
   the lines that apply, and the signatory. A letter with no value for a line is sent as the design's variant
   without it.
3. **Send** posts `{ operation: "sendCorrespondenceEmail", email: { to, cc, bcc, subject, html, text, hero,
   footerNote, attachments } }` to the `EMAIL` endpoint, which is the **IP_SEND_EMAIL** flow. `html` is the body
   fragment only (finding F1).
4. The flow draws the masthead, the hero from `email.hero` and the footer with `email.footerNote` around it, and
   appends an **Attachments** list when `email.attachments` is not empty
   (`partials/flow-attachment-section.html`).

## Files

| Path | What it is |
|---|---|
| `html/<id>.html` | **The template.** The body fragment, with each field left as a `{{token}}` and every line present. |
| `rendered/<id>.html` | **A worked example** in the design's complete document, filled in with sample values. |
| `partials/flow-attachment-section.html` | The attachment list the flow appends. |
| `templates.json` | The catalogue: subject patterns, required fields, designs, variants, optional lines, hero and footer note, defaults. |
| `index.html` | All the templates side by side. Open it in a browser. |

## The templates

| Template | Design | Category | Subject line | Required fields | Variant sent when a line is empty |
|---|---|---|---|---|---|
| [Official Correspondence](html/official-correspondence.html) (`official-correspondence`) | `CL-Official` | Formal Response | `{{referenceId}} — {{subject}}` | `recipientEmail`, `subject`, `referenceId`, `body` | `CL-Official--no-optional-lines` (none of: actionRequired is set, dueDate is set) |
| [Request for Information / Documents](html/request-for-information.html) (`request-for-information`) | `CL-Request-Info` | Request | `Request for Information — {{referenceId}}` | `recipientEmail`, `referenceId`, `body` | `CL-Request-Info--no-due-date` (none of: dueDate is set) |
| [Document Transmittal](html/document-transmittal.html) (`document-transmittal`) | `CL-Transmittal` | Transmittal | `Transmittal — {{referenceId}} — {{subject}}` | `recipientEmail`, `referenceId` | `CL-Transmittal--no-attachments` (none of: attachmentSummary is set) |
| [Meeting / Engagement Invitation](html/meeting-invitation.html) (`meeting-invitation`) | `CL-Invitation` | Invitation | `Invitation — {{subject}} — {{referenceId}}` | `recipientEmail`, `subject`, `body` | `CL-Invitation--no-due-date` (none of: dueDate is set) |
| [Circular / General Notice](html/circular-notice.html) (`circular-notice`) | `CL-Circular` | Notice | `Circular / Notice — {{subject}}` | `recipientEmail`, `subject`, `body` | — |
| [Closure / Final Response](html/closure-response.html) (`closure-response`) | `CL-Closure` | Closure | `Final Response — {{referenceId}}` | `recipientEmail`, `referenceId`, `body` | — |

## Tokens

| Token | Filled from |
|---|---|
| `{{recipientName}}` | The recipient name. Defaults to *Sir/Ma*. |
| `{{subject}}`, `{{referenceId}}` | The subject and reference fields. These are pre-filled from the source letter. |
| `{{body}}` | The correspondence body. Line breaks become `<br>`. |
| `{{actionRequired}}`, `{{dueDate}}`, `{{attachmentSummary}}` | Optional fields. Each one's line is left out when it is empty. |
| `{{classification}}`, `{{priority}}` | Shown in the hero chip and lead. Defaults: *Official* and *normal*. |
| `{{signatoryName}}`, `{{signatoryTitle}}` | Defaults: *Registry, Office of the Director-General*, *For: Director-General/CEO*. |
| `{{date}}` | The date the email is rendered, in the form *25 September 2026*. |

Every value is HTML-escaped when it is merged.

## Not included

`core/acknowledgement-service.js` builds a separate *Task Acknowledgment Confirmation* email.
It belongs to the Acknowledgment module and is a task notification, not correspondence, so it
isn't part of this desk.
