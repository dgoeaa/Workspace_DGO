# Flow URL capsule registry

A Python 3.11+ standard-library service, SQLite-backed, that holds each complete signed Power
Automate URL as one opaque string it never returns, and exposes an **alias** instead.

`core/capsule-client.js` and the Admin Suite's **Capsule registry** section administer a deployed
instance of this. The service is here; the console that drives it is in the platform.

## Why this exists beside the direct-call model

Every endpoint in this estate is a signed URL invoked directly by the browser. That is the
approved architecture and it has one irreducible consequence: **the signature reaches the browser,
so it can be rotated but never retired**, and anyone who obtains it can call the flow.

This is the alternative posture for deployments that can run a server. The signature stops at the
registry, and the estate gains three things the direct model structurally cannot have:

| | Direct call | Capsule registry |
|---|---|---|
| Where the signature ends up | Every browser | The registry only |
| Version history per endpoint | None | Retained, with rollback |
| Disable an endpoint | Redeploy | Immediate, no redeploy |
| Record of who invoked what | None | An audit row per invocation |

It is **not** a drop-in replacement. The platform still calls flows directly; adopting this is a
deployment decision with its own operational cost — a server, a service account, a backup regime.

## Layout

```
app/flowcapsule.py     The service. Byte-identical to both source packages.
app/flowcapctl.py      CLI: health, list, configure-flow, versions, verify,
                       enable, disable, rollback, invoke, backup.
app/POWER_AUTOMATE.md  What the flow behind an alias must implement.
termux-setup.sh        Android/Termux installer: install, update, verify,
                       diagnose, repair, backup, rollback, uninstall.
flowcapsule.service    systemd unit for a Linux host.
requirements.txt       Empty by design — standard library only.
tests/                 7 tests. Run with: python3 -m unittest discover -s tests
```

## Deploy on Linux

```bash
sudo useradd --system --home /var/lib/flowcapsule --shell /usr/sbin/nologin flowcapsule
sudo install -d -o flowcapsule -g flowcapsule -m 0700 /var/lib/flowcapsule
sudo install -d -o root -g root -m 0755 /opt/flowcapsule
sudo install -o root -g root -m 0755 app/flowcapsule.py /opt/flowcapsule/flowcapsule.py
sudo -u flowcapsule env FLOWCAP_DATA_DIR=/var/lib/flowcapsule python3 /opt/flowcapsule/flowcapsule.py
```

First start writes `bootstrap-credentials.json` and `registry.db`, both `0600`. Read the admin and
invocation bearer tokens **only on the server**. Put the service behind an existing HTTPS reverse
proxy, keep it bound to `127.0.0.1`, and disable proxy query-string logging — or set
`FLOWCAP_TLS_CERT`, `FLOWCAP_TLS_KEY` and `FLOWCAP_HOST=0.0.0.0` for built-in TLS.

## Deploy on Android

```bash
./termux-setup.sh install     # preflight, packages, storage, config, release, service, verify
./termux-setup.sh diagnose    # architecture, API level, free space, service status
./termux-setup.sh backup      # a 0600 tar.gz of the SQLite data directory
./termux-setup.sh rollback    # switch code to the retained release, data untouched
./termux-setup.sh uninstall   # removes code and service, PRESERVES data and backups
```

The installer refuses to run outside an unmodified Termux environment, below Android API 24, on an
unsupported architecture, or with less than 200 MiB free. It redacts URLs and bearer tokens from
its own log.

## Settings

| Variable | Default |
|---|---|
| `FLOWCAP_DATA_DIR` | `./data` |
| `FLOWCAP_HOST` | `127.0.0.1` |
| `FLOWCAP_PORT` | `8787` |
| `FLOWCAP_MAX_BODY_BYTES` | `1048576` |
| `FLOWCAP_VERIFY_TIMEOUT_SECONDS` | `20` |
| `FLOWCAP_INVOKE_TIMEOUT_SECONDS` | `60` |
| `FLOWCAP_RATE_LIMIT_PER_MINUTE` | `120` |
| `FLOWCAP_VERSION_RETENTION` | `5` |
| `FLOWCAP_ALLOWED_HOST_SUFFIXES` | `.api.powerplatform.com,.logic.azure.com` |
| `FLOWCAP_TLS_CERT` / `FLOWCAP_TLS_KEY` | unset — both required for built-in TLS |

## API

| Route | Token | |
|---|---|---|
| `GET /health` | none | |
| `GET /admin/flows` | admin | Alias list with fingerprints — never URLs |
| `GET /admin/flows/{alias}/versions` | admin | Retained versions |
| `POST /admin/flows` | admin | Register or rotate |
| `POST /admin/flows/{alias}/verify` | admin | Re-run the live identity handshake |
| `POST /admin/flows/{alias}/rollback/{version}` | admin | Re-verifies before activating |
| `POST /admin/flows/{alias}/enable` · `/disable` | admin | |
| `POST /invoke/{alias}` | invoke | Calls the exact stored string |

`core/capsule-client.js` implements every route above **except `/invoke`**, deliberately: a console
that can invoke arbitrary aliases with an operator's token is a console that can dispatch
correspondence by accident. Invocation belongs to the applications, with the invoke token.

## The identity handshake

Registration and rollback both require the flow to prove which flow it is. The service posts:

```json
{ "_platform": { "operation": "verify", "correlationId": "<uuid>" } }
```

and requires `verified`, `flowIdentity`, `environment`, `contractVersion` and the unchanged
`correlationId` back. This is the same handshake `core/health-contract.js` performs from the
browser, so a flow that implements it works with both — see
[`docs/reference/HEALTH_CONTRACT.md`](../../docs/reference/HEALTH_CONTRACT.md).

## Register or rotate

Put the actual values in a private JSON file, with the URL copied **unmodified** from Power
Automate:

```json
{"alias":"dgo.fetch-activities","url":"COMPLETE_TRIGGER_URL","flowIdentity":"FLOW_IDENTITY","environment":"ENVIRONMENT","contractVersion":"CONTRACT_VERSION"}
```

```bash
curl --fail-with-body -X POST https://registry.internal/admin/flows \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  --data-binary @registration.json
```

Registration inspects but never rewrites the URL, fingerprints the exact string, verifies it live,
checks identity/environment/version/correlation, and only then atomically activates a new version.
Repeating it for the same alias **is** rotation. Failed verification leaves the current version
untouched.

The same formation rules run client-side in `core/endpoint-formation.js`, so the Admin Suite
catches a trailing newline in the field the operator is looking at rather than after the URL has
crossed the network.

## Operational security

Run under a dedicated OS account. Use filesystem or full-disk encryption if encryption at rest is
required. Restrict network access and permit outbound HTTPS only to approved Power Automate hosts.
Never enable request-body, full-URL, SQL or proxy query logging. Rotate a signed URL after any
suspected disclosure. Back up the whole SQLite data directory and **test the restore**. Monitor
401, 403, 409, 429 and 503.

SHA-256 detects mutation. It is **not** encryption and does not replace the SAS signature — anyone
holding the URL can compute the same fingerprint. A privileged OS administrator can read the
database, so OS access remains inside the security boundary.

## Validate

```bash
python3 -m unittest discover -s tests -v          # 7 tests, no network
python3 app/flowcapsule.py inspect "$ACTUAL_URL"  # formation report for one URL
```

The tests cover formation rules, masking, exact storage, fingerprinting, atomic version
activation, retention, rollback, and every guard in the Termux installer. Live connectivity and
identity can only be validated against a real signed URL and real flow metadata, which is what the
registration endpoint enforces and what no test here can substitute for.
