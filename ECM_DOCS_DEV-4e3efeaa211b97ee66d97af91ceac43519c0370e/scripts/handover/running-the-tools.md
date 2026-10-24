# Running the Administrator Tools

## 1. The suite

The platform team's tools are one suite, the **Folio Central Administration Centre**, with the **Folio Vault** beside
it. They run on a platform-team computer, not on a website: they hold or read the estate's signed flow addresses and
its records, so they are kept where those are kept, by design. The **Folio Administrator Toolkit** holds both, ready
to run.

| Part | What it is for | Where |
| --- | --- | --- |
| Folio Central Administration Centre | The front door to everything below, and the control plane for operation | http://127.0.0.1:8844/ |
| Portfolio | Every platform, where it runs, what the monitor last saw, and a way in to each | Centre › Monitor › Portfolio |
| Flows | Every Folio flow ({{FLOWS}}), seen as its owner sees it: state against the state it should be in, run history, an alert for a failed run; turn a flow on or off, resubmit or cancel a run | Centre › Monitor › Flows |
| Alerts, incidents, changes | The register of alerts, incidents and changes, with a tamper-evident audit trail | Centre › Operate |
| Test a flow | Call one of the read-only Folio flows and read its reply, through the Vault, under your own Folio sign-in | Centre › Operate › Test a flow |
| Flow & endpoint estate | Every endpoint and its flow; check a deployed configuration file against the registers | Centre › Govern › Flow & Endpoint Estate |
| Estate Console | The estate as the registers describe it, with the commissioning and rotation procedures | Centre › Reference › Estate Console |
| Flow packages | Every flow package, action by action | Centre › Reference › Flow packages |
| Folio Vault | Holds the signed flow addresses behind aliases it never returns, and calls a flow by its alias | http://localhost:8787/health; managed from Centre › Govern › Vault |

## 2. Before you start

- Node.js 22 or later, and Python 3.11 or later. Nothing else is installed: the suite uses only what Node.js and
  Python provide.
- No internet connection is needed, except for the Centre's connection to the tenant and for Test a flow.

## 3. Starting and stopping

One step starts, configures and opens the whole suite.

| To | Do this |
| --- | --- |
| Start on Windows | Double-click `Start the tools - Windows.cmd` |
| Start on macOS or Linux | In a terminal, in the toolkit folder: `sh "Start the tools - macOS and Linux.sh"` |
| Stop | Press Ctrl-C in the window that started them, or close it |

Every start does all of this by itself:

1. Checks for Node.js 22+ and Python 3.11+, and says plainly if either is missing.
2. Sets every setting the Vault and the Centre need: their data folders, the Centre's access to the Vault's tokens,
   the kept Microsoft sign-in, and which platforms run on this computer. There is nothing to configure by hand.
3. Starts the Folio Vault and the Administration Centre, waits until both answer, and checks the platforms again so
   no false alarm is left from the start-up.
4. Opens the Centre in your browser, already unlocked. There is no token to paste.
5. Connects the Centre to the tenant as the flow owner. The first time only, it shows a Microsoft code and opens the
   Microsoft page for it. The sign-in is then kept, so later starts need no code.
6. Fills the Vault: it reads every Folio endpoint's signed address from the tenant and holds each one under its
   alias. An address already held unchanged is left alone. The window lists any it could not hold, and why.

The first start asks one question: your name, which the Centre records on every change you make. It is remembered.
If Folio Administration is already running, starting it again just opens the Centre, unlocked.

| Option | Effect |
| --- | --- |
| `--no-browser` | Prints a one-time sign-in link (valid once, for 10 minutes) instead of opening the browser |
| `--no-vault-fill` | Leaves the Vault as it is |

The provisioning console can also be opened without starting anything: double-click
`Open the provisioning console.html`.

**From the source code** (4.2 in the Handover Pack): run `npm install` once, then `npm run admin`. It does the same.

## 4. Where the suite keeps its data

The toolkit keeps everything in the folder `NITDA-Folio-Tools-Data` in your home folder (set `FOLIO_TOOLS_DATA` to
keep it elsewhere):

| Folder or file | Holds |
| --- | --- |
| `Vault` | The Vault's registry and its two access tokens (`bootstrap-credentials.json`) |
| `Administration-Centre` | The Centre's database (alerts, incidents, changes and the audit trail), its sign-in token (`config/admin.token`), backups and evidence |
| `Microsoft/session.json` | The flow owner's kept Microsoft sign-in (a refresh token only). Microsoft ends it after 90 days unused, on a password change, or by tenant policy; the next start then shows a new code |
| `operator.json` | Your accountable name |

The folder holds credentials: never share it or copy it to a shared drive. Back it up with the computer's own backup.

## 5. Signing in

- **The Centre.** The start opens it unlocked, through a link that works once and for 10 minutes; the sign-in is
  recorded in the audit trail. If you open the Centre another way, paste the token from `config/admin.token` in its
  data folder, enter your accountable name and choose **Unlock centre**. Issue each operator their own token under
  **Access**.
- **The tenant.** Done by the start, once (section 3). To connect again, choose **Connect as flow owner** under Flows.
- **Folio, for Test a flow.** Under Test a flow, enter your work e-mail; Folio e-mails you a code, as the Workspace does.
  The sign-in is held in the Centre's memory only.
- **The Vault.** On first start it writes an administrator token and an invocation token to
  `bootstrap-credentials.json` in its data folder. The Centre reads that file itself and never stores what is in it.
  The start fills the Vault from the tenant (section 3). It holds only a flow that names itself when asked (the
  identity handshake); a flow that does not is listed in the start window and left out.

## 6. Security

- Everything answers on this computer only. None of it is reachable from the network.
- Test a flow offers only the flows that read: none that writes a record or sends mail. Every test is recorded in the
  audit trail with its reason; the reply is shown, with any credential hidden, and not stored.
- A configuration file checked in the estate view is read in the browser page only and is never sent to the Centre.
- Never paste a signed flow address, a token or a sign-in code into an e-mail, a chat or a document.

## 7. Checking the suite

| To | Run |
| --- | --- |
| Check the Centre's installation, from the toolkit's `Programs` folder | `python3 tools/admin-centre/scripts/verify.py`, with `FOLIO_ADMIN_HOME` set to its data folder |
| Check the Centre's installation, from the source code | `npm run centre:verify` |
| Run the full check of every application, tool, flow package and register, from the source code | `npm run test:node` |
| Rebuild the Handover Pack, the Deployment Kit and the Administrator Toolkit, from the source code | `npm run handover -- --builds <folder of the private build>` |
| Rebuild only the Handover Pack and the Administrator Toolkit, for the build last delivered (the Deployment Kit stays as delivered) | `npm run handover -- --from-ledger` |
