# NITDA Flow Operations Workbench

A self-contained page for inspecting, composing, validating and sending requests against
the Power Automate flows defined in this repository.

- **Flows catalogued:** 50
- **HTTP-trigger flows:** 44 (plus 5 `Request/Button` and 1 `OpenApiConnection`)
- **Trigger field records:** 679
- **Actions catalogued:** 5,786

Every entry carries the path and SHA-256 of the definition file it came from, and
`scripts/check.sh` re-verifies all 50 hashes against
`docs/reference/flow-contracts/deployed/`.

## Running it

Inspection only — no send:

```bash
open index.html          # or just double-click it
```

To send requests you need the relay, because Power Automate endpoints return no CORS
headers and a browser cannot read a response without them:

```bash
python3 local_agent.py   # Python 3.7+; then open http://127.0.0.1:8765
```

Open the page **through** `http://127.0.0.1:8765`, not from the file on disk — the relay
accepts requests only from its own origin. The mode selector switches to
*Local loopback relay* automatically once the relay is detected. Stop it with Ctrl-C.

Endpoint URLs and actual payload values must come from the authorized tenant and business
context. The workbench does not invent them.

## Running it on Android (Termux)

The workbench runs on a phone. The relay needs only the Python standard library, and
Android's browser can reach the device's own loopback address.

```bash
pkg install python unzip          # curl is usually present already
unzip nitda-flow-workbench.zip
cd nitda-flow-workbench
python3 local_agent.py
```

Then open `http://127.0.0.1:8765` in Chrome or Firefox **on the same device**. The relay
and the browser share the phone's loopback interface, so this works without a network.

Termux specifics worth knowing:

- **Invoke the interpreter explicitly.** Termux has no `/usr/bin`, so a
  `#!/usr/bin/env python3` shebang works only through `termux-exec`. Use
  `python3 local_agent.py` and `bash scripts/check.sh` rather than `./local_agent.py`.
- **`node` is optional.** `scripts/check.sh` skips the two JavaScript syntax checks and
  says so when Node is absent; everything else still runs. `pkg install nodejs` if you
  want them.
- **`scripts/e2e.sh` will not run.** It needs a headless Chromium, which Termux does not
  provide. `scripts/check.sh` is the verification to use on a phone.
- **Keep it awake.** Android may suspend the process when the screen turns off. Run
  `termux-wake-lock` first (from `termux-api`), or keep Termux in the foreground.
- **Downloaded the zip to `/sdcard/Download`?** Run `termux-setup-storage` once, then
  extract from `~/storage/downloads/`. Extracting into Termux's own home directory is
  simpler and avoids the permission prompt.
- **Temp files** follow `TMPDIR`, which Termux sets to `$PREFIX/tmp`, so the scripts do not
  assume a `/tmp` exists.

## Scope

`Request/PowerAppV2` flows are excluded at build time: they are invoked by Power Apps
through the Power Platform connector rather than by posting to a URL. The ten excluded
definitions remain in `docs/reference/flow-contracts/deployed/`; only the workbench
catalogue narrows.

Every flow that *is* catalogued is fully enabled — composable, validatable and sendable.
The only gate on sending is a valid HTTPS endpoint URL. Flows whose trigger is not
`Request/Http` carry an advisory note in the composer but are not blocked.

Where a trigger declares no method, Power Automate accepts any; the workbench defaults to
POST and labels it "not declared — defaulting to POST" rather than showing it as unknown.

## What validation does and does not tell you

The validator walks the trigger's JSON Schema: type, enum, required, properties, items,
minimum/maximum, length, pattern and the email format. It does not implement
`anyOf`/`oneOf`/`allOf`/`$ref`, which none of these schemas use.

Most of these schemas declare no required fields and accept additional properties, so a
passing result confirms the **shape** only. It is not a statement about business
authority, tenant state, or whether the values are correct.

## Security of the relay

The relay binds to `127.0.0.1`, answers `Access-Control-Allow-Origin` for its own origin
only, refuses cross-origin browser requests, and forwards only to HTTPS targets using an
allowlist of methods.

It is **not authenticated**. Any process already running on this machine can use it to
issue HTTPS requests and read the responses, and it will forward to any HTTPS host,
including addresses on the local network. Run it only while you are using the workbench.

Endpoint URLs are stored in this browser's local storage and are never transmitted
anywhere except to the endpoint itself. Exports replace the value of `sig`, `token`,
`code`, `key`, `secret` and `password` query parameters with `REDACTED`.

## Layout

| File | Role |
|---|---|
| `catalog.json` | The flow catalogue. The single source the page is built from. |
| `app.js`, `app.css`, `template.html` | Application sources. |
| `build.py` | Assembles `index.html` and `ALL_FLOW_REQUEST_SHAPES.json`. |
| `index.html` | **Generated.** Self-contained page. Do not hand-edit. |
| `ALL_FLOW_REQUEST_SHAPES.json` | **Generated.** Same document `Export all request shapes` produces. |
| `local_agent.py` | The loopback relay. |
| `scripts/check.sh` | Syntax, build, provenance and consistency checks. |
| `scripts/e2e.sh` | Runs both browser suites below. |
| `scripts/browser-test.mjs` | 35 behaviour assertions, including a live relay round-trip. |
| `scripts/layout-test.mjs` | Responsive checks: no sideways scrolling, 44px tap targets. |

After changing any source, rebuild and re-check:

```bash
python3 build.py && ./scripts/check.sh
./scripts/e2e.sh                      # needs Node 18+ and Chromium
```

## Building the distributable package

```bash
python3 scripts/package.py            # -> dist/nitda-flow-workbench.zip
```

The zip carries the runnable page, the relay, the sources it is generated from, the
verification scripts, and a `MANIFEST.json` recording the SHA-256 of every packaged file.
It contains no endpoint URLs and no credentials. `dist/` is gitignored, so build the
package rather than expecting it in the repository.

Extract it anywhere and it stands alone:

```bash
unzip nitda-flow-workbench.zip && cd nitda-flow-workbench
./scripts/check.sh                    # passes outside the repo; the provenance
                                      # re-hash is skipped when the source
                                      # definitions are not alongside it
python3 local_agent.py                # then open http://127.0.0.1:8765
```

## Why this was rebuilt

The previous build (v2) never ran. `sendRequest()` was missing one closing brace, and
because the catalogue and the application code were fused into a single 1.66 MB line
inside one `<script>`, that one character prevented the entire script from parsing —
`CATALOG` was never defined, nothing initialised, and the page rendered as an empty shell
with a stuck "INITIALIZING" badge.

Sources are now kept apart and generated into `index.html`, so `node --check app.js` is
meaningful, and `scripts/check.sh` runs it. Other defects fixed in this rebuild:

- `local_agent.py` raised `AttributeError` on any POST outside `/api/request`
  (`SimpleHTTPRequestHandler` defines no `do_POST`); it now returns 405.
- The relay answered `Access-Control-Allow-Origin: *`, letting any site open in the
  browser drive it and read the responses. Now locked to its own origin.
- Endpoint profiles were keyed on `workflowId`, which is **not unique** — three flows share
  `_References_Matrix-POST`, so saving a URL for one silently overwrote the others. Keyed
  on `workflowId` + source hash now.
- Switching flows left the previous flow's request body in the composer, where it was
  validated against, and could be sent to, the new flow.
- Dashboard counts, the integrity check and the runtime badge were hardcoded to 60/59;
  they are derived from the catalogue now.
- The timeout control was ignored for direct sends (no `AbortController`), and a blank
  timeout reached the relay as `null` and crashed it on `int(None)`.
- The relay sent the literal bytes `null` as the body of a bodyless PUT/PATCH/DELETE.
- One malformed history record blanked the whole Outcomes table.
- `esc()` escaped only `& < >`, but its output is interpolated into quoted HTML
  attributes; quotes are escaped now.
- Search re-serialised the whole catalogue on every keystroke — over a megabyte of JSON
  per character typed. It uses a prebuilt index now.
- Masked URLs read `sig=%5BREDACTED%5D`, because both maskers percent-encoded the brackets.
- `ALL_FLOW_REQUEST_SHAPES.json` and the in-page export both claimed
  `nitda-all-request-shapes/v1` while emitting different structures. Both are `/v2` now and
  `scripts/check.sh` asserts they match.
- The Endpoint Profiles table had a "Verified" column that nothing could ever set, and no
  way to remove a saved URL. Replaced with a working Remove action.
- `URL.createObjectURL` was never revoked; `requiredFields` and `connectors` were carried
  in the data but never shown; the endpoint field could not be revealed to check a paste.
