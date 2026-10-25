# Blank the two `x-ms-igw-*` headers in the four flows that don't

Found 2026-08-27 while scanning run records before committing them as evidence.

## What leaks

`x-ms-igw-external-uri` and `x-ms-igw-raw-target` carry the full inbound request
URL, including the `sig=` trigger token. That token is a bearer credential —
whoever holds it can invoke the flow.

`Compose_Redacted_Headers` blanks `Authorization`, `Cookie`, `x-api-key` and
`Ocp-Apim-Subscription-Key`. In four of the seven Correspondence Gateway flows it
does not blank these two. `Compose_Flow_Run_Record` embeds the headers,
`Compose_Telemetry_Attachments` base64-encodes the record, and
`Send_Telemetry_Email` mails it to dgsRegistry@nitda.gov.ng — **on every run**.

| Flow | Blanks `x-ms-igw-*` |
| --- | --- |
| CG_Submission_Endpoint | yes |
| CG_Support_Endpoint | yes |
| CG_Status_Check_Endpoint | **no** |
| CG_Verification_Endpoint | **no** |
| CG_Verification_Confirmation_Endpoint | **no** |
| CG_Writeback_Endpoint | **no** |

Four distinct live tokens were recovered from twelve records captured in one
morning. Treat all four as disclosed.

## The fix

In each of the four flows, open `Compose_Redacted_Headers` and set its value to
the expression Submission and Support already use. The only difference from what
those four run today is the final two `setProperty` calls.

```
@setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(coalesce(triggerOutputs()?['headers'], json('{}')), 'Authorization', '***REDACTED***'), 'Cookie', '***REDACTED***'), 'x-api-key', '***REDACTED***'), 'Ocp-Apim-Subscription-Key', '***REDACTED***'), 'x-ms-igw-external-uri', '***REDACTED***'), 'x-ms-igw-raw-target', '***REDACTED***')
```

## Order matters

Apply this **before** regenerating the four trigger URLs. A URL regenerated while
the redaction is still incomplete leaks its new token on its first run, and the
rotation has to happen twice.

1. Apply the expression to all four flows.
2. Regenerate the four trigger URLs.
3. Bind the portal with the new URLs (`document-portal/config.local.js`).

## Done when

A fresh run record from each of the four shows `***REDACTED***` for both headers,
and no `sig=` value survives a scan of the record.
