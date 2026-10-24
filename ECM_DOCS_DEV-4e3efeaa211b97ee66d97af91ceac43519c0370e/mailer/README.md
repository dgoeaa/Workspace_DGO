# DGO Correspondence Mailer

A single-page app for sending official letters from the Office of the Director-General/CEO
(DGO), NITDA, to government institutions. Each addressee gets **one personalised email** with
**its own attachments**: its signed letter, plus any enclosures common to everyone.

It has no server of its own. Everything beyond the browser is done by **seven Power Automate
flows, each started by an HTTP request**. No scheduled, mailbox, SharePoint or child-flow
triggers are used.

It is published once, beside the internal platform, at `https://folio-platform.page.gd/mailer.html`,
and used from any computer or phone: operators sign in with a code mailed to them, and every
device sees the same mailings, files, reports, directory, templates and signatory, because they
live in SharePoint. The browser is only a cache. Nothing is installed or configured per device,
and no key or password is kept in a browser.

```
 ┌──────── any browser, any device ─────────┐        ┌──── Power Automate ────┐     ┌── Microsoft 365 ──────┐
 │ folio-platform.page.gd/mailer.html      │  POST  │ DGO_MAIL_AUTH  sign-in │────▶│ Outlook (codes, mail) │
 │ Sign in (mailed code → 12 h session)     │───────▶│ DGO_MAIL_SEND          │────▶│ SharePoint:           │
 │ Letters · Sent · Addressees · Settings   │  JSON  │ DGO_MAIL_DATA  shared  │     │  DGOMailLog           │
 │ cache of what SharePoint holds           │◀───────│ DGO_MAIL_LOG           │     │  DGOMailDirectory     │
 │ config.local.js: 7 URLs, no key          │        │ DGO_MAIL_DIRECTORY     │     │  DGOMailTemplates     │
 └──────────────────────────────────────────┘        │ DGO_MAIL_TEMPLATES     │     │  DGOMailOperators     │
                                                     │ DGO_MAIL_PROVISION     │     │  DGOMailSessions (private)
                                                     └────────────────────────┘     │  DGOMailCampaigns     │
                                                                                    │  DGOMailReports       │
                                                                                    │  DGOMailFiles (library)│
                                                                                    └───────────────────────┘
```

## What it does

The menu has four items. Everything happens on the page in front of you: results, checks and
progress appear where the action was taken, and a bar at the foot of a letter always says what is
left to do. Nothing pops up over the page unless you ask for a full report.

| Page | Purpose |
|---|---|
| **Letters** (`#/`) | Start a letter with **New letter**; pick up a draft on any device (each shows what is left before it can go); watch a send in progress; the letters sent recently. |
| **A letter** (`#/letter/<id>`) | One page, four sections, saved as you type. **1 Who is it to?** search and tick addressees, choose all, add a new addressee in place, adjust the address or wording for one. **2 What does it say?** the kind of letter in plain words (Sending documents, Official letter, Request for information, Invitation, Circular or notice, Final response, or one of the office's own templates), the title and message, and *More options* (date, importance, reference format, Cc, Bcc). **3 Signed letters and attachments** drop every file at once; each goes to the addressee whose code is in its name, and anything unmatched is assigned in place. **4 Check and send** a checklist with *Fix* links, a preview of every email, a check of every email through the send flow (sends nothing), a test to yourself, then **Send** with pause, stop and retry of failures. A live preview of the email sits beside it all. |
| **Sent** (`#/sent[/<id>]`) | Every letter that has gone, searchable and filterable; for one letter, each addressee's status, reference and time, a check against the SharePoint send log (a lost answer the log records as Sent is corrected), CSV download, and *Send again as a new letter*. |
| **Addressees** | The shared list of institutions (first filled from the *Nigerian Government Letter Mailing Guide*): addressee lines, addresses and notes. Edit, add, switch off, import or export CSV, push to or pull from SharePoint. |
| **Settings** | Tabs. **General**: who is signed in; for admins **Operators**; the shared signatory profile and sending rules; export and restore. **Templates**: the platform's six Agency letterhead templates (read-only) and the office's own editable templates. **Connection**: health and identity checks of the seven flows, SharePoint provisioning, flow packages. **Activity**: a report of every operation (one line per item, CSV or JSON). |

The earlier pages still open at their addresses (`#/compose`, `#/outbox`, `#/directory`, `#/templates`, `#/flows`, `#/activity`, `#/overview`).

## Deploying it

Run the package's **automatic setup** once, on a PC with Node.js (`setup.cmd`, or
`node tools/setup.mjs`), and sign in as the sending account with the code it shows. It creates or
upgrades the seven flows (a flow from an older contract keeps its own settings and key), keys
them, binds their SharePoint and Outlook connections, sets `allowedOrigin`, provisions every list
and the library, makes you the first admin operator, and writes `../dgo-mailer-publish/mailer.html`:
this whole app in one file — stylesheet inlined, every module embedded through an import map, the
seven URLs embedded, no key — built by the package's `tools/bundle.mjs`. Upload it into the
folder that holds the platform's `index.html`, so it opens at
`https://folio-platform.page.gd/mailer.html`. `GO-LIVE.html` in the package has every step.

A release that changes only the app needs no sign-in:
`node tools/setup.mjs --refresh-mailer` reads the seven addresses from the `mailer.html` setup
wrote before, writes the new one beside it (keeping the old as `mailer-<version>.html`), and
touches nothing in Power Automate or SharePoint. Upload the new file over the old one. Each
`mailer.html` carries a fingerprint of the flows setup installed; when this package's flows
differ (2.1.1 and 2.1.2 change them), the refresh stops and says to run full setup instead.

When the organisation blocks setup's Microsoft sign-in, the flows can be imported and keyed by
hand and setup finished with `node tools/setup.mjs --manual --endpoints FILE --key KEY
--operator EMAIL` (GO-LIVE, "Manual setup").

`node tools/setup.mjs --export-flows` saves all seven flows as they are in the tenant in one
file (`../dgo-mail-flows/dgo-mail-flows-<time>.zip`, mode 0600): `packages/<FLOW>.zip`, one
"Import package (legacy)" per flow, built by `tools/flow-package.mjs` exactly as the committed
packages are; `flows-backup.json`; and `README.txt`. It only reads. `node tools/setup.mjs
--restore-flows <that zip>` saves the flows as they are, then puts each back exactly as exported
(recreating any that were deleted) and reads each back. The export carries the admin key.

## The flow contract

Every request is a `POST` of JSON:

```json
{ "operation": "send", "requestId": "…", "validationOnly": false,
  "sessionToken": "…", "payload": { … } }
```

Every answer uses the same envelope, with `Access-Control-Allow-Origin` set to the flow's
`allowedOrigin` only:

```json
{ "success": true, "validationOnly": false, "endpoint": { "key": "MAIL_SEND" },
  "requestId": "…", "runId": "…", "data": { … }, "error": null }
```

| Flow | Key | Operations |
|---|---|---|
| `DGO_MAIL_AUTH` | `MAIL_AUTH` | `requestCode` (`email`), `verifyCode` (`challengeId`, `code`) — the two open to anyone — then `signOut`, `whoAmI`, and for admins `listOperators`, `upsertOperator` |
| `DGO_MAIL_SEND` | `MAIL_SEND` | `send` |
| `DGO_MAIL_DATA` | `MAIL_DATA` | `listMailings`, `saveMailing`, `deleteMailing`, `listReports`, `saveReport`, `deleteReport`, `uploadFile`, `downloadFile`, `listFiles`, `deleteFile` |
| `DGO_MAIL_LOG` | `MAIL_LOG` | `list` (`campaignId`, `status`, `recipientKey`, `since`, `top`), `get` (`messageId`) |
| `DGO_MAIL_DIRECTORY` | `MAIL_DIRECTORY` | `list`, `upsert` (`payload.record`), `delete` (`payload.record.key`) |
| `DGO_MAIL_TEMPLATES` | `MAIL_TEMPLATES` | `list`, `upsert` (`payload.template`), `delete` |
| `DGO_MAIL_PROVISION` | `MAIL_PROVISION` | `provision`. With `validationOnly: true` it only reports the plan. |

Every flow also answers `healthCheck` (with `validationOnly: true`) and the
`{"_platform":{"operation":"verify","correlationId":"…"}}` identity handshake, as set out in
[`docs/folio-Master-Flows-and-Endpoints/reference/HEALTH_CONTRACT.md`](../docs/folio-Master-Flows-and-Endpoints/reference/HEALTH_CONTRACT.md). Neither needs a session.

Before any other operation, every flow establishes who is calling: an active, unexpired session
in `DGOMailSessions` whose operator is still active in `DGOMailOperators` — or the admin key
(`operatorKey` in `Compose_Config`), which only automatic setup uses. Anyone else gets `401
SIGN_IN_REQUIRED`. The send log records the operator from the session, never from the request.

`send` payload:

```json
{ "messageId": "c1a2b3-NUC", "campaignId": "c1a2b3", "recipientKey": "NUC",
  "institution": "…", "addressee": "…", "reference": "NITDA/DGO/NUC/2026/001",
  "to": ["info@nuc.edu.ng"], "cc": [], "bcc": [], "subject": "…", "htmlBody": "<div>…</div>",
  "importance": "Normal",
  "attachments": [{ "name": "NUC_Letter.pdf", "contentType": "application/pdf", "contentBase64": "…" }] }
```

What `DGO_MAIL_SEND` does, in order:

1. Refuses anyone not signed in (`401`), and refuses everything if the flow is not configured (`503`).
2. Checks the message and refuses it with `400`/`413` before writing anything. It is refused
   if there is no recipient, too many recipients, any recipient outside the allowlist, no
   subject, no body, a malformed attachment, or attachments that are too large.
3. With `validationOnly: true`, stops here and reports what it would send.
4. If the log already shows this `messageId` as *Sent*, answers with that earlier result and
   sends nothing. This is why a retry never sends a letter twice.
5. Writes a log row (*Sending*), sends through Outlook (as the connection's account or from
   the shared mailbox), then marks the row *Sent* (answer `200`) or *Failed* with the
   connector's error (answer `502`).

## Security

- **Operators sign in with a mailed code**, not a shared key. `requestCode` mails an 8-digit code
  (valid 10 minutes, 5 tries) only to active operators, and answers everyone else the same, so
  the operator list can't be discovered. The session token lasts 12 hours, is kept in
  `sessionStorage`, and is checked by every flow on every call — sign-out, expiry and switching
  an operator off take effect at once.
- **Power Automate has no hash or HMAC function**, so codes and tokens are random values kept
  server-side in `DGOMailSessions`, which provisioning makes private to the flow owner.
- **One origin.** Each flow's answers are readable only by pages on its `allowedOrigin`.
- **The admin key never reaches a browser.** It is only in the flows, for automatic setup;
  `setup --rotate-key` replaces it. A flow still holding its placeholder refuses everything.
- **The trigger URLs** in the published `config.local.js` are useless without a session, but
  are still not committed: `mailer/config.js` stays empty, `config.local.js` is git-ignored, and
  `npm run test:secrets` guards the tree.
- The send flow only sends to allowlisted domains and logs every message with the signed-in
  operator.
- The SPA shows previews in a sandboxed iframe with scripts disabled. Merged values are
  HTML-escaped, except `{{{…}}}` fields, which only you write.
- The Content Security Policy only allows network calls to the Power Automate hosts and loopback.

## Limits

- Attachments: 20 MB per message by default (Settings), with a hard limit of about 22 MB
  inside the flow. That keeps each message under Exchange Online's limit once base64
  encoding is added.
- Up to 10 addresses per message by default. Messages go out one at a time, 2.5 s apart by
  default, which keeps a 25-letter run well inside the Outlook connector's throttling.
- Mailings are saved to SharePoint 0.8 s after the last change, and before every batch. Two
  people editing the same mailing at the same moment: the later save wins.

## Developing

```bash
npm run start:mailer        # serve the SPA on :8083
npm run mailer:mock         # the seven flows, from memory, on :8084 — prints the config.local.js to use and each sign-in code
npm run mailer:flows        # regenerate mailer/flows/ from scripts/build-mailer-flows.mjs
npm run mailer:letterhead   # recompile the platform's six templates into js/letterhead.generated.js
npm run test:mailer         # flows parse and resolve, packages match, directory = guide, merge rules
npm run test:mailer:e2e     # the whole journey in headless Chromium against the mock
npm run mailer:package      # build releases/dgo-correspondence-mailer-<version>.zip
npm run test:mailer:package # the same journey against an unpacked copy of that zip
```

### The release package

`releases/dgo-correspondence-mailer-<version>.zip` is the self-contained deliverable. It
holds `web/` (this app, ready to upload), the seven flow packages, `data/directory.csv`, a
zero-dependency server and mock (`tools/`), start scripts for Windows and macOS/Linux, a
deployment guide, and a SHA-256 manifest. It needs nothing from this repository and never
includes a `config.local.js`. The version comes from `mailer/VERSION`. Rebuild it after any
change under `mailer/`: `npm run test:mailer` fails while it is stale.

Don't edit `mailer/flows/` by hand. It is generated, and `npm run test:mailer` fails if it drifts.

## Troubleshooting

| You see | It means |
|---|---|
| **Simulation** badge | `MAIL_SEND` has no URL. Nothing is sent. |
| `NOT_CONFIGURED` | That flow still has the placeholder admin key: run automatic setup. |
| `SIGN_IN_REQUIRED` | No session, or it expired, was signed out, or its operator was switched off. Sign in again. |
| No sign-in code arrives | The address isn't an active operator (the answer is the same either way), or the code is in junk. |
| `RECIPIENT_NOT_ALLOWED` | An address is outside `allowedSuffixes`/`allowedDomains`. Change the flow's allowlist only if you really mean to. |
| `SEND_FAILED` | Outlook rejected the message. The log row holds the connector's reason. A common cause is a missing *Send As* right on the shared mailbox. |
| *Unreachable* | The browser got no answer: a blocked host, a DNS failure, or CORS — the page is not on the flows' `allowedOrigin`. Open the mailer at its published address, and check the network allows `*.logic.azure.com`. |
| A message stuck on *Sending* after a reload | The page closed mid-send. Open the letter under **Sent** and use **Check against the send log** before retrying. |
