# NITDA Email Template Library — Flow Contract

**Release** `nitda-ecm-ops-email-templates/2.1.0` · 20 templates · 640 px container · 640 px mobile breakpoint
**Brand** Deep Green `#05583B` (PANTONE 7484C) · Smart Green `#17B255` (PANTONE 354C) · Brand Black `#373435`
**Type** Outfit / Alwyn New (display) · Verdana (body) · Cascadia Mono (references)

Every dynamic value in every template is read as
`@{coalesce(outputs('Compose_Name'),'<fallback>')}`. A flow that sets nothing still
renders a complete, sensible email — the literal `@{...}` never reaches a recipient.
Pre-composed HTML row blocks are read as `@{coalesce(variables('varName'),'')}` and
collapse to an empty table body when unset.

## 1. Compose tokens (128)

| Token | Fallback when the flow sets nothing | Used by |
|---|---|---|
| `Compose_Ack_Due_Date` | — | DP-01 DP-08 IP-04 |
| `Compose_Ack_Expected` | — | IP-09 |
| `Compose_Acknowledge_Url` | # | IP-01 IP-02 IP-03 IP-05 IP-12 |
| `Compose_Action_Required` | Review and revert | IP-01 IP-03 IP-11 IP-12 |
| `Compose_Addressee` | — | IP-09 |
| `Compose_Affected_Service` | — | IP-10 |
| `Compose_Approve_Url` | # | IP-08 |
| `Compose_Archive_Ref` | — | DP-06 |
| `Compose_Assign_Url` | # | IP-04 |
| `Compose_Assigned_At` | — | IP-06 |
| `Compose_Assigned_By` | Office of the Director-General | IP-01 IP-02 IP-03 IP-05 IP-08 IP-12 |
| `Compose_Attachment_Count` | 0 | IP-04 |
| `Compose_Attempt_Ceiling` | 5 | DP-02 |
| `Compose_Batch_Count_High` | 0 | IP-02 |
| `Compose_Batch_Count_Low` | 0 | IP-02 |
| `Compose_Batch_Count_Normal` | 0 | IP-02 |
| `Compose_Batch_Count_Urgent` | 0 | IP-02 |
| `Compose_Batch_Id` | BATCH-UNSPECIFIED | IP-02 |
| `Compose_Batch_Oldest_Date` | — | IP-02 |
| `Compose_Batch_Portal_Url` | # | IP-02 |
| `Compose_Batch_Summary` | Consolidated task assignment | IP-02 |
| `Compose_Batch_Total` | 0 | IP-02 IP-07 |
| `Compose_Body_Html` | Please find below the official correspondence of the Agency on the referenced matter. | IP-11 |
| `Compose_Case_Ref` | CASE-UNSPECIFIED | DP-07 |
| `Compose_Case_Url` | # | DP-07 |
| `Compose_Category` | General correspondence | DP-01 IP-04 |
| `Compose_Channel` | Document Portal | DP-01 |
| `Compose_Classification` | Official | IP-11 |
| `Compose_Closed_At` | — | DP-06 |
| `Compose_Closing` | Please accept the assurances of our highest consideration. | IP-11 |
| `Compose_Closure_Body` | The Agency hereby conveys its final response on the referenced matter. | DP-06 |
| `Compose_Code_Expires_At` | in 10 minutes | DP-02 |
| `Compose_Copy_List` | — | IP-11 |
| `Compose_Correspondence_Type` | Official Correspondence | IP-11 |
| `Compose_Count_Due_Today` | 0 | IP-07 |
| `Compose_Count_Overdue` | 0 | IP-07 |
| `Compose_Count_This_Week` | 0 | IP-07 |
| `Compose_Days_Elapsed` | — | DP-08 |
| `Compose_Days_Overdue` | — | DP-08 IP-06 |
| `Compose_Decision_Body` | The Agency has concluded its assessment of the referenced submission. | DP-05 |
| `Compose_Decision_Date` | — | DP-05 |
| `Compose_Decision_Document_Url` | # | DP-05 |
| `Compose_Decision_Label` | Approved | DP-05 DP-06 |
| `Compose_Decision_Ref` | — | DP-05 |
| `Compose_Decision_Window` | — | DP-03 |
| `Compose_Decline_Url` | # | IP-08 |
| `Compose_Digest_Date` | — | IP-07 |
| `Compose_Digest_Generated_At` | the start of the working day | IP-07 |
| `Compose_Dispatch_Mode` | — | IP-09 |
| `Compose_Dispatched_At` | — | IP-09 |
| `Compose_Dispatched_By` | — | IP-09 |
| `Compose_Document_Version` | — | IP-05 |
| `Compose_Due_Clause` | (empty) | IP-11 |
| `Compose_Due_Date` | — | IP-01 IP-02 IP-03 IP-05 IP-06 IP-08 IP-12 |
| `Compose_Escalated_At` | — | IP-06 |
| `Compose_Escalation_Copy` | — | IP-06 |
| `Compose_Escalation_Email` | # | IP-01 IP-12 |
| `Compose_Escalation_Level` | 1 | IP-06 |
| `Compose_Escalation_Name` | — | DP-08 IP-01 IP-06 IP-12 |
| `Compose_Escalation_Ref` | — | DP-08 |
| `Compose_Escalation_Title` | — | IP-01 IP-06 IP-12 |
| `Compose_Feedback_Url` | # | DP-06 |
| `Compose_Financial_Implication` | None stated | IP-08 |
| `Compose_Handling_Unit` | — | DP-03 DP-05 IP-01 IP-03 IP-12 |
| `Compose_Impact_Count` | 1 | IP-10 |
| `Compose_Letter_Date` | — | IP-11 |
| `Compose_Opened_At` | — | DP-06 |
| `Compose_Org_Address_Line` | No. 28 Port Harcourt Crescent, Off Gimbiya Street, Area 11, Garki, Abuja | DP-01 DP-02 DP-03 DP-04 DP-05 DP-06 DP-07 DP-08 IP-01 IP-02 IP-03 IP-04 IP-05 IP-06 IP-07 IP-08 IP-09 IP-10 IP-11 IP-12 |
| `Compose_Org_Logo_Url` | https://nitda.gov.ng/assets/nitda-lockup-white.png | DP-01 DP-02 DP-03 DP-04 DP-05 DP-06 DP-07 DP-08 IP-01 IP-02 IP-03 IP-04 IP-05 IP-06 IP-07 IP-08 IP-09 IP-10 IP-11 IP-12 |
| `Compose_Org_Office_Line` | Office of the Director-General / CEO | DP-01 DP-02 DP-03 DP-04 DP-05 DP-06 DP-07 DP-08 IP-01 IP-02 IP-03 IP-04 IP-05 IP-06 IP-07 IP-08 IP-09 IP-10 IP-11 IP-12 |
| `Compose_Org_Portal_Url` | https://nitda.gov.ng | DP-01 DP-02 DP-03 DP-04 DP-05 DP-06 DP-07 DP-08 IP-01 IP-02 IP-03 IP-04 IP-05 IP-06 IP-07 IP-08 IP-09 IP-10 IP-11 IP-12 |
| `Compose_Org_Support_Url` | https://nitda.gov.ng/support | DP-01 DP-02 DP-03 DP-04 DP-05 DP-06 DP-07 DP-08 IP-01 IP-02 IP-03 IP-04 IP-05 IP-06 IP-07 IP-08 IP-09 IP-10 IP-11 IP-12 |
| `Compose_Portal_Url` | # | IP-07 |
| `Compose_Priority_Bg` | #E6F7ED | IP-01 IP-12 |
| `Compose_Priority_Color` | #0D7234 | IP-01 IP-02 IP-03 IP-10 IP-12 |
| `Compose_Priority_Description` | Review and action the attached document. | IP-01 IP-12 |
| `Compose_Priority_Level` | Normal | DP-07 IP-01 IP-03 IP-06 IP-10 IP-12 |
| `Compose_Reassign_Url` | # | IP-06 IP-10 |
| `Compose_Receipt_Url` | # | DP-01 IP-09 |
| `Compose_Received_At` | — | DP-01 DP-07 DP-08 IP-01 IP-04 IP-05 IP-10 |
| `Compose_Recipient_Address` | — | IP-11 |
| `Compose_Recipient_Email` | — | DP-02 |
| `Compose_Recipient_Name` | Designated Officer | DP-01 DP-03 DP-04 DP-05 DP-06 DP-07 DP-08 IP-01 IP-02 IP-03 IP-05 IP-06 IP-07 IP-08 IP-11 IP-12 |
| `Compose_Recipient_Org` | — | IP-11 |
| `Compose_Recommendation` | — | IP-08 |
| `Compose_Record_Url` | # | DP-06 IP-01 IP-03 IP-04 IP-05 IP-06 IP-08 IP-09 IP-12 |
| `Compose_Reference_Id` | REF-UNSPECIFIED | DP-01 DP-02 DP-03 DP-04 DP-05 DP-06 DP-07 DP-08 IP-01 IP-03 IP-04 IP-05 IP-06 IP-08 IP-09 IP-11 IP-12 |
| `Compose_Remarks` | — | DP-04 IP-01 IP-02 IP-05 IP-12 |
| `Compose_Reminder_Count` | 1 | IP-06 |
| `Compose_Reply_To` | dgsregistry@nitda.gov.ng | IP-11 |
| `Compose_Requested_At` | — | DP-02 |
| `Compose_Requester_Name` | — | IP-10 |
| `Compose_Requester_Unit` | — | IP-10 |
| `Compose_Respond_Url` | # | DP-04 |
| `Compose_Response_Due_Date` | — | DP-04 |
| `Compose_Review_Type` | Technical review | IP-05 |
| `Compose_Review_Window` | 21 days | DP-05 |
| `Compose_Reviewed_At` | — | IP-08 |
| `Compose_Reviewer_Name` | — | IP-08 |
| `Compose_Salutation` | Dear Sir/Madam, | IP-11 |
| `Compose_Signatory_Name` | — | DP-05 DP-06 IP-09 IP-11 |
| `Compose_Signatory_Title` | For: Director-General/CEO | DP-05 DP-06 IP-11 |
| `Compose_Sla_Due` | — | DP-07 IP-10 |
| `Compose_Source_Attachment_Count` | 0 | IP-03 IP-12 |
| `Compose_Source_Channel` | Registry | IP-01 |
| `Compose_Source_Mailbox` | — | IP-12 |
| `Compose_Source_Message_Id` | — | IP-12 |
| `Compose_Source_Received_At` | — | IP-03 IP-12 |
| `Compose_Source_Reference` | — | IP-08 |
| `Compose_Source_Sender_Email` | — | IP-03 IP-12 |
| `Compose_Source_Sender_Name` | — | IP-03 IP-12 |
| `Compose_Source_Sender_Org` | — | IP-12 |
| `Compose_Source_Thread_Excerpt` | (no excerpt available) | IP-03 IP-12 |
| `Compose_Status_Changed_At` | — | DP-03 DP-04 |
| `Compose_Status_Text` | Pending action | DP-01 DP-03 DP-04 DP-06 DP-07 DP-08 IP-01 IP-02 IP-03 IP-04 IP-05 IP-06 IP-07 IP-08 IP-09 IP-10 IP-12 |
| `Compose_Subject` | (subject not supplied) | DP-01 DP-03 DP-04 DP-05 DP-06 DP-07 DP-08 IP-01 IP-03 IP-04 IP-05 IP-06 IP-08 IP-09 IP-10 IP-11 IP-12 |
| `Compose_Submitter_Email` | — | IP-04 |
| `Compose_Submitter_Name` | — | IP-04 |
| `Compose_Suggested_Unit` | Central Registry | IP-04 |
| `Compose_Support_Body` | (no description supplied) | DP-07 IP-10 |
| `Compose_Support_Category` | General | DP-07 IP-10 |
| `Compose_Ticket_Ref` | TICKET | IP-10 |
| `Compose_Ticket_Url` | # | IP-10 |
| `Compose_Track_Url` | # | DP-01 DP-03 DP-04 DP-05 DP-08 |
| `Compose_Transmittal_Ref` | TRANSMITTAL | IP-09 |
| `Compose_Valid_Until` | Not applicable | DP-05 |
| `Compose_Verification_Code` | 000000 | DP-02 |
| `Compose_Verification_Purpose` | Portal access | DP-02 |

## 2. Pre-composed HTML row variables (9)

Build these with `Append to string variable` inside an `Apply to each`. Each row must be a
complete `<tr>`. The row recipe below matches the schedule styling used in the templates —
copy it verbatim so composed rows are indistinguishable from the static ones.

| Variable | Used by | Columns expected |
|---|---|---|
| `varAttachmentRowsHTML` | DP-01 IP-03 IP-04 IP-05 IP-08 IP-09 IP-12 | see §3 |
| `varChainRowsHTML` | IP-01 IP-12 | see §3 |
| `varDueTodayRowsHTML` | IP-07 | see §3 |
| `varEnclosureRowsHTML` | IP-11 | see §3 |
| `varOverdueRowsHTML` | IP-07 | see §3 |
| `varRequestedItemsHTML` | DP-04 | see §3 |
| `varTaskRowsHTML` | IP-02 | see §3 |
| `varTimelineRowsHTML` | DP-06 | see §3 |
| `varUpcomingRowsHTML` | IP-07 | see §3 |

### 3. Canonical row expression

```
@{concat(
'<tr><td align="left" valign="top" style="padding:11px 12px;border-bottom:1px solid #E8E6E7;font-family:''Cascadia Mono'',Consolas,''Courier New'',monospace;font-size:12px;line-height:1.45;color:#373435;">',
items('Apply_to_each')?['Reference'],
'</td><td align="left" valign="top" style="padding:11px 12px;border-bottom:1px solid #E8E6E7;font-family:Verdana,Geneva,''DejaVu Sans'',sans-serif;font-size:13px;line-height:1.45;color:#373435;">',
items('Apply_to_each')?['Subject'],
'</td><td align="right" valign="top" style="padding:11px 12px;border-bottom:1px solid #E8E6E7;font-family:Verdana,Geneva,''DejaVu Sans'',sans-serif;font-size:13px;line-height:1.45;color:#373435;">',
items('Apply_to_each')?['Due'],
'</td></tr>')}
```

Initialise every row variable to an empty string before the loop. Sanitise any
submitter-supplied fragment upstream — the templates carry no client-side script and
must never be handed unescaped HTML from a public channel.

## 4. Priority palette (governed)

Compute once in a `Switch` on `Compose_Priority_Level` and let every template consume it.

| Level | `Compose_Priority_Color` | `_Bg` | `_Border` | `_Text` |
|---|---|---|---|---|
| Low | `#4A4849` | `#F5F4F4` | `#C4C3C3` | `#344054` |
| Normal | `#0D7234` | `#E6F7ED` | `#C2EED2` | `#0D7234` |
| High | `#5A3F00` | `#FBF1D8` | `#F7E2A8` | `#5A3F00` |
| Urgent | `#C8102E` | `#FBE7EB` | `#F6C2CB` | `#C8102E` |

Priority levels are the canonical four from `config/priority.config.js`. Legacy
vocabularies (P1–P4, Medium, UPPERCASE) must be normalised before the send.

## 5. Governed status vocabulary

Portal-facing templates must display only the governed public labels from
`config/status-vocabulary.config.js`: **Received · Validation · Under review ·
Action required · Approved · Declined · Withdrawn**. Internal stored values
(Pending / Accepted / Delegated / Declined / Archived) are mapped through
`governedStatusLabel()` before they are placed in `Compose_Status_Text` on any
message leaving the Agency.

## 6. Conditional status indicators

Eighteen of the twenty templates colour themselves from the status they are reporting.
The flow sets **one** token — `Compose_Status_Text` (or `Compose_Decision_Label` on
DP-05) — and the template resolves the accent rail, the badge fill, the badge border and
the badge text colour from it inside the HTML. No extra Compose, no `Switch`, no palette
tokens to keep in step.

The resolution is a nested `if(contains(...))` on the lower-cased status, so an
unrecognised or unset status lands in Neutral rather than breaking:

| Bucket | Matches (case-insensitive) | Accent / text | Fill | Border |
|---|---|---|---|---|
| Cleared | approved · accepted · completed · closed · archived · cleared | `#0D7234` | `#E6F7ED` | `#C2EED2` |
| Adverse | declined · rejected · returned | `#C8102E` | `#FBE7EB` | `#F6C2CB` |
| Pressing | overdue · action required · awaiting information · escalated | `#5A3F00` | `#FBF1D8` | `#F7E2A8` |
| In hand | under review · in review · review · validation · processing · pending · pending action · delegated · open · in progress · logged | `#05583B` | `#EAF3EF` | `#CFE3D8` |
| Neutral | anything else, including an unset status | `#4A4849` | `#F5F4F4` | `#C4C3C3` |

Two carriers, both Outlook-safe:

- **Status badge** — an inline `<span>` with a `&#9679;` dot, the governed label in
  caps, and all three colours resolved conditionally.
- **Status rail** — a 4 px table cell to the left of the detail block, coloured with the
  bucket's accent. A table cell, not a CSS `border-left`, so Word-rendered Outlook keeps
  it; `font-size:0;line-height:0` stops the spacer collapsing.

`IP-11` (outbound letterhead correspondence) and `DP-02` (one-time code) carry no
indicator by design — neither reports a status.

## 7. Email-origin task assignment (IP-12)

`IP-12` is the single-task assignment for tasks raised from an email the Agency
received. It is not IP-03: IP-03 announces that a mailbox item became a task, IP-12 is a
full assignment notice that additionally carries the provenance of the email it came from
— sender, organisation, address, mailbox, hour of receipt, message id, subject as
received, and an excerpt of the message as it arrived. Batch language is absent by
design; there is one matter and one officer.

| Token | Fallback | Purpose |
|---|---|---|
| `Compose_Source_Sender_Name` | — | Person who wrote in. Also in the subject line. |
| `Compose_Source_Sender_Org` | — | Their organisation, under the name. |
| `Compose_Source_Sender_Email` | — | Reply-to address of record. |
| `Compose_Source_Mailbox` | — | Agency mailbox that received it. |
| `Compose_Source_Received_At` | — | Hour of receipt — the clock the officer is answering to. |
| `Compose_Source_Message_Id` | — | Mailbox message id, for retrieval and audit. |
| `Compose_Source_Thread_Excerpt` | (no excerpt available) | The message as it arrived. Sanitise upstream. |
| `Compose_Source_Attachment_Count` | 0 | Attachments carried onto the task. |

Chain of custody is a four-step schedule (received → converted → assigned → action
officer) so the officer can see who touched it before them. The provenance card is
headed *"Not a forward. Reproduced from the mailbox record."* — the reply must leave from
the platform or it is not on the record.
