# Folio Central Administration Centre

The governed control plane over the Folio portfolio: monitoring, management and administration of the Workspace, Document Portal, Estate Console, Correspondence Mailer, Flow Workbench and Vault, and — signed in as the flow owner, with no tenant administrator — of every Folio flow in Power Automate (the ones behind them, and the scheduled, event-driven and governance flows the flow catalogue names), with a hash-chained audit trail. Python 3.9+ standard library; nothing to install.

```bash
npm run admin                        # from the repository root — the Centre and the Vault in one step (below)
# or, the Centre alone:
npm run start:centre                 # from the repository root — state under the system temp dir
./scripts/start.sh                   # from this directory — state here, git-ignored
```

`npm run admin` (`scripts/folio-admin.mjs`; the Administrator Toolkit's start files run it) checks Node.js and Python, sets every variable below, starts the Vault and the Centre, opens the Centre in the browser already unlocked (a one-time link: `POST /api/launch` trades it once for the token), signs the Centre in to the tenant as the flow owner (a device code the first time; kept in `~/NITDA-Folio-Tools-Data/Microsoft/session.json` afterwards) and fills the Vault with every endpoint's signed address read from the tenant. State lives in `~/NITDA-Folio-Tools-Data` (`FOLIO_TOOLS_DATA`).

Started any other way, open http://127.0.0.1:8844, paste the token from `config/admin.token` under the state directory (the launcher prints where), give your accountable name, and unlock.

| | |
|---|---|
| Verify an installation | `python3 scripts/verify.py` (`--provision` on first run, `--json` for machines) |
| Tests | `npm run test:admincentre` · `npx playwright test tests/admin-centre.spec.js` |
| State directory | `FOLIO_ADMIN_HOME` (default: this directory) — `data/`, `config/admin.token`, `backups/`, `evidence/` |
| Vault | `FOLIO_VAULT_ADMIN_TOKEN` or `FOLIO_VAULT_TOKEN_FILE` (set for you by `npm run start:all`) |
| Keep the flow-owner sign-in | `FOLIO_MS_SESSION=<file>`: the refresh token is kept there (0600), so a restart needs no new code; the platform suite's `./folio` sets it and shares it with the Mailer's setup. Unset: memory only, as before |
| Platforms on this computer | `FOLIO_ADMIN_LOCAL_PLATFORMS=console,workbench,vault`: only those are probed; the others read *Not on this computer* (the Administrator Toolkit sets it, since the Workspace, Portal and Mailer run at their published addresses). Unset: all six |
| Quiet / no monitor | `FOLIO_ADMIN_ACCESS_LOG=0` · `FOLIO_ADMIN_MONITOR=0` (the monitor also runs the scheduled flow sync and the daily retention, so keep it on in operation) |

Documentation: [`docs/admin-centre/`](../../docs/admin-centre/README.md) — design, developer guide, provisioning and configuration, user guides, and the assessment against the 1.0 suite.

Loopback only. Never commit anything from the state directory; `.gitignore` covers it when it is this directory.
