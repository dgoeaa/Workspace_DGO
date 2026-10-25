# DGO Correspondence Mailer — deployment package

Send personalised official letters from the Office of the Director-General/CEO (DGO), NITDA,
to government institutions: **one tailored email per addressee, each with its own signed
letter attached**, plus any enclosures common to everyone.

It offers nine templates. Six are the internal platform's correspondence templates on the
Agency letterhead (National Information Technology Development Agency, Office of the
Director-General/CEO). They are sent exactly as the platform sends them, with the signed letter
attached as a real file. The other three are the mailer's own editable letters.

This package holds everything needed to deploy it. The only back end is **seven Power
Automate flows, each started by an HTTP request**. There is no server to build or host
beyond static files.

## Start here

Open **`GO-LIVE.html`** in your browser. It walks you from unpacking this zip to your first
mailing to the 24 institutions, one step at a time, with every setting given in full and a
line saying what you should see after each step. This README is the summary.

## What's in the package

| Path | What it is |
|---|---|
| `web/` | **The app.** Upload this folder, exactly as it is, to any HTTPS static host. |
| `folio-Master-Flows-and-Endpoints/packages/*.zip` | **The seven flows**, ready for *Import package (legacy)* in Power Automate. |
| `folio-Master-Flows-and-Endpoints/definitions/*.json` | The same seven flows as readable JSON, for review. |
| `folio-Master-Flows-and-Endpoints/flows.catalogue.json` | Which flow does what, with its connectors and operations. |
| `data/directory.csv` | The 25 institutions from the *Nigerian Government Letter Mailing Guide*, in the app's import format. |
| `tools/serve.mjs` | Runs the app on this computer (Node 18+, no installs). |
| `tools/mock-flows.mjs` | Stands in for the seven flows, so you can rehearse without a tenant. Nothing is emailed; sign-in codes are printed instead. |
| `tools/verify-package.mjs` | Checks every file against `PACKAGE_MANIFEST.json`. |
| `start.cmd` / `start.sh` | Runs the app. |
| `setup.cmd` / `setup.sh` / `tools/setup.mjs` | **Automatic setup.** Sign in once with a code; it creates or upgrades the seven flows, keys them, binds connections, sets the allowed origin, provisions the lists and library, makes you the first admin operator, and writes the mailer ready to publish. Safe to re-run; `--plan` changes nothing. |
| `start-demo.cmd` / `start-demo.sh` | Runs the app wired to the mock flows. |
| `GO-LIVE.html` | **The step-by-step go-live walkthrough.** Start here. |
| `web/README.md` | The full reference: screens, merge fields, the flow contract, security and limits. |

## Try it first (5 minutes, no tenant)

You need Node.js 18 or later ([nodejs.org](https://nodejs.org)).

- Windows: double-click **`start-demo.cmd`**
- macOS/Linux: `./start-demo.sh`

Your browser opens http://127.0.0.1:8083/ at the sign-in page. Sign in as
`operator@nitda.gov.ng`: the code is printed in the demo's black window instead of being mailed.
Then:

1. **Flows & setup → Check all.** All seven flows show *healthy* and *verified*.
2. **Plan**, then **Provision.**
3. **New mailing.** Pick recipients, drop in some PDFs named after them (for example
   `NUC_Letter.pdf`), review, and send.

The mock records what would have been sent. Nothing leaves your computer.

## Deploy it for real

It is deployed once, beside the internal platform, and then used from any device:

1. **Set up (once, on any device with Node.js 18+: a PC with `setup.cmd`, or Termux on
   Android with `node tools/setup.mjs`)** and sign in as the sending account with the code it shows. It creates or
   upgrades the seven flows, keys them, binds their connections, lets only
   `https://folio-platform.page.gd` read their answers (`--origin` to change), provisions the
   SharePoint lists and library, makes you the first admin operator, and writes the whole mailer
   as ONE file, `../dgo-mailer-publish/mailer.html` (the app and the seven flow addresses — no
   key, no password; `tools/bundle.mjs` builds it).
2. **Publish.** Upload `mailer.html` into the folder that holds the platform's `index.html`, so it
   opens at `https://folio-platform.page.gd/mailer.html`.
3. **Use.** Anyone on the operator list opens that address on any device and signs in
   with a code mailed to them. Admins add operators in **Settings → Operators**.

Mailings with their results, attached letters, Activity reports, the directory, templates and
the signatory are all kept in SharePoint, so every device shows the same. Nothing is installed or
configured per device, and nothing secret is kept in a browser beyond a 12-hour session.

`GO-LIVE.html` walks through it step by step, on an Android phone with Termux.

## Security

- **Operators sign in with a mailed code.** `DGO_MAIL_AUTH` mails an 8-digit code (10 minutes,
  5 tries) to active addresses on `DGOMailOperators` only, and answers everyone else the same.
  The code buys a 12-hour session token. Every flow checks the token, and that its operator is
  still active, on every call — so signing out or switching someone off takes effect at once.
- **Codes and sessions are private.** They live in `DGOMailSessions`, which provisioning cuts off
  from the site's permissions so only the flow owner can read it.
- **One origin.** Each flow answers readable responses only to its `allowedOrigin`.
- **The admin key never reaches a browser.** It exists only inside the flows' `Compose_Config`,
  for automatic setup. `setup --rotate-key` replaces it.
- **No relay.** The send flow only sends to the allowlisted domains (`gov.ng`, `edu.ng`), logs
  every message with the signed-in operator, and never sends a `messageId` twice.

## Check the package

```
node tools/verify-package.mjs
```

This confirms every file matches `PACKAGE_MANIFEST.json`.
