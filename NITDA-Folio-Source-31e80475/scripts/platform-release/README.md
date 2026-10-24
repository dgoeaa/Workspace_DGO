# NITDA Folio — platform suite

Every Folio platform, application and tool in one release. It depends on nothing in the source
repository, and there is nothing to install apart from Node.js and Python.

## Requirements

- **Node.js 22+** for the launcher, the static platforms and the Hub.
- **Python 3.11+** for the Flow Workbench, the Vault and the Central Administration Centre. They
  use the standard library only. Without Python, the five Node platforms still start, and the
  launcher says which ones it skipped.

## Administer everything with `folio`

One command runs the whole suite. It handles the live URLs, wiring, starting and stopping, live
checks, the Vault, the Mailer, the Centre, backups and starting at boot. It keeps everything it
writes in `~/.folio` (or `FOLIO_HOME`), never inside this package. It never prints a signature.

```sh
./folio go --values ~/dgo-values.txt     # file the URLs, wire them, start all eight, live-check, status
./folio help                             # every command
```

| Task | Command |
|---|---|
| Get the live URLs | `./folio values fetch` reads the harvester flow, whose URL you copy to the clipboard (or pass with `--stdin`).<br>`./folio values import FILE` reads a values file or the Live Report callback file.<br>`./folio values pull https://HOST` reads them from the deployed site.<br>`./folio values set KEY` sets one URL. |
| See what is set | `./folio values`: every endpoint, its host and workflow id, never the URL |
| Wire them in | `./folio wire` writes the Workspace and Portal configs, the same bytes `npm run package` writes, and refreshes the Portal's cache. `./folio unwire` goes back to demo mode. |
| Rotate one URL | `./folio values set KEY`, then `./folio wire` |
| Check them live | `./folio check` runs read-only probes. `--include-writes` exercises the writes too; it creates records tagged `__DGO_PROBE__`. |
| Run | `./folio start` runs everything in the background; closing the terminal does not stop it, and on Termux it also takes a wake lock. `./folio stop`, `restart`, `status` and `logs` do what they say. |
| Start at boot | `./folio autostart` uses Termux:Boot on Android, crontab `@reboot` on Linux, or the Startup folder on Windows. |
| Microsoft sign-in, kept | `./folio signin` signs in once with Microsoft's device code. The sign-in is kept in `~/.folio/microsoft/session.json` (refresh token only, mode 0600) and shared by the Centre and the Mailer's setup, so neither asks for a code again. It lasts while it is used; Microsoft ends it after 90 days unused, on a password change, or by tenant policy.<br>`./folio whoami --check` shows who is signed in and confirms Microsoft still accepts it.<br>`./folio signout` deletes it everywhere. |
| Mailer | `./folio mailer` runs the Mailer's own setup, using the kept sign-in, then handles the flows, the lists and `mailer.html`. |
| Centre | `./folio centre` shows alerts and the flow owner.<br>`./folio centre signin` connects the Centre to the tenant with a Microsoft device code.<br>`./folio centre sync` and `./folio centre probe` refresh flows and platform health. |
| Vault | `./folio vault` holds each wired URL whose flow passes the identity handshake. |
| Safety | `./folio backup` copies the values, Vault and Centre state, and configs into a private zip. `./folio restore FILE` puts one back. `./folio doctor` checks Node, Python, package integrity, values against wiring, ports and permissions. |

On Windows, use `folio.cmd` in place of `./folio`.

## Start

```sh
./start.sh                          # macOS / Linux: all eight
start.cmd                           # Windows (double-click): all eight
node scripts/run-platform.mjs --all             # the same, directly
node scripts/run-platform.mjs runtime mailer    # only the ones named
node scripts/run-platform.mjs --group staff     # one group: public, staff or control
node scripts/run-platform.mjs --list            # what can be started, and where it answers
```

Open the **Platform Hub** at http://localhost:8079/ first. It lists every platform below, what each
one is for, and whether it is up. Ctrl-C stops everything the launcher started.

## The platforms

| Platform | Group | Port | Folder | What it is |
|---|---|---|---|---|
| **Platform Hub** | staff | 8079 | `tools/hub/` | The front door: every platform, and whether it is up. |
| **Folio Workspace** | staff | 8080 | `runtime/` | The operations platform: correspondence, assignments, approvals, reports, the Admin Suite (31 routes). |
| **NITDA Document Portal** | public | 8081 | `document-portal/` | Public document submission and tracking (installable web app). |
| **Folio Estate Console** | staff | 8082 | `tools/admin-console.html` | Single-file console over the endpoint estate and the flow catalogue. |
| **DGO Correspondence Mailer** | staff | 8083 | `mailer/` | Personalised letters through seven flows. This is the Mailer's complete release, including its flow packages and automatic setup (`mailer/README.md`). |
| **Folio Flow Workbench** | control | 8765 | `tools/flow-workbench/` | Inspect, compose and send requests against the catalogued flows. |
| **Folio Vault** | control | 8787 | `tools/flow-capsule/` | Registry that holds each signed flow URL as an alias. An API; `/health` answers without a token. |
| **Folio Central Administration Centre** | control | 8844 | `tools/admin-centre/` | Control plane: monitoring, alerts, incidents, changes, audit trail. |

The control platforms bind loopback (127.0.0.1) only. The Vault and the Centre write their state and
bootstrap tokens to a directory under the system temp folder, never inside this package. The
launcher prints where they are.

## Check it is intact

```sh
node scripts/verify-release.mjs
```

It checks every file against `RELEASE_MANIFEST.json`.

## Wire the endpoints

This release contains no signed trigger URL, because a signed URL is a bearer credential. Until
they are wired, the Workspace and the Portal run in demo mode and the Mailer runs in simulation.
Nothing is transmitted.

| Platform | Configuration file |
|---|---|
| Workspace | `runtime/config/config.local.js`: fill in each key. |
| Portal | `document-portal/config.local.js`: fill in each key. |
| Mailer | `mailer/web/config.local.js`, or run `mailer/setup.cmd` / `mailer/setup.sh` (see `mailer/GO-LIVE.html`). |

Every URL in these files is delivered to every browser that loads the platform. The flow behind
each URL must authenticate, authorise, validate and rate-limit its callers itself. Each package's
own `DEPLOY.md` covers publishing it.

## Deploy

The Workspace (`runtime/`), the Portal (`document-portal/`), the Mailer (`mailer/web/`) and the
Estate Console are static files. Upload them to any HTTPS static host. Give the Portal and the Mailer
an origin each, because their storage and service worker are per-origin. The Workbench, the Vault and
the Centre are loopback services for operators. Their own READMEs cover running them on a server.
